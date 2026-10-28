/** 课堂游戏模块：6 个投影友好的趣味互动游戏
 *  - 幸运转盘：随机抽取学生/选项（带减速动画）
 *  - 翻牌配对：单词与释义配对记忆
 *  - 抢答对战：两队抢答选择题
 *  - 抽卡问答：随机任务/题目卡片
 *  - 单词闪卡：翻面记忆单词
 *  - 口算速答：限时算术挑战
 * 全部为前端纯实现，桌面端网页端通用，可投屏使用。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dices, Layers, Swords, CreditCard, BookOpen, Calculator,
  RotateCcw, Play, Trophy, Clock3, ChevronLeft, ChevronRight,
} from 'lucide-react';

const GAMES = [
  { id: 'spinner', name: '幸运转盘', icon: Dices, desc: '随机抽取学生或选项' },
  { id: 'memory', name: '翻牌配对', icon: Layers, desc: '单词释义配对记忆' },
  { id: 'quiz', name: '抢答对战', icon: Swords, desc: '两队抢答积分' },
  { id: 'card', name: '抽卡问答', icon: CreditCard, desc: '随机任务题目卡' },
  { id: 'flash', name: '单词闪卡', icon: BookOpen, desc: '翻面快速记忆' },
  { id: 'math', name: '口算速答', icon: Calculator, desc: '限时算术挑战' },
];

const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ff6b00'];

export default function ClassroomGames({ students = [] }) {
  const [active, setActive] = useState('spinner');

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <h2 className="text-base font-bold tracking-tight">课堂游戏</h2>
        <span className="text-[10px] text-white/40">6 款 · 投屏即玩</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {GAMES.map(g => (
            <button key={g.id} onClick={() => setActive(g.id)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${active === g.id ? 'bg-[#0a84ff] text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
              <g.icon size={12} />{g.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {active === 'spinner' && <SpinnerGame students={students} />}
        {active === 'memory' && <MemoryGame />}
        {active === 'quiz' && <QuizGame />}
        {active === 'card' && <CardGame />}
        {active === 'flash' && <FlashGame />}
        {active === 'math' && <MathGame />}
      </div>
    </div>
  );
}

/* ==================== 幸运转盘 ==================== */
function SpinnerGame({ students }) {
  const [mode, setMode] = useState('students'); // students / custom
  const [custom, setCustom] = useState('苹果,香蕉,橘子,葡萄,西瓜,草莓');
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState('');
  const [segments, setSegments] = useState([]);
  const timerRef = useRef(null);

  const items = useMemo(() => {
    if (mode === 'students') return students.map(s => s.name);
    return custom.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  }, [mode, custom, students]);

  useEffect(() => {
    setSegments(items.map((label, i) => ({
      label, color: PALETTE[i % PALETTE.length],
    })));
    setResult('');
  }, [items]);

  const spin = () => {
    if (spinning || segments.length < 2) return;
    setSpinning(true);
    setResult('');
    const n = segments.length;
    const anglePer = 360 / n;
    const target = Math.floor(Math.random() * n);
    /* 多转几圈 + 精确停到目标段中央 */
    const turns = 5 + Math.floor(Math.random() * 3);
    const finalAngle = 360 - (target * anglePer + anglePer / 2);
    const dest = rotation + turns * 360 + (finalAngle - (rotation % 360));
    setRotation(dest);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setResult(segments[target].label);
      setSpinning(false);
    }, 4200);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const R = 150;
  const circumference = 2 * Math.PI * R;

  return (
    <div className="h-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => setMode('students')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${mode === 'students' ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50'}`}>
            学生名单
          </button>
          <button onClick={() => setMode('custom')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${mode === 'custom' ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50'}`}>
            自定义
          </button>
        </div>
        {mode === 'custom' && (
          <input value={custom} onChange={e => setCustom(e.target.value)}
            placeholder="用逗号分隔选项"
            className="flex-1 min-w-[160px] rounded-full bg-white/10 px-3 py-1 text-xs text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#0a84ff]/40" />
        )}
        <span className="text-[10px] text-white/30">共 {segments.length} 项</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2"
            style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '20px solid #ff375f' }} />
          <svg width="200" height="200" viewBox="0 0 320 320"
            style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(.17,.67,.2,1)' : 'none' }}>
            {segments.map((seg, i) => {
              const start = (i / segments.length) * 2 * Math.PI - Math.PI / 2;
              const end = ((i + 1) / segments.length) * 2 * Math.PI - Math.PI / 2;
              const x1 = 160 + R * Math.cos(start);
              const y1 = 160 + R * Math.sin(start);
              const x2 = 160 + R * Math.cos(end);
              const y2 = 160 + R * Math.sin(end);
              const large = end - start > Math.PI ? 1 : 0;
              const mid = (start + end) / 2;
              const tx = 160 + R * 0.62 * Math.cos(mid);
              const ty = 160 + R * 0.62 * Math.sin(mid);
              return (
                <g key={i}>
                  <path d={`M160,160 L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`}
                    fill={seg.color} stroke="#1d1d1f" strokeWidth="2" />
                  <text x={tx} y={ty} fill="#fff" fontSize="16" fontWeight="700"
                    textAnchor="middle" dominantBaseline="middle"
                    transform={`rotate(${(mid + Math.PI / 2) * 180 / Math.PI}, ${tx}, ${ty})`}>
                    {seg.label.length > 5 ? seg.label.slice(0, 5) + '…' : seg.label}
                  </text>
                </g>
              );
            })}
            <circle cx="160" cy="160" r="26" fill="#1d1d1f" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
            <circle cx="160" cy="160" r="8" fill="#fff" />
          </svg>
        </div>

        {result && !spinning && (
          <div className="text-center">
            <div className="text-[11px] text-white/40">抽中</div>
            <div className="text-3xl font-bold" style={{ textShadow: '0 0 30px rgba(10,132,255,.6)' }}>{result}</div>
          </div>
        )}

        <button onClick={spin} disabled={spinning || segments.length < 2}
          className="rounded-full bg-[#0a84ff] px-7 py-2 text-sm font-semibold shadow-lg shadow-blue-500/30 transition hover:bg-[#2f94ff] disabled:opacity-40">
          {spinning ? '转动中…' : result ? '再来一次' : '开始转动'}
        </button>
        {segments.length < 2 && <p className="text-[10px] text-white/30">至少需要 2 个选项</p>}
      </div>
    </div>
  );
}

