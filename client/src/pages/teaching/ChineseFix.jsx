/** 语文 · 病句修改 */
import { useState } from 'react';
import Practice from '../../components/Practice.jsx';
import { inputCls } from '../../components/ui.jsx';
import { useAutoQuestions } from '../../hooks/useAutoQuestions.js';

const meta = {
  title: '病句修改专项',
  subtitle: '找出语病并订正（主语残缺 / 前后矛盾 / 搭配不当 / 成分赘余）',
};
const DEFAULTS = { grade: '4', difficulty: 'medium', count: 10, keyword: '小学常见病句类型' };

export default function ChineseFix() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const { questions, loading, error, reload } = useAutoQuestions('fix', cfg);
  return (
    <Practice
      {...meta}
      type="fix"
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
          <div className="text-sm text-ink-secondary">原句（找出语病）：</div>
          <div className="mt-3 text-base leading-loose sm:text-lg">{q.sentence}</div>
        </div>
      )}
      renderAnswerInput={(q, val, set, submitted) => (
        <textarea
          autoFocus
          rows={3}
          placeholder="请在原句基础上修改..."
          className={`${inputCls} text-base leading-relaxed`}
          value={val}
          onChange={e => set(e.target.value)}
          disabled={submitted}
        />
      )}
      renderAnswerKey={(q) => <div className="text-base leading-relaxed">参考答案：{q.answer}</div>}
    />
  );
}
