/** 英语 · 阅读理解专项 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '阅读理解专项',
  subtitle: '读短文做选择（主旨 / 细节 / 推断 / 词义）',
};
const DEFAULTS = { grade: '5', difficulty: 'medium', count: 5, keyword: '校园生活 / 友谊故事' };

const LETTERS = ['A', 'B', 'C', 'D'];

export default function EnglishReading() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('reading', cfg);

  return (
    <Practice
      {...meta}
      type="reading"
      mode="english"
      subject="english"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderGroupHeader={(q) => (
        <div className="mb-4 rounded-2xl border border-[#0071e3]/20 bg-[#0071e3]/[0.04] p-4 text-sm leading-loose sm:text-base">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#0071e3]">
            <span>📖 阅读短文</span>
          </div>
          {q.passage}
        </div>
      )}
      renderPrompt={(q) => (
        <div className="text-base leading-relaxed sm:text-lg">{q.stem}</div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <div className="grid gap-2 sm:grid-cols-2">
          {(q.choices || []).map((c, i) => {
            const letter = LETTERS[i];
            const picked = (val || '').toUpperCase() === letter;
            return (
              <label key={i}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3 text-sm transition active:scale-[0.98] ${
                  picked
                    ? 'border-[#0071e3] bg-[#0071e3]/[0.06]'
                    : 'border-black/10 bg-bg-light hover:border-black/20'
                } ${submitted ? 'pointer-events-none opacity-70' : ''}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${picked ? 'bg-[#0071e3] text-white' : 'bg-black/5 text-ink-secondary'}`}>
                  {letter}
                </span>
                <span className="flex-1">{c}</span>
                <input type="radio" name={q.id} value={letter} checked={picked} onChange={() => set(letter)} disabled={submitted} className="sr-only" />
              </label>
            );
          })}
        </div>
      )}
      renderAnswerKey={(q) => (
        <div className="space-y-1 text-sm">
          <div><b>答案：</b><span className="font-mono font-semibold text-[#28cd41]">{q.answer}</span></div>
          {q.explanation && <div className="text-ink-secondary">{q.explanation}</div>}
        </div>
      )}
    />
  );
}
