/** 算力充值支付：拉卡拉 MOSS（商户一站式服务）
 *
 *  网关：POST {baseUrl}/ord-api/unified/v3 ，靠 head.serviceId 区分接口
 *    下单   serviceId = lfops.moss.order.pay
 *    查单   serviceId = lfops.moss.order.qry
 *    回调   平台 POST 到 notify_url（加密报文 {head, requestEncrypted, sign}）
 *
 *  安全（详见 server/moss.js，已用 SDK 真实样例 + 用户密钥验证）：
 *    - 请求报文加密模式：业务参数用平台公钥 RSA 加密，sign = SHA1withRSA
 *    - 响应 / 回调均验签 + 解密；回调验签失败绝不加算力
 *    - 回调/补单幂等：仅当订单仍为 pending 时才加算力
 *
 *  环境变量（Vercel 项目设置里需配同名变量）：
 *    LAKALA_APPID           businessChannel，如 C00003134
 *    LAKALA_MERCHANT_NO     mer_no，如 M00006108
 *    LAKALA_PRIVATE_KEY     商户私钥 PEM（PKCS8，换行用 \n 转义成单行）
 *    LAKALA_PUBLIC_KEY      平台公钥 PEM（SPKI，换行用 \n 转义成单行，验签+加密用）
 *    LAKALA_ACCOUNT_TYPE    钱包类型，默认 ALIPAY（可选 UQRCODEPAY 聚合码）
 *    LAKALA_MOSS_BASE_URL   默认 https://moss.lakala.com/ord-api/unified/v3
 *    APP_URL                默认 https://teach.rayzo.cn（拼 notify_url，不能带参数）
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { ah } = require('../util');
const { authRequired, activatedRequired, invalidateFeatures } = require('../auth');
const { createMossClient } = require('../moss');

const router = express.Router();

/* ---------------- 配置 ---------------- */
const APPID = process.env.LAKALA_APPID || '';
const MERCHANT_NO = process.env.LAKALA_MERCHANT_NO || '';
const PRIVATE_KEY = (process.env.LAKALA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PUBLIC_KEY = (process.env.LAKALA_PUBLIC_KEY || '').replace(/\\n/g, '\n');
const ACCOUNT_TYPE = process.env.LAKALA_ACCOUNT_TYPE || 'ALIPAY';
const MOSS_BASE_URL = (process.env.LAKALA_MOSS_BASE_URL || 'https://moss.lakala.com/ord-api/unified/v3').replace(/\/$/, '');
const APP_URL = (process.env.APP_URL || 'https://teach.rayzo.cn').replace(/\/$/, '');

function configured() {
  return !!(APPID && MERCHANT_NO && PRIVATE_KEY && PUBLIC_KEY);
}

/* 懒加载 MOSS 客户端：缺配置时不崩溃，命中接口才返回 503 */
let _client = null;
function getClient() {
  if (!configured()) return null;
  if (!_client) {
    _client = createMossClient({
      baseUrl: MOSS_BASE_URL,
      appId: APPID,
      merchantNo: MERCHANT_NO,
      privateKeyPem: PRIVATE_KEY,
      publicKeyPem: PUBLIC_KEY,
    });
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
  // ≤32 位：TW + 时间戳(13) + 6 hex = 21
  return 'TW' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket?.remoteAddress || req.ip || '127.0.0.1').replace(/^::ffff:/, '');
}

/**
 * 幂等标记订单已支付并加算力。
 * @returns {{found:boolean, alreadyPaid:boolean, balance:number, credits:number}}
 */
async function markOrderPaid(orderNo, transactionId) {
  return db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE order_no = ?', [orderNo]);
    if (!order) return { found: false, alreadyPaid: false, balance: 0, credits: 0 };
    const r = await tx.run(
      `UPDATE orders SET status='paid', transaction_id=?, channel='lakala', paid_at=?
       WHERE order_no=? AND status='pending'`,
      [transactionId || '', nowText(), orderNo]
    );
    if (r.changes === 1) {
      await tx.run('UPDATE teachers SET credits = credits + ? WHERE id = ?', [order.credits, order.user_id]);
      try { invalidateFeatures(order.user_id); } catch (_) { /* 缓存清不掉不影响到账 */ }
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

/** 构造 MOSS 下单业务参数 */
function buildPayRequest(orderNo, amountFen, notifyUrl, ip, opts) {
  const req = {
    order_no: orderNo,
    total_amount: String(amountFen),
    mer_no: MERCHANT_NO,
    pay_scene: opts.payScene,
    notify_url: notifyUrl,
    subject: opts.subject,
    order_eff_time: '5',
  };
  if (opts.accountType) req.account_type = opts.accountType;
  if (opts.transType) req.trans_type = opts.transType;
  if (opts.includeLocation && ip) req.location_info = { request_ip: ip };
  return req;
}

/* ---------------- 公开：套餐列表 ---------------- */
router.get('/packages', (req, res) => {
  res.json({ packages: PACKAGES });
});

/* ---------------- 下单：建 pending 订单 + MOSS 取二维码/收银台 ---------------- */
router.post('/create', authRequired, activatedRequired, ah(async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ error: '支付通道尚未配置（缺少拉卡拉凭证）' });

  const pkg = PACKAGE_MAP[req.body?.packageId];
  if (!pkg) return res.status(400).json({ error: '套餐不存在' });

  const orderNo = genOrderNo();
  await db.run(
    'INSERT INTO orders (user_id, order_no, amount, credits, status, channel) VALUES (?,?,?,?,?,?)',
    [req.teacherId, orderNo, pkg.amount, pkg.credits, 'pending', 'lakala']
  );

  const notifyUrl = `${APP_URL}/api/pay/notify`;
  const subject = `算力充值${pkg.credits}`;
  const ip = clientIp(req);

  // 主方案：pay_scene=1 + trans_type=41(NATIVE) → 返回二维码内容 acc_resp_fields.code
  // 失败回退：pay_scene=0(标准收银台) → 返回 counter_url
  let payRes;
  let mode = 'native';
  try {
    payRes = await client.call(
      'lfops.moss.order.pay',
      buildPayRequest(orderNo, pkg.amount, notifyUrl, ip, {
        payScene: '1',
        transType: '41',
        accountType: ACCOUNT_TYPE,
        includeLocation: true,
        subject,
      })
    );
  } catch (e) {
    console.warn('[pay] scene=1 下单失败，回退 scene=0:', e.message);
    mode = 'counter';
    try {
      payRes = await client.call(
        'lfops.moss.order.pay',
        buildPayRequest(orderNo, pkg.amount, notifyUrl, ip, {
          payScene: '0',
          accountType: ACCOUNT_TYPE,
          includeLocation: false,
          subject,
        })
      );
    } catch (e2) {
      console.error('[pay] MOSS 下单失败:', e2.message);
      return res.status(502).json({ error: `支付网关下单失败：${e2.message}` });
    }
  }

  const qr = payRes?.acc_resp_fields?.code || '';
  const counterUrl = payRes?.counter_url || '';
  if (!qr && !counterUrl) {
    return res.status(502).json({ error: '支付网关未返回二维码或收银台地址' });
  }
  res.json({ orderNo, qr, counterUrl, mode });
}));

