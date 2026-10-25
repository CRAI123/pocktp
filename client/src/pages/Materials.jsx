import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, FileText, Presentation, PenSquare, Video, Folder, Download, UploadCloud, FileUp, Search } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, statusTone } from '../components/ui.jsx';

const TYPE_ICON = { 课件: Presentation, 教案: FileText, 习题: PenSquare, 视频: Video, 其他: Folder };
const MAX_MB = 50;
const ACCEPT = '.ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.7z,.mp4,.mov,.mp3,.png,.jpg,.jpeg,.gif,.txt,.csv,.md,.key,.pages';

/** 按扩展名猜资料类型（可手改） */
const guessType = (name) => {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (['ppt', 'pptx', 'key'].includes(ext)) return '课件';
  if (['mp4', 'mov', 'mp3'].includes(ext)) return '视频';
  if (['doc', 'docx', 'pdf', 'md', 'txt', 'pages'].includes(ext)) return '教案';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '习题';
  return '其他';
};

const fmtSize = (n) => {
  n = Number(n) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return n ? `${n} B` : '';
};

/** XHR PUT 直传签名地址（fetch 无上传进度回调） */
function putFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`云端上传失败（${xhr.status}）`)));
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.send(file);
  });
}

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ course_id: '', title: '', type: '课件', summary: '' });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(-1); // -1=未开始 0-100=上传中
  const [err, setErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get(`/materials${filter ? `?course_id=${filter}` : ''}`).then(setMaterials).catch(console.error);
  useEffect(() => { api.get('/courses').then(setCourses).catch(console.error); }, []);
  useEffect(() => { load(); }, [filter]);

  const openCreate = () => {
    setForm({ course_id: filter || '', title: '', type: '课件', summary: '' });
    setFile(null);
    setProgress(-1);
    setErr('');
    if (fileRef.current) fileRef.current.value = '';
    setOpen(true);
  };

  const pickFile = (f) => {
    if (!f) return;
    if (f.size > MAX_MB * 1048576) { setErr(`文件不能超过 ${MAX_MB} MB`); return; }
    setErr('');
    setFile(f);
    /* 自动带入：标题用去掉扩展名的文件名，类型按扩展名猜测 */
    setForm(fm => ({
      ...fm,
      title: fm.title || f.name.replace(/\.[A-Za-z0-9]{1,8}$/, ''),
      type: guessType(f.name),
    }));
  };

  /** 上传流程：申请签名地址 → 浏览器直传云端 → 落库元数据 */
  const submit = async (e) => {
    e.preventDefault();
    if (progress >= 0) return; // 防重复提交
    if (!file) { setErr('请选择要上传的文件'); return; }
    setErr('');
    try {
      setProgress(0);
      const { uploadUrl, path } = await api.post('/materials/upload-url', { name: file.name, size: file.size, mime: file.type });
      await putFile(uploadUrl, file, setProgress);
      await api.post('/materials', {
        ...form,
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime: file.type || '',
      });
      setOpen(false);
      load();
      api.get('/courses').then(setCourses);
    } catch (e2) {
      setErr(e2.message || '上传失败，请重试');
    } finally {
      setProgress(-1);
    }
  };

  const download = async (m) => {
    try {
      const { url } = await api.get(`/materials/${m.id}/download`);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      alert(e.message || '获取下载地址失败');
    }
  };

  return (
    <div>
      <SectionHeader
        title="备课资料库"
        desc="课件、教案、习题与教学视频云端保存，任意设备登录即可下载使用"
        action={(
          <div className="flex items-center gap-2">
            <Link to="/ai-tools?tab=material" className="btn-pill flex items-center gap-2 bg-[#0071e3]/10 px-4 py-2 text-sm font-medium text-[#0071e3] transition hover:bg-[#0071e3]/15">
              <Search size={16} />AI 检索
            </Link>
            <Button onClick={openCreate}><Plus size={16} />上传资料</Button>
          </div>
        )}
      />

      {/* 课程筛选 */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setFilter('')} className={chipCls(!filter)}>全部课程</button>
        {courses.map(c => (
          <button key={c.id} onClick={() => setFilter(String(c.id))} className={chipCls(filter === String(c.id))}>{c.name}</button>
        ))}
      </div>

      {materials.length === 0 ? (
        <Empty
          icon={UploadCloud}
          text="该课程下暂无资料"
          desc={`上传课件文件（PPT/PDF/Word/视频等，单个不超过 ${MAX_MB}MB），云端保存随取随用`}
          action={<Button onClick={openCreate}><Plus size={16} />上传资料</Button>}
        />
      ) : (
        <div className="card divide-y divide-black/5">
          {materials.map(m => {
            const Icon = TYPE_ICON[m.type] || Folder;
            return (
              <div key={m.id} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-bg-light/60">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{m.title}</span>
                    <Badge tone={statusTone[m.type]}>{m.type}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-ink-secondary">
                    {m.course_name}{m.file_name ? ` · ${m.file_name}` : ''}{m.file_size ? ` · ${m.file_size}` : ''}{m.summary ? ` · ${m.summary}` : ''}
                  </div>
                </div>
                <span className="hidden shrink-0 text-xs text-ink-secondary sm:block">{(m.created_at || '').slice(0, 10)}</span>
                {!!m.storage_path && (
                  <button
                    onClick={() => download(m)}
                    title="下载文件"
                    className="btn-pill shrink-0 p-2 text-[#0071e3] opacity-60 transition hover:bg-[#0071e3]/10 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Download size={16} />
                  </button>
                )}
                <button
                  onClick={async () => { if (confirm('确认删除该资料？云端文件将一并删除。')) { await api.del(`/materials/${m.id}`); load(); } }}
                  title="删除资料"
                  className="btn-pill shrink-0 p-2 text-ink-secondary/50 opacity-60 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => progress < 0 && setOpen(false)} title="上传备课资料">
        <form onSubmit={submit} className="space-y-4">
          {/* 文件选择/拖拽区：原生 label 触发文件框（兼容性最好），支持拖入文件 */}
          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer?.files?.[0]); }}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 text-left transition ${
              dragOver
                ? 'border-[#0071e3] bg-[#0071e3]/[0.06]'
                : file
                  ? 'border-[#28cd41]/40 bg-[#28cd41]/[0.05]'
                  : 'border-black/15 hover:border-[#0071e3]/40 hover:bg-[#0071e3]/[0.03]'
            }`}
          >
            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" onChange={e => pickFile(e.target.files?.[0])} />
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${file ? 'bg-[#28cd41]' : 'brand-gradient'}`}>
              <FileUp size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{file ? file.name : dragOver ? '松开鼠标，放入文件' : '点击选择文件，或直接拖进来'}</div>
              <div className="text-xs text-ink-secondary">
                {file ? `${fmtSize(file.size)} · ${file.type || '未知类型'}` : `PPT / PDF / Word / 视频等，单个不超过 ${MAX_MB}MB`}
              </div>
            </div>
            {file && <Badge tone="green">已选择</Badge>}
          </label>

          {/* 上传进度条 */}
          {progress >= 0 && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="brand-gradient h-full rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-ink-secondary">{progress < 100 ? `正在上传云端… ${progress}%` : '保存资料信息…'}</div>
            </div>
          )}

          <Field label="所属课程">
            <select required className={inputCls} value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
              <option value="">请选择课程</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="资料标题">
            <input required className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：第3讲 基本体组合建模" />
          </Field>
          <Field label="类型">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(TYPE_ICON).map(t => (
                <button type="button" key={t} onClick={() => setForm({ ...form, type: t })}
                  className={`btn-pill px-3.5 py-1.5 text-xs font-medium transition ${
                    form.type === t ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                  }`}>{t}</button>
              ))}
            </div>
          </Field>
          <Field label="内容摘要（选填）">
            <textarea className={`${inputCls} h-20 resize-none`} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="简要说明资料内容与适用课时" />
          </Field>

          {err && <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{err}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={progress >= 0}>取消</Button>
            <Button type="submit" disabled={progress >= 0 || !file}>
              {progress >= 0 ? `上传中 ${progress}%` : '上传到云端'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function chipCls(active) {
  return `btn-pill px-4 py-1.5 text-sm font-medium ${
    active ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-white text-ink-secondary shadow-sm hover:text-ink'
  }`;
}
