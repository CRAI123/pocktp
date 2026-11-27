/** 支付宝 AI 网页应用收款 SDK 配置。
 *
 * 私钥只从服务端环境变量读取，不下发到客户端、不写入日志。
 * Node.js 使用 PKCS#1 应用私钥；这里保留密钥原始内容，不做 Base64 或换行加工。
 */
const { AlipaySdk } = require('alipay-sdk');

const PRODUCTION_GATEWAY = 'https://openapi.alipay.com/gateway.do';

function envText(value) {
  return String(value == null ? '' : value).trim().replace(/^['"]|['"]$/g, '');
}

function readAlipayConfig() {
  const appUrl = (envText(process.env.APP_URL) || 'https://teach.rayzo.cn').replace(/\/$/, '');
  return {
    appId: envText(process.env.ALIPAY_APP_ID),
    privateKey: envText(process.env.ALIPAY_PRIVATE_KEY),
    alipayPublicKey: envText(process.env.ALIPAY_PUBLIC_KEY),
    gateway: envText(process.env.ALIPAY_GATEWAY) || PRODUCTION_GATEWAY,
    sellerId: envText(process.env.ALIPAY_SELLER_ID),
    sellerEmail: envText(process.env.ALIPAY_SELLER_EMAIL),
    appUrl,
    returnUrl: envText(process.env.ALIPAY_RETURN_URL) || `${appUrl}/pay/result`,
  };
}

function configured(config) {
  return Boolean(
    config.appId
      && config.privateKey
      && config.alipayPublicKey
      && (config.sellerId || config.sellerEmail)
  );
}

function isLocalUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/** 本地开发没有公网回调时省略 notify_url；显式设置空值也可禁用。 */
function resolveNotifyUrl(config) {
  const explicit = Object.prototype.hasOwnProperty.call(process.env, 'ALIPAY_NOTIFY_URL');
  if (!explicit && !envText(process.env.APP_URL) && process.env.NODE_ENV !== 'production') return '';
  const raw = explicit ? envText(process.env.ALIPAY_NOTIFY_URL) : `${config.appUrl}/api/pay/notify`;
  if (!raw || isLocalUrl(raw)) return '';
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ALIPAY_NOTIFY_URL 必须使用 HTTP/HTTPS');
  return url.toString();
}

function resolveReturnUrl(config) {
  const url = new URL(config.returnUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ALIPAY_RETURN_URL 必须使用 HTTP/HTTPS');
  return url.toString();
}

let cached = null;
function getAlipayClient() {
  const config = readAlipayConfig();
  if (!configured(config)) return null;
  if (!cached) {
    cached = {
      sdk: new AlipaySdk({
        appId: config.appId,
        privateKey: config.privateKey,
        alipayPublicKey: config.alipayPublicKey,
        gateway: config.gateway,
        signType: 'RSA2',
        keyType: 'PKCS1',
        camelcase: false,
      }),
      config,
    };
  }
  return cached;
}

module.exports = { getAlipayClient, readAlipayConfig, resolveNotifyUrl, resolveReturnUrl };
