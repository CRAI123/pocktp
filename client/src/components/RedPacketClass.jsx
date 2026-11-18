import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Gift, Play, RotateCcw, Sparkles, Timer, Trophy, UserPlus, X,
} from 'lucide-react';

/**
 * 红包课堂（讲台模式）
 * 场景：2-3 名学生轮流上讲台，直接用教师电脑操作；不接学生手机、不依赖网络。
 * 流程：发红包 → 抢红包 → 弹题作答 → 积分 / 连击 → 排行榜 → 抽奖 → 结算
 */

const DIFF = {
  easy: { label: '简易', score: 10, time: 20, cls: 'bg-[#28cd41]/15 text-[#7ee2a8]' },
  medium: { label: '中等', score: 20, time: 18, cls: 'bg-[#ffcc66]/15 text-[#ffd98a]' },
  hard: { label: '困难', score: 30, time: 15, cls: 'bg-[#ff5f57]/15 text-[#ff9a94]' },
};

/* 题库按科目分组：开课时只抽当前课程科目的题 */
const BANK = {
  语文: [
    { q: '"床前明月光"的下一句是？', o: ['疑是地上霜', '举头望明月', '低头思故乡', '白日依山尽'], a: 0, diff: 'easy', tip: '出自李白《静夜思》。' },
    { q: '"春眠不觉晓"出自哪首诗？', o: ['《春晓》', '《静夜思》', '《登鹳雀楼》', '《咏柳》'], a: 0, diff: 'easy', tip: '孟浩然《春晓》。' },
    { q: '"欲穷千里目"的下一句是？', o: ['黄河入海流', '更上一层楼', '白日依山尽', '春风不度玉门关'], a: 1, diff: 'easy', tip: '王之涣《登鹳雀楼》。' },
    { q: '下列词语没有错别字的是？', o: ['再接再励', '再接再厉', '再接再利', '再接再立'], a: 1, diff: 'medium', tip: '"厉"通"砺"，意为磨快。' },
    { q: '"桃花潭水深千尺"的下一句是？', o: ['不及汪伦送我情', '唯见长江天际流', '孤帆远影碧空尽', '疑是银河落九天'], a: 0, diff: 'medium', tip: '李白《赠汪伦》。' },
    { q: '"落霞与孤鹜齐飞"的下一句是？', o: ['秋水共长天一色', '长河落日圆', '霜叶红于二月花', '孤帆远影碧空尽'], a: 0, diff: 'hard', tip: '王勃《滕王阁序》。' },
  ],
  数学: [
    { q: '25 × 4 等于多少？', o: ['90', '100', '110', '80'], a: 1, diff: 'easy', tip: '25 × 4 = 100。' },
    { q: '三角形内角和是多少度？', o: ['90°', '180°', '360°', '270°'], a: 1, diff: 'easy', tip: '任意三角形内角和都是 180°。' },
    { q: '0.5 等于下面哪个分数？', o: ['1/3', '1/4', '1/2', '2/5'], a: 2, diff: 'easy', tip: '0.5 = 5/10 = 1/2。' },
    { q: '12 和 18 的最大公因数是？', o: ['3', '2', '12', '6'], a: 3, diff: 'medium', tip: '12 = 2²×3，18 = 2×3²，公因数 2×3 = 6。' },
    { q: '边长 5 厘米的正方形，面积是多少？', o: ['20 平方厘米', '25 平方厘米', '10 平方厘米', '15 平方厘米'], a: 1, diff: 'medium', tip: '面积 = 边长 × 边长 = 25。' },
    { q: '3/4 + 1/4 等于多少？', o: ['1', '4/8', '1/2', '3/8'], a: 0, diff: 'easy', tip: '分母相同，分子相加得 4/4 = 1。' },
    { q: '一个数的 3 倍是 27，这个数是？', o: ['6', '9', '12', '8'], a: 1, diff: 'medium', tip: '27 ÷ 3 = 9。' },
  ],
  英语: [
    { q: '"apple" 的中文意思是？', o: ['香蕉', '苹果', '橘子', '葡萄'], a: 1, diff: 'easy', tip: 'apple = 苹果。' },
    { q: 'I ___ a student.', o: ['is', 'am', 'are', 'be'], a: 1, diff: 'easy', tip: '第一人称单数用 am。' },
    { q: '"book" 的复数形式是？', o: ['bookes', 'books', 'book', 'booking'], a: 1, diff: 'easy', tip: '一般名词直接加 s。' },
    { q: 'Which word is a color?', o: ['table', 'blue', 'apple', 'run'], a: 1, diff: 'easy', tip: 'blue 表示蓝色。' },
    { q: 'She ___ to school every day.', o: ['go', 'goes', 'going', 'went'], a: 1, diff: 'medium', tip: '第三人称单数一般现在时用 goes。' },
  ],
  科学: [
    { q: '地球上面积最大的洋是？', o: ['大西洋', '印度洋', '太平洋', '北冰洋'], a: 2, diff: 'medium', tip: '太平洋约占地球表面积的三分之一。' },
    { q: '标准大气压下，水的沸点是多少？', o: ['90℃', '100℃', '80℃', '120℃'], a: 1, diff: 'easy', tip: '标准大气压下水在 100℃ 沸腾。' },
    { q: '太阳从哪个方向升起？', o: ['西方', '南方', '北方', '东方'], a: 3, diff: 'easy', tip: '地球自西向东自转，太阳东升西落。' },
    { q: '人体面积最大的器官是？', o: ['心脏', '肝脏', '皮肤', '肺'], a: 2, diff: 'medium', tip: '皮肤是人体最大的器官。' },
    { q: '光在真空中的传播速度约为？', o: ['3 万千米/秒', '300 千米/秒', '30 万千米/秒', '3000 千米/秒'], a: 2, diff: 'hard', tip: '约 30 万千米每秒。' },
    { q: '一年中白昼最长的节气是？', o: ['春分', '夏至', '秋分', '冬至'], a: 1, diff: 'medium', tip: '夏至这天北半球白昼最长。' },
  ],
};

