/** Vercel Serverless 入口：复用 Express 应用，等数据库初始化完成后再处理请求。
 *  数据库初始化失败时返回 503 + 具体错误信息，便于线上排查（而不是无意义的 500）。 */
const app = require('../server/index');
const db = require('../server/db');

module.exports = async (req, res) => {
  try {
    await db.ready;
  } catch (e) {
    return res.status(503).json({ error: 'DB_INIT_FAILED', message: e.message });
  }
  return app(req, res);
};
