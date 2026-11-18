import { useEffect, useState } from 'react';
import {
  BookOpen, Check, GraduationCap, KeyRound, Phone, ShieldCheck, User, Users, Zap,
} from 'lucide-react';
import { api, auth, isMembershipActive } from '../api.js';
import { SectionHeader, Button, Field, inputCls, Badge } from '../components/ui.jsx';

/** 个人中心：账号资料、会员与算力、所教课程、密码修改 */
export default function Profile() {
  const [me, setMe] = useState(auth.teacher);
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  const [name, setName] = useState(auth.teacher?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

  const [pwd, setPwd] = useState({ old: '', next: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');

  useEffect(() => {
    api.get('/auth/me')
      .then(t => {
        setMe(t);
        setName(t.name);
        auth.save(auth.token, t, auth.remember);
      })
      .catch(console.error);
    api.get('/courses').then(setCourses).catch(console.error);
    api.get('/classes').then(setClasses).catch(console.error);
    api.get('/students').then(setStudents).catch(console.error);
  }, []);

  const saveName = async () => {
    const v = name.trim();
    if (!v) return setNameMsg('姓名不能为空');
    if (v === me?.name) return setNameMsg('');
    setSavingName(true);
    setNameMsg('');
    try {
      const t = await api.put('/auth/profile', { name: v });
      setMe(t);
      auth.save(auth.token, t, auth.remember);
      setNameMsg('已保存');
    } catch (e) {
      setNameMsg(e?.message || '保存失败');
    } finally {
      setSavingName(false);
    }
  };

  const changePwd = async () => {
    if (!pwd.old || !pwd.next) return setPwdMsg('请填写原密码与新密码');
    if (pwd.next.length < 6) return setPwdMsg('新密码至少 6 位');
    if (pwd.next !== pwd.confirm) return setPwdMsg('两次输入的新密码不一致');
    setSavingPwd(true);
    setPwdMsg('');
    try {
      await api.put('/auth/password', { old_password: pwd.old, new_password: pwd.next });
      setPwd({ old: '', next: '', confirm: '' });
      setPwdMsg('密码已更新');
    } catch (e) {
      setPwdMsg(e?.message || '修改失败');
    } finally {
      setSavingPwd(false);
    }
  };

  const active = isMembershipActive(me);
  const initial = (me?.name || '师').slice(0, 1);

  const stats = [
    { icon: BookOpen, label: '所教课程', value: courses.length, tone: 'text-[#0071e3]' },
    { icon: GraduationCap, label: '班级', value: classes.length, tone: 'text-[#af52de]' },
    { icon: Users, label: '学生', value: students.length, tone: 'text-[#28cd41]' },
    { icon: Zap, label: '算力余额', value: me?.credits ?? 0, tone: 'text-[#ff9500]' },
  ];

  return (
    <div>
      <SectionHeader title="个人中心" desc="账号资料、会员状态与所教课程，都可以在这里查看和修改。" />

      {/* 账号概览 */}
      <div className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-[0_18px_50px_-38px_rgba(16,24,40,0.5)]">
        <div className="brand-gradient px-5 py-7 sm:px-7">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/95 text-[26px] font-semibold text-ink shadow-lg">
              {initial}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[22px] font-semibold text-white">{me?.name || '教师'}</h3>
                {me?.is_admin && <Badge tone="purple"><ShieldCheck size={11} /> 管理员</Badge>}
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  active ? 'bg-white/20 text-white ring-white/30' : 'bg-[#ff3b30] text-white ring-[#ff3b30]'
                }`}>
                  {active ? (me?.membership_expires_at ? `会员至 ${me.membership_expires_at}` : '永久会员') : '会员已到期'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/80">
                <span className="inline-flex items-center gap-1.5"><Phone size={12} />{me?.phone || '-'}</span>
                <span className="inline-flex items-center gap-1.5">
                  <User size={12} />注册于 {(me?.created_at || '').slice(0, 10) || '-'}
                </span>
              </div>
            </div>
            <a href="/renew" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-sm transition hover:bg-white">
              <Zap size={13} className="text-[#ff9500]" /> 续费与算力
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.05] sm:grid-cols-4 sm:divide-y-0">
          {stats.map(s => (
            <div key={s.label} className="px-5 py-4">
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
                <s.icon size={13} className={s.tone} /> {s.label}
              </div>
              <div className="num mt-1 text-[24px] font-semibold leading-none text-ink">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        {/* 所教课程 */}
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">所教课程</h3>
            <span className="text-[11.5px] text-ink-secondary">{courses.length} 门</span>
          </div>
          {courses.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-secondary">还没有课程，可到「课程列表」新建。</p>
          ) : (
            <div className="space-y-2">
              {courses.map(c => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.05] bg-[#fbfbfd] px-3.5 py-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0071e3]/10 text-[11px] font-semibold text-[#0071e3]">
                    {c.subject?.slice(0, 1) || '课'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{c.name}</div>
                    <div className="mt-0.5 text-[11px] text-ink-secondary">
                      {[c.name?.includes(c.subject) ? '' : c.subject, c.class_name, c.semester].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {c.schedule && <span className="text-[11px] text-ink-secondary">{c.schedule}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 账号设置 */}
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-[15px] font-semibold text-ink">基本资料</h3>
            <Field label="姓名">
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameMsg(''); }}
                maxLength={20}
                className={inputCls}
                placeholder="请输入姓名"
              />
            </Field>
            <Field label="手机号（登录账号）">
              <input value={me?.phone || ''} disabled className={`${inputCls} cursor-not-allowed bg-black/[0.03] text-ink-secondary`} />
            </Field>
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={saveName} disabled={savingName}>
                {savingName ? '保存中…' : '保存资料'}
              </Button>
              {nameMsg && (
                <span className={`inline-flex items-center gap-1 text-[12px] ${nameMsg === '已保存' ? 'text-[#1a7f2b]' : 'text-[#b3251c]'}`}>
                  {nameMsg === '已保存' && <Check size={12} />}{nameMsg}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
              <KeyRound size={14} className="text-ink-secondary" /> 修改密码
            </h3>
            <div className="space-y-3">
              <Field label="原密码">
                <input type="password" value={pwd.old} onChange={e => { setPwd(p => ({ ...p, old: e.target.value })); setPwdMsg(''); }} className={inputCls} placeholder="当前密码" />
              </Field>
              <Field label="新密码">
                <input type="password" value={pwd.next} onChange={e => { setPwd(p => ({ ...p, next: e.target.value })); setPwdMsg(''); }} className={inputCls} placeholder="至少 6 位" />
              </Field>
              <Field label="确认新密码">
                <input type="password" value={pwd.confirm} onChange={e => { setPwd(p => ({ ...p, confirm: e.target.value })); setPwdMsg(''); }} className={inputCls} placeholder="再输入一次" />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="secondary" onClick={changePwd} disabled={savingPwd}>
                {savingPwd ? '提交中…' : '更新密码'}
              </Button>
              {pwdMsg && (
                <span className={`inline-flex items-center gap-1 text-[12px] ${pwdMsg === '密码已更新' ? 'text-[#1a7f2b]' : 'text-[#b3251c]'}`}>
                  {pwdMsg === '密码已更新' && <Check size={12} />}{pwdMsg}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
