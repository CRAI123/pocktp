/**
 * 自动发货 API（给第三方卡密 / 自动发货平台调用）：
 *
 *   GET /api/delivery/code?key=<密钥>
 *     可选参数：
 *       tier=7d-light|7d-std|...  按档位取算力与天数（与后台快选档位一致）
 *       credits=300&days=7        或直接指定算力 / 激活后有效天数（0=永久）
 *       order=<订单号>            同一订单号重复调用返回同一个码（幂等，防重复发货）
 *       format=json|text|code     返回格式，默认 json；text 为「网址+激活码」两行，code 仅激活码
 *
 * 密钥从服务端环境变量 DELIVERY_KEY 读取（Vercel 项目设置里配置），不写死在代码里。
 */
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { ah } = require('../util');

const router = express.Router();

/* 无歧义字符集（与后台生成规则一致：去除 0/O/1/I） */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += CHARSET[bytes[i] % CHARSET.length];
  return s;
}

/** 档位（与 client/src/pages/Admin.jsx 的 TIERS 保持一致） */
const TIERS = {
  '7d-light':   { days: 7,   credits: 100 },
  '7d-std':     { days: 7,   credits: 300 },
  '7d-large':   { days: 7,   credits: 600 },
  '14d-std':    { days: 14,  credits: 600 },
  '14d-large':  { days: 14,  credits: 1200 },
  '30d-std':    { days: 30,  credits: 1500 },
  '30d-large':  { days: 30,  credits: 3000 },
  '90d-large':  { days: 90,  credits: 4500 },
  '365d-large': { days: 365, credits: 18000 },
  'perm-light': { days: 0,   credits: 1000 },
  'perm-std':   { days: 0,   credits: 3000 },
  'perm-large': { days: 0,   credits: 10000 },
  'perm-top':   { days: 0,   credits: 30000 },
};

const DEFAULT_TIER = '7d-std';
const BATCH = 'API自动发货';
const REDEEM_BASE = (process.env.PUBLIC_BASE_URL || 'https://teach.rayzo.cn').replace(/\/+$/, '');

const digits = (v, fallback, max) => {
  const n = parseInt(v, 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 0), max);
};

const fmtCode = code => code.replace(/(.{4})(?=.)/g, '$1-');
const redeemUrl = code => `${REDEEM_BASE}/redeem/${code}`;

function send(res, row, format) {
  const code = row.code;
  const credits = row.credits ?? 1000;
  const days = row.valid_days ?? 7;

  if (format === 'code') return res.type('text/plain').send(fmtCode(code));
  if (format === 'text') {
    return res.type('text/plain').send(`一键激活网址：${redeemUrl(code)}\n激活码：${fmtCode(code)}`);
  }
  return res.json({
    code,
    formatted: fmtCode(code),
    redeem_url: redeemUrl(code),
    credits,
    valid_days: days,
  });
}

router.get('/code', ah(async (req, res) => {
  const expected = process.env.DELIVERY_KEY;
  if (!expected) return res.status(503).json({ error: '服务端未配置 DELIVERY_KEY 环境变量' });

  const key = req.get('x-delivery-key') || req.query.key;
  if (!key || key !== expected) return res.status(401).json({ error: '密钥错误' });

  const format = String(req.query.format || 'json').toLowerCase();
  const order = String(req.query.order || '').trim().slice(0, 60);

  /* 幂等：同一订单号只发一次码 */
  if (order) {
    const exist = await db.get(
      "SELECT code, credits, valid_days FROM activation_codes WHERE note = ? ORDER BY id DESC LIMIT 1",
      [`API:${order}`]
    );
    if (exist) return send(res, exist, format);
  }

  const tierKey = String(req.query.tier || DEFAULT_TIER);
  const tier = TIERS[tierKey] || TIERS[DEFAULT_TIER];
  const credits = digits(req.query.credits, tier.credits, 10000000);
  const days = digits(req.query.days, tier.days, 3650);
  const note = order ? `API:${order}` : '';

  let code = genCode();
  try {
    await db.run(
      'INSERT INTO activation_codes (code, batch, note, expires_at, credits, valid_days) VALUES (?,?,?,?,?,?)',
      [code, BATCH, note, '', credits, days]
    );
  } catch (e) {
    if (e.code !== '23505') throw e;
    code = genCode();
    await db.run(
      'INSERT INTO activation_codes (code, batch, note, expires_at, credits, valid_days) VALUES (?,?,?,?,?,?)',
      [code, BATCH, note, '', credits, days]
    );
  }

  return send(res, { code, credits, valid_days: days }, format);
}));

module.exports = router;
