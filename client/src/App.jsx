import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, api, isMembershipActive, canUseFinance } from './api.js';
import Layout, { isDesktopApp, DesktopTitlebar } from './components/Layout.jsx';
import { syncCloseToTray } from './desktop.js';
import UpdateDialog from './components/UpdateDialog.jsx';
import Login from './pages/Login.jsx';
import Activate from './pages/Activate.jsx';
import Renew from './pages/Renew.jsx';
import Redeem from './pages/Redeem.jsx';
import Admin from './pages/Admin.jsx';
import SubjectIndex from './pages/teaching/SubjectIndex.jsx';
import ChineseIndex from './pages/teaching/ChineseIndex.jsx';
import MathIndex from './pages/teaching/MathIndex.jsx';
import EnglishIndex from './pages/teaching/EnglishIndex.jsx';
import ChineseDictation from './pages/teaching/ChineseDictation.jsx';
import ChinesePinyin from './pages/teaching/ChinesePinyin.jsx';
import ChineseFix from './pages/teaching/ChineseFix.jsx';
import ChinesePoem from './pages/teaching/ChinesePoem.jsx';
import EnglishSentence from './pages/teaching/EnglishSentence.jsx';
import EnglishWordbank from './pages/teaching/EnglishWordbank.jsx';
import EnglishReading from './pages/teaching/EnglishReading.jsx';
import EnglishDictation from './pages/teaching/EnglishDictation.jsx';
import ComprehensiveExam from './pages/teaching/ComprehensiveExam.jsx';
import ClassroomPractice from './pages/teaching/ClassroomPractice.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ClassDetail from './pages/ClassDetail.jsx';
import Classes from './pages/Classes.jsx';
import Courses from './pages/Courses.jsx';
import Materials from './pages/Materials.jsx';
import Assignments from './pages/Assignments.jsx';
import Grades from './pages/Grades.jsx';
import Students from './pages/Students.jsx';
import Attendance from './pages/Attendance.jsx';
import Finance from './pages/Finance.jsx';
import Notifications from './pages/Notifications.jsx';
import Todos from './pages/Todos.jsx';
import Comments from './pages/Comments.jsx';
import AiTools from './pages/AiTools.jsx';
import Timetable from './pages/Timetable.jsx';
import Journals from './pages/Journals.jsx';
import Classroom from './pages/Classroom.jsx';
import NotFound from './pages/NotFound.jsx';
import Download from './pages/Download.jsx';
import PrivacyNotice from './components/PrivacyNotice.jsx';

/** 路由守卫：未登录跳 /login；未激活或会员到期跳 /activate 续费 */
function RequireAuth() {
  const t = auth.teacher;
  if (!auth.token) return <Navigate to="/login" replace />;
  if (t && !isMembershipActive(t)) return <Navigate to="/activate" replace />;
  return <Outlet />;
}

/** 路由守卫：仅管理员 */
function RequireAdmin() {
  const t = auth.teacher;
  if (!auth.token) return <Navigate to="/login" replace />;
  if (!t?.is_admin) return <Navigate to="/" replace />;
  return <Admin />;
}

/** 路由守卫：课时费与工作量（管理员在后台分配后才可访问） */
function RequireFinance() {
  if (!canUseFinance()) return <Navigate to="/" replace />;
  return <Finance />;
}

