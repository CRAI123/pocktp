/** async handler 包装器：Express 4 不自动捕获 async 异常，统一转交错误中间件 */
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { ah };
