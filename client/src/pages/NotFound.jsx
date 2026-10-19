import { Link } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';
import { Button, BrandFooter } from '../components/ui.jsx';

/** 品牌 404 页 */
export default function NotFound() {
  return (
    <div className="auth-bg relative flex min-h-screen flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="w-full max-w-md">
        <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-6 h-20 w-20 rounded-full" />
        <div className="brand-gradient-text text-7xl font-bold tracking-tight">404</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">页面走丢了</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          你访问的地址不存在或已被移动<br />
          课堂还要继续，回工作台接着忙吧
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button><Home size={16} />返回工作台</Button>
          </Link>
          <Link to="/teaching">
            <Button variant="secondary"><Compass size={16} />去专项练习</Button>
          </Link>
        </div>
      </div>

      <BrandFooter fixed />
    </div>
  );
}
