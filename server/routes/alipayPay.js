/** 支付宝 AI 网页应用收款（alipay.trade.page.pay）。
 *
 * 环境变量：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY（PKCS#1）、ALIPAY_PUBLIC_KEY、
 * ALIPAY_SELLER_ID 或 ALIPAY_SELLER_EMAIL、ALIPAY_GATEWAY、APP_URL。
 * 可选：ALIPAY_NOTIFY_URL（显式空值表示不用通知）、ALIPAY_RETURN_URL。
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { ah } = require('../util');
const { authRequired, activatedRequired, invalidateFeatures } = require('../auth');
const { getAlipayClient, resolveNotifyUrl, resolveReturnUrl } = require('../alipay');

const router = express.Router();

const PACKAGES = [
  { id: 'p5', amount: 500, credits: 60, name: '体验包', tag: '' },
  { id: 'p10', amount: 1000, credits: 130, name: '标准包', tag: '送 10%' },
  { id: 'p30', amount: 3000, credits: 420, name: '常用包', tag: '送 20%' },
  { id: 'p100', amount: 10000, credits: 1560, name: '学期包', tag: '送 30%' },
];
const PACKAGE_MAP = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));
const EXEC_OPTIONS = { validateSign: true };

function nowText() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-');
}
function genOrderNo() {
  return 'TW' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function genRefundNo() {
  return 'RF' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function amountText(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
function normalizeAmountText(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return `${BigInt(match[1]).toString()}.${(match[2] || '').padEnd(2, '0')}`;
}
function parseAmountCents(value) {
  const normalized = normalizeAmountText(value);
  if (!normalized) return null;
  const [yuan, fraction] = normalized.split('.');
  const cents = Number(yuan) * 100 + Number(fraction);
  return Number.isSafeInteger(cents) ? cents : null;
}
function isPaidStatus(value) {
  return value === 'TRADE_SUCCESS' || value === 'TRADE_FINISHED';
}
function isPaidEvent(params) {
  return isPaidStatus(params.trade_status)
    && !params.out_biz_no
    && !params.gmt_refund
    && !params.refund_fee;
}
function sellerMatches(config, params) {
  return Boolean(
    (config.sellerId && params.seller_id === config.sellerId)
      || (config.sellerEmail && params.seller_email === config.sellerEmail)
  );
}
function paidBusinessMatches(order, params, config, checkAppId = false) {
  return params.out_trade_no === order.order_no
    && normalizeAmountText(params.total_amount) === amountText(order.amount)
    && sellerMatches(config, params)
    && (!checkAppId || params.app_id === config.appId);
}
function resultMessage(result) {
  return result?.sub_msg || result?.msg || '支付宝接口调用失败';
}
function safeNotifyLog(message, params) {
  console.warn(message, {
    outTradeNo: params.out_trade_no || '',
    tradeStatus: params.trade_status || '',
    notifyId: params.notify_id || '',
  });
}

/** 仅管理员可发起退款；路由必须先经过 authRequired。 */
const adminRequired = ah(async (req, res, next) => {
  const teacher = await db.get('SELECT is_admin FROM teachers WHERE id = ?', [req.teacherId]);
  if (!teacher?.is_admin) return res.status(403).json({ error: '仅管理员可执行退款操作' });
  next();
});

/** 调用方须先完成订单、金额和卖家归属校验。 */
async function creditOrder(tx, order, tradeNo) {
  const updated = await tx.run(
    `UPDATE orders SET status='paid', transaction_id=?, channel='alipay', paid_at=?
     WHERE order_no=? AND status='pending'`,
    [tradeNo || '', nowText(), order.order_no]
  );
  if (updated.changes === 1) {
    await tx.run('UPDATE teachers SET credits = credits + ? WHERE id = ?', [order.credits, order.user_id]);
    try { invalidateFeatures(order.user_id); } catch (_) { /* 缓存清理不影响到账 */ }
  }
  const teacher = await tx.get('SELECT credits FROM teachers WHERE id = ?', [order.user_id]);
  return {
    alreadyPaid: updated.changes !== 1,
    balance: Number(teacher?.credits || 0),
    credits: order.credits,
  };
}

async function markOrderPaid(orderNo, trade, config) {
  return db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo]);
    if (!order) return { found: false };
    if (!paidBusinessMatches(order, trade, config)) return { found: true, mismatch: true };
    const result = await creditOrder(tx, order, trade.trade_no);
    return { found: true, mismatch: false, ...result };
  });
}

