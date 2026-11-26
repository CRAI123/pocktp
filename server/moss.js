/**
 * 拉卡拉 MOSS（商户一站式服务）协议适配层
 * 协议依据：moss-sdk-1.0.0 源码逆向（BaseService / SecurityUtil）
 *
 * 报文为「加密模式」：{ head, requestEncrypted, sign }
 *   - head:        公共参数（versionId/serviceId/channelId/requestTime/serviceSn/businessChannel）
 *   - requestEncrypted: 业务参数 JSON 用【平台公钥】RSA 加密后的 base64
 *   - sign:        对 "head=<字母序head JSON>&requestEncrypted=<密文>" 做【SHA1withRSA】签名
 *
 * 关键对齐点（与 Java SDK 一致，已用真实回调样例 + 用户密钥验证）：
 *   1. head JSON 必须按 key 字母序序列化（对应 TreeMap），跳过 null、保留空串、不转义 HTML
 *   2. 签名串 key=value 用 & 连接，跳过空值与 sign 字段
 *   3. RSA 1024 位、PKCS1 v1.5 padding，分块：加密每块 k-11 字节、解密每块 k 字节
 *   4. 商户私钥(PKCS8)用于签名+解密；平台公钥(SPKI)用于验签+加密
 *
 * 说明：Node 22 已禁用 crypto.privateDecrypt 的 PKCS1v1.5（CVE 缓解），
 *      故加解密改用 Node 原生 BigInt 自实现（n/e/d 从 KeyObject 导出 JWK 获取），
 *      签名/验签仍用 crypto（RSA-SHA1 在各版本均可用）。
 */
const crypto = require('crypto');

/* ---------------- 工具函数 ---------------- */

function b64urlToBigInt(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const buf = Buffer.from(s, 'base64');
  let r = 0n;
  for (const b of buf) r = (r << 8n) | BigInt(b);
  return r;
}
function bufToBigInt(buf) {
  let r = 0n;
  for (const b of buf) r = (r << 8n) | BigInt(b);
  return r;
}
function bigIntToBuf(x, k) {
  const hex = x.toString(16).padStart(k * 2, '0');
  return Buffer.from(hex, 'hex');
}
function modPow(base, exp, mod) {
  let r = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return r;
}

/** 上海时区 yyyyMMddHHmmss（服务器可能在 UTC，强制 +08:00） */
function shanghaiTimestamp() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}
function uuid32() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 序列化对象为与 Gson+TreeMap 一致的 JSON：
 *   - key 按字母序排列
 *   - 跳过 null/undefined（Gson 默认不序列化 null）
 *   - 保留空字符串 ''（Gson 会序列化空串）
 *   - 不转义 HTML（对应 disableHtmlEscaping）
 */
function sortedJson(obj) {
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== null && obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(obj[k])).join(',') + '}';
}

/**
 * 拼接待签串：key=value 用 & 连接，按 key 字母序，跳过空值/null 和 sign 字段
 * 对应 SecurityUtil.getSignSrcSkipNull(map, isUseKey=true, split="&")
 */
function buildSignSrc(signMap) {
  const keys = Object.keys(signMap)
    .filter((k) => k !== 'sign' && signMap[k] !== '' && signMap[k] != null)
    .sort();
  return keys.map((k) => `${k}=${signMap[k]}`).join('&');
}

/* ---------------- RSA 加解密（BigInt 自实现 PKCS1 v1.5） ---------------- */

/** 从 PEM 导出 n/e/d 分量 + 模数字节长 k */
function loadRsaComponents(privateKeyPem, publicKeyPem) {
  const privKey = crypto.createPrivateKey(privateKeyPem);
  const pubKey = crypto.createPublicKey(publicKeyPem);
  const privJwk = privKey.export({ format: 'jwk' });
  const pubJwk = pubKey.export({ format: 'jwk' });
  const privN = b64urlToBigInt(privJwk.n);
  const pubN = b64urlToBigInt(pubJwk.n);
  return {
    privKey,
    pubKey,
    // 加密请求用平台公钥
    enc: { n: pubN, e: b64urlToBigInt(pubJwk.e), k: Math.ceil(pubN.toString(2).length / 8) },
    // 解密响应用商户私钥
    dec: { n: privN, d: b64urlToBigInt(privJwk.d), k: Math.ceil(privN.toString(2).length / 8) },
  };
}

/** PKCS1 v1.5 加密：00 02 [PS≥8 非零随机] 00 M，单块 */
function rsaEncryptBlock(plainBuf, { n, e, k }) {
  if (plainBuf.length > k - 11) throw new Error('data too large for RSA block');
  const psLen = k - 3 - plainBuf.length;
  const ps = Buffer.alloc(psLen);
  for (let i = 0; i < psLen; ) {
    const b = crypto.randomBytes(1)[0];
    if (b !== 0) {
      ps[i] = b;
      i++;
    }
  }
  const eb = Buffer.concat([Buffer.from([0x00, 0x02]), ps, Buffer.from([0x00]), plainBuf]);
  const c = modPow(bufToBigInt(eb), e, n);
  return bigIntToBuf(c, k);
}
function rsaEncrypt(plaintext, comp) {
  const buf = Buffer.from(plaintext, 'utf8');
  const chunk = comp.k - 11;
  let out = Buffer.alloc(0);
  for (let i = 0; i < buf.length; i += chunk) {
    out = Buffer.concat([out, rsaEncryptBlock(buf.slice(i, i + chunk), comp)]);
  }
  return out.toString('base64');
}

