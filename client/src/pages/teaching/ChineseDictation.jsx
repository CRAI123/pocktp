/** 语文 · 生字默写练习 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const meta = {
  title: '生字默写练习',
  subtitle: '看清词语，默写出对应的汉字（拼音题 / 易错字）',
};

const DEFAULTS = { grade: '3', difficulty: 'medium', count: 10, keyword: '小学常见易错字' };

export default function ChineseDictation() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('dictation', cfg);

  return (
    <Practice
      {...meta}
      type="dictation"
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
          <div className="text-sm text-ink-secondary">请根据下面词语默写汉字：</div>
          <div className="mt-3 text-3xl font-semibold tracking-widest text-[#0071e3] sm:text-4xl">
            {q.pinyin || q.word}
          </div>
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <input
          autoFocus
          placeholder="请在此处默写汉字，如：陈思远"
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
