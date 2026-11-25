/** 数学 · 口算速算专项 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '口算速算专项',
  subtitle: '限时快速求值：加减乘除、乘方等，看算式直接写出结果',
};
const DEFAULTS = { grade: '3', difficulty: 'easy', count: 20, keyword: '表内乘除法与加减法' };

export default function MathMental() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('mentalMath', cfg);
  return (
    <Practice
      {...meta}
      type="mentalMath"
      mode="math"
      subject="math"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => (
        <div className="text-3xl font-semibold tracking-tight sm:text-4xl">{q.stem}</div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <input
          autoFocus
          className={`${inputCls} max-w-xs text-2xl`}
          placeholder="写出结果"
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => (
        <div className="space-y-1 text-base">
          <div><b>答案：</b><span className="text-[#28cd41]">{q.answer}</span></div>
          {q.explanation && <div className="text-sm text-ink-secondary">{q.explanation}</div>}
        </div>
      )}
    />
  );
}
