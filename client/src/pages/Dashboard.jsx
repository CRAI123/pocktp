import { useEffect, useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ClipboardList, ListTodo, CalendarCheck, GraduationCap, ArrowRight, Zap, RefreshCw, MonitorPlay, PenLine, MessageSquare, BookText, Check, Clock3, ArrowLeftRight, Heart } from 'lucide-react';
import { api, auth } from '../api.js';
import { StatCard, Badge } from '../components/ui.jsx';
import { periodRange, todayWeekday } from '../timetable.js';

const localDate = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const PRIORITY_DOT = { 高: 'bg-[#ff3b30]', 中: 'bg-[#ff9500]', 低: 'bg-[#0071e3]' };
const PRIORITY_W = { 高: 0, 中: 1, 低: 2 };
const KIND_TONE = {
  调课: 'bg-[#ff9500]/15 text-[#a85300]',
  代课: 'bg-[#0071e3]/10 text-[#0059b3]',
  停课: 'bg-[#ff3b30]/10 text-[#b3251c]',
  换教室: 'bg-[#5ac8fa]/15 text-[#0b6e94]',
};

/* 今日调整的文案（调课 → 新节次、代课 → 教师、停课、换教室 → 地点） */
function changeText(c) {
  if (!c) return '';
  if (c.kind === '调课') return `调至第 ${c.new_period} 节${c.new_subject ? ` ${c.new_subject}` : ''}`;
  if (c.kind === '代课') return `${c.new_teacher || '他人'} 代课`;
  if (c.kind === '停课') return '停上';
  if (c.kind === '换教室') return `改至 ${c.new_note || '新教室'}`;
  return c.reason || '';
}

