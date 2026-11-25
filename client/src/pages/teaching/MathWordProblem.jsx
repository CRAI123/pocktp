/** 数学 · 应用题精练专项 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '应用题精练',
  subtitle: '结合生活情境的数量关系题，写出解题过程与结果',
};
const DEFAULTS = { grade: '7', difficulty: 'medium', count: 8, keyword: '一元一次方程的应用' };

export default function MathWordProblem() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('wordProblem', cfg);
  return (
    <Practice
      {...meta}
      type="wordProblem"
      mode="math"
      subject="math"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => (
        <div>
          {q.passage && <div className="mb-2 text-sm leading-relaxed text-ink-secondary">{q.passage}</div>}
          <div className="whitespace-pre-wrap">{q.stem}</div>
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <textarea
          autoFocus
          rows={4}
          className={inputCls}
          placeholder="写出解题过程与答案"
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => (
        <div className="space-y-1 whitespace-pre-wrap text-base leading-relaxed">
          <div><b>参考答案：</b><span className="text-[#28cd41]">{q.answer}</span></div>
          {q.explanation && <div className="text-sm text-ink-secondary">{q.explanation}</div>}
        </div>
      )}
    />
  );
}
