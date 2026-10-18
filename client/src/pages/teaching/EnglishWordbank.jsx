/** 英语 · 选词填空专项训练 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '选词填空专项',
  subtitle: '从词表中选出恰当的词填入短文对应空号（点击词表中的词，再点击空号填入）',
};
const DEFAULTS = { grade: '4', difficulty: 'medium', count: 8, keyword: '小学英语短文选词填空' };

function PassageWithBlanks({ q, picks, setPicks, submitted }) {
  const re = /____(\d+)____/g;
  const parts = [];
  const slots = [];
  let last = 0;
  let m;
  while ((m = re.exec(q.passage)) !== null) {
    parts.push(q.passage.slice(last, m.index));
    slots.push(parseInt(m[1], 10));
    last = m.index + m[0].length;
  }
  parts.push(q.passage.slice(last));

  const onBlankClick = (slotIndex) => {
    if (submitted) return;
    const current = picks[q.id]?.[slotIndex] || '';
    if (current) {
      setPicks(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [slotIndex]: '' } }));
    }
  };

  return (
    <div>
      <div className="text-sm text-ink-secondary">请用下方词表补全短文</div>
      <div className="mt-3 text-xl leading-loose">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <button
                onClick={() => onBlankClick(i)}
                className={`mx-1 inline-flex h-8 min-w-[4ch] items-center justify-center rounded-md border-2 px-2 align-middle text-sm font-medium transition active:scale-95 ${
                  picks[q.id]?.[i]
                    ? 'border-[#28cd41] bg-[#28cd41]/10 text-[#1f9e33]'
                    : 'border-dashed border-[#0071e3] text-ink-secondary'
                }`}
              >
                {picks[q.id]?.[i] || (i + 1)}
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function WordbankChoices({ q, picks, setPicks, submitted }) {
  const onWord = (w) => {
    if (submitted) return;
    const cur = picks[q.id] || {};
    const slotCount = (q.passage.match(/____\d+____/g) || []).length;
    let target = -1;
    for (let i = 0; i < slotCount; i++) {
      if (!cur[i]) { target = i; break; }
    }
    if (target < 0) return;
    setPicks(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [target]: w } }));
  };

  return (
    <div>
      <div className="text-sm text-ink-secondary">词表</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {q.choices.map((w) => (
          <button
            key={w}
            onClick={() => onWord(w)}
            className="btn-pill border border-black/10 bg-bg-light px-3 py-1.5 text-sm font-medium transition active:scale-95 hover:bg-white"
          >
            {w}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-ink-secondary">点击词表中的词自动填到第一个空位；点击已填的空位可清空。</div>
    </div>
  );
}

export default function EnglishWordbank() {
  const [picks, setPicks] = useState({});
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('wordbank', cfg);
  const state = { picks, setPicks };
  return (
    <Practice
      {...meta}
      mode="english"
      subject="english"
      type="wordbank"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => <PassageWithBlanks q={q} picks={picks} setPicks={setPicks} submitted={false} />}
      renderAnswerInput={(q) => <WordbankChoices q={q} picks={picks} setPicks={setPicks} submitted={false} />}
      renderAnswerKey={(q) => (
        <div className="text-sm leading-relaxed">
          <div className="mb-1 text-ink-secondary">参考答案：</div>
          {q.blanks.map((b, i) => (
            <div key={i}>
              <span className="text-ink-secondary">空 {b.index + 1}：</span>
              <span className="ml-1 font-mono font-semibold text-[#28cd41]">{b.answer}</span>
            </div>
          ))}
        </div>
      )}
      state={state}
    />
  );
}
