import { useEffect, useState } from 'react';
import { Wand2, Copy, Check, Plus, MessageSquare } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const TEMPLATES = [
  { type: 'activity', label: '活动通知', desc: '班级活动 / 研学 / 比赛', fields: [['name', '活动名称'], ['date', '活动日期'], ['detail', '补充说明']] },
  { type: 'attendance', label: '考勤提醒', desc: '学生考勤异常私信家长', fields: [['student_name', '学生姓名'], ['status', '考勤状态'], ['date', '日期']] },
  { type: 'homework', label: '作业提醒', desc: '作业布置与截止催交', fields: [['course', '课程名称'], ['title', '作业标题'], ['deadline', '截止时间']] },
  { type: 'score', label: '成绩反馈', desc: '测验成绩私信反馈', fields: [['exam', '考试名称'], ['score', '学生得分'], ['average', '班级均分']] },
];

export default function Notifications() {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(TEMPLATES[0]);
  const [classId, setClassId] = useState('');
  const [params, setParams] = useState({});
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => api.get('/notifications').then(setList).catch(console.error);
  useEffect(() => {
    load();
    api.get('/classes').then(cs => { setClasses(cs); if (cs.length) setClassId(String(cs[0].id)); }).catch(console.error);
  }, []);

  const generate = async () => {
    const result = await api.post('/notifications/generate', { type: tpl.type, class_id: classId || null, params });
    setGenerated(result);
    setCopied(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`【${generated.title}】\n${generated.content}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    await api.post('/notifications', { ...generated, target_class_id: classId || null, channel: tpl.type === 'attendance' || tpl.type === 'score' ? '微信私聊' : '微信群' });
    setGenerated(null);
    setParams({});
    setOpen(false);
    load();
  };

  return (
    <div>
      <SectionHeader
        title="微信消息通知"
        desc="选择场景模板，一键生成通知文案并复制发送"
        action={<Button onClick={() => setOpen(true)}><Plus size={16} />生成通知</Button>}
      />

      {list.length === 0 ? <Empty text="还没有生成过通知" /> : (
        <div className="space-y-3">
          {list.map(n => (
            <div key={n.id} className="card card-hover p-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#28cd41]/12 text-[#1fa733]">
                  <MessageSquare size={17} />
                </div>
                <h3 className="font-semibold">{n.title}</h3>
                <Badge tone="green">{n.channel}</Badge>
                {n.class_name && <Badge tone="blue">{n.class_name}</Badge>}
                <span className="ml-auto text-xs text-ink-secondary">{(n.created_at || '').slice(0, 16)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-bg-light p-4 text-sm leading-relaxed text-ink-secondary">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* 生成器 */}
      <Modal open={open} onClose={() => { setOpen(false); setGenerated(null); }} title="生成微信通知" width="max-w-2xl">
        <div className="space-y-4">
          {/* 模板选择 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => { setTpl(t); setGenerated(null); setParams({}); }}
                className={`rounded-2xl border p-3.5 text-left transition ${tpl.type === t.type ? 'border-transparent brand-gradient text-white shadow-md shadow-blue-500/25' : 'border-black/10 hover:border-[#0071e3]/40'}`}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className={`mt-0.5 text-xs ${tpl.type === t.type ? 'text-white/80' : 'text-ink-secondary'}`}>{t.desc}</div>
              </button>
            ))}
          </div>

          <Field label="目标班级">
            <select className={inputCls} value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          {/* 动态参数 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tpl.fields.map(([key, label]) => (
              <Field key={key} label={label}>
                <input className={inputCls} value={params[key] || ''} onChange={e => setParams({ ...params, [key]: e.target.value })} />
              </Field>
            ))}
          </div>

          <Button onClick={generate} className="w-full justify-center"><Wand2 size={16} />生成文案</Button>

          {generated && (
            <div className="rounded-2xl border border-[#28cd41]/30 bg-[#28cd41]/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">【{generated.title}】</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制'}</Button>
                  <Button onClick={save}>保存记录</Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{generated.content}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