/** 主动查单补单：只有验签后的支付宝查询结果可以改变订单状态。 */
async function reconcilePendingOrder(order, client) {
  const trade = await client.sdk.exec('alipay.trade.query', {
    bizContent: { out_trade_no: order.order_no },
  }, EXEC_OPTIONS);

  if (trade.code !== '10000') return { status: 'pending' };
  if (trade.out_trade_no !== order.order_no) {
    console.warn('[alipay] 查单订单号不匹配:', order.order_no);
    return { status: 'pending' };
  }
  if (isPaidStatus(trade.trade_status)) {
    if (!isPaidEvent(trade)) {
      console.warn('[alipay] 支付查询包含退款/分账特征，不予到账:', order.order_no);
      return { status: 'pending' };
    }
    const result = await markOrderPaid(order.order_no, trade, client.config);
    if (result.mismatch) {
      console.warn('[alipay] 查单金额或卖家不匹配:', order.order_no);
      return { status: 'pending' };
    }
    return { status: 'paid', credits: result.credits, balance: result.balance };
  }
  if (trade.trade_status === 'TRADE_CLOSED') {
    await db.run("UPDATE orders SET status='closed' WHERE order_no=? AND status='pending'", [order.order_no]);
    return { status: 'closed' };
  }
  return { status: 'pending' };
}

async function completeRefund(orderNo, outRequestNo, tradeNo) {
  return db.transaction(async (tx) => {
    const request = await tx.get(
      'SELECT * FROM refund_requests WHERE order_no=? AND out_request_no=? FOR UPDATE',
      [orderNo, outRequestNo]
    );
    if (!request) return { found: false };
    await tx.run(
      "UPDATE refund_requests SET status='succeeded', transaction_id=?, completed_at=? WHERE id=?",
      [tradeNo || '', nowText(), request.id]
    );
    const order = await tx.get('SELECT * FROM orders WHERE order_no=? FOR UPDATE', [orderNo]);
    const total = await tx.get(
      "SELECT COALESCE(SUM(amount), 0) total FROM refund_requests WHERE order_no=? AND status='succeeded'",
      [orderNo]
    );
    if (order && Number(total.total) >= order.amount) {
      await tx.run("UPDATE orders SET status='refunded' WHERE order_no=?", [orderNo]);
    }
    return { found: true, status: 'refunded' };
  });
}

router.get('/packages', (req, res) => {
  res.json({ packages: PACKAGES });
});

/* 网站支付下单：同步返回 HTML form，由浏览器渲染并提交到支付宝收银台。 */
router.post('/create', authRequired, activatedRequired, ah(async (req, res) => {
  const client = getAlipayClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置（缺少支付宝应用、密钥或卖家信息）' });

  const pkg = PACKAGE_MAP[req.body?.packageId];
  if (!pkg) return res.status(400).json({ error: '套餐不存在' });

  const orderNo = genOrderNo();
  await db.run(
    'INSERT INTO orders (user_id, order_no, amount, credits, status, channel) VALUES (?,?,?,?,?,?)',
    [req.teacherId, orderNo, pkg.amount, pkg.credits, 'pending', 'alipay']
  );

  const notifyUrl = resolveNotifyUrl(client.config);
  const pageParams = {
    returnUrl: resolveReturnUrl(client.config),
    bizContent: {
      out_trade_no: orderNo,
      total_amount: amountText(pkg.amount),
      subject: `算力充值${pkg.credits}`,
      product_code: 'FAST_INSTANT_TRADE_PAY',
    },
  };
  if (notifyUrl) pageParams.notifyUrl = notifyUrl;

  try {
    const paymentHtml = client.sdk.pageExec('alipay.trade.page.pay', 'POST', pageParams);
    res.json({ orderNo, paymentHtml });
  } catch (error) {
    console.error('[alipay] 网站支付下单失败:', error.message);
    res.status(502).json({ error: `支付宝下单失败：${error.message}`, orderNo });
  }
}));

