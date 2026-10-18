/** Vercel Serverless 入口：复用 Express 应用，等数据库初始化完成后再处理请求 */
const app = require('../server/index');
const db = require('../server/db');

module.exports = async (req, res) => {
  await db.ready;
  return app(req, res);
};
