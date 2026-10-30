/** 对外可见的站点根地址：用于拼兑换链接等需要展示给买家的 URL。
 *  只有本地开发（localhost / 127.0.0.1）才用当前地址，方便本地测兑换流程；
 *  其余任何环境（正式域名、Vercel 预览域名、内网 IP 等）一律固定为正式域名，
 *  避免把部署域名发给买家（也不再读构建期环境变量，防止线上配错）。 */
export const OFFICIAL_BASE_URL = 'https://teach.rayzo.cn';

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export const BASE_URL =
  typeof window !== 'undefined' && LOCAL_HOSTNAMES.includes(window.location.hostname)
    ? window.location.origin
    : OFFICIAL_BASE_URL;