/* 支付宝 POST form 异步通知：验签、业务校验、通知事件与到账在同一事务中幂等完成。 */
router.post('/notify', express.urlencoded({ extended: false }), ah(async (req, res) => {
  const params = { ...req.body };
  const fail = (message) => {
    safeNotifyLog(`[alipay] ${message}`, params);
    return res.type('text/plain').send('fail');
  };
  const client = getAlipayClient();
  if (!client || params.app_id !== client.config.appId) return fail('通知应用配置不匹配');

  let verified = false;
  try {
    verified = await Promise.resolve(client.sdk.checkNotifySignV2(params));
  } catch (error) {
    return fail(`通知验签异常：${error.message}`);
  }
  if (!verified) return fail('通知验签失败');
  if (!params.notify_id || !params.out_trade_no || !params.trade_status) return fail('通知缺少必要字段');

  const result = await db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE order_no=? FOR UPDATE', [params.out_trade_no]);
    if (!order || !paidBusinessMatches(order, params, client.config, true)) return { ok: false };

    const safePayload = { ...params };
    delete safePayload.sign;
    const inserted = await tx.run(
      `INSERT INTO payment_notifications
         (notify_id, order_no, trade_no, trade_status, payload, created_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT (notify_id) DO NOTHING RETURNING id`,
      [params.notify_id, order.order_no, params.trade_no || '', params.trade_status, safePayload, nowText()]
    );
    if (inserted.changes === 0) return { ok: true, duplicate: true };

    if (isPaidEvent(params)) {
      const paid = await creditOrder(tx, order, params.trade_no);
      return { ok: true, paid: true, ...paid };
    }
    if (params.trade_status === 'TRADE_CLOSED') {
      await tx.run("UPDATE orders SET status='closed' WHERE order_no=? AND status='pending'", [order.order_no]);
    }
    return { ok: true, paid: false };
  });

  if (!result.ok) return fail('通知业务字段校验失败');
  return res.type('text/plain').send('success');
}));

/* 前端回跳和充值页共用：订单归属由当前登录会话约束，pending 时主动查支付宝。 */
router.get('/status/:orderNo', authRequired, ah(async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE order_no=? AND user_id=?', [req.params.orderNo, req.teacherId]);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  if (order.status === 'paid') {
    const teacher = await db.get('SELECT credits FROM teachers WHERE id=?', [order.user_id]);
    return res.json({ status: 'paid', credits: order.credits, balance: Number(teacher?.credits || 0) });
  }
  if (order.status !== 'pending') return res.json({ status: order.status });

  const client = getAlipayClient();
  if (!client) return res.json({ status: 'pending' });
  try {
    return res.json(await reconcilePendingOrder(order, client));
  } catch (error) {
    console.warn('[alipay] 补偿查单失败:', error.message);
    return res.json({ status: 'pending' });
  }
}));

router.get('/orders', authRequired, ah(async (req, res) => {
  const rows = await db.all(
    `SELECT order_no, amount, credits, status, paid_at, created_at FROM orders
     WHERE user_id=? ORDER BY id DESC LIMIT 50`,
    [req.teacherId]
  );
  res.json({ orders: rows });
}));

/* 关闭未支付交易。已支付或结果未知时不重复发起关单。 */
router.post('/close', authRequired, activatedRequired, ah(async (req, res) => {
  const orderNo = String(req.body?.orderNo || '').trim();
  const order = await db.get('SELECT * FROM orders WHERE order_no=? AND user_id=?', [orderNo, req.teacherId]);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') return res.status(409).json({ error: '仅待支付订单可以关闭', status: order.status });
  const client = getAlipayClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置' });

  try {
    const before = await reconcilePendingOrder(order, client);
    if (before.status !== 'pending') return res.status(409).json({ error: '订单状态已变化，无需关闭', ...before });
    const result = await client.sdk.exec('alipay.trade.close', {
      bizContent: { out_trade_no: orderNo },
    }, EXEC_OPTIONS);
    if (result.code === '10000') {
      await db.run("UPDATE orders SET status='closed' WHERE order_no=? AND status='pending'", [orderNo]);
      return res.json({ status: 'closed' });
    }
    const after = await reconcilePendingOrder(order, client);
    if (after.status !== 'pending') return res.json(after);
    return res.status(502).json({ error: `关闭交易未确认：${resultMessage(result)}`, status: 'pending' });
  } catch (error) {
    console.warn('[alipay] 关闭交易结果未知:', error.message);
    return res.status(502).json({ error: '关闭交易结果未知，请稍后查询订单', status: 'pending' });
  }
}));

