/** 数学 · 几何图形专项（需要配图时由 AI 自动生成示意图） */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '几何图形专项',
  subtitle: '角度、周长面积体积、图形性质与证明；需要图形时自动配示意图',
};
const DEFAULTS = { grade: '8', difficulty: 'medium', count: 8, keyword: '三角形与四边形' };

export default function MathGeometry() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('geometry', cfg);
  return (
    <Practice
      {...meta}
      type="geometry"
      mode="math"
      subject="math"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => (
        <div className="whitespace-pre-wrap">{q.stem}</div>
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
