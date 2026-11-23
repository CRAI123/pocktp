/** 教室大屏：挂在教室显示器上常驻显示当天课表、当前节次、班级待办与作业 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Maximize2, Lock, LogOut } from 'lucide-react';
import { api } from '../api.js';
import { setScreenKiosk } from '../desktop.js';
import { periodRange, todayWeekday, wdLabel } from '../timetable.js';

const pad = (n) => String(n).padStart(2, '0');
const WD_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export default function Board() {
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(() => localStorage.getItem('tw_board_class') || '');
  const [rows, setRows] = useState([]);
  const [slots, setSlots] = useState(null);
  const [todos, setTodos] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [now, setNow] = useState(() => new Date());
  /* 投屏锁定：默认锁定，学生无法直接点走；老师长按页脚 3 秒才出现退出入口 */
  const [locked, setLocked] = useState(true);
  const [exitOpen, setExitOpen] = useState(false);
  const [kiosk, setKiosk] = useState(() => localStorage.getItem('tw_board_kiosk') === '1');
  const holdRef = useRef(null);

  /* 锁定期间拦截刷新与关闭：刷新会丢状态，关闭会中断投屏 */
  useEffect(() => {
    if (!locked) return;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onKey = (e) => {
      const combo = (e.ctrlKey || e.metaKey) && ['r', 'R', 'w', 'W'].includes(e.key);
      if (e.key === 'F5' || e.key === 'F11' || combo) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [locked]);

  const startHold = () => {
    holdRef.current = setTimeout(() => setExitOpen(true), 3000);
  };
  const cancelHold = () => {
    clearTimeout(holdRef.current);
    holdRef.current = null;
  };

  const toggleKiosk = (v) => {
    setKiosk(v);
    localStorage.setItem('tw_board_kiosk', v ? '1' : '0');
  };

  /* 桌面端进入大屏即锁定窗口：全屏置顶、隐藏任务栏、拒绝关闭；离开页面自动解除 */
  useEffect(() => {
    setScreenKiosk(true);
    return () => setScreenKiosk(false);
  }, []);

  /* 时钟：每秒刷新，用于当前节次倒计时 */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* 基础数据只取一次 */
  useEffect(() => {
    api.get('/classes').then((cs) => {
      setClasses(cs);
      if (!localStorage.getItem('tw_board_class') && cs.length) setClassId(String(cs[0].id));
    }).catch(console.error);
    api.get('/timetable-settings').then(setSlots).catch(console.error);
    api.get('/todos').then(setTodos).catch(console.error);
    api.get('/assignments').then(setAssignments).catch(console.error);
    api.get('/courses').then(setCourses).catch(console.error);
  }, []);

  /* 切换班级：记录选择并拉取该班课表 */
  useEffect(() => {
    if (!classId) return;
    localStorage.setItem('tw_board_class', classId);
    api.get(`/timetables?class_id=${classId}`).then(setRows).catch(console.error);
  }, [classId]);

  /* 待办/作业/课表每分钟同步一次，老师手机上改完大屏会自动更新 */
  useEffect(() => {
    const t = setInterval(() => {
      api.get('/todos').then(setTodos).catch(() => {});
      api.get('/assignments').then(setAssignments).catch(() => {});
      if (classId) api.get(`/timetables?class_id=${classId}`).then(setRows).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, [classId]);

  const wd = todayWeekday(now);
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const todayRows = useMemo(
    () => rows.filter((r) => Number(r.weekday) === wd).sort((a, b) => a.period - b.period),
    [rows, wd],
  );

  const withTimes = useMemo(
    () => todayRows.map((r) => ({ ...r, range: periodRange(slots, r.period) })),
    [todayRows, slots],
  );

  const current = withTimes.find(
    (r) => r.range.startMin != null && mins >= r.range.startMin && mins < r.range.endMin,
  );
  const next = withTimes.find((r) => r.range.startMin != null && r.range.startMin > mins);

  const remainMin = current ? Math.max(0, current.range.endMin - mins) : 0;
  const progress = current
    ? Math.min(1, Math.max(0, (mins - current.range.startMin) / (current.range.endMin - current.range.startMin)))
    : 0;

  /* 只投屏老师明确标记过的待办，默认全部隐藏，避免学生姓名等信息出现在公共屏幕 */
  const openTodos = useMemo(
    () => todos.filter((t) => !t.done && Number(t.board_safe) === 1).slice(0, 6),
    [todos],
  );

  const classCourses = useMemo(
    () => new Set(courses.filter((c) => String(c.class_id) === String(classId)).map((c) => String(c.id))),
    [courses, classId],
  );
  const classAssignments = useMemo(
    () => assignments.filter((a) => classCourses.has(String(a.course_id))).slice(0, 4),
    [assignments, classCourses],
  );

  const toggleTodo = async (t) => {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: 1 } : x)));
    await api.patch(`/todos/${t.id}/toggle`, {}).catch(() => {});
  };

  const cls = classes.find((c) => String(c.id) === classId);
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <div className="min-h-screen bg-[#EDF2EE] px-8 py-6 text-[#16241C]">
      {/* 顶部：班级 / 日期 / 时钟 */}
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-11 rounded-xl border border-black/10 bg-white/80 px-3 text-lg font-semibold outline-none focus:border-[#1B8A57]"
          >
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="leading-tight">
            <div className="text-2xl font-semibold">
              {now.getMonth() + 1}月{now.getDate()}日
            </div>
            <div className="text-sm text-[#5D6E64]">星期{WD_SHORT[now.getDay()]} · {wdLabel(wd)}</div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right leading-none">
            <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums">{clock}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              title="全屏"
              className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white/80 text-[#5D6E64] transition hover:text-[#1B8A57]"
            >
              <Maximize2 size={15} />
            </button>
            {!locked && (
              <button
                onClick={() => nav('/timetable')}
                title="返回工作台"
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white/80 text-[#5D6E64] transition hover:text-[#1B8A57]"
              >
                <ArrowLeft size={15} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:h-[calc(100vh-12.5rem)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          {/* 当前节次 */}
          <section className="flex flex-col justify-between rounded-3xl bg-white p-7 shadow-[0_8px_28px_-16px_rgba(22,36,28,0.25)] lg:flex-1">
            {current ? (
              <>
                <div className="flex items-center gap-2 text-sm font-medium text-[#5D6E64]">
                  <Clock size={14} />
                  第 {current.period} 节 · {current.range.end} 下课
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div className="text-[88px] font-bold leading-none tracking-tight">{current.subject}</div>
                  <span className="mb-3 rounded-full bg-[#1B8A57] px-3 py-1 text-sm font-semibold text-white">正在上课</span>
                  {current.teacher ? <span className="mb-3 text-base text-[#5D6E64]">{current.teacher}</span> : null}
                </div>
                <div className="mt-4">
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#E4EBE6]">
                    <div className="h-full rounded-full bg-[#1B8A57] transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="mt-2 text-sm text-[#5D6E64]">
                    还剩 {Math.floor(remainMin)} 分钟
                    {next ? ` · 下一节 ${next.subject}（${next.range.start}）` : ' · 今天是最后一节'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-medium text-[#5D6E64]">
                  <Clock size={14} />
                  {next ? `下一节 ${next.range.start} 开始` : '今日课程已全部结束'}
                </div>
                <div className="mt-2 text-[56px] font-bold leading-none tracking-tight">
                  {next ? next.subject : '放学'}
                </div>
                <div className="mt-4 text-base text-[#5D6E64]">
                  {next
                    ? `第 ${next.period} 节 · ${next.range.start} - ${next.range.end}${next.teacher ? ` · ${next.teacher}` : ''}`
                    : '好好休息，明天见'}
                </div>
              </>
            )}
          </section>

          {/* 今日课表 */}
          <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_-16px_rgba(22,36,28,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">今日课程</h2>
              <span className="text-xs text-[#7A8A80]">
                {cls?.name || ''} · 共 {todayRows.length} 节
              </span>
            </div>
            {todayRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#7A8A80]">
                这个班今天还没有排课，可在「课程表」里添加
              </div>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {withTimes.map((r) => {
                  const on = current && current.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`min-w-[104px] flex-1 rounded-2xl px-3 py-3 text-center transition ${
                        on ? 'bg-[#1B8A57] text-white' : 'bg-[#F3F7F4] text-[#16241C]'
                      }`}
                    >
                      <div className={`text-[11px] ${on ? 'text-white/75' : 'text-[#7A8A80]'}`}>第 {r.period} 节</div>
                      <div className="mt-1 truncate text-lg font-semibold">{r.subject}</div>
                      <div className={`mt-0.5 text-[11px] ${on ? 'text-white/75' : 'text-[#7A8A80]'}`}>
                        {r.range.start || '--:--'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* 右侧：待办 + 作业 */}
        <div className="flex flex-col gap-5">
          <section className="flex flex-col rounded-3xl bg-white p-5 shadow-[0_8px_28px_-16px_rgba(22,36,28,0.25)] lg:flex-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">班级通知</h2>
              <span className="text-xs text-[#7A8A80]">点一下划掉</span>
            </div>
            {openTodos.length === 0 ? (
              <div className="py-8 text-center text-sm leading-relaxed text-[#7A8A80]">
                暂无公开事项<br />
                <span className="text-xs">在「班级待办」里点投影图标才会显示到这里</span>
              </div>
            ) : (
              <ul className="space-y-2.5 overflow-y-auto">
                {openTodos.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => toggleTodo(t)}
                      className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-[#F3F7F4]"
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-[#1B8A57]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-snug">{t.title}</span>
                        <span className="mt-0.5 block text-[11px] text-[#7A8A80]">
                          {t.category || '班级事务'}{t.due_date ? ` · ${t.due_date}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_-16px_rgba(22,36,28,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">今日作业</h2>
              <span className="text-xs text-[#7A8A80]">{classAssignments.length} 项</span>
            </div>
            {classAssignments.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#7A8A80]">还没有布置作业</div>
            ) : (
              <ul className="space-y-3">
                {classAssignments.map((a) => (
                  <li key={a.id} className="rounded-xl bg-[#F3F7F4] px-3 py-2.5">
                    <div className="text-[15px] font-medium leading-snug">{a.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[#7A8A80]">
                      <span>{a.course_name}</span>
                      {a.deadline ? <span>· 截止 {a.deadline}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <footer className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#9AA79F]">
        <span
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          className="select-none"
        >
          教室大屏 · 仅显示班级课表与老师标记为公开的事项 · 每分钟自动同步
        </span>
        {locked && <Lock size={11} />}
      </footer>

      {exitOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6" onClick={() => setExitOpen(false)}>
          <div className="w-[340px] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">投屏设置</h3>
            <p className="mt-1 text-xs text-[#7A8A80]">大屏默认锁定，学生无法直接退出</p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#F3F7F4] p-3">
              <input type="checkbox" checked={kiosk} onChange={(e) => toggleKiosk(e.target.checked)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">开机后自动打开大屏</span>
                <span className="mt-0.5 block text-xs text-[#7A8A80]">桌面版配合开机自启，开机即进入投屏</span>
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setExitOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[#5D6E64]">取消</button>
              <button
                onClick={() => { setExitOpen(false); setLocked(false); nav('/timetable'); }}
                className="flex items-center gap-1.5 rounded-lg bg-[#1B8A57] px-3 py-2 text-sm font-medium text-white"
              >
                <LogOut size={14} />退出投屏
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
