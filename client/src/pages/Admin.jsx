import { useCallback, useEffect, useState } from 'react';
import {
  Ticket, TicketCheck, TicketX, Users, Plus, Copy, Ban, Check, ShieldCheck, Link2, Zap, Sparkles, CalendarPlus, Wallet,
} from 'lucide-react';
import { api, todayStr } from '../api.js';
import { BASE_URL } from '../config.js';
import { StatCard, SectionHeader, Button, Badge, Modal, Field, inputCls, Empty } from '../components/ui.jsx';

const STATUS_MAP = {
  unused: ['未使用', 'blue'],
  used: ['已使用', 'green'],
  revoked: ['已作废', 'gray'],
};

/** 13 档档位定义（单价 ¥0.02/算力为基准）
 *  - 7 日最高使用额度 = 300 算力（一周老师出卷 + 批改 + 提示合理用量）
 *  - 永久档按额度 4 档，避免被薅 */
const TIERS = [
  { id: '7d-light',     validDays: 7,   credits: 100,   price: '¥2.9',   label: '7 日轻',   tag: '100 算力' },
  { id: '7d-std',       validDays: 7,   credits: 300,   price: '¥5.9',   label: '7 日标',   tag: '300 算力',  highlight: true },
  { id: '7d-large',     validDays: 7,   credits: 600,   price: '¥9.9',   label: '7 日大',   tag: '600 算力' },
  { id: '14d-std',      validDays: 14,  credits: 600,   price: '¥9.9',   label: '14 日标',  tag: '600 算力' },
  { id: '14d-large',    validDays: 14,  credits: 1200,  price: '¥17.9',  label: '14 日大',  tag: '1200 算力' },
  { id: '30d-std',      validDays: 30,  credits: 1500,  price: '¥19.9',  label: '30 日标',  tag: '1500 算力' },
  { id: '30d-large',    validDays: 30,  credits: 3000,  price: '¥29.9',  label: '30 日大',  tag: '3000 算力' },
  { id: '90d-large',    validDays: 90,  credits: 4500,  price: '¥49.9',  label: '90 日大',  tag: '4500 算力',  highlight: true },
  { id: '365d-large',   validDays: 365, credits: 18000, price: '¥119',   label: '365 日大', tag: '18000 算力' },
  { id: 'perm-light',   validDays: 0,   credits: 1000,  price: '¥39.9',  label: '永久轻',   tag: '1000 算力' },
  { id: 'perm-std',     validDays: 0,   credits: 3000,  price: '¥89',    label: '永久标',   tag: '3000 算力' },
  { id: 'perm-large',   validDays: 0,   credits: 10000, price: '¥199',   label: '永久大',   tag: '10000 算力' },
  { id: 'perm-top',     validDays: 0,   credits: 30000, price: '¥499',   label: '永久顶',   tag: '30000 算力' },
];

