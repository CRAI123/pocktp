/** 语文 · 古诗默写专项 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '古诗默写专项',
  subtitle: '给出古诗上句写下句 / 给出题目默写关键句（课标必背篇目）',
};
const DEFAULTS = { grade: '5', difficulty: 'medium', count: 10, keyword: '小学课标必背古诗' };

export default function ChinesePoem() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('poem', cfg);
  return (
    <Practice
      {...meta}
      type="poem"
      mode="chinese"
      subject="chinese"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => (
        <div>
          <div className="text-sm text-ink-secondary">{q.hint || '请根据上句写下句：'}</div>
          <div className="mt-3 text-2xl font-semibold leading-loose text-[#0071e3] sm:text-3xl">{q.sentence}</div>
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <textarea
          autoFocus
          rows={2}
          placeholder="如：低头思故乡"
          className={`${inputCls} text-lg leading-loose`}
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => (
        <div className="space-y-1 text-base leading-loose">
          <div><b>参考答案：</b><span className="text-[#28cd41]">{q.answer}</span></div>
          {q.explanation && <div className="text-sm text-ink-secondary">{q.explanation}</div>}
        </div>
      )}
    />
  );
}
