/** 语文 · 看拼音写汉字 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '看拼音写汉字',
  subtitle: '根据拼音写出对应的汉字（翘舌音/前后鼻音/多音字重点突破）',
};
const DEFAULTS = { grade: '3', difficulty: 'medium', count: 10, keyword: '小学常见易错拼音' };

export default function ChinesePinyin() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('pinyin', cfg);
  return (
    <Practice
      {...meta}
      type="pinyin"
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
          <div className="text-sm text-ink-secondary">请根据拼音写出对应汉字：</div>
          <div className="mt-3 text-3xl font-semibold tracking-widest text-[#0071e3] sm:text-4xl">{q.pinyin}</div>
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <input
          autoFocus
          placeholder="如：翅膀 / 传 烧"
          className={`${inputCls} text-lg tracking-widest`}
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => <div className="text-base font-medium">参考答案：{q.answer}</div>}
    />
  );
}
