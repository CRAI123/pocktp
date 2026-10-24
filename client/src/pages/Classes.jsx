/** 班级管理：班级卡片列表 + 新建班级弹窗（/classes 列表、/classes/new 直达创建） */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Plus, Users, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Modal, Field, inputCls, Empty, SkeletonList } from '../components/ui.jsx';

const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级'];

export default function Classes() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [creating, setCreating] = useState(pathname === '/classes/new');
  const [form, setForm] = useState({ name: '', grade: '', description: '' });
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/classes').then(d => { setList(d); setLoadErr(''); }).catch(e => setLoadErr(e.message || '加载失败'));
  useEffect(() => { load(); }, []);

  const closeCreate = () => {
    setCreating(false);
    setFormErr('');
    if (pathname === '/classes/new') navigate('/classes', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormErr('请填写班级名称'); return; }
    setBusy(true); setFormErr('');
    try {
      const { id } = await api.post('/classes', form);
      navigate(`/classes/${id}`); // 创建成功进入班级详情
    } catch (e2) {
      setFormErr(e2.message || '创建失败，请重试');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">我的班级</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">创建并管理班级，点击卡片进入座次表、班委、家长联系等班务管理</p>
        </div>
        <button onClick={() => { setForm({ name: '', grade: '', description: '' }); setCreating(true); }}
          className="btn-pill brand-gradient flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-medium text-white shadow-md shadow-blue-500/25">
          <Plus size={16} />新建班级
        </button>
      </div>

      {loadErr ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="text-base">{loadErr}</div>
          <button onClick={load} className="btn-pill brand-gradient px-4 py-2 text-sm text-white">
            <RefreshCw size={14} className="mr-1 inline" />重试
          </button>
        </div>
      ) : !list ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="card h-[104px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
        </div>
      ) : list.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(cls => (
            <Link key={cls.id} to={`/classes/${cls.id}`}
              className="card group flex flex-col gap-3 p-5 transition hover:border-[#0071e3]/40 hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#5856d6] text-white">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <div className="font-semibold tracking-tight">{cls.name}</div>
                    <div className="text-xs text-ink-secondary">{cls.grade || '未设年级'}{cls.description ? ` · ${cls.description}` : ''}</div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-ink-secondary transition group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-ink">
                <Users size={14} className="text-ink-secondary" />{cls.student_count} 名学生
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={GraduationCap} text="还没有班级"
          desc="创建第一个班级后，即可添加学生、编排座次、考勤点名"
          action={
            <button onClick={() => { setForm({ name: '', grade: '', description: '' }); setCreating(true); }}
              className="btn-pill brand-gradient px-4 py-2 text-sm font-medium text-white">
              <Plus size={15} className="mr-1 inline" />创建班级
            </button>
          } />
      )}

      {/* 新建班级弹窗 */}
      <Modal open={creating} onClose={closeCreate} title="新建班级">
        <form onSubmit={submit} className="space-y-4">
          <Field label="班级名称（必填）">
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="如：三年级(2)班" className={inputCls} maxLength={30} />
          </Field>
          <Field label="年级（可选）">
            <div className="flex flex-wrap gap-1.5">
              {GRADES.map(g => (
                <button type="button" key={g}
                  onClick={() => setForm({ ...form, grade: form.grade === g ? '' : g })}
                  className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                    form.grade === g ? 'brand-gradient text-white' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </Field>
          <Field label="班级描述（可选）">
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="如：信息科技兴趣班" className={inputCls} maxLength={50} />
          </Field>
          {formErr && <p className="text-xs text-[#ff3b30]">{formErr}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={closeCreate} className="btn-pill bg-black/[0.05] px-4 py-2 text-sm text-ink hover:bg-black/[0.08]">取消</button>
            <button type="submit" disabled={busy}
              className="btn-pill brand-gradient px-5 py-2 text-sm font-medium text-white shadow-md shadow-blue-500/25 disabled:opacity-50">
              {busy ? '创建中…' : '创建班级'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