/* ---------------- MOSS 异步回调（无登录，加密报文） ---------------- */
router.post('/notify', ah(async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ head: { code: 'MOSS0004', desc: '支付通道未配置' } });

  const { ok, data, error } = client.verifyAndDecryptNotify(req.body || {});
  if (!ok) {
    console.warn('[pay] notify 验签/解密失败:', error, 'order=', req.body?.head?.serviceSn);
    // 验签失败：返回失败应答（停止重发），绝不加算力
    return res.json({ head: { code: 'MOSS0001', desc: '验签失败' } });
  }

  const orderNo = data?.order_no || '';
  const orderStatus = String(data?.order_status || '');
  const tradeMainType = String(data?.trade_main_type || '');
  const transactionId = data?.pay_serial || data?.log_no || '';

  if (orderStatus === 'SUCCESS' && (!tradeMainType || tradeMainType === 'PAY')) {
    const result = await markOrderPaid(orderNo, transactionId);
    console.log(`[pay] notify 到账 order=${orderNo} alreadyPaid=${result.alreadyPaid} balance=${result.balance}`);
  } else {
    console.log(`[pay] notify 非支付成功 order=${orderNo} status=${orderStatus} type=${tradeMainType}`);
  }

  // 成功应答：告知平台停止重发
  res.json({
    head: {
      code: '000000',
      desc: '交易成功',
      serviceId: 'lfops.moss.order.ntc',
      serviceSn: req.body?.head?.serviceSn || '',
      serviceTime: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
    },
  });
}));

/* ---------------- 查询订单状态（前端轮询；pending 时主动查 MOSS 补单） ---------------- */
router.get('/status/:orderNo', authRequired, ah(async (req, res) => {
  const o = await db.get('SELECT * FROM orders WHERE order_no=? AND user_id=?', [req.params.orderNo, req.teacherId]);
  if (!o) return res.status(404).json({ error: '订单不存在' });

  if (o.status === 'paid') {
    const t = await db.get('SELECT credits FROM teachers WHERE id=?', [o.user_id]);
    return res.json({ status: 'paid', credits: o.credits, balance: Number(t?.credits || 0) });
  }

  // pending 时主动查一次 MOSS，覆盖回调丢失场景
  const client = getClient();
  if (client) {
    try {
      const data = await client.call('lfops.moss.order.qry', { order_no: o.order_no });
      if (data?.order_status === 'SUCCESS') {
        const payInfo = Array.isArray(data.pay_info_list) ? data.pay_info_list[0] : null;
        const result = await markOrderPaid(o.order_no, payInfo?.transaction_id || data?.pay_serial || '');
        return res.json({ status: 'paid', credits: result.credits, balance: result.balance });
      }
      if (data?.order_status === 'CLOSE') {
        return res.json({ status: 'expired' });
      }
    } catch (e) {
      // 查询失败不影响本地状态，前端继续轮询
      console.warn('[pay] 补单查询失败:', e.message);
    }
  }
  res.json({ status: 'pending' });
}));

/* ---------------- 我的订单列表 ---------------- */
router.get('/orders', authRequired, ah(async (req, res) => {
  const rows = await db.all(
    `SELECT order_no, amount, credits, status, paid_at, created_at FROM orders
     WHERE user_id=? ORDER BY id DESC LIMIT 50`,
    [req.teacherId]
  );
  res.json({ orders: rows });
}));

module.exports = router;