const QUESTIONS = Object.entries(BANK).flatMap(([s, list]) => list.map(q => ({ ...q, s })));

/* 默认奖池：老师可按班级情况替换 */
const DEFAULT_PRIZES = [
  { id: 'p1', name: '免作业券', emoji: '🎫', cost: 50, weight: 5, stock: 2 },
  { id: 'p2', name: '棒棒糖', emoji: '🍭', cost: 30, weight: 15, stock: 5 },
  { id: 'p3', name: '精美橡皮', emoji: '🧽', cost: 20, weight: 30, stock: 10 },
  { id: 'p4', name: '谢谢参与', emoji: '🙂', cost: 10, weight: 50, stock: 999 },
];

/* ---------- 音效：Web Audio 合成，无需音频文件 ---------- */
let audioCtx;
function tone(freq, dur = 0.14, type = 'sine', vol = 0.09, delay = 0) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* 无音频环境时静默 */ }
}
const sfx = {
  coin: () => { tone(920, 0.1, 'triangle', 0.1); tone(1380, 0.12, 'triangle', 0.08, 0.08); },
  right: () => { tone(640, 0.12); tone(880, 0.12, 'sine', 0.09, 0.1); tone(1180, 0.16, 'sine', 0.08, 0.2); },
  wrong: () => { tone(170, 0.28, 'sawtooth', 0.11); tone(85, 0.36, 'square', 0.09, 0.1); },
  combo: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'sine', 0.08, i * 0.07)),
  tick: () => tone(760, 0.05, 'square', 0.04),
  win: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, i * 0.1)),
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickQuestion = (pool, usedIdx) => {
  if (usedIdx.length >= pool.length) return Math.floor(Math.random() * pool.length);
  let idx;
  do { idx = Math.floor(Math.random() * pool.length); } while (usedIdx.includes(idx));
  return idx;
};
const comboMultiplier = (combo) => (combo >= 7 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1);