/** PKCS1 v1.5 解密单块：校验 00 02 ... 00 M */
function rsaDecryptBlock(cipherBuf, { n, d, k }) {
  const m = modPow(bufToBigInt(cipherBuf), d, n);
  const eb = bigIntToBuf(m, k);
  if (eb[0] !== 0x00 || eb[1] !== 0x02) throw new Error('Encryption block is invalid (bad header)');
  let i = 2;
  while (i < eb.length && eb[i] !== 0x00) i++;
  if (i >= eb.length) throw new Error('Encryption block is invalid (no separator)');
  if (i - 2 < 8) throw new Error('Encryption block is invalid (pad too short)');
  return eb.slice(i + 1);
}
function rsaDecrypt(b64, comp) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length % comp.k !== 0) throw new Error(`ciphertext not aligned: ${buf.length} % ${comp.k}`);
  let out = Buffer.alloc(0);
  for (let i = 0; i < buf.length; i += comp.k) {
    out = Buffer.concat([out, rsaDecryptBlock(buf.slice(i, i + comp.k), comp)]);
  }
  return out.toString('utf8');
}

/* ---------------- 签名 / 验签 ---------------- */

function rsaSign(src, privKey) {
  return crypto.createSign('RSA-SHA1').update(src, 'utf8').sign(privKey, 'base64');
}
function rsaVerify(src, sigB64, pubKey) {
  try {
    return crypto.createVerify('RSA-SHA1').update(src, 'utf8').verify(pubKey, sigB64, 'base64');
  } catch {
    return false;
  }
}

/* ---------------- 客户端 ---------------- */

/**
 * 创建 MOSS 客户端
 * @param {Object} cfg
 * @param {string} cfg.baseUrl        网关基址，如 https://moss.lakala.com/ord-api/unified/v3
 * @param {string} cfg.appId          businessChannel，如 C00003134
 * @param {string} cfg.merchantNo     mer_no，如 M00006108
 * @param {string} cfg.privateKeyPem  商户私钥 PEM（PKCS8）
 * @param {string} cfg.publicKeyPem   平台公钥 PEM（SPKI）
 * @param {string} [cfg.accountType]  默认钱包类型 ALIPAY
 * @param {number} [cfg.timeoutMs]    请求超时，默认 15s
 */
function createMossClient(cfg) {
  const { baseUrl, appId, merchantNo, privateKeyPem, publicKeyPem, timeoutMs = 15000 } = cfg;
  const keys = loadRsaComponents(privateKeyPem, publicKeyPem);

  async function call(serviceId, request) {
    const head = {
      versionId: '1.0',
      serviceId,
      channelId: 'API',
      requestTime: shanghaiTimestamp(),
      serviceSn: uuid32(),
      businessChannel: appId,
    };
    const headJson = sortedJson(head);
    const requestEncrypted = rsaEncrypt(JSON.stringify(request), keys.enc);
    const signSrc = buildSignSrc({ head: headJson, requestEncrypted });
    const sign = rsaSign(signSrc, keys.privKey);
    const body = JSON.stringify({ head, requestEncrypted, sign });

    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body,
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs);
    }
    let res;
    try {
      res = await fetch(baseUrl, init);
    } catch (e) {
      throw new Error(`MOSS 网络请求失败(${serviceId}): ${e.message}`);
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`MOSS 响应非 JSON(${serviceId}): ${text.slice(0, 200)}`);
    }
    if (!json || !json.head) {
      throw new Error(`MOSS 响应缺少 head(${serviceId}): ${text.slice(0, 200)}`);
    }
    if (json.head.code !== '000000') {
      throw new Error(`MOSS ${serviceId} 返回错误: ${json.head.code} ${json.head.desc || ''}`.trim());
    }
    // 验签
    const resHeadJson = sortedJson(json.head);
    const vSrc = buildSignSrc({ head: resHeadJson, responseEncrypted: json.responseEncrypted });
    if (!rsaVerify(vSrc, json.sign, keys.pubKey)) {
      throw new Error(`MOSS ${serviceId} 响应验签失败`);
    }
    // 解密
    let plain;
    try {
      plain = rsaDecrypt(json.responseEncrypted, keys.dec);
    } catch (e) {
      throw new Error(`MOSS ${serviceId} 响应解密失败: ${e.message}`);
    }
    try {
      return JSON.parse(plain);
    } catch {
      throw new Error(`MOSS ${serviceId} 响应解密后非 JSON: ${plain.slice(0, 200)}`);
    }
  }

  /**
   * 验签并解密回调通知（平台 → 商户）
   * @param {Object} body  解析后的请求体 {head, requestEncrypted, sign}
   * @returns {{ok:boolean, data?:Object, error?:string}}
   */
  function verifyAndDecryptNotify(body) {
    if (!body || !body.head || !body.requestEncrypted || !body.sign) {
      return { ok: false, error: '回调报文缺少 head/requestEncrypted/sign' };
    }
    const headJson = sortedJson(body.head);
    const signSrc = buildSignSrc({ head: headJson, requestEncrypted: body.requestEncrypted });
    if (!rsaVerify(signSrc, body.sign, keys.pubKey)) {
      return { ok: false, error: '回调验签失败' };
    }
    try {
      const plain = rsaDecrypt(body.requestEncrypted, keys.dec);
      return { ok: true, data: JSON.parse(plain) };
    } catch (e) {
      return { ok: false, error: '回调解密失败: ' + e.message };
    }
  }

  return { call, verifyAndDecryptNotify, merchantNo, appId };
}

module.exports = {
  createMossClient,
  // 暴露工具便于单元自检
  sortedJson,
  buildSignSrc,
  rsaSign,
  rsaVerify,
  rsaEncrypt,
  rsaDecrypt,
  loadRsaComponents,
  shanghaiTimestamp,
  uuid32,
};
