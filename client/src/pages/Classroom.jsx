import { useEffect, useRef, useState } from 'react';
import { Dices, Timer, Zap, Volume2, Play, Pause, RotateCcw, Mic, MicOff, Plus, Minus, Users } from 'lucide-react';
import { api, todayStr } from '../api.js';

/**
 * 课堂小助手（大屏深色风）：随机点名 / 倒计时 / 课堂加减分 / 分贝计
 * 加减分复用班务 POST /classes/:id/moral（category=课堂表现），并本地累计本节得分
 */
export default function Classroom() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    api.get('/classes').then(cs => {
      setClasses(cs);
      if (cs.length) setClassId(String(cs[0].id));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!classId) return;
    api.get(`/students?class_id=${classId}`).then(setStudents).catch(console.error);
    api.get(`/classes/${classId}/duty-groups`).then(d => setGroups(d.groups || [])).catch(() => setGroups([]));
  }, [classId]);

  return (
    <div className="rounded-3xl bg-[#1d1d1f] p-5 text-white shadow-2xl sm:p-7">
      {/* 头部：标题 + 班级切换 */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">课堂小助手</h2>
        <span className="text-xs text-white/40">投屏可用 · 数据实时保存</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {classes.map(c => (
            <button key={c.id} onClick={() => setClassId(String(c.id))}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${classId === String(c.id) ? 'bg-[#0a84ff] text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RollCall students={students} />
        <Countdown />
        <QuickScore classId={classId} students={students} groups={groups} />
        <DecibelMeter />
      </div>
    </div>
  );
}

/* ==================== 随机点名 ==================== */
function RollCall({ students }) {
  const [rolling, setRolling] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const timer = useRef(null);

  const roll = () => {
    if (rolling || !students.length) return;
    /* 不重复点名：全部点过后自动重置 */
    let pool = students.filter(s => !picked.includes(s.id));
    if (!pool.length) { setPicked([]); pool = students; }
    setRolling(true);
    let n = 0;
    const total = 24 + Math.floor(Math.random() * 8); // 滚动总帧数
    const step = () => {
      setName(pool[Math.floor(Math.random() * pool.length)].name);
      n++;
      /* 逐渐减速，营造悬念 */
      const delay = n < total - 8 ? 60 : 60 + (n - (total - 8)) * 70;
      if (n < total) {
        timer.current = setTimeout(step, delay);
      } else {
        const winner = pool[Math.floor(Math.random() * pool.length)];
        setName(winner.name);
        setPicked(p => [...p, winner.id]);
        setRolling(false);
      }
    };
    step();
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  /* 换班清空已点记录 */
  useEffect(() => { setPicked([]); setName(''); }, [students]);

  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-white/70">
        <Dices size={18} /><span className="text-sm font-medium">随机点名</span>
        <span className="ml-auto text-xs text-white/30">已点 {picked.length}/{students.length}</span>
      </div>
      <div className="flex flex-1 items-center justify-center py-6">
        <div className={`text-center text-6xl font-bold tracking-widest transition sm:text-7xl ${rolling ? 'text-white/50' : 'text-white'}`}
          style={rolling ? { filter: 'blur(1px)' } : { textShadow: '0 0 40px rgba(10,132,255,.6)' }}>
          {name || (students.length ? '准备好了吗' : '暂无学生')}
        </div>
      </div>
      <button onClick={roll} disabled={rolling || !students.length}
        className="mx-auto rounded-full bg-[#0a84ff] px-10 py-3 text-lg font-semibold shadow-lg shadow-blue-500/30 transition hover:bg-[#2f94ff] disabled:opacity-40">
        {rolling ? '点名中…' : '开始点名'}
      </button>
    </div>
  );
}

/* ==================== 倒计时 ==================== */
const PRESETS = [1, 3, 5, 10];

function Countdown() {
  const [total, setTotal] = useState(5 * 60);
  const [left, setLeft] = useState(5 * 60);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer.current);
  }, [running]);

  /* 时间到：停表 + 蜂鸣提示 */
  useEffect(() => {
    if (left === 0 && running) {
      setRunning(false);
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.25, 0.5].forEach(t => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.15;
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
        });
      } catch { /* 无音频环境时静默 */ }
    }
  }, [left, running]);

  const setMinutes = (m) => { setRunning(false); setTotal(m * 60); setLeft(m * 60); };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const urgent = left <= 10 && left > 0;
  const pct = total ? left / total : 0;

  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-white/70">
        <Timer size={18} /><span className="text-sm font-medium">倒计时</span>
        <div className="ml-auto flex gap-1.5">
          {PRESETS.map(m => (
            <button key={m} onClick={() => setMinutes(m)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${total === m * 60 ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50 hover:bg-white/15'}`}>
              {m} 分钟
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <div className={`font-mono text-7xl font-bold tabular-nums sm:text-8xl ${urgent ? 'animate-pulse text-[#ff453a]' : left === 0 ? 'text-[#ff453a]' : 'text-white'}`}>
          {mm}:{ss}
        </div>
        {/* 进度条 */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-[#ff453a]' : 'bg-[#0a84ff]'}`} style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <div className="flex justify-center gap-3">
        <button onClick={() => setRunning(r => !r)} disabled={left === 0}
          className="flex items-center gap-2 rounded-full bg-[#0a84ff] px-8 py-2.5 font-semibold shadow-lg shadow-blue-500/30 transition hover:bg-[#2f94ff] disabled:opacity-40">
          {running ? <Pause size={17} /> : <Play size={17} />}{running ? '暂停' : '开始'}
        </button>
        <button onClick={() => { setRunning(false); setLeft(total); }}
          className="flex items-center gap-2 rounded-full bg-white/10 px-6 py-2.5 font-medium text-white/70 transition hover:bg-white/15">
          <RotateCcw size={15} />重置
        </button>
      </div>
    </div>
  );
}

/* ==================== 课堂加减分 ==================== */
function QuickScore({ classId, students, groups }) {
  const [tally, setTally] = useState({}); // { [studentId]: 本节累计分 }
  const [view, setView] = useState('group'); // group=按小组 / all=按学生
  const [busy, setBusy] = useState(false);

  /* 换班清空本节累计 */
  useEffect(() => { setTally({}); }, [classId]);

  const add = async (stu, delta) => {
    if (busy || !classId) return;
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/moral`, {
        items: [{ student_id: stu.id, score: delta, reason: delta > 0 ? '课堂表现加分' : '课堂表现扣分', category: '课堂表现', date: todayStr() }],
      });
      setTally(t => ({ ...t, [stu.id]: (t[stu.id] || 0) + delta }));
    } catch (e) { alert(e.message || '保存失败'); }
    finally { setBusy(false); }
  };

  const renderStu = (s) => {
    const v = tally[s.id] || 0;
    return (
      <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
        {v !== 0 && (
          <span className={`w-9 text-center text-sm font-bold tabular-nums ${v > 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
            {v > 0 ? `+${v}` : v}
          </span>
        )}
        <button onClick={() => add(s, 1)} title="加 1 分"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#30d158]/20 text-[#30d158] transition hover:bg-[#30d158]/35 active:scale-90">
          <Plus size={17} />
        </button>
        <button onClick={() => add(s, -1)} title="扣 1 分"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff453a]/15 text-[#ff453a] transition hover:bg-[#ff453a]/30 active:scale-90">
          <Minus size={17} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-white/70">
        <Zap size={18} /><span className="text-sm font-medium">课堂加减分</span>
        <span className="text-xs text-white/30">自动计入德育量化</span>
        <div className="ml-auto flex gap-1.5">
          {groups.length > 0 && (
            <button onClick={() => setView(v => v === 'group' ? 'all' : 'group')}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/60 transition hover:bg-white/15">
              <Users size={12} />{view === 'group' ? '按学生' : '按小组'}
            </button>
          )}
        </div>
      </div>
      <div className="max-h-72 flex-1 space-y-3 overflow-y-auto pr-1">
        {students.length === 0 && <p className="py-8 text-center text-sm text-white/30">该班级暂无学生</p>}
        {view === 'group' && groups.length > 0
          ? groups.map(g => (
            <div key={g.id}>
              <div className="mb-1.5 text-xs font-semibold text-white/40">{g.name}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(g.members || []).map(m => renderStu({ id: m.id, name: m.name }))}
              </div>
            </div>
          ))
          : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{students.map(renderStu)}</div>}
      </div>
    </div>
  );
}

/* ==================== 分贝计 ==================== */
function DecibelMeter() {
  const [on, setOn] = useState(false);
  const [level, setLevel] = useState(0); // 0-100
  const [error, setError] = useState('');
  const refs = useRef({});

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        /* RMS 音量映射到 0-100 */
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(100, Math.round(rms * 280)));
        refs.current.raf = requestAnimationFrame(loop);
      };
      loop();
      refs.current = { stream, ctx };
      setOn(true);
    } catch {
      setError('无法访问麦克风，请在浏览器地址栏允许麦克风权限');
    }
  };

  const stop = () => {
    cancelAnimationFrame(refs.current.raf);
    refs.current.stream?.getTracks().forEach(t => t.stop());
    refs.current.ctx?.close().catch(() => {});
    refs.current = {};
    setOn(false); setLevel(0);
  };
  useEffect(() => () => { cancelAnimationFrame(refs.current.raf); refs.current.stream?.getTracks().forEach(t => t.stop()); refs.current.ctx?.close().catch(() => {}); }, []);

  const tone = level < 40 ? '#30d158' : level < 70 ? '#ffd60a' : '#ff453a';
  const label = level < 40 ? '安静' : level < 70 ? '适中' : '偏吵';

  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-white/70">
        <Volume2 size={18} /><span className="text-sm font-medium">课堂分贝</span>
        <span className="ml-auto text-xs text-white/30">需麦克风权限</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
        <div className="font-mono text-7xl font-bold tabular-nums" style={{ color: on ? tone : 'rgba(255,255,255,.25)' }}>
          {on ? level : '--'}
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${tone}22`, color: on ? tone : 'rgba(255,255,255,.3)' }}>
          {on ? label : '未开启'}
        </span>
        {/* 音量柱 */}
        <div className="flex h-20 w-full items-end justify-center gap-1">
          {Array.from({ length: 24 }).map((_, i) => {
            const threshold = ((i + 1) / 24) * 100;
            return (
              <div key={i} className="w-2.5 rounded-full transition-all duration-75"
                style={{
                  height: `${20 + (i / 24) * 80}%`,
                  background: on && level >= threshold ? (threshold < 40 ? '#30d158' : threshold < 70 ? '#ffd60a' : '#ff453a') : 'rgba(255,255,255,.08)',
                }} />
            );
          })}
        </div>
        {error && <p className="text-xs text-[#ff453a]">{error}</p>}
      </div>
      <button onClick={on ? stop : start}
        className={`mx-auto flex items-center gap-2 rounded-full px-8 py-2.5 font-semibold shadow-lg transition ${on ? 'bg-white/10 text-white/70 hover:bg-white/15' : 'bg-[#0a84ff] text-white shadow-blue-500/30 hover:bg-[#2f94ff]'}`}>
        {on ? <MicOff size={16} /> : <Mic size={16} />}{on ? '停止监听' : '开始监听'}
      </button>
    </div>
  );
}