/* ==================== 翻牌配对 ==================== */
const WORD_PAIRS = [
  ['apple', '苹果'], ['book', '书'], ['cat', '猫'], ['dog', '狗'],
  ['school', '学校'], ['water', '水'], ['sun', '太阳'], ['moon', '月亮'],
  ['happy', '快乐'], ['friend', '朋友'], ['teacher', '老师'], ['study', '学习'],
];

function MemoryGame() {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [teamMode, setTeamMode] = useState(false);
  const [team, setTeam] = useState(0); // 0 / 1
  const [scores, setScores] = useState([0, 0]);
  const timerRef = useRef(null);

  const deal = () => {
    const pool = WORD_PAIRS.slice(0, 8);
    const deck = pool.flatMap(([en, zh], i) => [
      { id: `${i}-a`, pair: i, text: en },
      { id: `${i}-b`, pair: i, text: zh },
    ]);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setCards(deck);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setSeconds(0);
    setStarted(false);
    setScores([0, 0]);
    setTeam(0);
    clearInterval(timerRef.current);
  };

  useEffect(() => { deal(); }, []);

  const flip = (card) => {
    if (flipped.length >= 2 || flipped.find(f => f.id === card.id) || matched.includes(card.pair)) return;
    if (!started) { setStarted(true); timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000); }
    const next = [...flipped, card];
    setFlipped(next);
    if (next.length === 2) {
      setMoves(m => m + 1);
      if (next[0].pair === next[1].pair) {
        setTimeout(() => {
          setMatched(m => [...m, card.pair]);
          setFlipped([]);
          if (teamMode) setScores(s => { const n = [...s]; n[team]++; return n; });
        }, 450);
      } else {
        setTimeout(() => {
          setFlipped([]);
          if (teamMode) setTeam(t => t === 0 ? 1 : 0);
        }, 900);
      }
    }
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const done = matched.length === 8;
  useEffect(() => { if (done) clearInterval(timerRef.current); }, [done]);

  return (
    <div className="h-full">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/70">步数 {moves}</span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/70">⏱ {seconds}s</span>
        <button onClick={() => setTeamMode(t => !t)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${teamMode ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50'}`}>
          {teamMode ? '双人模式' : '单人模式'}
        </button>
        {teamMode && (
          <span className="flex items-center gap-2 text-[11px]">
            <span className={team === 0 ? 'text-[#0a84ff] font-bold' : 'text-white/40'}>蓝队 {scores[0]}</span>
            <span className="text-white/20">vs</span>
            <span className={team === 1 ? 'text-[#ff9f0a] font-bold' : 'text-white/40'}>橙队 {scores[1]}</span>
          </span>
        )}
        <button onClick={deal} className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/15">
          <RotateCcw size={12} /> 重新发牌
        </button>
      </div>

      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {cards.map(card => {
          const isOpen = flipped.find(f => f.id === card.id) || matched.includes(card.pair);
          const isMatched = matched.includes(card.pair);
          return (
            <button key={card.id} onClick={() => flip(card)}
              className="aspect-[3/4] rounded-xl text-lg font-bold transition-all duration-300"
              style={{
                background: isOpen ? (isMatched ? '#30d158' : '#0a84ff') : 'rgba(255,255,255,.08)',
                boxShadow: isOpen ? '0 0 20px rgba(10,132,255,.3)' : 'inset 0 0 0 2px rgba(255,255,255,.06)',
                color: '#fff',
              }}>
              {isOpen ? card.text : '?'}
            </button>
          );
        })}
      </div>

      {done && (
        <div className="mt-3 rounded-xl bg-[#30d158]/15 p-3 text-center">
          <Trophy size={20} className="mx-auto text-[#30d158]" />
          <div className="mt-1 text-sm font-bold">全部配对完成！</div>
          <div className="text-[11px] text-white/60">用时 {seconds} 秒 · {moves} 步</div>
        </div>
      )}
    </div>
  );
}

/* ==================== 抢答对战 ==================== */
const SUBJECTS = ['综合', '语文', '数学', '英语', '科学', '常识'];
const QUIZ_BANK = [
  /* 语文 */
  { subject: '语文', q: '「床前明月光」的下一句是？', opts: ['疑是地上霜', '低头思故乡', '举头望明月', '夜来风雨声'], a: 0 },
  { subject: '语文', q: '「鹅鹅鹅」的作者是？', opts: ['李白', '骆宾王', '杜甫', '白居易'], a: 1 },
  { subject: '语文', q: '「春眠不觉晓」出自哪首诗？', opts: ['静夜思', '春晓', '登鹳雀楼', '悯农'], a: 1 },
  { subject: '语文', q: '「锄禾日当午」的下一句是？', opts: ['汗滴禾下土', '粒粒皆辛苦', '谁知盘中餐', '四海无闲田'], a: 0 },
  { subject: '语文', q: '下列哪个字是后鼻音？', opts: ['山', '水', '风', '云'], a: 2 },
  { subject: '语文', q: '「画蛇添足」告诉我们什么道理？', opts: ['做事要坚持', '多此一举反而坏事', '团结力量大', '知错能改'], a: 1 },
  { subject: '语文', q: '「百家姓」中排在第一位的姓是？', opts: ['李', '王', '赵', '孙'], a: 2 },
  { subject: '语文', q: '「一日之计在于晨」的下一句是？', opts: ['一年之计在于春', '一生之计在于勤', '一家之计在于和', '以上都对'], a: 0 },

  /* 数学 */
  { subject: '数学', q: '一年有多少天（平年）？', opts: ['364', '365', '366', '360'], a: 1 },
  { subject: '数学', q: '1 公里等于多少米？', opts: ['100', '500', '1000', '10000'], a: 2 },
  { subject: '数学', q: '三角形内角和是多少度？', opts: ['90°', '180°', '270°', '360°'], a: 1 },
  { subject: '数学', q: '一个正方形边长 5cm，周长是？', opts: ['10cm', '15cm', '20cm', '25cm'], a: 2 },
  { subject: '数学', q: '7 × 8 = ?', opts: ['54', '56', '64', '48'], a: 1 },
  { subject: '数学', q: '下列哪个是质数？', opts: ['9', '15', '17', '21'], a: 2 },
  { subject: '数学', q: '一个圆的直径是 4cm，半径是？', opts: ['1cm', '2cm', '4cm', '8cm'], a: 1 },
  { subject: '数学', q: '3/4 + 1/4 = ?', opts: ['4/8', '1', '4/4', '2/4'], a: 1 },

  /* 英语 */
  { subject: '英语', q: '"Apple" 的中文意思是？', opts: ['香蕉', '苹果', '橙子', '葡萄'], a: 1 },
  { subject: '英语', q: '"星期一" 的英文是？', opts: ['Monday', 'Sunday', 'Friday', 'Tuesday'], a: 0 },
  { subject: '英语', q: '"红色" 的英文是？', opts: ['Blue', 'Green', 'Red', 'Yellow'], a: 2 },
  { subject: '英语', q: '"I ___ a student." 应填？', opts: ['is', 'am', 'are', 'be'], a: 1 },
  { subject: '英语', q: '"Book" 的复数是？', opts: ['Book', 'Books', 'Bookes', 'Bookies'], a: 1 },
  { subject: '英语', q: '"Good morning" 的意思是？', opts: ['晚安', '早上好', '下午好', '再见'], a: 1 },
  { subject: '英语', q: '数字 "12" 的英文是？', opts: ['Twenty', 'Twelve', 'Two', 'Ten'], a: 1 },
  { subject: '英语', q: '"Teacher" 的意思是？', opts: ['学生', '老师', '医生', '工人'], a: 1 },

  /* 科学 */
  { subject: '科学', q: '水的化学式是？', opts: ['CO2', 'O2', 'H2O', 'NaCl'], a: 2 },
  { subject: '科学', q: '地球绕什么公转？', opts: ['月亮', '太阳', '火星', '金星'], a: 1 },
  { subject: '科学', q: '人体内最大的器官是？', opts: ['心脏', '肝脏', '皮肤', '肺'], a: 2 },
  { subject: '科学', q: '光的速度大约是每秒？', opts: ['3 万公里', '30 万公里', '300 万公里', '3000 公里'], a: 1 },
  { subject: '科学', q: '彩虹有几种颜色？', opts: ['5', '6', '7', '8'], a: 2 },
  { subject: '科学', q: '下列哪种动物是哺乳动物？', opts: ['鳄鱼', '鲨鱼', '鲸鱼', '乌龟'], a: 2 },
  { subject: '科学', q: '植物进行光合作用需要什么？', opts: ['氧气', '阳光', '氮气', '二氧化碳'], a: 1 },
  { subject: '科学', q: '太阳系中最大的行星是？', opts: ['地球', '火星', '木星', '土星'], a: 2 },

  /* 常识 */
  { subject: '常识', q: '中国的首都是？', opts: ['上海', '北京', '广州', '深圳'], a: 1 },
  { subject: '常识', q: '太阳从哪个方向升起？', opts: ['东', '西', '南', '北'], a: 0 },
  { subject: '常识', q: '一年有几个季节？', opts: ['2', '3', '4', '5'], a: 2 },
  { subject: '常识', q: '一周有几天？', opts: ['5', '6', '7', '8'], a: 2 },
  { subject: '常识', q: '火警电话是？', opts: ['110', '120', '119', '122'], a: 2 },
  { subject: '常识', q: '中国有多少个省级行政区？', opts: ['32', '34', '36', '30'], a: 1 },
  { subject: '常识', q: '端午节是农历几月几日？', opts: ['五月初五', '八月十五', '正月初一', '九月初九'], a: 0 },
  { subject: '常识', q: '奥运会几年举办一次？', opts: ['2 年', '3 年', '4 年', '5 年'], a: 2 },
];

function QuizGame() {
  const [subject, setSubject] = useState('综合');
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [buzzed, setBuzzed] = useState(null); // null / 0 / 1
  const [answered, setAnswered] = useState(null); // null / correctIndex
  const [showResult, setShowResult] = useState(false);
  const [bank, setBank] = useState([]);

  const shuffle = (subj = subject) => {
    const pool = subj === '综合' ? QUIZ_BANK : QUIZ_BANK.filter(q => q.subject === subj);
    const b = [...pool];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    setBank(b);
    setIdx(0); setScores([0, 0]); reset();
  };
  useEffect(() => { shuffle('综合'); }, []);

  const switchSubject = (s) => { setSubject(s); shuffle(s); };

  const reset = () => { setBuzzed(null); setAnswered(null); setShowResult(false); };

  const q = bank[idx];
  const buzz = (team) => { if (buzzed === null) setBuzzed(team); };
  const answer = (optI) => {
    if (buzzed === null || showResult) return;
    setShowResult(true);
    if (optI === q.a) {
      setScores(s => { const n = [...s]; n[buzzed]++; return n; });
    } else {
      setScores(s => { const n = [...s]; n[buzzed === 0 ? 1 : 0]++; return n; });
    }
    setAnswered(optI);
  };

  const next = () => {
    if (idx + 1 >= bank.length) { shuffle(); return; }
    setIdx(i => i + 1); reset();
  };

  return (
    <div className="h-full">
      {/* 学科选择 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-white/50">学科：</span>
        {SUBJECTS.map(s => (
          <button key={s} onClick={() => switchSubject(s)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${subject === s ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50 hover:bg-white/15'}`}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/30">共 {bank.length} 题</span>
      </div>

      {/* 比分板 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`flex-1 rounded-2xl p-3 text-center transition ${buzzed === 0 ? 'bg-[#0a84ff]/30 ring-2 ring-[#0a84ff]' : 'bg-white/5'}`}>
          <div className="text-[10px] text-white/50">蓝队</div>
          <div className="text-3xl font-bold tabular-nums">{scores[0]}</div>
          <button onClick={() => buzz(0)} disabled={buzzed !== null}
            className="mt-1 rounded-full bg-[#0a84ff] px-4 py-1 text-xs font-semibold disabled:opacity-40">
            蓝队抢答
          </button>
        </div>
        <div className="text-xl font-bold text-white/30">VS</div>
        <div className={`flex-1 rounded-2xl p-3 text-center transition ${buzzed === 1 ? 'bg-[#ff9f0a]/30 ring-2 ring-[#ff9f0a]' : 'bg-white/5'}`}>
          <div className="text-[10px] text-white/50">橙队</div>
          <div className="text-3xl font-bold tabular-nums">{scores[1]}</div>
          <button onClick={() => buzz(1)} disabled={buzzed !== null}
            className="mt-1 rounded-full bg-[#ff9f0a] px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">
            橙队抢答
          </button>
        </div>
      </div>

      {/* 题目 */}
      {q && (
        <div className="rounded-2xl bg-white/[0.06] p-4">
          <div className="mb-1 flex items-center justify-between text-[10px] text-white/40">
            <span>第 {idx + 1} / {bank.length} 题</span>
            {q.subject && q.subject !== '综合' && <span className="rounded bg-white/10 px-1.5 py-0.5">{q.subject}</span>}
          </div>
          <div className="mb-3 text-lg font-bold sm:text-xl">{q.q}</div>
          <div className="grid grid-cols-2 gap-2">
            {q.opts.map((opt, i) => {
              let bg = 'bg-white/5 hover:bg-white/10';
              if (showResult) {
                if (i === q.a) bg = 'bg-[#30d158]/30 text-[#30d158]';
                else if (i === answered) bg = 'bg-[#ff453a]/30 text-[#ff453a]';
              }
              return (
                <button key={i} onClick={() => answer(i)} disabled={buzzed === null || showResult}
                  className={`rounded-xl p-3 text-left text-sm font-medium transition ${bg} disabled:cursor-not-allowed`}>
                  <span className="mr-1.5 opacity-60">{String.fromCharCode(65 + i)}.</span>{opt}
                </button>
              );
            })}
          </div>
          {showResult && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-white/60">
                {answered === q.a ? '答对了！' : `答错了，正确答案是 ${String.fromCharCode(65 + q.a)}`}
              </span>
              <button onClick={next} className="flex items-center gap-1 rounded-full bg-[#0a84ff] px-4 py-1.5 text-xs font-semibold">
                下一题 <ChevronRight size={14} />
              </button>
            </div>
          )}
          {buzzed === null && <p className="mt-2 text-center text-[10px] text-white/40">先点击上方「抢答」按钮，再选择答案</p>}
        </div>
      )}
    </div>
  );
}

/* ==================== 抽卡问答 ==================== */
const CARD_DECK = [
  { cat: '语文', text: '背诵一首你最喜欢的古诗', color: '#0a84ff' },
  { cat: '语文', text: '用「因为…所以…」造一个句子', color: '#0a84ff' },
  { cat: '数学', text: '快速说出 7 × 8 的结果', color: '#30d158' },
  { cat: '数学', text: '一个正方形边长 5cm，周长是多少？', color: '#30d158' },
  { cat: '英语', text: '说出 3 个表示颜色的英文单词', color: '#ff9f0a' },
  { cat: '英语', text: '用英语介绍你自己（不少于 3 句）', color: '#ff9f0a' },
  { cat: '常识', text: '中国有多少个省级行政区？', color: '#bf5af2' },
  { cat: '常识', text: '说出 3 种哺乳动物', color: '#bf5af2' },
  { cat: '脑筋急转弯', text: '什么东西越洗越脏？', color: '#ff375f' },
  { cat: '脑筋急转弯', text: '什么门永远关不上？', color: '#ff375f' },
  { cat: '任务', text: '给大家讲一个笑话', color: '#64d2ff' },
  { cat: '任务', text: '模仿一种动物的叫声', color: '#64d2ff' },
  { cat: '语文', text: '说出 5 个 AABB 式的成语', color: '#0a84ff' },
  { cat: '数学', text: '1 小时等于多少分钟？', color: '#30d158' },
  { cat: '英语', text: '说出今天星期几的英文', color: '#ff9f0a' },
  { cat: '常识', text: '一年有几个季节？分别是？', color: '#bf5af2' },
];

function CardGame() {
  const [drawn, setDrawn] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [filter, setFilter] = useState('全部');

  const categories = ['全部', ...Array.from(new Set(CARD_DECK.map(c => c.cat)))];
  const pool = filter === '全部' ? CARD_DECK : CARD_DECK.filter(c => c.cat === filter);

  const draw = () => {
    setFlipping(true);
    setTimeout(() => {
      setDrawn(pool[Math.floor(Math.random() * pool.length)]);
      setFlipping(false);
    }, 500);
  };

  const changeFilter = (f) => { setFilter(f); setDrawn(null); };

  return (
    <div className="flex h-full flex-col py-2">
      {/* 学科/分类选择 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-white/50">分类：</span>
        {categories.map(c => (
          <button key={c} onClick={() => changeFilter(c)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${filter === c ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50 hover:bg-white/15'}`}>
            {c}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/30">共 {pool.length} 张</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="mb-3 text-xs text-white/50">点击卡片抽取一道题目或任务</p>
        <div style={{ perspective: '1000px' }}>
          <div className={`relative h-48 w-40 transition-transform duration-500 ${flipping ? 'animate-spin' : ''}`}
            style={{ transformStyle: 'preserve-3d' }}>
            {drawn ? (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl p-4 text-center shadow-2xl"
                style={{ background: drawn.color }}>
                <div className="mb-2 rounded-full bg-black/20 px-2.5 py-0.5 text-[10px] font-semibold">{drawn.cat}</div>
                <div className="text-base font-bold leading-relaxed">{drawn.text}</div>
              </div>
            ) : (
              <button onClick={draw}
                className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#bf5af2] shadow-2xl transition hover:scale-105">
                <CreditCard size={36} className="mb-2" />
                <div className="text-sm font-bold">点击抽卡</div>
                <div className="mt-0.5 text-[10px] opacity-70">共 {pool.length} 张</div>
              </button>
            )}
          </div>
        </div>
        {drawn && !flipping && (
          <button onClick={draw} className="mt-4 flex items-center gap-1.5 rounded-full bg-white/10 px-5 py-2 text-xs font-medium hover:bg-white/15">
            <RotateCcw size={13} /> 再抽一张
          </button>
        )}
      </div>
    </div>
  );
}

/* ==================== 单词闪卡 ==================== */
const FLASH_DECK = [
  { en: 'apple', zh: '苹果' }, { en: 'banana', zh: '香蕉' }, { en: 'orange', zh: '橙子' },
  { en: 'grape', zh: '葡萄' }, { en: 'school', zh: '学校' }, { en: 'teacher', zh: '老师' },
  { en: 'student', zh: '学生' }, { en: 'book', zh: '书' }, { en: 'pen', zh: '钢笔' },
  { en: 'water', zh: '水' }, { en: 'sun', zh: '太阳' }, { en: 'moon', zh: '月亮' },
];

function FlashGame() {
  const [idx, setIdx] = useState(0);
  const [showZh, setShowZh] = useState(false);
  const [known, setKnown] = useState(0);
  const card = FLASH_DECK[idx];

  const next = (learned) => {
    if (learned) setKnown(k => k + 1);
    setShowZh(false);
    setIdx(i => (i + 1) % FLASH_DECK.length);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center py-2">
      <div className="mb-3 flex items-center gap-3 text-xs text-white/50">
        <span>第 {idx + 1} / {FLASH_DECK.length} 张</span>
        <span className="text-[#30d158]">已掌握 {known}</span>
      </div>

      <div style={{ perspective: '1000px' }}>
        <div className="relative h-44 w-64 cursor-pointer transition-transform duration-500"
          style={{ transformStyle: 'preserve-3d', transform: showZh ? 'rotateY(180deg)' : '' }}
          onClick={() => setShowZh(s => !s)}>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#0a84ff] shadow-2xl"
            style={{ backfaceVisibility: 'hidden' }}>
            <div className="text-[10px] uppercase tracking-widest opacity-60">English</div>
            <div className="mt-1.5 text-3xl font-bold">{card.en}</div>
            <div className="mt-3 text-[10px] opacity-50">点击翻面看释义</div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#30d158] shadow-2xl"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <div className="text-[10px] uppercase tracking-widest opacity-60">中文</div>
            <div className="mt-1.5 text-3xl font-bold">{card.zh}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <button onClick={() => next(false)}
          className="flex items-center gap-1 rounded-full bg-white/10 px-5 py-2 text-xs font-medium text-white/70 hover:bg-white/15">
          不认识 <ChevronRight size={13} />
        </button>
        <button onClick={() => next(true)}
          className="flex items-center gap-1 rounded-full bg-[#30d158] px-5 py-2 text-xs font-semibold text-white hover:bg-[#34d961]">
          认识 <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

/* ==================== 口算速答 ==================== */
function MathGame() {
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [problem, setProblem] = useState(null);
  const [ans, setAns] = useState('');
  const [feedback, setFeedback] = useState('');
  const [maxNum, setMaxNum] = useState(20);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const gen = () => {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, result;
    if (op === '+') { a = rand(1, maxNum); b = rand(1, maxNum); result = a + b; }
    else if (op === '-') { a = rand(1, maxNum); b = rand(1, a); result = a - b; }
    else { a = rand(2, 9); b = rand(2, 9); result = a * b; }
    setProblem({ a, b, op, result });
    setAns('');
    setFeedback('');
  };
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const start = () => {
    setScore(0); setLeft(60); setRunning(true);
    gen();
    setTimeout(() => inputRef.current?.focus(), 100);
    timerRef.current = setInterval(() => {
      setLeft(s => {
        if (s <= 1) { setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const submit = (e) => {
    e.preventDefault();
    if (!running || !problem) return;
    if (Number(ans) === problem.result) {
      setScore(s => s + 1);
      setFeedback('✓');
      setTimeout(gen, 200);
    } else {
      setFeedback('✗');
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center py-2">
      {!running && score === 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-white/50">难度：</span>
          {[10, 20, 50].map(n => (
            <button key={n} onClick={() => setMaxNum(n)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${maxNum === n ? 'bg-[#0a84ff] text-white' : 'bg-white/10 text-white/50'}`}>
              {n} 以内
            </button>
          ))}
        </div>
      )}

      {running ? (
        <>
          <div className="mb-4 flex items-center gap-5 text-base">
            <span className="flex items-center gap-1.5"><Clock3 size={15} className="text-[#ffd60a]" /> <b className="tabular-nums">{left}s</b></span>
            <span className="flex items-center gap-1.5"><Trophy size={15} className="text-[#30d158]" /> <b>{score}</b> 分</span>
          </div>
          {problem && (
            <form onSubmit={submit} className="flex items-center gap-2 text-3xl font-bold tabular-nums">
              <span>{problem.a}</span>
              <span className="text-white/60">{problem.op}</span>
              <span>{problem.b}</span>
              <span className="text-white/60">=</span>
              <input ref={inputRef} value={ans} onChange={e => setAns(e.target.value)}
                className="w-20 rounded-lg bg-white/10 px-2 py-1 text-center outline-none focus:ring-2 focus:ring-[#0a84ff]" />
              <span className={`w-6 text-center text-2xl ${feedback === '✓' ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>{feedback}</span>
            </form>
          )}
          <p className="mt-3 text-[10px] text-white/40">输入答案后按回车提交</p>
        </>
      ) : (
        <div className="text-center">
          {score > 0 && (
            <div className="mb-3">
              <Trophy size={32} className="mx-auto text-[#ffd60a]" />
              <div className="mt-1 text-2xl font-bold">{score} 分</div>
              <div className="text-xs text-white/50">60 秒内答对 {score} 题</div>
            </div>
          )}
          <button onClick={start}
            className="flex items-center gap-2 rounded-full bg-[#0a84ff] px-6 py-2.5 text-base font-semibold shadow-lg shadow-blue-500/30 hover:bg-[#2f94ff]">
            <Play size={16} /> {score > 0 ? '再来一局' : '开始挑战'}
          </button>
        </div>
      )}
    </div>
  );
}
