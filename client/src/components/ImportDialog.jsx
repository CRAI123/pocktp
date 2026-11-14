import { useState } from 'react';
import { Upload, FileText, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { Modal, Button, Field, inputCls } from './ui.jsx';
import { readDocxText, textToLines } from '../lib/docx.js';

/**
 * 批量导入弹窗：上传 Word(.docx) 或直接粘贴文本
 *  - mod：后端 /cp/bulk 的模块标识
 *  - parse(lines)：把文本行解析成待插入的行对象数组，由各页面提供
 */
export default function ImportDialog({ open, onClose, title, example, mod, parse, onDone }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [docText, setDocText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setText(''); setDocText(''); setFileName(''); setResult(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const pickFile = async (file) => {
    if (!file) return;
    setResult(null);
    try {
      const t = await readDocxText(file);
      setDocText(t);
      setFileName(file.name);
    } catch (e) {
      setResult({ ok: false, text: `读取失败：${e.message}` });
    }
  };

  const submit = async () => {
    const source = docText || text;
    if (!source.trim()) { setResult({ ok: false, text: '请先选择 Word 文件或粘贴文本' }); return; }
    let rows;
    try { rows = parse(textToLines(source)); }
    catch (e) { setResult({ ok: false, text: `解析失败：${e.message}` }); return; }
    if (!rows || !rows.length) { setResult({ ok: false, text: '没有解析出有效数据，请检查格式' }); return; }
    setBusy(true);
    try {
      const r = await api.post('/cp/bulk', { mod, rows });
      setResult({ ok: true, text: `成功导入 ${r.imported} 条（已追加，不会覆盖已有数据）` });
      setText(''); setDocText(''); setFileName('');
      onDone?.();
    } catch (e) {
      setResult({ ok: false, text: `导入失败：${e.message}` });
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title={title || '批量导入'} width="max-w-2xl">
      <div className="space-y-4">
        <pre className="whitespace-pre-wrap rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs leading-relaxed text-ink-secondary">{example}</pre>

        <Field label="① 上传 Word（.docx）">
          <div className="flex items-center gap-3">
            <label className="btn-pill inline-flex cursor-pointer items-center gap-2 border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-black/[0.14]">
              <Upload size={15} />选择文件
              <input type="file" accept=".docx" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
            </label>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary"><FileText size={13} />{fileName}</span>
            )}
          </div>
        </Field>

        <div className="text-center text-xs text-ink-secondary">— 或 —</div>

        <Field label="② 直接粘贴文本（每行一条）">
          <textarea className={`${inputCls} resize-y`} rows={7} value={text} onChange={e => setText(e.target.value)}
            placeholder="按上面的格式排好，每行一条" />
        </Field>

        {result && (
          <div className={`rounded-xl px-3 py-2 text-sm ${result.ok ? 'bg-[#28cd41]/10 text-[#1a7f2b]' : 'bg-[#ff3b30]/10 text-[#b3251c]'}`}>
            {result.text}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={close}>取消</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
            {busy ? '导入中…' : '开始导入'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
