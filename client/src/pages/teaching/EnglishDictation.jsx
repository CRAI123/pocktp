/** 英语 · 单词听写（看中文写英文） */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '单词听写专项',
  subtitle: '看中文释义写出对应英文单词（课本核心词汇）',
};
const DEFAULTS = { grade: '4', difficulty: 'medium', count: 10, keyword: '小学英语课本核心词汇' };

export default function EnglishDictation() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('dictationEn', cfg);
  return (
    <Practice
      {...meta}
      type="dictationEn"
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
          <div className="text-sm text-ink-secondary">请根据中文释义写出英文单词：</div>
          <div className="mt-3 text-2xl font-medium tracking-wide text-[#0071e3] sm:text-3xl">{q.chinese}</div>
          {q.hint && <div className="mt-2 text-xs text-ink-secondary">提示：{q.hint}</div>}
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <input
          autoFocus
          placeholder="如：apple"
          className={`${inputCls} font-mono text-lg lowercase`}
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => <div className="font-mono text-base font-medium">参考答案：{q.answer}</div>}
    />
  );
}
