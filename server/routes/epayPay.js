/** 算力充值：易支付聚合通道（支付宝扫码 / 页面支付）
 *
 *  环境变量（本地 server/.env 与 Vercel 项目设置都要配）：
 *    EPAY_BASE_URL   网关根地址，默认 https://pay.mapay.cn/xpay/epay/
 *    EPAY_PID        商户 PID
 *    EPAY_KEY        商户密钥（仅服务端使用，禁止进入前端或日志）
 *    EPAY_TYPE       支付类型，默认 alipay（可选 wxpay）
 *    APP_URL         站点地址，用于拼 notify_url / return_url
 *
 *  安全要点：
 *    - 异步通知必须验签 + 校验商户号、订单号、金额，验签失败绝不加算力
 *    - 到账幂等：仅当订单仍为 pending 时才加算力
 *    - 前端只拿支付页地址，不接触密钥
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { ah } = require('../util');
const { authRequired, activatedRequired, invalidateFeatures } = require('../auth');
const { createEpayClient } = require('../epay');

const router = express.Router();

/* ---------------- 配置 ---------------- */
function envTrim(v) {
  return String(v == null ? '' : v).trim().replace(/^['"]|['"]$/g, '');
}
function envId(v) {
  let s = envTrim(v);
  const eq = s.indexOf('=');
  if (eq > 0) s = envTrim(s.slice(eq + 1));
  return s;
}

const PID = envId(process.env.EPAY_PID);
const KEY = envTrim(process.env.EPAY_KEY);
const TYPE = envId(process.env.EPAY_TYPE) || 'alipay';
const BASE_URL = envTrim(process.env.EPAY_BASE_URL) || 'https://pay.mapay.cn/xpay/epay/';
const APP_URL = (envTrim(process.env.APP_URL) || 'https://teach.rayzo.cn').replace(/\/$/, '');

function configured() {
  return !!(PID && KEY);
}

let _client = null;
function getClient() {
  if (!configured()) return null;
  if (!_client) {
    _client = createEpayClient({ baseUrl: BASE_URL, pid: PID, key: KEY, type: TYPE });
  }
  return _client;
}

/* 充值套餐：amount 单位分，credits 为到账算力 */
const PACKAGES = [
  { id: 'p5',   amount: 500,   credits: 60,   name: '体验包', tag: '' },
  { id: 'p10',  amount: 1000,  credits: 130,  name: '标准包', tag: '送 10%' },
  { id: 'p30',  amount: 3000,  credits: 420,  name: '常用包', tag: '送 20%' },
  { id: 'p100', amount: 10000, credits: 1560, name: '学期包', tag: '送 30%' },
];
const PACKAGE_MAP = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));

/* ---------------- 工具 ---------------- */
function nowText() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-');
}
function genOrderNo() {
  // 网关要求商户订单号唯一；21 位字母数字
  return 'TW' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function yuanText(fen) {
  return (Number(fen) / 100).toFixed(2);
}

/** 幂等标记订单已支付并加算力 */
async function markOrderPaid(orderNo, transactionId) {
  return db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE order_no = ?', [orderNo]);
    if (!order) return { found: false, alreadyPaid: false, balance: 0, credits: 0 };
    const r = await tx.run(
      `UPDATE orders SET status='paid', transaction_id=?, channel='epay', paid_at=?
       WHERE order_no=? AND status='pending'`,
      [transactionId || '', nowText(), orderNo]
    );
    if (r.changes === 1) {
      await tx.run('UPDATE teachers SET credits = credits + ? WHERE id = ?', [order.credits, order.user_id]);
      try { invalidateFeatures(order.user_id); } catch (_) { /* 缓存清理失败不影响入账 */ }
    }
    const t = await tx.get('SELECT credits FROM teachers WHERE id = ?', [order.user_id]);
    return {
      found: true,
      alreadyPaid: r.changes !== 1,
      balance: Number(t?.credits || 0),
      credits: order.credits,
    };
  });
}

/* ---------------- 公开：套餐列表 ---------------- */
router.get('/packages', (req, res) => {
  res.json({ packages: PACKAGES });
});

/* 临时诊断：只回显是否存在与长度，不回显密钥内容。
 * 访问 /api/pay/_diag?k=diag2026 可确认线上进程是否读到环境变量。 */
