/** 对外可见的站点根地址：用于拼兑换链接等需要展示给买家的 URL。
 *  优先取构建期环境变量 VITE_PUBLIC_BASE_URL；本地开发（localhost/127.0.0.1）回退到当前地址方便测试；
 *  其余任何环境（Vercel 预览域名、内网 IP 等）一律固定为正式域名，避免把预览域名发给买家。 */
export const OFFICIAL_BASE_URL = 'https://teach.rayzo.cn';

const ENV_BASE_URL = (import.meta.env?.VITE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export const BASE_URL =
  ENV_BASE_URL ||
  (typeof window !== 'undefined' && LOCAL_HOSTNAMES.includes(window.location.hostname)
    ? window.location.origin
    : OFFICIAL_BASE_URL);

