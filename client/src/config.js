/** 对外可见的站点根地址：用于拼兑换链接等需要展示给买家的 URL。
 *  优先取构建期环境变量 VITE_PUBLIC_BASE_URL（部署到 teach.rayzo.cn 时写为 https://teach.rayzo.cn），
 *  本地开发未配置时回退到当前浏览器地址（方便用 localhost 测试）。
 */
export const BASE_URL =
  (import.meta.env?.VITE_PUBLIC_BASE_URL || '').replace(/\/+$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');
