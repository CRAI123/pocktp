import { useEffect, useState } from 'react';
import { Plus, Trash2, Gift, Coins, Ticket, Check, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const TYPES = ['奖励券', '心愿瓶', '特权'];
const TYPE_TONE = { 奖励券: 'blue', 心愿瓶: 'purple', 特权: 'orange' };

/* 常用奖励快选：点一下就填好名称、类型与积分 */
const PRESETS = [
  { name: '免写一次作业券', type: '奖励券', cost: 30 },
  { name: '自选座位一周', type: '特权', cost: 50 },
  { name: '心愿瓶 · 点一首歌', type: '心愿瓶', cost: 20 },
  { name: '心愿瓶 · 当一天小组长', type: '心愿瓶', cost: 60 },
];

/** 奖励券 / 心愿瓶：自定义奖励 + 用德育积分兑换 + 兑换留痕 */
export default function RewardsTab({ classId }) {
  const [data, setData] = useState(null); // { rewards, students, redemptions }
  const [openReward, setOpenReward] = useState(false);
  const [redeem, setRedeem] = useState(null); // { student_id, reward_id, remark }
  const [rewardForm, setRewardForm] = useState({ name: '', type: '奖励券', cost: 20, stock: 0, remark: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/classes/${classId}/rewards`).then(setData);
  useEffect(() => { load(); }, [classId]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const pending = data.redemptions.filter(r => r.status === '待兑换').length;

  const addReward = async () => {
    if (!rewardForm.name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/rewards`, rewardForm);
      setOpenReward(false);
      setRewardForm({ name: '', type: '奖励券', cost: 20, stock: 0, remark: '' });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const submitRedeem = async () => {
    if (!redeem?.student_id || !redeem?.reward_id) return;
    setErr(''); setBusy(true);
    try {
      await api.post(`/classes/${classId}/redemptions`, redeem);
      setRedeem(null);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const pickedStu = data.students.find(s => String(s.id) === String(redeem?.student_id));
  const pickedReward = data.rewards.find(r => String(r.id) === String(redeem?.reward_id));
  const canRedeem = pickedStu && pickedReward && pickedStu.balance >= pickedReward.cost;

  return (
    <div className="space-y-4">
      {/* 概览 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#00c6ff] text-white"><Ticket size={18} /></div>
          <div><div className="text-xl font-bold">{data.rewards.length}</div><div className="text-xs text-ink-secondary">可兑换奖励</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#28cd41] to-[#34d058] text-white"><Gift size={18} /></div>
          <div><div className="text-xl font-bold">{data.redemptions.length}</div><div className="text-xs text-ink-secondary">累计兑换</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff9500] to-[#ffcc00] text-white"><Sparkles size={18} /></div>
          <div><div className="text-xl font-bold text-[#c93400]">{pending}</div><div className="text-xs text-ink-secondary">待兑现</div></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setErr(''); setOpenReward(true); }}><Plus size={15} />新建奖励</Button>
        <Button onClick={() => { setErr(''); setRedeem({ student_id: '', reward_id: '', remark: '' }); }} disabled={!data.rewards.length || !data.students.length}>
          <Gift size={15} />兑换奖励
        </Button>
      </div>

      {/* 奖励项 */}
      {data.rewards.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.rewards.map(w => (
            <div key={w.id} className="card group flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#af52de] to-[#d783ff] text-white"><Gift size={18} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{w.name}</span>
                  <Badge tone={TYPE_TONE[w.type] || 'gray'}>{w.type}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-secondary">
                  <span className="inline-flex items-center gap-0.5 text-[#c93400]"><Coins size={12} />{w.cost} 积分</span>
                  <span>·</span>
                  <span>{Number(w.stock) > 0 ? `库存 ${Math.max(0, w.stock - w.used_count)}/${w.stock}` : '不限量'}</span>
                  {w.remark && <span className="truncate">· {w.remark}</span>}
                </div>
              </div>
              <button
                onClick={async () => { await api.del(`/rewards/${w.id}`); load(); }}
                className="btn-pill p-2 text-ink-secondary opacity-60 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100"
                title="删除"
              ><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={Gift} text="还没有可兑换的奖励" desc="先建几张奖励券或心愿瓶，学生就能用积分来兑换了" />
      )}

      {/* 兑换记录 */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <span className="text-sm font-semibold">兑换记录</span>
          <span className="text-xs text-ink-secondary">积分来自德育量化的加减分，兑换后自动扣减可用积分</span>
        </div>
        {data.redemptions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-black/5 bg-bg-light text-left text-xs text-ink-secondary">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">学生</th>
                  <th className="px-4 py-3 font-medium">奖励</th>
                  <th className="px-4 py-3 text-right font-medium">消耗</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.redemptions.map(r => (
                  <tr key={r.id} className="group border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3 text-xs text-ink-secondary">{String(r.created_at || '').slice(0, 16)}</td>
                    <td className="px-4 py-3 font-medium">{r.student_name}</td>
                    <td className="px-4 py-3">{r.reward_name}{r.remark ? <span className="ml-1 text-xs text-ink-secondary">（{r.remark}）</span> : null}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#c93400]">-{r.cost}</td>
                    <td className="px-4 py-3"><Badge tone={r.status === '已兑换' ? 'green' : 'orange'}>{r.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.status !== '已兑换' && (
                          <button
                            onClick={async () => { await api.put(`/redemptions/${r.id}`, { status: '已兑换' }); load(); }}
                            className="btn-pill p-2 text-ink-secondary hover:bg-[#28cd41]/10 hover:text-[#1fa733]" title="标记已兑换"
                          ><Check size={14} /></button>
                        )}
                        <button
                          onClick={async () => { await api.del(`/redemptions/${r.id}`); load(); }}
                          className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={Coins} text="还没有兑换记录" desc="兑换后会自动扣减学生积分并留痕" />}
      </div>

      {/* 新建奖励 */}
      <Modal open={openReward} onClose={() => setOpenReward(false)} title="新建奖励">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => setRewardForm({ ...rewardForm, name: p.name, type: p.type, cost: p.cost })}
                className="btn-pill bg-black/[0.04] px-3 py-1.5 text-xs text-ink-secondary transition hover:bg-[#0071e3]/10 hover:text-[#0071e3]">
                {p.name}
              </button>
            ))}
          </div>
          <Field label="奖励名称">
            <input className={inputCls} placeholder="如：免写一次作业券" value={rewardForm.name} onChange={e => setRewardForm({ ...rewardForm, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <select className={inputCls} value={rewardForm.type} onChange={e => setRewardForm({ ...rewardForm, type: e.target.value })}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="所需积分">
              <input type="number" min="1" className={inputCls} value={rewardForm.cost} onChange={e => setRewardForm({ ...rewardForm, cost: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="库存（0=不限量）">
              <input type="number" min="0" className={inputCls} value={rewardForm.stock} onChange={e => setRewardForm({ ...rewardForm, stock: e.target.value })} />
            </Field>
            <Field label="备注（可选）">
              <input className={inputCls} placeholder="如：每周五兑现" value={rewardForm.remark} onChange={e => setRewardForm({ ...rewardForm, remark: e.target.value })} />
            </Field>
          </div>
          {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
          <Button className="w-full justify-center" onClick={addReward} disabled={!rewardForm.name.trim() || busy}>保存奖励</Button>
        </div>
      </Modal>

      {/* 兑换 */}
      <Modal open={!!redeem} onClose={() => setRedeem(null)} title="兑换奖励">
        {redeem && (
          <div className="space-y-4">
            <Field label="学生（显示可用积分）">
              <select className={inputCls} value={redeem.student_id} onChange={e => setRedeem({ ...redeem, student_id: e.target.value })}>
                <option value="">请选择学生</option>
                {data.students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} · 可用 {s.balance} 分</option>
                ))}
              </select>
            </Field>
            <Field label="奖励">
              <select className={inputCls} value={redeem.reward_id} onChange={e => setRedeem({ ...redeem, reward_id: e.target.value })}>
                <option value="">请选择奖励</option>
                {data.rewards.map(w => (
                  <option key={w.id} value={w.id} disabled={Number(w.stock) > 0 && w.used_count >= Number(w.stock)}>
                    {w.name} · {w.cost} 积分{Number(w.stock) > 0 ? ` · 余 ${Math.max(0, w.stock - w.used_count)}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {pickedStu && pickedReward && (
              <div className={`rounded-xl px-3.5 py-3 text-sm ${canRedeem ? 'bg-[#28cd41]/8 text-[#1fa733]' : 'bg-[#ff9500]/10 text-[#c93400]'}`}>
                {pickedStu.name}：{pickedStu.balance} 分 → 兑换后剩余 {pickedStu.balance - pickedReward.cost} 分
                {!canRedeem && '（积分不足，先去德育量化加分吧）'}
              </div>
            )}
            <Field label="备注（可选）">
              <input className={inputCls} placeholder="如：周五班会课兑现" value={redeem.remark} onChange={e => setRedeem({ ...redeem, remark: e.target.value })} />
            </Field>
            {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
            <Button className="w-full justify-center" onClick={submitRedeem} disabled={!canRedeem || busy}>确认兑换</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
