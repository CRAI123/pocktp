/** 易支付（彩虹易支付协议）客户端
 *
 *  网关：
 *    {base}submit.php  页面支付（浏览器跳转 / 生成可扫码的支付页地址）
 *    {base}api.php     查单、退款（act=order / act=refund）
 *
 *  签名规则：参数按 key 升序拼成 k=v&k=v，末尾直接拼接商户密钥，MD5 取小写十六进制。
 *  异步通知同样规则验签，需排除 sign 与 sign_type。
 *
 *  环境变量见 server/routes/epayPay.js 顶部说明。
 */
const crypto = require('crypto');

function md5(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

/** 参与签名的参数：排除 sign / sign_type 与空值，按 key ASCII 升序 */
function signableEntries(params) {
  return Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type')
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .sort()
    .map((k) => [k, String(params[k])]);
}

function signParams(params, key) {
  const raw = signableEntries(params).map(([k, v]) => `${k}=${v}`).join('&');
  return md5(raw + key);
}

function createEpayClient({ baseUrl, pid, key, type = 'alipay' }) {
  const base = String(baseUrl).replace(/\/+$/, '') + '/';

  /**
   * 生成页面支付地址。amount 单位为分，网关要求元并保留两位小数。
   */
  function buildPayUrl({ orderNo, amount, subject, notifyUrl, returnUrl }) {
    const params = {
      pid,
      type,
      out_trade_no: orderNo,
      name: subject,
      money: (Number(amount) / 100).toFixed(2),
      notify_url: notifyUrl,
      return_url: returnUrl,
    };
    params.sign = signParams(params, key);
    params.sign_type = 'MD5';
    const qs = new URLSearchParams(params).toString();
    return `${base}submit.php?${qs}`;
  }

  /** 校验异步通知签名（同时校验商户号由调用方完成） */
  function verifyNotify(params) {
    if (!params || !params.sign) return false;
    const expected = signParams(params, key);
    const actual = String(params.sign).toLowerCase();
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  /** 主动查单：返回网关原始 JSON，status=1 表示已支付 */
  async function queryOrder(orderNo) {
    const qs = new URLSearchParams({ act: 'order', pid, key, out_trade_no: orderNo }).toString();
    const resp = await fetch(`${base}api.php?${qs}`, { headers: { accept: 'application/json' } });
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error('支付网关返回内容无法解析');
    }
  }

  return { base, pid, key, type, buildPayUrl, verifyNotify, queryOrder };
}

module.exports = { createEpayClient, signParams };
