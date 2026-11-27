import { Navigate } from 'react-router-dom';

/** 原「续费与激活码」页面已合并到算力充值页（含激活码兑换），这里只保留跳转。 */
export default function Renew() {
  return <Navigate to="/recharge" replace />;
}