/** 激活码分组显示：XXXX-XXXX-XXXX-XXXX */
const fmtCode = (c) => (c ? c.replace(/(.{4})(?=.)/g, '$1-') : '');

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export default function Admin() {
  const [tab, setTab] = useState('codes');
  const [codes, setCodes] = useState({ list: [], stats: {}, batches: [] });
  const [teachers, setTeachers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [gen, setGen] = useState({ count: 10, batch: '', note: '', validDays: 7, credits: 300 });
  const [pickedTier, setPickedTier] = useState(null);

  /** 点击档位快选：填表 + 自动填 batch（方便后续筛选） + 自动填数量 */
  const pickTier = (t) => {
    setPickedTier(t.id);
    setGen(g => ({ ...g, validDays: t.validDays, credits: t.credits, batch: g.batch || t.label, count: g.count < 5 ? 10 : g.count }));
  };

  /** 兑换链接：买家打开即可登录并激活（域名取自 BASE_URL，本地默认 localhost，部署后自动用 teach.rayzo.cn） */
  const redeemUrl = (code) => `${BASE_URL}/redeem/${code}`;
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null); // 新生成的码（弹窗展示）
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const loadCodes = useCallback(async () => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set('status', statusFilter);
    if (batchFilter) qs.set('batch', batchFilter);
    setCodes(await api.get(`/admin/codes?${qs}`));
  }, [statusFilter, batchFilter]);

  const loadTeachers = useCallback(async () => setTeachers(await api.get('/admin/teachers')), []);

  /* 给用户延长会员时长 */
  const [extendFor, setExtendFor] = useState(null); // 目标教师对象
  const [extendDays, setExtendDays] = useState(30);
  const [extendBusy, setExtendBusy] = useState(false);
  const [extendErr, setExtendErr] = useState('');

  const openExtend = (t) => { setExtendFor(t); setExtendDays(30); setExtendErr(''); };

  const submitExtend = async () => {
    if (!extendFor || extendBusy) return;
    setExtendBusy(true);
    setExtendErr('');
    try {
      await api.post(`/admin/teachers/${extendFor.id}/extend`, { days: Number(extendDays) });
      setExtendFor(null);
      await loadTeachers();
    } catch (e) {
      setExtendErr(e.message || '操作失败，请重试');
    } finally {
      setExtendBusy(false);
    }
  };

  useEffect(() => { loadCodes().catch(e => setError(e.message)); }, [loadCodes]);
  useEffect(() => { loadTeachers().catch(() => {}); }, [loadTeachers]);

  /* 功能权限：课时费与工作量（默认关闭，按教师分配） */
  const [permBusy, setPermBusy] = useState(null);
  const toggleFinance = async (t) => {
    if (permBusy) return;
    setPermBusy(t.id);
    try {
      const r = await api.post(`/admin/teachers/${t.id}/finance`, { enabled: !t.finance_enabled });
      setTeachers(list => list.map(x => (x.id === t.id ? { ...x, finance_enabled: r.finance_enabled } : x)));
    } catch (e) {
      alert(e.message || '操作失败');
    } finally {
      setPermBusy(null);
    }
  };

  const generate = async (e) => {
    e.preventDefault();
    setError('');
    setGenerating(true);
    try {
      const payload = {
        count: gen.count,
        batch: gen.batch,
        note: gen.note,
        credits: gen.credits,
        validDays: Number(gen.validDays), // 激活后有效天数，0=永久
      };
      const tierInfo = TIERS.find(t => t.id === pickedTier);
      const res = await api.post('/admin/codes', payload);
      setGenerated({ codes: res.created, tier: tierInfo });
      await Promise.all([loadCodes(), loadTeachers()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const revoke = async (id) => {
    if (!confirm('确定作废该激活码？作废后不可恢复。')) return;
    try {
      await api.post(`/admin/codes/${id}/revoke`);
      await loadCodes();
    } catch (err) {
      alert(err.message);
    }
  };

  const doCopy = (text, key) => {
    copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const stats = codes.stats;
  const total = (stats.unused || 0) + (stats.used || 0) + (stats.revoked || 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="管理后台"
        desc="激活码生成与核销管理、教师用户总览"
        action={
          <div className="flex rounded-xl bg-black/[0.05] p-1 text-sm font-medium">
            {[['codes', '激活码管理'], ['teachers', `教师用户 (${teachers.length})`]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-1.5 transition ${tab === k ? 'bg-white shadow-sm text-ink' : 'text-ink-secondary hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Ticket} label="激活码总数" value={total} tone="purple" />
        <StatCard icon={TicketCheck} label="未使用" value={stats.unused || 0} tone="blue" />
        <StatCard icon={Check} label="已核销" value={stats.used || 0} tone="green" />
        <StatCard icon={Users} label="注册教师" value={teachers.length} tone="orange" />
      </div>

      {tab === 'codes' ? (
        <>
          {/* 生成激活码 */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><Plus size={18} /> 批量生成激活码</h3>

            {/* 13 档快选（点击填表，自动填 batch） */}
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                <Sparkles size={13} className="text-[#ff9500]" /> 快选档位（推荐）
                <span className="text-ink-secondary/60">· 闲鱼挂单价 ¥2.9 起</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map(t => {
                  const picked = pickedTier === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTier(t)}
                      title={`${t.label} · ${t.validDays > 0 ? `${t.validDays} 天` : '永久'} · ${t.credits} 算力 · ${t.price}`}
                      className={`group flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition active:scale-95 ${
                        picked
                          ? 'border-transparent bg-gradient-to-r from-[#0071e3] to-[#af52de] text-white shadow-md shadow-blue-500/20'
                          : t.highlight
                            ? 'border-[#ff9500]/40 bg-[#ff9500]/5 text-ink hover:border-[#ff9500]/60 hover:bg-[#ff9500]/10'
                            : 'border-black/[0.08] bg-bg-light text-ink hover:border-[#0071e3]/30 hover:bg-white'
                      }`}
                    >
                      <span className={`font-semibold ${picked ? 'text-white' : 'text-ink'}`}>{t.price}</span>
                      <span className={picked ? 'text-white/85' : 'text-ink-secondary'}>{t.label}</span>
                      <span className={`hidden lg:inline ${picked ? 'text-white/70' : 'text-ink-secondary/70'}`}>· {t.tag}</span>
                      {t.highlight && !picked && (
                        <span className="rounded-full bg-[#ff9500] px-1 text-[10px] font-medium text-white">热</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={generate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Field label="数量（1-500）">
                <input
                  type="number" min={1} max={500} required className={inputCls}
                  value={gen.count} onChange={e => setGen({ ...gen, count: e.target.value })}
                />
              </Field>
              <Field label="有效期（激活后）">
                <select
                  className={inputCls}
                  value={gen.validDays} onChange={e => setGen({ ...gen, validDays: Number(e.target.value) })}
                >
                  <option value={7}>7 天</option>
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                  <option value={365}>365 天</option>
                  <option value={0}>永久有效</option>
                </select>
              </Field>
              <Field label="算力额度">
                <div className="relative">
                  <Zap size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ff9500]" />
                  <input
                    type="number" min={0} max={10000000} required className={`${inputCls} pl-9`}
                    value={gen.credits} onChange={e => setGen({ ...gen, credits: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="批次（选填）">
                <input
                  placeholder="如：闲鱼 10 月批" className={inputCls}
                  value={gen.batch} onChange={e => setGen({ ...gen, batch: e.target.value })}
                />
              </Field>
              <Field label="备注（选填）">
                <input
                  placeholder="如：买家订单号" className={inputCls}
                  value={gen.note} onChange={e => setGen({ ...gen, note: e.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={generating} className="w-full justify-center">
                  <Ticket size={16} />{generating ? '生成中…' : '生成'}
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-ink-secondary">
              有效期从买家「激活当天」开始计算；未过期再次兑换新码，剩余天数自动叠加。
            </p>
            {error && <div className="mt-3 rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{error}</div>}
          </div>

          {/* 筛选 */}
          <div className="flex flex-wrap items-center gap-3">
            <select className={`${inputCls} w-auto`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">全部状态</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="revoked">已作废</option>
            </select>
            <select className={`${inputCls} w-auto`} value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
              <option value="">全部批次</option>
              {codes.batches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="text-sm text-ink-secondary">共 {codes.list.length} 条</span>
          </div>

          {/* 激活码列表 */}
          {codes.list.length === 0 ? <Empty text="暂无激活码，点击上方生成" /> : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs text-ink-secondary">
                    <th className="px-5 py-3 font-medium">激活码</th>
                    <th className="px-5 py-3 font-medium">批次 / 备注</th>
                    <th className="px-5 py-3 font-medium">算力</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">使用者</th>
                    <th className="px-5 py-3 font-medium">有效时长</th>
                    <th className="px-5 py-3 font-medium">创建时间</th>
                    <th className="px-5 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.list.map(c => {
                    const [label, tone] = STATUS_MAP[c.status] || [c.status, 'gray'];
                    return (
                      <tr key={c.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                        <td className="px-5 py-3 font-mono text-[13px] tracking-wider">{fmtCode(c.code)}</td>
                        <td className="px-5 py-3">
                          {c.batch && <div className="font-medium">{c.batch}</div>}
                          {c.note && <div className="text-xs text-ink-secondary">{c.note}</div>}
                          {!c.batch && !c.note && <span className="text-ink-secondary/50">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 font-medium text-[#ff9500]">
                            <Zap size={13} />{c.credits ?? 1000}
                          </span>
                        </td>
                        <td className="px-5 py-3"><Badge tone={tone}>{label}</Badge></td>
                        <td className="px-5 py-3">
                          {c.used_by_name ? (
                            <>
                              <div>{c.used_by_name}</div>
                              <div className="text-xs text-ink-secondary">{c.used_by_phone} · {c.used_at}</div>
                            </>
                          ) : <span className="text-ink-secondary/50">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {c.valid_days > 0 ? `激活后 ${c.valid_days} 天` : <span className="text-ink-secondary/50">永久</span>}
                        </td>
                        <td className="px-5 py-3 text-ink-secondary">{c.created_at}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => doCopy(redeemUrl(c.code), `l${c.id}`)}
                              title="复制兑换链接（发给买家，打开即可激活）"
                              className="btn-pill p-1.5 text-ink-secondary hover:bg-[#ff9500]/10 hover:text-[#ff9500]"
                            >
                              {copied === `l${c.id}` ? <Check size={15} className="text-[#28cd41]" /> : <Link2 size={15} />}
                            </button>
                            <button
                              onClick={() => doCopy(fmtCode(c.code), c.id)}
                              title="复制激活码"
                              className="btn-pill p-1.5 text-ink-secondary hover:bg-[#0071e3]/10 hover:text-[#0071e3]"
                            >
                              {copied === c.id ? <Check size={15} className="text-[#28cd41]" /> : <Copy size={15} />}
                            </button>
                            {c.status === 'unused' && (
                              <button
                                onClick={() => revoke(c.id)}
                                title="作废"
                                className="btn-pill p-1.5 text-ink-secondary hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                              >
                                <Ban size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* 教师用户列表 */
        teachers.length === 0 ? <Empty text="暂无教师用户" /> : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-[#0071e3]/[0.05] px-4 py-3 text-xs leading-relaxed text-ink-secondary">
              <Wallet size={14} className="mt-0.5 shrink-0 text-[#0071e3]" />
              <span>「课时费与工作量」默认不开放（学校教师通常用不到）。点击教师行里的按钮即可开通；开通后该教师侧栏会出现入口，关闭后入口隐藏、接口也会拒绝访问。</span>
            </div>
            <div className="card overflow-x-auto">
            <table className="w-full min-w-[1060px] text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-ink-secondary">
                  <th className="px-5 py-3 font-medium">教师</th>
                  <th className="px-5 py-3 font-medium">手机号</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">会员到期</th>
                  <th className="px-5 py-3 font-medium">算力余额</th>
                  <th className="px-5 py-3 font-medium">功能权限</th>
                  <th className="px-5 py-3 font-medium">班级 / 学生</th>
                  <th className="px-5 py-3 font-medium">使用的激活码</th>
                  <th className="px-5 py-3 font-medium">注册时间</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t => (
                  <tr key={t.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white">
                          {(t.name || '师')[0]}
                        </div>
                        <span className="font-medium">{t.name}</span>
                        {!!t.is_admin && <ShieldCheck size={15} className="text-[#af52de]" />}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px]">{t.phone || '—'}</td>
                    <td className="px-5 py-3">
                      {t.is_admin
                        ? <Badge tone="purple">管理员</Badge>
                        : t.activated
                          ? <Badge tone="green">已激活</Badge>
                          : <Badge tone="orange">未激活</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      {t.is_admin
                        ? <span className="text-ink-secondary/50">—</span>
                        : !t.activated
                          ? <span className="text-ink-secondary/50">未激活</span>
                          : t.membership_expires_at
                            ? (() => {
                                const expired = t.membership_expires_at < todayStr();
                                return <span className={expired ? 'text-[#ff3b30]' : 'text-ink'}>{t.membership_expires_at}{expired ? '（已到期）' : ''}</span>;
                              })()
                            : <Badge tone="green">永久</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 font-medium text-[#ff9500]">
                        <Zap size={13} />{t.credits ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {t.is_admin ? (
                        <Badge tone="gray">默认开放</Badge>
                      ) : (
                        <button
                          onClick={() => toggleFinance(t)}
                          disabled={permBusy === t.id}
                          title="点击切换「课时费与工作量」功能权限"
                          className={`btn-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                            t.finance_enabled
                              ? 'bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15'
                              : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                          }`}
                        >
                          <Wallet size={13} />
                          {permBusy === t.id ? '处理中…' : t.finance_enabled ? '课时费 已开通' : '课时费 未开通'}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">{t.classes} 班 / {t.students} 人</td>
                    <td className="px-5 py-3 font-mono text-[13px]">
                      {t.used_code ? (
                        <span className="inline-flex flex-col">
                          <span>{fmtCode(t.used_code)}</span>
                          {t.used_count > 1 && <span className="text-[11px] font-sans text-ink-secondary">共兑换 {t.used_count} 张</span>}
                        </span>
                      ) : <span className="text-ink-secondary/50">—</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{t.created_at}</td>
                    <td className="px-5 py-3 text-right">
                      {!t.is_admin && (
                        <button
                          onClick={() => openExtend(t)}
                          title="延长会员时长"
                          className="btn-pill inline-flex items-center gap-1 bg-[#0071e3]/10 px-3 py-1.5 text-xs font-medium text-[#0071e3] transition hover:bg-[#0071e3]/15"
                        >
                          <CalendarPlus size={13} />延期
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )
      )}

      {/* 生成结果弹窗 */}
      <Modal open={!!generated} onClose={() => setGenerated(null)} title={
        <div className="flex items-center gap-2">
          <Check size={18} className="text-[#28cd41]" />
          <span>已生成 {generated?.codes?.length || 0} 个激活码</span>
          {generated?.tier && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#0071e3]/10 to-[#af52de]/10 px-2 py-0.5 text-xs font-medium text-[#0071e3]">
              <Sparkles size={11} />{generated.tier.label} · {generated.tier.price}
            </span>
          )}
        </div>
      } width="max-w-xl">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => doCopy(generated.codes.map(c => `一键激活网址：${redeemUrl(c)}\t激活码：${fmtCode(c)}`).join('\n\n\n'), 'all-links')}
          >
            {copied === 'all-links' ? <Check size={15} className="text-[#28cd41]" /> : <Link2 size={15} />}
            {copied === 'all-links' ? '已复制' : '一键复制网址+激活码'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => doCopy(generated.codes.map(fmtCode).join('\n'), 'all')}
          >
            {copied === 'all' ? <Check size={15} className="text-[#28cd41]" /> : <Copy size={15} />}
            {copied === 'all' ? '已复制' : '仅复制激活码'}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-2xl bg-bg-light p-4">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {generated?.codes?.map(c => (
              <code key={c} className="rounded-lg bg-white px-3 py-2 text-center font-mono text-[13px] tracking-wider shadow-sm">
                {fmtCode(c)}
              </code>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          推荐直接把「网址+激活码」设置到闲鱼自动发货：每行一条，格式为「兑换网址：xxx 激活码：xxx」，买家打开链接登录/注册即可自动激活并到账算力（每个码仅可使用一次）。关闭弹窗前请确认已保存。
        </p>
      </Modal>

      {/* 延长会员时长弹窗 */}
      <Modal open={!!extendFor} onClose={() => setExtendFor(null)} title={`延长会员时长${extendFor ? ` · ${extendFor.name}` : ''}`} width="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl bg-bg-light px-4 py-3 text-sm text-ink-secondary">
            当前到期：
            <b className="text-ink">
              {extendFor?.membership_expires_at
                ? `${extendFor.membership_expires_at}${extendFor.membership_expires_at < todayStr() ? '（已到期）' : ''}`
                : '永久'}
            </b>
            <span className="ml-2 text-xs">延期按「今天与现到期日取较晚者」起叠加，未激活账号将同时激活</span>
          </div>

          <Field label="选择时长">
            <div className="flex flex-wrap gap-1.5">
              {[{ d: 7, l: '+7 天' }, { d: 14, l: '+14 天' }, { d: 30, l: '+30 天' }, { d: 90, l: '+90 天' }, { d: 365, l: '+365 天' }, { d: 0, l: '永久' }].map(o => (
                <button key={o.d} type="button"
                  onClick={() => setExtendDays(o.d)}
                  className={`btn-pill px-3.5 py-2 text-sm font-medium transition ${
                    Number(extendDays) === o.d ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>
          </Field>

          <Field label="自定义天数（0 = 永久，最长 3650 天）">
            <input
              type="number" min="0" max="3650" className={inputCls}
              value={extendDays}
              onChange={e => setExtendDays(e.target.value)}
            />
          </Field>

          {extendErr && <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{extendErr}</div>}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setExtendFor(null)}>取消</Button>
            <Button type="button" disabled={extendBusy} onClick={submitExtend}>
              {extendBusy ? '处理中…' : Number(extendDays) === 0 ? '设为永久' : `延长 ${extendDays} 天`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
