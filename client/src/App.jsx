import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { auth, isMembershipActive } from './api.js';
import Layout, { isDesktopApp, DesktopTitlebar } from './components/Layout.jsx';
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
import Notifications from './pages/Notifications.jsx';
import Todos from './pages/Todos.jsx';
import Comments from './pages/Comments.jsx';
import AiWriter from './pages/AiWriter.jsx';
import Journals from './pages/Journals.jsx';
import Classroom from './pages/Classroom.jsx';
import NotFound from './pages/NotFound.jsx';
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

export default function App() {
  return (
    <>
      {/* 桌面端自绘标题栏（无边框窗口）；网页端不渲染 */}
      <DesktopTitlebar />
      <div className={isDesktopApp() ? 'pt-9' : ''}>
      {/* Cookie / 隐私提示条：全站首访出现，同意状态仅存本地 */}
      <PrivacyNotice />
      <Routes>
      <Route path="/login" element={<Login />} />
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
          <Route path="notifications" element={<Notifications />} />
          <Route path="todos" element={<Todos />} />
          <Route path="comments" element={<Comments />} />
          <Route path="ai-writer" element={<AiWriter />} />
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
