/** Vercel Serverless 入口：复用 Express 应用，等数据库初始化完成后再处理请求。
 *  - db.ready 在 require 阶段就开始执行，若失败会立刻 reject；
 *    冷启动期间先 catch 一次，避免 Node 以 Unhandled Rejection 直接杀掉函数
 *  - 初始化失败时返回 503 + 具体错误信息，便于线上排查（而不是无意义的 500） */
const app = require('../server/index');
const db = require('../server/db');

/* 把 Promise 结果变成「值」：成功为 undefined，失败为 Error 对象 */
const dbReady = db.ready.then(() => null, e => e);

module.exports = async (req, res) => {
  const err = await dbReady;
  if (err) {
    return res.status(503).json({ error: 'DB_INIT_FAILED', message: err.message });
  }
  return app(req, res);
};
