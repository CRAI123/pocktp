/** 英语 · 句子填空专项 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '句子填空专项',
  subtitle: '根据时态/句型/语法补全句子（一般现在时/进行时/完成时/情态动词）',
};
const DEFAULTS = { grade: '4', difficulty: 'medium', count: 10, keyword: '小学英语核心句型' };

export default function EnglishSentence() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('sentence', cfg);
  return (
    <Practice
      {...meta}
      type="sentence"
      mode="english"
      subject="english"
      questions={questions}
      loading={loading}
      error={error}
      onReload={reload}
      configDefaults={cfg}
      onConfigApply={setCfg}
      renderPrompt={(q) => (
        <div>
          <div className="text-sm text-ink-secondary">请补全句子：</div>
          <div className="mt-3 font-mono text-2xl leading-relaxed">{q.sentence}</div>
          {q.hint && <div className="mt-2 text-xs text-ink-secondary">提示：{q.hint}</div>}
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <input
          autoFocus
          placeholder="如：go / is singing / have finished"
          className={`${inputCls} font-mono text-lg`}
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => <div className="text-base font-mono font-medium">参考答案：{q.answer}</div>}
    />
  );
}
