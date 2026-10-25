/** 班级数据备份：生成快照 / 恢复 / 删除（误删找回） */
import { useEffect, useState } from 'react';
import { DatabaseBackup, RotateCcw, Trash2, Plus, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Badge, Empty, SkeletonList } from '../../components/ui.jsx';

const COUNT_LABEL = { students: '学生', grades: '成绩', attendance: '考勤', moral: '德育', funds: '班费', wrong: '错题' };

export default function BackupsTab({ classId }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');

  const load = () => api.get(`/classes/${classId}/backups`).then(setList).catch(e => { setErr(e.message); setList([]); });
  useEffect(() => { setList(null); load(); }, [classId]);

  const create = async () => {
    setBusy(1); setErr('');
    try { await api.post(`/classes/${classId}/backups`, {}); await load(); }
    catch (e) { setErr(e.message || '备份失败'); } finally { setBusy(0); }
  };

  const restore = async (b) => {
    if (!confirm(`确认恢复到「${b.name}」？\n\n该班当前的学生资料会被补齐、成绩/考勤/德育/班费/错题会被备份内容覆盖，此操作不可撤销。`)) return;
    setBusy(b.id); setErr('');
    try {
      const r = await api.post(`/backups/${b.id}/restore`, {});
      const n = r.restored || {};
      alert(`恢复完成：学生 ${n.students ?? 0} 名补建，成绩 ${n.grades ?? 0} 条，考勤 ${n.attendance ?? 0} 条，德育 ${n.moral ?? 0} 条，班费 ${n.funds ?? 0} 条，错题 ${n.wrong ?? 0} 条`);
    } catch (e) { setErr(e.message || '恢复失败'); } finally { setBusy(0); }
  };

  const remove = async (b) => {
    if (!confirm(`删除备份「${b.name}」？`)) return;
    setBusy(b.id);
    try { await api.del(`/backups/${b.id}`); await load(); }
    catch (e) { setErr(e.message || '删除失败'); } finally { setBusy(0); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={create} disabled={!!busy}><Plus size={16} />{busy === 1 ? '备份中…' : '立即备份'}</Button>
        <span className="text-xs text-ink-secondary">快照包含学生名单、成绩、考勤、德育、班费与错题；恢复时按姓名匹配学生，已删除的学生会重新建回。</span>
      </div>

      {err && <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{err}</div>}

      {list === null ? <SkeletonList rows={3} /> : list.length === 0 ? (
        <Empty icon={DatabaseBackup} text="还没有备份点" desc="建议在批量删除、导入成绩等操作前先点一次「立即备份」" />
      ) : (
        <div className="space-y-3">
          {list.map(b => (
            <div key={b.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                <DatabaseBackup size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-ink-secondary">{b.created_at}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(b.counts || {}).map(([k, v]) => (
                    <Badge key={k} tone="gray">{COUNT_LABEL[k] || k} {v}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" onClick={() => restore(b)} disabled={!!busy}>
                  {busy === b.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}恢复
                </Button>
                <button onClick={() => remove(b)} disabled={!!busy} title="删除备份"
                  className="btn-pill p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] disabled:opacity-50">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl bg-[#ff9500]/[0.07] px-4 py-3 text-xs leading-relaxed text-[#8a4b00]">
        <ShieldAlert size={15} className="mt-0.5 shrink-0" />
        <span>恢复是「覆盖式」操作：学生名单会保留并补齐已删除的学生，但成绩、考勤、德育、班费、错题会被备份内容整体替换（备份之后新增的这些记录会丢失）。建议操作前先做一次新备份或导出整班归档。</span>
      </div>
    </div>
  );
}