/* 管理员退款。同一 out_request_no 必须复用原订单和原金额；网络异常不会生成新编号重试。 */
router.post('/refund', authRequired, adminRequired, ah(async (req, res) => {
  const orderNo = String(req.body?.orderNo || '').trim();
  const outRequestNo = String(req.body?.outRequestNo || '').trim();
  const refundAmount = parseAmountCents(req.body?.refundAmount);
  if (!orderNo || !refundAmount || refundAmount <= 0) {
    return res.status(400).json({ error: '请提供订单号和大于 0 的退款金额（元）' });
  }
  if (outRequestNo.length > 64) return res.status(400).json({ error: '退款请求号不能超过 64 位' });
  const client = getAlipayClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置' });

  const setup = await db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE order_no=? FOR UPDATE', [orderNo]);
    if (!order) return { error: '订单不存在', httpStatus: 404 };
    if (!['paid', 'refunded'].includes(order.status)) return { error: '仅已支付订单可以退款', httpStatus: 409 };

    if (outRequestNo) {
      const existing = await tx.get('SELECT * FROM refund_requests WHERE out_request_no=?', [outRequestNo]);
      if (!existing) return { error: '退款请求号不存在，新退款请留空该字段', httpStatus: 404 };
      if (existing.order_no !== orderNo || existing.amount !== refundAmount) {
        return { error: '重试退款必须复用原订单号和原退款金额', httpStatus: 409 };
      }
      return { order, request: existing };
    }

    const used = await tx.get(
      "SELECT COALESCE(SUM(amount), 0) total FROM refund_requests WHERE order_no=? AND status IN ('processing','succeeded')",
      [orderNo]
    );
    if (Number(used.total) + refundAmount > order.amount) {
      return { error: '累计退款金额不能超过订单实付金额', httpStatus: 409 };
    }
    const requestNo = genRefundNo();
    const inserted = await tx.run(
      `INSERT INTO refund_requests (order_no, out_request_no, amount, status, created_at)
       VALUES (?,?,?,'processing',?) RETURNING id`,
      [orderNo, requestNo, refundAmount, nowText()]
    );
    const request = await tx.get('SELECT * FROM refund_requests WHERE id=?', [inserted.lastInsertRowid]);
    return { order, request };
  });
  if (setup.error) return res.status(setup.httpStatus).json({ error: setup.error });
  if (setup.request.status === 'succeeded') {
    return res.json({ status: 'refunded', outRequestNo: setup.request.out_request_no });
  }

  const requestNo = setup.request.out_request_no;
  let result;
  try {
    result = await client.sdk.exec('alipay.trade.refund', {
      bizContent: {
        out_trade_no: orderNo,
        refund_amount: amountText(refundAmount),
        out_request_no: requestNo,
        refund_reason: '算力充值退款',
      },
    }, EXEC_OPTIONS);
  } catch (error) {
    console.warn('[alipay] 退款请求结果未知:', error.message);
    return res.status(502).json({
      error: '退款结果未知，请使用同一退款请求号查询或重试',
      status: 'processing',
      outRequestNo: requestNo,
    });
  }

  if (result.code !== '10000') {
    return res.status(502).json({
      error: resultMessage(result),
      status: 'processing',
      outRequestNo: requestNo,
    });
  }
  if ((result.out_trade_no && result.out_trade_no !== orderNo)
      || (result.refund_fee && normalizeAmountText(result.refund_fee) !== amountText(refundAmount))) {
    return res.status(502).json({ error: '退款响应与本地请求不一致，请查询确认', status: 'processing', outRequestNo: requestNo });
  }
  if (result.fund_change === 'Y') {
    await completeRefund(orderNo, requestNo, result.trade_no);
    return res.json({ status: 'refunded', outRequestNo: requestNo });
  }
  return res.json({ status: 'processing', outRequestNo: requestNo, message: '退款已受理，请至少间隔 10 秒后查询' });
}));

/* 退款查询：只有 REFUND_SUCCESS 才确认退款成功。 */
router.get('/refund/status', authRequired, adminRequired, ah(async (req, res) => {
  const orderNo = String(req.query.orderNo || '').trim();
  const outRequestNo = String(req.query.outRequestNo || '').trim();
  const request = await db.get('SELECT * FROM refund_requests WHERE order_no=? AND out_request_no=?', [orderNo, outRequestNo]);
  if (!request) return res.status(404).json({ error: '退款请求不存在' });
  if (request.status === 'succeeded') return res.json({ status: 'refunded', outRequestNo });
  const client = getAlipayClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置' });

  try {
    const result = await client.sdk.exec('alipay.trade.fastpay.refund.query', {
      bizContent: { out_trade_no: orderNo, out_request_no: outRequestNo },
    }, EXEC_OPTIONS);
    if (result.code !== '10000') return res.status(502).json({ error: resultMessage(result), status: 'processing' });
    if ((result.out_trade_no && result.out_trade_no !== orderNo)
        || (result.out_request_no && result.out_request_no !== outRequestNo)
        || (result.refund_amount && normalizeAmountText(result.refund_amount) !== amountText(request.amount))) {
      return res.status(502).json({ error: '退款查询响应与本地请求不一致', status: 'processing' });
    }
    if (result.refund_status === 'REFUND_SUCCESS') {
      await completeRefund(orderNo, outRequestNo, result.trade_no);
      return res.json({ status: 'refunded', outRequestNo });
    }
    return res.json({ status: 'processing', outRequestNo });
  } catch (error) {
    console.warn('[alipay] 退款查询失败:', error.message);
    return res.status(502).json({ error: '退款查询失败，请使用同一退款请求号稍后重试', status: 'processing' });
  }
}));

module.exports = router;