/* 红包雨 */
function RedPacket({ item, onGrab }) {
  return (
    <button
      onClick={() => onGrab(item.id)}
      className="absolute grid h-16 w-14 place-items-center rounded-xl bg-gradient-to-b from-[#ff5a45] to-[#d8281b] text-[22px] shadow-[0_10px_30px_-6px_rgba(255,60,40,0.75)] transition hover:scale-110 active:scale-95 sm:h-20 sm:w-16"
      style={{ left: `${item.left}%`, animation: `rpFall ${item.dur}s linear ${item.delay}s forwards` }}
      aria-label="抢红包"
    >
      <span className="absolute inset-x-1.5 top-1 h-[38%] rounded-t-lg bg-[#ffc93c]/90" />
      <span className="relative mt-6 text-[15px] font-black text-[#ffd76a]">¥</span>
    </button>
  );
}

export default function RedPacketClass({ courses = [], courseId = '', onCourseChange, students = [] }) {
  const [phase, setPhase] = useState('setup'); // setup | play | result
  const [picked, setPicked] = useState([]);
  const [manual, setManual] = useState('');
  const [players, setPlayers] = useState([]);
  const [current, setCurrent] = useState(0);
  const [packets, setPackets] = useState([]);
  const [question, setQuestion] = useState(null);
  const [used, setUsed] = useState([]);
  const [left, setLeft] = useState(0);
  const [answered, setAnswered] = useState(null);
  const [banner, setBanner] = useState(null);
  const [comboFx, setComboFx] = useState(null);
  const [log, setLog] = useState([]);
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES);
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [spinTarget, setSpinTarget] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef(null);

  const roster = useMemo(() => {
    const fromClass = students.map(s => ({ id: String(s.id), name: s.name }));
    const extra = picked.filter(p => p.manual);
    return [...fromClass, ...extra];
  }, [students, picked]);

  const me = players[current];
  const course = courses.find(c => String(c.id) === courseId);

  /* 当前课程科目对应的题库；该科目暂无题时退回综合题库 */
  const pool = useMemo(() => {
    const subject = course?.subject || '';
    const bySubject = QUESTIONS.filter(q => q.s === subject);
    return bySubject.length ? bySubject : QUESTIONS;
  }, [course]);

  /* 换课程时清空已选学生与出题记录，避免跨科目串题 */
  useEffect(() => {
    setPicked([]);
    setUsed([]);
  }, [courseId]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  /* ---------- 开局 ---------- */
  const start = () => {
    if (!picked.length) return;
    setPlayers(picked.map(p => ({
      id: p.id, name: p.name, score: 0, combo: 0, maxCombo: 0, right: 0, wrong: 0, prizes: [],
    })));
    setCurrent(0);
    setPackets([]);
    setQuestion(null);
    setUsed([]);
    setAnswered(null);
    setLog([]);
    setPhase('play');
    tone(660, 0.12); tone(880, 0.16, 'sine', 0.09, 0.12);
  };

  /* ---------- 发红包 ---------- */
  const sendPackets = () => {
    if (!me || packets.length || question) return;
    const count = 4;
    setPackets(Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      left: 16 + Math.random() * 66,
      dur: 1.5 + Math.random() * 0.8,
      delay: i * 0.16,
    })));
    sfx.coin();
    /* 5 秒内没抢自动收回 */
    setTimeout(() => setPackets(p => (p.length ? [] : p)), 5000);
  };

  const grab = (id) => {
    setPackets([]);
    sfx.coin();
    const idx = pickQuestion(pool, used);
    setUsed(u => [...u, idx]);
    setQuestion({ ...pool[idx], idx });
    setLeft(DIFF[pool[idx].diff].time);
    setAnswered(null);
  };

  /* ---------- 倒计时 ---------- */
  useEffect(() => {
    if (!question || answered) return;
    timerRef.current = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        if (prev <= 4) sfx.tick();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [question, answered]);

  /* 超时判错 */
  useEffect(() => {
    if (question && !answered && left === 0) {
      resolve(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, question, answered]);

  /* ---------- 判定 ---------- */
  const resolve = (choice) => {
    if (!question || answered) return;
    clearInterval(timerRef.current);
    const correct = choice === question.a;
    const base = DIFF[question.diff].score;
    setAnswered({ choice, correct });

    setPlayers(prev => prev.map((p, i) => {
      if (i !== current) return p;
      if (!correct) {
        return { ...p, wrong: p.wrong + 1, combo: 0 };
      }
      const combo = p.combo + 1;
      const gain = Math.round(base * comboMultiplier(combo));
      return {
        ...p,
        score: p.score + gain,
        combo,
        maxCombo: Math.max(p.maxCombo, combo),
        right: p.right + 1,
      };
    }));

    if (correct) {
      const nextCombo = (me?.combo || 0) + 1;
      sfx.right();
      if (nextCombo >= 3) {
        sfx.combo();
        setComboFx(nextCombo);
        setTimeout(() => setComboFx(null), 1300);
      }
      setLog(l => [{ name: me?.name, ok: true, gain: Math.round(base * comboMultiplier(nextCombo)), at: Date.now() }, ...l].slice(0, 30));
    } else {
      sfx.wrong();
      setLog(l => [{ name: me?.name, ok: false, gain: 0, at: Date.now() }, ...l].slice(0, 30));
    }

    setBanner(correct
      ? { ok: true, text: choice === -1 ? '' : '答对了' }
      : { ok: false, text: choice === -1 ? '时间到，红包炸了' : '答错了，红包炸了' });
    setTimeout(() => setBanner(null), 1100);

    /* 1.9 秒后轮到下一位 */
    setTimeout(() => {
      setQuestion(null);
      setAnswered(null);
      setCurrent(c => (players.length ? (c + 1) % players.length : 0));
    }, 1900);
  };

  /* ---------- 抽奖 ---------- */
  const draw = (prize) => {
    if (!me || spinning) return;
    if (me.score < prize.cost) return;
    if (prize.stock <= 0) return;
    setSpinning(true);
    sfx.spin?.();
    /* 转盘感：随机高亮 6 次后落定 */
    let n = 0;
    const timer = setInterval(() => {
      setSpinTarget(prizes[Math.floor(Math.random() * prizes.length)].id);
      tone(520 + Math.random() * 300, 0.05, 'square', 0.04);
      if (++n >= 7) {
        clearInterval(timer);
        setSpinTarget(prize.id);
        setPlayers(prev => prev.map((p, i) => (
          i === current
            ? { ...p, score: p.score - prize.cost, prizes: [...p.prizes, prize.name] }
            : p
        )));
        setPrizes(prev => prev.map(p => (p.id === prize.id ? { ...p, stock: p.stock - 1 } : p)));
        setSpinning(false);
        if (prize.name !== '谢谢参与') sfx.win(); else sfx.wrong();
      }
    }, 130);
  };

  const resetAll = () => {
    setPhase('setup');
    setPlayers([]);
    setCurrent(0);
    setQuestion(null);
    setPackets([]);
    setLog([]);
    setPrizes(DEFAULT_PRIZES);
  };

  const ranked = [...players].sort((a, b) => b.score - a.score);

  /* ==================== 选人页 ==================== */
  if (phase === 'setup') {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161618] text-white">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-b from-[#ff5a45] to-[#d8281b] text-lg">🧧</span>
          <div>
            <div className="text-[16px] font-bold tracking-tight">红包课堂</div>
            <div className="text-[10.5px] text-white/45">学生轮流上台操作 · 无需手机 · 无需联网</div>
          </div>
          <div className="ml-auto rounded-full bg-white/10 px-3 py-1 text-[10.5px] text-white/60">
            已选 {picked.length}/3
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">第一步 · 选择课程</div>
            <p className="mt-1.5 text-[11.5px] text-white/45">题目只从该课程科目的题库抽取，学生名单取自课程绑定的班级。</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {courses.map(c => {
                const on = String(c.id) === courseId;
                return (
                  <button
                    key={c.id}
                    onClick={() => onCourseChange?.(String(c.id))}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      on ? 'border-[#ff5a45] bg-[#ff5a45]/12' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                    }`}
                  >
                    <div className="text-[12.5px] font-semibold">{c.name}</div>
                    <div className="mt-0.5 text-[10px] text-white/45">
                      {[c.name.includes(c.subject) ? '' : c.subject, c.class_name || '未绑定班级'].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                );
              })}
              {!courses.length && (
                <div className="text-[11.5px] text-white/40">还没有课程，请先到「课程」页创建。</div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">第二步 · 选上台的学生</span>
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/45">
                {course?.subject || '综合'}题库 {pool.length} 题
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-white/45">
              建议 2-3 人，依次上台点击抢红包并作答。
              {course && !BANK[course.subject] ? ' 该科目专属题库待补充，暂用综合题。' : ''}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {roster.map(stu => {
                const on = picked.some(p => p.id === stu.id);
                return (
                  <button
                    key={stu.id}
                    onClick={() => setPicked(prev => (
                      on ? prev.filter(p => p.id !== stu.id)
                        : prev.length >= 3 ? prev
                          : [...prev, { id: stu.id, name: stu.name }]
                    ))}
                    className={`relative rounded-xl border px-2 py-2.5 text-[12px] font-medium transition ${
                      on
                        ? 'border-[#ff5a45] bg-[#ff5a45]/15 text-white'
                        : 'border-white/10 bg-white/[0.04] text-white/65 hover:border-white/25'
                    } ${!on && picked.length >= 3 ? 'opacity-40' : ''}`}
                  >
                    {stu.name}
                    {on && (
                      <span className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#ff5a45] text-[9px]">
                        {picked.findIndex(p => p.id === stu.id) + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {!students.length && (
              <div className="mt-4 flex gap-2">
                <input
                  value={manual}
                  onChange={e => setManual(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && manual.trim() && picked.length < 3) {
                      setPicked(p => [...p, { id: `m-${Date.now()}`, name: manual.trim(), manual: true }]);
                      setManual('');
                    }
                  }}
                  placeholder={course && !course.class_id ? '该课程未绑定班级，直接输入学生姓名' : '输入学生姓名，回车添加'}
                  className="flex-1 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2.5 text-[12.5px] text-white outline-none placeholder:text-white/25 focus:border-[#ff5a45]/60"
                />
                <button
                  onClick={() => {
                    if (manual.trim() && picked.length < 3) {
                      setPicked(p => [...p, { id: `m-${Date.now()}`, name: manual.trim(), manual: true }]);
                      setManual('');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 text-[12px] font-medium hover:bg-white/15"
                >
                  <UserPlus size={13} /> 添加
                </button>
              </div>
            )}

            {picked.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {picked.map((p, i) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#ff5a45]/15 px-3 py-1.5 text-[11.5px] text-[#ffb3a8]">
                    {i + 1}. {p.name}
                    <button onClick={() => setPicked(prev => prev.filter(x => x.id !== p.id))} className="text-white/40 hover:text-white">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 grid gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-3">
              {[
                ['🧧', '抢红包', '点「发红包」，红包雨下落，抢到就弹题'],
                ['⚡', '连击加成', '3 连 ×1.5、5 连 ×2、7 连 ×3'],
                ['🎁', '积分抽奖', '攒够积分去奖池抽文具、免作业券'],
              ].map(([icon, title, desc]) => (
                <div key={title} className="flex gap-2.5">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <div className="text-[11.5px] font-semibold">{title}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-white/40">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <button
            onClick={start}
            disabled={!picked.length}
            className="mx-auto flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff5a45] to-[#e03a26] px-8 py-3 text-[14px] font-bold text-white shadow-[0_14px_30px_-12px_rgba(255,80,60,0.9)] transition hover:brightness-110 disabled:opacity-35"
          >
            <Play size={16} /> 开始红包课堂
          </button>
        </div>
      </div>
    );
  }

  /* ==================== 结算页 ==================== */
  if (phase === 'result') {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161618] text-white">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
          <Trophy size={18} className="text-[#ffcc66]" />
          <span className="text-[16px] font-bold">课堂结算</span>
          <button onClick={resetAll} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] hover:bg-white/15">
            <RotateCcw size={12} /> 再来一节
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl">
            <div className="space-y-2.5">
              {ranked.map((p, i) => {
                const total = p.right + p.wrong;
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${
                    i === 0 ? 'border-[#ffcc66]/40 bg-[#ffcc66]/[0.08]' : 'border-white/10 bg-white/[0.03]'
                  }`}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                      i === 0 ? 'bg-[#ffcc66] text-[#3a2a00]' : i === 1 ? 'bg-white/70 text-[#222]' : 'bg-white/12 text-white/70'
                    }`}>{i === 0 ? '1' : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{p.name}</div>
                      <div className="mt-0.5 text-[10.5px] text-white/45">
                        答对 {p.right} · 答错 {p.wrong} · 正确率 {total ? Math.round((p.right / total) * 100) : 0}% · 最高连击 {p.maxCombo}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[22px] font-bold leading-none text-[#ffcc66]">{p.score}</div>
                      <div className="mt-1 text-[9.5px] text-white/35">积分</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {players.some(p => p.prizes.length) && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">奖品清单</div>
                <div className="mt-2.5 space-y-1.5">
                  {players.filter(p => p.prizes.length).map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-[12px]">
                      <span className="w-20 shrink-0 text-white/60">{p.name}</span>
                      <span className="text-white/85">{p.prizes.join('、')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {log.length > 0 && (
              <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">答题记录</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {log.slice(0, 24).map((l, i) => (
                    <span key={i} className={`rounded-full px-2.5 py-1 text-[10.5px] ${
                      l.ok ? 'bg-[#28cd41]/15 text-[#8ce8b0]' : 'bg-[#ff5f57]/15 text-[#ff9a94]'
                    }`}>
                      {l.name} {l.ok ? `+${l.gain}` : '答错'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ==================== 课堂进行页 ==================== */
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141416] text-white">
      <style>{`
        @keyframes rpFall {
          0% { transform: translateY(-140px) rotate(-10deg); opacity: 0; }
          8% { opacity: 1; }
          100% { transform: translateY(80vh) rotate(10deg); opacity: 1; }
        }
        @keyframes rpFloat {
          0% { opacity: 0; transform: translateY(14px) scale(.9); }
          30% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-46px) scale(1.06); }
        }
        @keyframes comboIn {
          0% { opacity: 0; transform: scale(.5) rotate(-6deg); }
          25% { opacity: 1; transform: scale(1.08) rotate(2deg); }
          70% { opacity: 1; transform: scale(1) rotate(0); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        @keyframes boom {
          0% { transform: scale(.4); opacity: 1; }
          100% { transform: scale(1.9); opacity: 0; }
        }
      `}</style>

      {/* 顶部：选手条 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="mr-1 hidden text-[12px] font-bold tracking-tight text-white/70 sm:block">红包课堂</span>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {players.map((p, i) => {
            const active = i === current;
            return (
              <button
                key={p.id}
                onClick={() => { if (!question) setCurrent(i); }}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 transition ${
                  active ? 'border-[#ff5a45] bg-[#ff5a45]/12' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                }`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[10.5px] font-bold ${
                  active ? 'bg-[#ff5a45] text-white' : 'bg-white/10 text-white/60'
                }`}>{p.name.slice(0, 1)}</span>
                <span className="text-left">
                  <span className="block text-[11.5px] font-semibold leading-tight">{p.name}</span>
                  <span className="num block text-[9.5px] leading-tight text-white/40">
                    {p.score} 分{p.combo >= 2 ? ` · ${p.combo} 连` : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setLotteryOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ffcc66]/12 px-2.5 py-1.5 text-[11px] font-medium text-[#ffd98a] hover:bg-[#ffcc66]/20"
        >
          <Gift size={12} /> 抽奖
        </button>
        <button
          onClick={() => setPhase('result')}
          className="shrink-0 rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/15"
        >
          结算
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 主舞台 */}
        <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-4">
          {/* 氛围光 */}
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute left-1/2 top-0 h-64 w-[520px] -translate-x-1/2 rounded-full bg-[#ff5a45]/12 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-[#ffcc66]/10 blur-3xl" />
          </div>

          {/* 红包雨 */}
          {packets.map(p => <RedPacket key={p.id} item={p} onGrab={grab} />)}

          {/* 空闲：发红包 */}
          {!question && !packets.length && (
            <div className="relative text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">轮到</div>
              <div className="mt-1.5 text-[30px] font-black tracking-tight sm:text-[40px]" style={{ textShadow: '0 0 40px rgba(255,90,69,.45)' }}>
                {me?.name}
              </div>
              {me?.combo >= 2 && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#ffcc66]/15 px-3 py-1 text-[11.5px] font-semibold text-[#ffd98a]">
                  <Sparkles size={12} /> {me.combo} 连击中 · 得分 ×{comboMultiplier(me.combo)}
                </div>
              )}
              <div className="mt-7">
                <button
                  onClick={sendPackets}
                  className="group relative inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#ff5a45] to-[#d8281b] px-9 py-4 text-[16px] font-bold shadow-[0_20px_45px_-16px_rgba(255,80,60,0.95)] transition hover:brightness-110 active:scale-95"
                >
                  <span className="text-[20px]">🧧</span> 发红包
                </button>
              </div>
              <div className="mt-3 text-[10.5px] text-white/30">点击后红包雨落下，抢到一个即可答题</div>
            </div>
          )}

          {/* 等待抢红包 */}
          {packets.length > 0 && (
            <div className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-[13px] font-semibold text-[#ffd98a]">
              抢一个红包！
            </div>
          )}

          {/* 答题卡 */}
          {question && (
            <div className="relative w-full max-w-2xl">
              <div className="mb-2.5 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${DIFF[question.diff].cls}`}>
                  {DIFF[question.diff].label} · {DIFF[question.diff].score} 分
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] text-white/55">
                  <Timer size={11} /> {left}s
                </span>
                <span className="ml-auto text-[10.5px] text-white/35">{me?.name} 作答</span>
              </div>

              <div className="rounded-2xl border border-white/12 bg-[#1c1c1f] p-5 shadow-2xl">
                <div className="text-[18px] font-semibold leading-relaxed sm:text-[21px]">{question.q}</div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {question.o.map((opt, i) => {
                    const chosen = answered?.choice === i;
                    const right = answered && i === question.a;
                    return (
                      <button
                        key={i}
                        disabled={!!answered}
                        onClick={() => resolve(i)}
                        className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[13px] transition ${
                          right
                            ? 'border-[#28cd41] bg-[#28cd41]/15 text-white'
                            : chosen && !answered?.correct
                              ? 'border-[#ff5f57] bg-[#ff5f57]/15 text-white'
                              : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/30 hover:bg-white/[0.07]'
                        } ${answered ? 'cursor-default' : ''}`}
                      >
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                          right ? 'bg-[#28cd41] text-[#08240f]' : chosen ? 'bg-[#ff5f57] text-white' : 'bg-white/10 text-white/60'
                        }`}>
                          {right ? <Check size={12} /> : String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div className={`mt-3.5 rounded-xl px-3.5 py-2.5 text-[11.5px] leading-5 ${
                    answered.correct ? 'bg-[#28cd41]/10 text-[#9be9b8]' : 'bg-[#ff5f57]/10 text-[#ffb0aa]'
                  }`}>
                    {answered.correct ? '答对了！' : '这题答案是：' + String.fromCharCode(65 + question.a) + '. ' + question.o[question.a]}
                    {question.tip ? ` · ${question.tip}` : ''}
                  </div>
                )}

                {/* 倒计时条 */}
                {!answered && (
                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#ff5a45] to-[#ffcc66] transition-all duration-1000 ease-linear"
                      style={{ width: `${(left / DIFF[question.diff].time) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 判定横幅 */}
          {banner && (
            <div className={`pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-full px-5 py-2 text-[14px] font-bold shadow-lg ${
              banner.ok ? 'bg-[#28cd41] text-[#06230f]' : 'bg-[#ff5f57] text-white'
            }`} style={{ animation: 'rpFloat 1.1s ease-out forwards' }}>
              {banner.text}
            </div>
          )}

          {/* 连击特效 */}
          {comboFx && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ animation: 'comboIn 1.3s ease-out forwards' }}>
              <div className="text-center">
                <div className="text-[54px] font-black tracking-tight text-[#ffcc66] drop-shadow-[0_0_28px_rgba(255,204,102,.85)] sm:text-[72px]">
                  COMBO ×{comboFx}
                </div>
                <div className="text-[13px] font-semibold text-white/70">得分 ×{comboMultiplier(comboFx)}</div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：排行榜 */}
        <div className="hidden w-56 shrink-0 flex-col border-l border-white/10 p-3 lg:flex">
          <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
            <Trophy size={12} /> 实时排行
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {ranked.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${
                p.id === me?.id ? 'bg-[#ff5a45]/12' : 'bg-white/[0.03]'
              }`}>
                <span className={`num w-4 text-[10.5px] font-bold ${i === 0 ? 'text-[#ffcc66]' : 'text-white/35'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{p.name}</span>
                <span className="num text-[12px] font-bold text-[#ffd98a]">{p.score}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-white/[0.03] p-2.5">
            <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/30">本轮记录</div>
            <div className="mt-1.5 space-y-1">
              {log.slice(0, 5).map((l, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className={l.ok ? 'text-[#7ee2a8]' : 'text-[#ff9a94]'}>{l.ok ? '✓' : '✕'}</span>
                  <span className="truncate text-white/45">{l.name}</span>
                  <span className="ml-auto num text-white/60">{l.ok ? `+${l.gain}` : '0'}</span>
                </div>
              ))}
              {!log.length && <div className="text-[10px] text-white/25">还没有答题记录</div>}
            </div>
          </div>
        </div>
      </div>

      {/* 抽奖抽屉 */}
      {lotteryOpen && (
        <div className="absolute inset-0 z-20 flex justify-end">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => !spinning && setLotteryOpen(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-[#17171a] p-4">
            <div className="flex items-center gap-2">
              <Gift size={16} className="text-[#ffcc66]" />
              <span className="text-[14px] font-bold">积分奖池</span>
              <button onClick={() => !spinning && setLotteryOpen(false)} className="ml-auto rounded-full p-1.5 text-white/45 hover:bg-white/10">
                <X size={15} />
              </button>
            </div>
            <div className="mt-2 rounded-xl bg-[#ffcc66]/10 px-3 py-2.5 text-[11.5px] text-[#ffd98a]">
              {me?.name} 当前积分 <b className="num text-[15px]">{me?.score ?? 0}</b>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {prizes.map(p => {
                const affordable = (me?.score ?? 0) >= p.cost && p.stock > 0;
                const hit = spinTarget === p.id;
                return (
                  <button
                    key={p.id}
                    disabled={!affordable || spinning}
                    onClick={() => draw(p)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      hit ? 'border-[#ffcc66] bg-[#ffcc66]/20 scale-[1.02]' : 'border-white/10 bg-white/[0.03]'
                    } ${affordable ? 'hover:border-[#ffcc66]/50' : 'opacity-45'}`}
                  >
                    <span className="text-[20px]">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold">{p.name}</div>
                      <div className="mt-0.5 text-[10px] text-white/40">
                        需 {p.cost} 积分 · 剩余 {p.stock}
                      </div>
                    </div>
                    <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] text-white/55">
                      {p.weight}%
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-white/30">
              点击奖品格即可抽取，积分立即扣除。老师可后续在设置里替换奖品与概率。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
