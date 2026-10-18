import { useEffect, useMemo, useState } from 'react';
import { Wand2, Copy, Download, CheckSquare, Square, ClipboardCopy, RefreshCw } from 'lucide-react';
import { api, ai, auth } from '../api.js';
import { SectionHeader, Button, Badge, Empty } from '../components/ui.jsx';

/** AI 期末评语：按班级勾选学生 → 一次调用批量生成（全班仅 10 算力）→ 逐条编辑 → 复制/导出 */
export default function Comments() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [checked, setChecked] = useState({}); // { [studentId]: true }
  const [tags, setTags] = useState({});       // { [studentId]: '关键词' }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null); // [{name, text}]
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/classes').then(cs => {
      setClasses(cs);
      if (cs.length) setClassId(String(cs[0].id));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); return; }
    api.get(`/students?class_id=${classId}`).then(list => {
      setStudents(list);
      /* 默认全选 */
      const all = {}; list.forEach(s => { all[s.id] = true; });
      setChecked(all);
    }).catch(console.error);
  }, [classId]);

  const selected = useMemo(() => students.filter(s => checked[s.id]), [students, checked]);
  const allChecked = students.length > 0 && selected.length === students.length;

  const toggleAll = () => {
    if (allChecked) setChecked({});
    else { const all = {}; students.forEach(s => { all[s.id] = true; }); setChecked(all); }
  };

  const generate = async () => {
    if (!selected.length || loading) return;
    setLoading(true); setError(''); setCopied(false);
    try {
      const d = await ai.write('comment', {
        students: selected.map(s => ({ name: s.name, gender: s.gender, tags: tags[s.id] || '' })),
      });
      setResults(d.items);
      /* 同步顶栏算力余额 */
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setError(e.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const fullText = (results || []).map(it => `【${it.name}】\n${it.text}`).join('\n\n');

  const copyAll = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const exportTxt = () => {
    const cls = classes.find(c => String(c.id) === classId);
    const blob = new Blob(['﻿' + fullText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cls?.name || '班级'}-期末评语.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <SectionHeader title="AI 期末评语" desc="勾选学生，一次生成全班个性化评语，可逐条修改后复制或导出" />

      {/* 班级选择 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {classes.map(c => (
          <button key={c.id} onClick={() => { setClassId(String(c.id)); setResults(null); }}
            className={`btn-pill px-4 py-1.5 text-sm font-medium transition ${classId === String(c.id) ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'}`}>
            {c.name}
          </button>
        ))}
      </div>

      {/* 学生勾选 + 特点关键词 */}
      {students.length === 0 ? <Empty text="该班级暂无学生，请先在「班级成员」中添加" /> : (
        <div className="card mb-5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink">
              {allChecked ? <CheckSquare size={16} className="text-[#0071e3]" /> : <Square size={16} />}
              已选 {selected.length}/{students.length} 人
            </button>
            <span className="text-xs text-ink-secondary">可为每名学生填写特点关键词（选填），评语更贴切</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {students.map(s => (
              <div key={s.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${checked[s.id] ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.04]' : 'border-black/5'}`}>
                <button onClick={() => setChecked({ ...checked, [s.id]: !checked[s.id] })} className="shrink-0">
                  {checked[s.id] ? <CheckSquare size={17} className="text-[#0071e3]" /> : <Square size={17} className="text-ink-secondary/50" />}
                </button>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${s.gender === '女' ? 'bg-gradient-to-br from-[#ff9500] to-[#ffcc00]' : 'brand-gradient'}`}>
                  {s.name[0]}
                </div>
                <span className="w-14 shrink-0 truncate text-sm font-medium">{s.name}</span>
                <input
                  placeholder="如：活泼好动、数学好、爱阅读…"
                  className="min-w-0 flex-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-[#0071e3]"
                  value={tags[s.id] || ''}
                  onChange={e => setTags({ ...tags, [s.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={generate} disabled={!selected.length || loading}>
              {loading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {loading ? 'AI 撰写中…' : `一键生成 ${selected.length} 人评语`}
            </Button>
            <Badge tone="purple">全班一次生成 · 仅 10 算力</Badge>
            {error && <span className="text-sm text-[#ff3b30]">{error}</span>}
          </div>
        </div>
      )}

      {/* 生成结果：逐条可编辑 */}
      {results && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">生成结果（{results.length} 条，可直接修改）</h3>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={copyAll}>
                {copied ? <ClipboardCopy size={15} className="text-[#28cd41]" /> : <Copy size={15} />}
                {copied ? '已复制' : '复制全部'}
              </Button>
              <Button variant="secondary" onClick={exportTxt}><Download size={15} />导出 TXT</Button>
            </div>
          </div>
          <div className="space-y-3">
            {results.map((it, i) => (
              <div key={i} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="blue">{it.name}</Badge>
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(it.text); }}
                    className="btn-pill p-1.5 text-ink-secondary hover:bg-black/5" title="复制该条"
                  ><Copy size={14} /></button>
                </div>
                <textarea
                  className="w-full resize-y rounded-xl border border-black/5 bg-bg-light px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-[#0071e3] focus:bg-white"
                  rows={3}
                  value={it.text}
                  onChange={e => setResults(rs => rs.map((r, j) => j === i ? { ...r, text: e.target.value } : r))}
                />
                <div className="mt-1 text-right text-[10px] text-ink-secondary">{it.text.length} 字</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
