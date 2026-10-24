/**
 * Supabase Storage 辅助：service_role 密钥直连 Storage API（不走 RLS）。
 * 环境变量：SUPABASE_URL（项目 URL，如 https://xxx.supabase.co）/ SUPABASE_SERVICE_ROLE_KEY
 * 桶：materials（私有，首次调用时自动创建；50MB/文件上限）
 * 全部访问经后端签名 URL，密钥不下发前端。
 */
const BUCKET = 'materials';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

const URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const enabled = () => !!(URL() && KEY());

const headers = () => ({
  Authorization: `Bearer ${KEY()}`,
  apikey: KEY(),
  'Content-Type': 'application/json',
});

let bucketReady = null;
/** 幂等建桶（已存在视为成功）；只执行一次 */
function ensureBucket() {
  if (!enabled()) return Promise.reject(new Error('云存储未配置'));
  if (!bucketReady) {
    bucketReady = (async () => {
      const r = await fetch(`${URL()}/storage/v1/bucket`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES }),
      });
      if (!r.ok) {
        const t = await r.text();
        if (!/already exists|Duplicate/i.test(t)) throw new Error(`创建存储桶失败：${t}`);
      }
    })().catch(e => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

/** 申请签名上传地址：返回绝对 uploadUrl，客户端 PUT 文件体直传；path 为桶内对象路径 */
async function signedUploadUrl(path) {
  await ensureBucket();
  const r = await fetch(`${URL()}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: headers(), body: '{}',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || d.message || `申请上传地址失败（${r.status}）`);
  return `${URL()}${d.url}`;
}

/** 申请签名下载地址（默认 10 分钟有效） */
async function signedDownloadUrl(path, expiresIn = 600) {
  const r = await fetch(`${URL()}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ expiresIn }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.signedURL) throw new Error(d.error || d.message || `申请下载地址失败（${r.status}）`);
  return `${URL()}${d.signedURL}`;
}

/** 删除对象（忽略失败，避免影响主流程） */
async function removeObjects(paths) {
  if (!enabled() || !paths.length) return;
  try {
    await fetch(`${URL()}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE', headers: headers(), body: JSON.stringify({ prefixes: paths }),
    });
  } catch (_) {}
}

module.exports = { BUCKET, MAX_BYTES, enabled, signedUploadUrl, signedDownloadUrl, removeObjects };