/* 待办到期文案：今天 / 明天 / 逾期 N 天 */
function dueLabel(due, today) {
  if (!due) return '';
  if (due === today) return '今天到期';
  const diff = Math.round((new Date(`${due}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  if (diff < 0) return `逾期 ${-diff} 天`;
  if (diff === 1) return '明天';
  return due.slice(5).replace('-', '/');
}

const countText = m => (m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`);

/* 今日提醒面板：下一节课倒计时 + 今日课程时间线 + 今日待办 + 今日调整 */
function TodayBoard() {
  const [data, setData] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/todos'),
      api.get('/timetables?mine=1'),
      api.get('/timetable-settings'),
      api.get(`/schedule-changes?date=${localDate()}`),
    ]).then(([todos, rows, slots, changes]) => {
      if (!alive) return;
      setData({
        todos: Array.isArray(todos) ? todos : [],
        rows: Array.isArray(rows) ? rows : [],
        slots,
        changes: Array.isArray(changes) ? changes : [],
      });
    }).catch(() => { /* 静默：面板不因单个接口失败而打断工作台 */ });
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!data) return null;

  const today = localDate(new Date(now));
  const wd = todayWeekday(new Date(now));
  const d = new Date(now);
  const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

  const lessons = data.rows
    .filter(r => Number(r.weekday) === wd)
    .map(r => {
      const range = periodRange(data.slots, Number(r.period));
      const chg = data.changes.find(c => Number(c.period) === Number(r.period)
        && (!c.class_id || String(c.class_id) === String(r.class_id)));
      const state = chg?.kind === '停课' ? 'stopped'
        : range.startMin == null ? 'unknown'
          : nowMin < range.startMin ? 'upcoming'
            : nowMin <= range.endMin ? 'ongoing' : 'past';
      return { ...r, range, chg, state, diff: range.startMin == null ? null : Math.round(range.startMin - nowMin), rest: range.endMin == null ? 0 : Math.round(range.endMin - nowMin) };
    })
    .sort((a, b) => (a.range.startMin ?? 1e9) - (b.range.startMin ?? 1e9));

  const featured = lessons.find(l => l.state === 'ongoing') || lessons.find(l => l.state === 'upcoming');
  const pending = data.todos.filter(t => !t.done)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')
      || ((PRIORITY_W[a.priority] ?? 1) - (PRIORITY_W[b.priority] ?? 1)));

  const toggleTodo = async (id) => {
    setBusy(id);
    setData(prev => prev ? { ...prev, todos: prev.todos.map(t => (t.id === id ? { ...t, done: t.done ? 0 : 1 } : t)) } : prev);
    try { await api.patch(`/todos/${id}/toggle`); }
    catch { setData(prev => prev ? { ...prev, todos: prev.todos.map(t => (t.id === id ? { ...t, done: t.done ? 1 : 0 } : t)) } : prev); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Today</div>
          <h3 className="display mt-1 text-[17px] font-semibold text-ink">今日提醒</h3>
        </div>
        <Link to="/timetable?change=1" className="inline-flex items-center gap-1 text-xs font-medium text-[#a85300] hover:underline">
          <ArrowLeftRight size={13} />换课调课登记
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
        {/* 上课提醒：下一节 + 今日课程时间线 */}
        <div className="card relative overflow-hidden p-5 sm:p-6">
          <span className="brand-gradient pointer-events-none absolute inset-x-6 top-0 h-[2px] opacity-40" />
          {featured ? (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0071e3] via-[#0a68df] to-[#0a55c8] p-4 text-white shadow-[0_16px_34px_-20px_rgba(0,113,227,0.9)]">
              <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-[#28cd41]/35 blur-2xl" />
              <div className="relative flex items-center justify-between text-[11px] font-medium text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={12} />
                  {featured.state === 'ongoing' ? '正在上课' : '下一节课'}
                </span>
                <span className="num">{featured.range.start}-{featured.range.end}</span>
              </div>
              <div className="relative mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[20px] font-semibold leading-tight">{featured.chg?.new_subject || featured.subject}</div>
                  <div className="mt-1 truncate text-[11.5px] text-white/80">
                    {featured.class_name} · 第 {featured.period} 节{featured.note ? ` · ${featured.note}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`num font-semibold leading-none tracking-tight ${(featured.state === 'ongoing' ? featured.rest : featured.diff) >= 60 ? 'text-[17px]' : 'text-[30px]'}`}>
                    {countText(Math.max(0, featured.state === 'ongoing' ? featured.rest : featured.diff))}
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-white/75">{featured.state === 'ongoing' ? '后下课' : '后上课'}</div>
                </div>
              </div>
              {featured.chg && (
                <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
                  <ArrowLeftRight size={11} />{featured.chg.kind} · {changeText(featured.chg)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.015] px-4 py-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#28cd41]/12 text-[#1a7f2b]"><Check size={16} /></span>
              <div>
                <div className="text-[13px] font-medium text-ink">今天没有安排上课</div>
                <div className="mt-0.5 text-[11px] text-ink-secondary">可以整理待办，或提前备好明天的课。</div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-[11px] font-medium text-ink-secondary">今日课程 · {lessons.length} 节</div>
            <Link to="/timetable" className="text-[11px] font-medium text-[#0071e3] hover:underline">课程表 →</Link>
          </div>

          {lessons.length ? (
            <div className="mt-1 space-y-0.5">
              {lessons.slice(0, 5).map(l => {
                const chip = l.state === 'stopped' ? { text: '停课', cls: 'bg-[#ff3b30]/10 text-[#b3251c]' }
                  : l.state === 'ongoing' ? { text: '进行中', cls: 'bg-[#28cd41]/12 text-[#1a7f2b]' }
                    : l.state === 'upcoming' && l.diff != null && l.diff <= 30 ? { text: `${Math.max(1, l.diff)} 分钟后`, cls: 'bg-[#ff9500]/15 text-[#a85300]' }
                      : null;
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-lg px-1 py-2 transition hover:bg-black/[0.02]">
                    <span className="num w-11 shrink-0 text-[11px] text-ink-secondary">{l.range.start || `第${l.period}节`}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.state === 'ongoing' ? 'bg-[#28cd41]' : l.state === 'stopped' ? 'bg-[#ff3b30]' : l.state === 'past' ? 'bg-black/15' : 'bg-[#0071e3]/70'}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[13px] font-medium ${l.state === 'past' || l.state === 'stopped' ? 'text-ink-secondary line-through decoration-black/15' : 'text-ink'}`}>
                        {l.subject}
                      </div>
                      <div className="truncate text-[11px] text-ink-secondary">
                        {l.class_name} · 第 {l.period} 节{l.chg && l.state !== 'stopped' ? ` · ${changeText(l.chg)}` : ''}
                      </div>
                    </div>
                    {chip && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip.cls}`}>{chip.text}</span>}
                  </div>
                );
              })}
              {lessons.length > 5 && (
                <Link to="/timetable" className="block px-1 pt-1.5 text-[11px] font-medium text-ink-secondary transition hover:text-[#0071e3]">
                  还有 {lessons.length - 5} 节 · 查看完整课程表 →
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-xl bg-black/[0.02] px-3 py-4 text-center text-[11.5px] text-ink-secondary">
              课表里还没有今天的课，<Link to="/timetable" className="font-medium text-[#0071e3] hover:underline">去排课</Link>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* 今日待办：可直接勾选完成 */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#ff9500]/12 text-[#a85300]"><ListTodo size={16} /></span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">今日待办</div>
                  <div className="text-[11px] text-ink-secondary">{pending.length ? `还有 ${pending.length} 件待处理` : '全部完成'}</div>
                </div>
              </div>
              <Link to="/todos" className="shrink-0 text-[11px] font-medium text-[#0071e3] hover:underline">全部 →</Link>
            </div>

            {pending.length ? (
              <div className="space-y-0.5">
                {pending.slice(0, 4).map(t => {
                  const overdue = t.due_date && t.due_date < today;
                  return (
                    <div key={t.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
                      <button aria-label="标记完成" title="标记完成" disabled={busy === t.id} onClick={() => toggleTodo(t.id)}
                        className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border border-black/20 text-transparent transition hover:border-[#28cd41] hover:bg-[#28cd41]/10 hover:text-[#1a7f2b] disabled:opacity-50">
                        <Check size={11} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] leading-snug text-ink">{t.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-black/20'}`} />
                          <span className="shrink-0">{t.priority}优先</span>
                          {t.category && <span className="truncate">· {t.category}</span>}
                          {t.due_date && <span className={`shrink-0 ${overdue ? 'font-medium text-[#b3251c]' : ''}`}>· {dueLabel(t.due_date, today)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-black/[0.02] px-3 py-4 text-center text-[11.5px] text-ink-secondary">今日待办已清空</div>
            )}
          </div>

          {/* 今日调整：换课 / 代课 / 停课 / 换教室 */}
          {data.changes.length > 0 && (
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#ff9500]/12 text-[#a85300]"><ArrowLeftRight size={15} /></span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-ink">今日调整</div>
                    <div className="text-[11px] text-ink-secondary">{data.changes.length} 处临时变动</div>
                  </div>
                </div>
                <Link to="/timetable?change=1" className="shrink-0 text-[11px] font-medium text-[#0071e3] hover:underline">管理 →</Link>
              </div>
              <div className="space-y-1">
                {data.changes.slice(0, 3).map(c => (
                  <div key={c.id} className="flex items-start gap-2 rounded-lg px-1 py-1.5">
                    <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${KIND_TONE[c.kind] || 'bg-black/[0.06] text-ink-secondary'}`}>{c.kind}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] leading-snug text-ink">
                        第 {c.period} 节 {c.subject}{c.class_name ? ` · ${c.class_name}` : ''}
                      </div>
                      <div className="truncate text-[10.5px] text-ink-secondary">{changeText(c)}{c.reason ? ` · ${c.reason}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* 单个班级卡片（memo 避免无关重渲） */
const ClassCard = memo(function ClassCard({ cls }) {
  const rate = cls.student_count > 0 ? Math.round((cls.today_present / cls.student_count) * 100) : 0;
  const tone = rate >= 90 ? 'from-[#28cd41] to-[#34d058]' : rate >= 70 ? 'from-[#ff9500] to-[#ffcc00]' : 'from-[#ff3b30] to-[#ff6b5e]';
  return (
    <Link to={`/classes/${cls.id}`}
      className="card card-hover group flex flex-col gap-4 p-5 active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0071e3]/[0.08] text-[#0071e3] ring-1 ring-inset ring-[#0071e3]/10">
            <GraduationCap size={18} />
          </span>
          <div className="min-w-0">
            <div className="display truncate text-[15px] font-semibold text-ink">{cls.name}</div>
            <div className="text-[11px] text-ink-secondary">{cls.grade} · {cls.student_count} 人</div>
          </div>
        </div>
        <ArrowRight size={16} className="mt-1 shrink-0 text-ink-secondary/50 transition group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-ink-secondary">今日出勤</span>
          <span className={`num font-semibold ${rate >= 90 ? 'text-[#1a7f2b]' : rate >= 70 ? 'text-[#a85300]' : 'text-[#b3251c]'}`}>{rate}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.055]">
          <div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500`} style={{ width: `${Math.min(100, rate)}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
        <CalendarCheck size={13} className="shrink-0" />
        <span className="truncate">{cls.latest_assignment ? `最近作业 · ${cls.latest_assignment}` : '暂无最近作业'}</span>
      </div>
    </Link>
  );
});

/* 紧凑骨架屏（避免大块空白） */
function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="card animate-pulse p-4">
            <div className="h-3 w-12 rounded bg-black/10" />
            <div className="mt-3 h-7 w-16 rounded bg-black/10" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card animate-pulse p-5">
            <div className="flex gap-2">
              <div className="h-9 w-9 rounded-xl bg-black/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 rounded bg-black/10" />
                <div className="h-2 w-12 rounded bg-black/5" />
              </div>
            </div>
            <div className="mt-3 h-3 w-32 rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const teacher = auth.teacher;

  useEffect(() => {
    api.get('/overview')
      .then(d => setData(d))
      .catch(e => setErr(e.message || '加载失败'));
  }, []);

  const reload = () => { setData(null); setErr(''); api.get('/overview').then(setData).catch(e => setErr(e.message || '加载失败')); };

  if (err) return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#ff3b30]/15 text-[#ff3b30]">⚠</div>
      <div className="text-base">{err}</div>
      <button onClick={reload} className="btn-pill brand-gradient px-4 py-2 text-sm text-white">
        <RefreshCw size={14} className="mr-1 inline" />重试
      </button>
    </div>
  );

  if (!data) return <Skeleton />;

  const attTotal = data.todayAttendance.reduce((s, r) => s + r.n, 0);
  const present = data.todayAttendance.find(r => r.status === '出勤')?.n || 0;
  const attRate = attTotal ? Math.round((present / attTotal) * 100) : null;
  const totalPending = data.pendingTodos + data.pendingGrading;

  /* 问候语：按时段变化 */
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  /* 与工作台相伴的天数：按本地自然日计算，注册当天记为第 1 天 */
  const companionDays = (() => {
    const raw = teacher?.created_at;
    if (!raw) return null;
    const created = new Date(String(raw).replace(' ', 'T'));
    if (Number.isNaN(created.getTime())) return null;
    const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(1, Math.round((dayStart(new Date()) - dayStart(created)) / 86400000) + 1);
  })();

  return (
    <div className="space-y-8">
      {/* 欢迎区：编辑式大标题 + 今日考勤环，替代整块渐变大横幅 */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#0071e3]/[0.09] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-24 h-56 w-56 rounded-full bg-[#28cd41]/[0.09] blur-3xl" />
        <span className="brand-gradient pointer-events-none absolute inset-x-8 top-0 h-[2px] opacity-50" />

        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{dateStr}</span>
              {companionDays != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0071e3]/[0.07] px-2 py-[3px] text-[10.5px] font-medium text-[#0059b3] ring-1 ring-inset ring-[#0071e3]/10">
                  <Heart size={10} className="fill-current" />
                  已陪伴您 <b className="num font-semibold">{companionDays}</b> 天
                </span>
              )}
            </div>
            <h2 className="display mt-2.5 text-[28px] font-semibold leading-tight text-ink sm:text-[34px]">
              {greet}，{teacher?.name || '老师'}
            </h2>
            <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-secondary">
              {totalPending > 0
                ? <>今天还有 <b className="num font-semibold text-ink">{totalPending}</b> 件事待处理，先从最急的一件开始。</>
                : '今天的事情都处理完了，喝口茶，或者为明天备一节课。'}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link to="/attendance" className="btn-pill brand-gradient inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,113,227,0.6)] transition hover:brightness-[1.06]">
                <CalendarCheck size={15} />开始点名
              </Link>
              <Link to="/timetable" className="btn-pill inline-flex items-center gap-1.5 border border-black/[0.08] bg-white/75 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-black/[0.14] hover:bg-white">
                <ClipboardList size={15} />查看课程表
              </Link>
            </div>
          </div>

          {/* 今日考勤环 */}
          <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-black/[0.05] bg-white/70 px-4 py-3.5 backdrop-blur">
            <div
              className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(#28cd41 ${attRate ?? 0}%, rgba(0,0,0,0.06) 0)` }}
            >
              <div className="grid h-[54px] w-[54px] place-items-center rounded-full bg-white">
                <span className="num text-[15px] font-semibold text-ink">{attRate == null ? '—' : `${attRate}%`}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="eyebrow">今日出勤</div>
              <div className="mt-1 text-[13px] font-medium text-ink">
                {attRate == null ? '尚未录入' : `${present} / ${attTotal} 人次`}
              </div>
              <Link to="/attendance" className="mt-0.5 inline-block text-[11px] font-medium text-[#0071e3] hover:underline">去点名 →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 今日提醒：下一节课倒计时 + 今日待办 + 临时调课 */}
      <TodayBoard />

      {/* 顶部精简：3 卡（不显示算力/课程，避免信息过载；算力在顶栏已显示） */}
      <div className="stagger grid grid-cols-3 gap-3">
        <StatCard icon={GraduationCap} label="班级" value={data.classes} tone="blue" />
        <StatCard icon={Users} label="学生" value={data.students} tone="green" />
        <StatCard icon={ListTodo} label="待办" value={totalPending} tone="orange" />
      </div>

      {/* 主体：班级卡片 */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="eyebrow">Classes</div>
            <h3 className="display mt-1 text-[17px] font-semibold text-ink">我的班级</h3>
          </div>
          <Link to="/classes" className="text-xs font-medium text-[#0071e3] hover:underline">查看全部 →</Link>
        </div>
        {data.classList?.length ? (
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.classList.map(cls => <ClassCard key={cls.id} cls={cls} />)}
          </div>
        ) : (
          <Link to="/classes/new" className="card flex flex-col items-center gap-2 p-8 text-center text-ink-secondary transition hover:border-[#0071e3]/40">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white"><GraduationCap size={22} /></div>
            <div className="text-sm">还没有班级，点击创建第一个班级</div>
          </Link>
        )}
      </div>

      {/* 班主任工具快捷入口 */}
      <div>
        <div className="mb-3">
          <div className="eyebrow">Tools</div>
          <h3 className="display mt-1 text-[17px] font-semibold text-ink">班主任工具</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { to: '/classroom', icon: MonitorPlay, label: '课堂小助手', desc: '点名·倒计时·加减分', chip: 'bg-[#5856d6]/10 text-[#3b398f]' },
            { to: '/comments', icon: PenLine, label: 'AI 期末评语', desc: '全班一次仅 10 算力', chip: 'bg-[#0071e3]/10 text-[#0059b3]' },
            { to: '/notifications', icon: MessageSquare, label: '消息通知', desc: '通知·周报 AI 撰写', chip: 'bg-[#ff9500]/12 text-[#a85300]' },
            { to: '/journals', icon: BookText, label: '班主任周记', desc: 'AI 汇总学期总结', chip: 'bg-[#28cd41]/12 text-[#1a7f2b]' },
          ].map(t => (
            <Link key={t.to} to={t.to}
              className="card card-hover group flex items-center gap-3 p-4 active:scale-[0.98]">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.04] ${t.chip}`}>
                <t.icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-ink">{t.label}</div>
                <div className="truncate text-[11px] text-ink-secondary">{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 今日考勤速览（精简） */}
      <div className="card p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">Attendance</div>
            <h3 className="display mt-1 flex items-center gap-2 text-[17px] font-semibold text-ink">
              今日考勤
              <span className="text-[11px] font-normal text-ink-secondary">· 共 {attTotal} 人次</span>
            </h3>
          </div>
          <Link to="/attendance" className="text-xs font-medium text-[#0071e3] hover:underline">点名 →</Link>
        </div>
        {data.todayAttendance.length ? (
          <div className="flex flex-wrap gap-2">
            {data.todayAttendance.map(r => (
              <div key={r.status} className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-black/[0.02] px-3 py-2 text-sm">
                <Badge tone={{ 出勤: 'green', 迟到: 'orange', 缺勤: 'red', 请假: 'blue' }[r.status]}>{r.status}</Badge>
                <span className="num font-semibold text-ink">{r.n}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">尚未录入，<Link to="/attendance" className="font-medium text-[#0071e3] hover:underline">立即点名</Link></p>
        )}
      </div>

      {/* AI 算力入口（顶栏已有余额，移动到此作为行动点） */}
      {teacher?.credits != null && teacher.credits <= 200 && (
        <div className="card flex items-start gap-3 border-[#ff9500]/25 bg-gradient-to-r from-[#ff9500]/[0.08] to-[#ff3b30]/[0.06] p-4 text-sm">
          <Zap size={18} className="mt-0.5 shrink-0 text-[#a85300]" />
          <div className="flex-1">
            <div className="font-medium text-ink">算力余额：<b className="num text-[#a85300]">{teacher.credits}</b></div>
            <div className="mt-0.5 text-xs text-ink-secondary">AI 出题每次扣 5 算力，余额不足会影响使用。</div>
          </div>
          <Link to="/renew" className="btn-pill bg-[#ff9500] px-3 py-1.5 text-xs font-semibold text-white">续费</Link>
        </div>
      )}
    </div>
  );
}