router.get('/_diag', (req, res) => {
  if (req.query.k !== 'diag2026') return res.status(404).end();
  const info = (s) => ({
    len: String(s || '').length,
    hasSpace: /\s/.test(String(s || '')),
    hasQuote: /["']/.test(String(s || '')),
  });
  let host = '(invalid)';
  try { host = new URL(BASE_URL).host; } catch (_) { /* keep invalid */ }
  res.json({
    configured: configured(),
    pid: PID,
    key: info(KEY),
    type: TYPE,
    baseUrlHost: host,
    baseUrlTailsWithSlash: BASE_URL.endsWith('/'),
    appUrl: APP_URL,
  });
});

/* ---------------- 下单：建 pending 订单 + 返回支付页地址 ---------------- */
router.post('/create', authRequired, activatedRequired, ah(async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置（缺少易支付商户参数）' });

  const pkg = PACKAGE_MAP[req.body?.packageId];
  if (!pkg) return res.status(400).json({ error: '套餐不存在' });

  const orderNo = genOrderNo();
  await db.run(
    'INSERT INTO orders (user_id, order_no, amount, credits, status, channel) VALUES (?,?,?,?,?,?)',
    [req.teacherId, orderNo, pkg.amount, pkg.credits, 'pending', 'epay']
  );

  const payUrl = client.buildPayUrl({
    orderNo,
    amount: pkg.amount,
    subject: `算力充值${pkg.credits}`,
    notifyUrl: `${APP_URL}/api/pay/notify`,
    returnUrl: `${APP_URL}/pay/result`,
  });

  res.json({ orderNo, payUrl });
}));

/* ---------------- 异步通知（GET/POST 均支持，明文验签） ---------------- */
const notifyHandler = ah(async (req, res) => {
  const client = getClient();
  if (!client) return res.type('text/plain').send('fail');

  const params = { ...(req.method === 'POST' ? (req.body || {}) : (req.query || {})) };
  if (String(params.pid || '') !== PID) {
    console.warn('[epay] 通知商户号不匹配:', params.out_trade_no);
    return res.type('text/plain').send('fail');
  }
  if (!client.verifyNotify(params)) {
    console.warn('[epay] 通知验签失败:', params.out_trade_no);
    return res.type('text/plain').send('fail');
  }
  const orderNo = String(params.out_trade_no || '');
  if (!orderNo || String(params.trade_status || '') !== 'TRADE_SUCCESS') {
    return res.type('text/plain').send('fail');
  }

  const order = await db.get('SELECT * FROM orders WHERE order_no=?', [orderNo]);
  if (!order) {
    console.warn('[epay] 通知订单不存在:', orderNo);
    return res.type('text/plain').send('fail');
  }
  if (yuanText(order.amount) !== Number(params.money || 0).toFixed(2)) {
    console.warn('[epay] 通知金额不一致:', orderNo, params.money, yuanText(order.amount));
    return res.type('text/plain').send('fail');
  }

  const result = await markOrderPaid(orderNo, params.trade_no);
  console.log(`[epay] 到账 order=${orderNo} alreadyPaid=${result.alreadyPaid} balance=${result.balance}`);
  res.type('text/plain').send('success');
});

router.get('/notify', notifyHandler);
router.post('/notify', express.urlencoded({ extended: false }), notifyHandler);

/* ---------------- 查询订单状态（前端轮询；pending 时主动查单补单） ---------------- */
router.get('/status/:orderNo', authRequired, ah(async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE order_no=? AND user_id=?', [req.params.orderNo, req.teacherId]);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  if (order.status === 'paid') {
    const teacher = await db.get('SELECT credits FROM teachers WHERE id=?', [order.user_id]);
    return res.json({ status: 'paid', credits: order.credits, balance: Number(teacher?.credits || 0) });
  }
  if (order.status !== 'pending') return res.json({ status: order.status });

  const client = getClient();
  if (!client) return res.json({ status: 'pending' });
  try {
    const data = await client.queryOrder(order.order_no);
    if (Number(data?.code) === 1 && Number(data?.status) === 1) {
      const result = await markOrderPaid(order.order_no, data.trade_no);
      return res.json({ status: 'paid', credits: order.credits, balance: result.balance });
    }
  } catch (error) {
    console.warn('[epay] 查单失败:', error.message);
  }
  return res.json({ status: 'pending' });
}));

router.get('/orders', authRequired, ah(async (req, res) => {
  const rows = await db.all(
    `SELECT order_no, amount, credits, status, paid_at, created_at FROM orders
     WHERE user_id=? ORDER BY id DESC LIMIT 50`,
    [req.teacherId]
  );
  res.json({ orders: rows });
}));

module.exports = router;