export default function App() {
  const [updateOpen, setUpdateOpen] = useState(false);
  /* 教师信息刷新计数：管理后台改权限后，重新拉取使导航与路由守卫即时生效 */
  const [, setMeTick] = useState(0);

  useEffect(() => {
    if (!auth.token) return;
    /* 免密登录续期 */
    api.post('/auth/refresh', { remember: auth.remember })
      .then(r => { if (r?.token) auth.save(r.token, auth.teacher, auth.remember); })
      .catch(() => {});
    /* 同步最新的账号信息（功能权限等） */
    api.get('/auth/me')
      .then(t => { auth.save(auth.token, t, auth.remember); setMeTick(v => v + 1); })
      .catch(() => {});
  }, []);

  /* 桌面端检查更新：壳内 F5 热键 / 托盘「检查更新」→ 事件通知 → 打开应用内弹窗；
   * 网页端不注册，保持浏览器默认刷新 */
  useEffect(() => {
    if (!isDesktopApp()) return;
    /* 把用户偏好同步给壳：关闭窗口时是否最小化到托盘（默认直接退出） */
    syncCloseToTray(localStorage.getItem('tw_close_tray') === '1');
    let unlisten;
    window.__TAURI__?.event
      ?.listen?.('tw-update-check', () => setUpdateOpen(true))
      .then((u) => { unlisten = u; })
      .catch(() => {});

    /* 启动自动检查：由网页在挂载后主动调用壳命令，避免壳端 4 秒后发的事件
     * 早于远程页面注册监听而丢失；只有确实有新版本才自动弹窗 */
    const timer = setTimeout(() => {
      window.__TAURI__?.core?.invoke?.('check_update')
        .then((r) => { if (r) setUpdateOpen(true); })
        .catch(() => {});
    }, 1200);

    const onKey = (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setUpdateOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      unlisten?.();
    };
  }, []);

  /* 桌面端快捷键适配：Ctrl+R 刷新；Ctrl +/-/0 界面缩放（持久化，教室大屏友好）；
   * F11 全屏切换（课堂小助手投屏用）。网页端一律不注册，保持浏览器原生行为 */
  useEffect(() => {
    if (!isDesktopApp()) return;
    const ZK = 'tw_zoom';
    const cur = () => parseFloat(localStorage.getItem(ZK) || '1') || 1;
    const applyZoom = (z) => {
      const c = Math.min(1.5, Math.max(0.7, Math.round(z * 100) / 100));
      document.documentElement.style.zoom = String(c);
      localStorage.setItem(ZK, String(c));
    };
    const saved = cur();
    if (saved !== 1) document.documentElement.style.zoom = String(saved);
    const onKey = (e) => {
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); applyZoom(cur() + 0.1); }
      else if (e.ctrlKey && e.key === '-') { e.preventDefault(); applyZoom(cur() - 0.1); }
      else if (e.ctrlKey && e.key === '0') { e.preventDefault(); applyZoom(1); }
      else if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); window.location.reload(); }
      else if (e.key === 'F11') {
        e.preventDefault();
        const w = window.__TAURI__?.window?.getCurrentWindow?.();
        w?.isFullscreen?.().then((f) => w.setFullscreen(!f)).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* 桌面端自绘标题栏（无边框窗口）；网页端不渲染 */}
      <DesktopTitlebar />
      {updateOpen && <UpdateDialog onClose={() => setUpdateOpen(false)} />}
      <div className={isDesktopApp() ? 'pt-9' : ''}>
      {/* Cookie / 隐私提示条：全站首访出现，同意状态仅存本地 */}
      <PrivacyNotice />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/download" element={<Download />} />
      <Route path="/redeem/:code?" element={<Redeem />} />
      <Route path="/activate" element={auth.token ? <Activate /> : <Navigate to="/login" replace />} />
      <Route path="/renew" element={auth.token ? <Renew /> : <Navigate to="/login" replace />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<Courses />} />
          <Route path="materials" element={<Materials />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="grades" element={<Grades />} />
          <Route path="teaching" element={<SubjectIndex />} />
          <Route path="teaching/chinese" element={<ChineseIndex />} />
          <Route path="teaching/math" element={<MathIndex />} />
          <Route path="teaching/english" element={<EnglishIndex />} />
          <Route path="teaching/chinese/dictation" element={<ChineseDictation />} />
          <Route path="teaching/chinese/pinyin" element={<ChinesePinyin />} />
          <Route path="teaching/chinese/fix" element={<ChineseFix />} />
          <Route path="teaching/chinese/poem" element={<ChinesePoem />} />
          <Route path="teaching/english/sentence" element={<EnglishSentence />} />
          <Route path="teaching/english/wordbank" element={<EnglishWordbank />} />
          <Route path="teaching/english/reading" element={<EnglishReading />} />
          <Route path="teaching/english/dictation" element={<EnglishDictation />} />
          <Route path="teaching/exam" element={<ComprehensiveExam />} />
          <Route path="teaching/classroom-practice" element={<ClassroomPractice />} />
          <Route path="students" element={<Students />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/new" element={<Classes />} />
          <Route path="classes/:id" element={<ClassDetail />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="finance" element={<RequireFinance />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="todos" element={<Todos />} />
          <Route path="comments" element={<Comments />} />
          <Route path="ai-tools" element={<AiTools />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="journals" element={<Journals />} />
          <Route path="classroom" element={<Classroom />} />
          <Route path="admin" element={<RequireAdmin />} />
        </Route>
      </Route>
      {/* 品牌 404：任何未匹配路径（含未登录）均展示 */}
      <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
    </>
  );
}
