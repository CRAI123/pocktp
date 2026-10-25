import { useEffect, useMemo, useState } from 'react';
import { Save, Shuffle, RefreshCw, Plus, Minus, UserX, MonitorPlay, Ban, LayoutGrid, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { Button, inputCls } from '../../components/ui.jsx';

/**
 * 座次表编排（支持不规则教室布局）：
 * - 拖拽编排：座位格互相拖动换位；待入座学生拖进空格；座位学生拖回右侧待入座
 * - 触屏兜底：点击选中 → 点击目标交换（与拖拽等价）
 * - 每行独立增减座位：行两侧悬浮 +/−，可实现"一行就一个人"、单座贴墙等布局
 * - 过道/空置格：完全隐形（仅悬停可见），可挖出讲台边空位、行内过道；点击空白处恢复座位
 * - 支持增删行列、一键顺序编排（跳过空置格）、前后排自动轮换、大屏展示模式
 */
export default function SeatsTab({ classId }) {
  const [data, setData] = useState(null);   // { rows, cols, grid, students }
  const [grid, setGrid] = useState([]);      // 编辑中的二维数组：null | {disabled:true} | {student_id,name}
  const [selected, setSelected] = useState(null); // {row, col} 或 {pool: studentId}
  const [dragOver, setDragOver] = useState(null); // 拖拽悬停目标 {row, col}
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bigScreen, setBigScreen] = useState(false);
  const [mode, setMode] = useState('random');
  const [arranging, setArranging] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planName, setPlanName] = useState('');

  const loadPlans = () => api.get(`/classes/${classId}/seat-plans`).then(setPlans).catch(console.error);
  useEffect(() => { loadPlans(); }, [classId]);

  const load = () => api.get(`/classes/${classId}/seats`).then(d => {
    setData(d);
    setGrid(d.grid.map(r => r.map(c =>
      c?.disabled ? { disabled: true } : (c ? { student_id: c.student_id, name: c.name } : null)
    )));
    setDirty(false);
  });
  useEffect(() => { load(); }, [classId]);

  /* 已入座学生 id 集合 */
  const seated = useMemo(() => new Set(grid.flat().filter(c => c?.student_id).map(c => c.student_id)), [grid]);
  const pool = useMemo(() => (data?.students || []).filter(s => !seated.has(s.id)), [data, seated]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const rows = grid.length, cols = grid[0]?.length || 0;

  /* ---------- 拖拽编排 ---------- */

  /* 座位格开始拖拽：记录来源坐标 */
  const dragFromCell = (r, c, e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ from: { row: r, col: c } }));
    e.dataTransfer.effectAllowed = 'move';
  };

  /* 待入座学生开始拖拽：记录学生 id */
  const dragFromPool = (sid, e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ pool: sid }));
    e.dataTransfer.effectAllowed = 'move';
  };

  /* 拖拽放到某格：放入 / 交换 */
  const dropOnCell = (r, c, e) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    let payload; try { payload = JSON.parse(raw); } catch { return; }
    const next = grid.map(row => row.slice());
    if (payload.pool != null) {
      /* 待入座学生放入（原格有人则顶替回待入座） */
      const stu = data.students.find(s => s.id === payload.pool);
      if (!stu) return;
      next[r][c] = { student_id: stu.id, name: stu.name };
    } else if (payload.from) {
      const { row: fr, col: fc } = payload.from;
      if (fr === r && fc === c) return;
      const tmp = next[fr][fc];
      next[fr][fc] = next[r][c];
      next[r][c] = tmp;
    } else return;
    setGrid(next); setSelected(null); setDirty(true);
  };

  /* 拖回右侧待入座区：把该格学生移出座位 */
  const dropOnPool = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    let payload; try { payload = JSON.parse(raw); } catch { return; }
    if (payload.from == null) return;
    const next = grid.map(row => row.slice());
    next[payload.from.row][payload.from.col] = null;
    setGrid(next); setDirty(true);
  };

  /* ---------- 点击兜底（触屏） ---------- */

  const clickCell = (r, c) => {
    const cell = grid[r][c];
    /* 空置格：点击恢复为空座位 */
    if (cell?.disabled) {
      const next = grid.map(row => row.slice());
      next[r][c] = null;
      setGrid(next); setDirty(true);
      return;
    }
    if (!selected) { if (cell) setSelected({ row: r, col: c }); return; }
    const next = grid.map(row => row.slice());
    if (selected.pool != null) {
      /* 从待入座列表放入 */
      if (cell) return; // 格子有人，先清空或交换逻辑由格子选择处理
      const stu = data.students.find(s => s.id === selected.pool);
      next[r][c] = { student_id: stu.id, name: stu.name };
    } else {
      if (selected.row === r && selected.col === c) { setSelected(null); return; }
      const tmp = next[selected.row][selected.col];
      next[selected.row][selected.col] = next[r][c];
      next[r][c] = tmp;
    }
    setGrid(next); setSelected(null); setDirty(true);
  };

  const clickPool = (sid) => setSelected(selected?.pool === sid ? null : { pool: sid });

  /* 把选中格学生移回待入座 */
  const removeCell = (r, c) => {
    const next = grid.map(row => row.slice());
    next[r][c] = null;
    setGrid(next); setDirty(true);
  };

  /* 空格 → 空置（无座位） */
  const markDisabled = (r, c) => {
    const next = grid.map(row => row.slice());
    next[r][c] = { disabled: true };
    setGrid(next); setDirty(true);
  };

  /* ---------- 每行独立增减座位（实现一行一人等不规则布局） ---------- */

  /* 从指定方向找本行第一个非空置格并删除该座位（有人则回待入座） */
  const rowRemoveSeat = (r, fromRight = true) => {
    const cs = [...Array(cols).keys()];
    if (!fromRight) cs.reverse();
    for (const c of cs) {
      if (!grid[r][c]?.disabled) {
        if (grid[r][c] && !confirm(`该座位上是「${grid[r][c].name}」，确定删除这个座位？该学生将回到待入座。`)) return;
        const next = grid.map(row => row.slice());
        next[r][c] = { disabled: true };
        setGrid(next); setDirty(true);
        return;
      }
    }
  };

  /* 从指定方向恢复本行第一个空置格为空座位 */
  const rowAddSeat = (r, fromRight = true) => {
    const cs = [...Array(cols).keys()];
    if (!fromRight) cs.reverse();
    for (const c of cs) {
      if (grid[r][c]?.disabled) {
        const next = grid.map(row => row.slice());
        next[r][c] = null;
        setGrid(next); setDirty(true);
        return;
      }
    }
  };

  const rowCanRemove = (r) => grid[r].some(c => !c?.disabled);
  const rowCanAdd = (r) => grid[r].some(c => c?.disabled);

  /* ---------- 布局工具 ---------- */

  /* 增删行列（全局） */
  const resize = (dr, dc) => {
    let next = grid.map(row => row.slice());
    if (dr > 0) next.push(Array.from({ length: cols }, () => null));
    if (dr < 0 && rows > 1) next.pop();
    if (dc > 0) next = next.map(row => [...row, null]);
    if (dc < 0 && cols > 1) next = next.map(row => row.slice(0, -1));
    setGrid(next); setDirty(true);
  };

  /* 一键顺序编排：全部学生按学号填入（跳过空置格） */
  const autoFill = () => {
    const all = [...data.students];
    const next = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c]?.disabled) next[r][c] = { disabled: true }; // 保留空置区
    let i = 0;
    for (let c = 0; c < cols && i < all.length; c++)       // 按列填（传统教室列优先）
      for (let r = 0; r < rows && i < all.length; r++, i++) {
        if (next[r][c]?.disabled) continue;
        next[r][c] = { student_id: all[i].id, name: all[i].name };
      }
    setGrid(next); setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const cells = [];
      grid.forEach((row, r) => row.forEach((cell, c) => cells.push({
        row: r, col: c,
        student_id: cell?.student_id || null,
        disabled: cell?.disabled ? 1 : 0,
      })));
      await api.put(`/classes/${classId}/seats`, { cells });
      setDirty(false);
    } finally { setSaving(false); }
  };

  const rotate = async () => {
    await api.post(`/classes/${classId}/seats/rotate`);
    await load();
  };

  /* 智能排座：随机 / 按成绩均衡 / 男女交错（后端直接落库） */
  const autoArrange = async () => {
    if (dirty && !confirm('当前有未保存的调整，智能排座会覆盖，继续？')) return;
    setArranging(true);
    try {
      const r = await api.post(`/classes/${classId}/seats/auto`, { mode });
      await load();
      if (r?.unslotted) alert(`座位数不足，还有 ${r.unslotted} 名学生留在待入座区`);
    } catch (e) {
      alert(e.message || '智能排座失败');
    } finally { setArranging(false); }
  };

  const savePlan = async () => {
    if (!planName.trim()) return alert('请先填写方案名称，如「期中调整后」');
    if (dirty) await save();          /* 先把当前编辑落库，保证方案与所见一致 */
    try {
      await api.post(`/classes/${classId}/seat-plans`, { name: planName.trim() });
      setPlanName('');
      await loadPlans();
    } catch (e) { alert(e.message || '保存方案失败'); }
  };

  const applyPlan = async (p) => {
    if (!confirm(`应用方案「${p.name}」会覆盖当前座次，继续？`)) return;
    try {
      await api.post(`/seat-plans/${p.id}/apply`);
      await load();
    } catch (e) { alert(e.message || '应用方案失败'); }
  };

  const deletePlan = async (p) => {
    if (!confirm(`删除方案「${p.name}」？`)) return;
    await api.del(`/seat-plans/${p.id}`);
    await loadPlans();
  };

  /* 大屏模式：只读全屏座次图（空置区不渲染，呈现不规则布局原貌） */
  if (bigScreen) return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white p-4 sm:p-6" onClick={() => setBigScreen(false)}>
      <div className="mb-4 text-center text-sm text-ink-secondary">讲台 ↑ · 点击任意处退出大屏</div>
      <div className="flex flex-1 items-center justify-center overflow-auto">
        <div className="grid w-full gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr))`, maxWidth: cols * 128 }}>
          {grid.flatMap((row, r) => row.map((cell, c) => (
            <div key={`${r}-${c}`} className={`flex h-16 items-center justify-center rounded-2xl text-base font-medium sm:h-20 sm:text-lg ${
              cell?.disabled ? 'bg-white'
              : cell ? 'bg-gradient-to-br from-[#0071e3]/10 to-[#00c6ff]/10 text-ink'
              : 'bg-black/[0.03] text-ink-secondary/40'
            }`}>{cell?.disabled ? '' : (cell?.name || '空')}</div>
          )))}
        </div>
      </div>
    </div>
  );

  /* 行两侧悬浮 +/− 控件 */
  const RowCtrl = ({ r, fromRight }) => (
    <div className="flex w-6 shrink-0 flex-col gap-0.5 opacity-60 transition sm:opacity-0 sm:group-hover/row:opacity-100">
      <button title={fromRight ? '删除本行右侧座位' : '删除本行左侧座位'} disabled={!rowCanRemove(r)}
        onClick={() => rowRemoveSeat(r, fromRight)}
        className="btn-pill p-1 text-ink-secondary hover:bg-black/5 hover:text-[#ff3b30] disabled:opacity-25 disabled:hover:text-ink-secondary">
        <Minus size={11} />
      </button>
      <button title={fromRight ? '本行右侧补一个座位' : '本行左侧补一个座位'} disabled={!rowCanAdd(r)}
        onClick={() => rowAddSeat(r, fromRight)}
        className="btn-pill p-1 text-ink-secondary hover:bg-[#0071e3]/10 hover:text-[#0071e3] disabled:opacity-25 disabled:hover:text-ink-secondary">
        <Plus size={11} />
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_240px]">
      <div className="card p-5">
        {/* 工具行 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty || saving}>
            <Save size={15} />{saving ? '保存中…' : dirty ? '保存座次' : '已保存'}
          </Button>
          <Button variant="secondary" onClick={autoFill} title="按学号顺序填座（跳过挖空区）"><LayoutGrid size={15} />顺序编排</Button>
          <div className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 py-1 pl-1 pr-1">
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="rounded-full bg-transparent px-2 py-1 text-xs font-medium text-ink outline-none">
              <option value="random">随机排</option>
              <option value="score">按成绩均衡</option>
              <option value="gender">男女交错</option>
            </select>
            <Button variant="secondary" onClick={autoArrange} disabled={arranging}>
              <Shuffle size={15} />{arranging ? '排座中…' : '智能排'}
            </Button>
          </div>
          <Button variant="secondary" onClick={rotate} title="最后一排移到最前，其余顺移"><RefreshCw size={15} />前后轮换</Button>
          <Button variant="secondary" onClick={() => setBigScreen(true)} title="全屏展示座次"><MonitorPlay size={15} />大屏</Button>
          <div className="ml-auto flex items-center gap-1 text-xs text-ink-secondary">
            行
            <button className="btn-pill p-1 hover:bg-black/5" onClick={() => resize(-1, 0)}><Minus size={13} /></button>
            <b className="w-5 text-center text-ink">{rows}</b>
            <button className="btn-pill p-1 hover:bg-black/5" onClick={() => resize(1, 0)}><Plus size={13} /></button>
            <span className="ml-2">列</span>
            <button className="btn-pill p-1 hover:bg-black/5" onClick={() => resize(0, -1)}><Minus size={13} /></button>
            <b className="w-5 text-center text-ink">{cols}</b>
            <button className="btn-pill p-1 hover:bg-black/5" onClick={() => resize(0, 1)}><Plus size={13} /></button>
          </div>
        </div>

        {/* 讲台提示 */}
        <div className="mx-auto mb-4 w-40 rounded-xl bg-ink/80 py-1.5 text-center text-xs text-white">讲 台</div>

        {/* 座次网格：每行独立包裹，支持行内座位数不同 */}
        <div className="space-y-2 overflow-x-auto pb-1">
          {grid.map((row, r) => (
            <div key={r} className="group/row flex min-w-max items-center">
              <RowCtrl r={r} fromRight={false} />
              <div className="grid flex-1 gap-1.5 px-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(48px, 1fr))` }}>
                {row.map((cell, c) => {
                  const isSel = selected && selected.pool == null && selected.row === r && selected.col === c;
                  const isOver = dragOver && dragOver.row === r && dragOver.col === c;
                  /* 空置格：默认完全隐形（悬停显示虚线框，点击恢复座位） */
                  if (cell?.disabled) return (
                    <div
                      key={`${r}-${c}`}
                      onClick={() => clickCell(r, c)}
                      title="无座位区 · 点击恢复为座位"
                      className="group/dis flex h-14 cursor-pointer items-center justify-center rounded-xl border border-transparent transition hover:border-dashed hover:border-black/25"
                    >
                      <Ban size={12} className="text-ink-secondary/0 transition group-hover/dis:text-ink-secondary/30" />
                    </div>
                  );
                  return (
                    <div
                      key={`${r}-${c}`}
                      draggable={!!cell}
                      onDragStart={cell ? (e) => dragFromCell(r, c, e) : undefined}
                      onDragOver={(e) => { e.preventDefault(); setDragOver({ row: r, col: c }); }}
                      onDragLeave={() => setDragOver(prev => prev?.row === r && prev?.col === c ? null : prev)}
                      onDrop={(e) => dropOnCell(r, c, e)}
                      onClick={() => clickCell(r, c)}
                      className={`group relative flex h-14 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition active:scale-95 ${
                        isSel ? 'border-[#0071e3] bg-[#0071e3]/10 ring-2 ring-[#0071e3]/30'
                        : isOver ? 'border-[#0071e3] bg-[#0071e3]/5 ring-2 ring-[#0071e3]/40'
                        : cell ? 'border-black/5 bg-gradient-to-br from-[#0071e3]/8 to-[#00c6ff]/8 text-ink hover:border-[#0071e3]/40'
                        : 'border-dashed border-black/15 bg-transparent text-ink-secondary/40 hover:border-[#0071e3]/40'
                      }`}
                    >
                      {cell?.name || '空'}
                      {cell && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCell(r, c); }}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-1 text-ink-secondary opacity-70 shadow-md hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100"
                          title="移出座位"
                        ><UserX size={12} /></button>
                      )}
                      {!cell && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markDisabled(r, c); }}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-1 text-ink-secondary opacity-70 shadow-md hover:text-[#ff9500] sm:opacity-0 sm:group-hover:opacity-100"
                          title="此处无座位（挖空）"
                        ><Ban size={12} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
              <RowCtrl r={r} fromRight={true} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          操作：直接<b className="text-ink">拖拽</b>学生到目标座位换位（触屏可点击选中再点击目标）。
          鼠标悬停任意一行，行两侧出现 <Minus size={10} className="inline" />/<Plus size={10} className="inline" /> 可<b className="text-ink">单独增减该行座位数</b>——比如把某行减到只剩 1 个人；
          空格上的 🚫 可挖掉单个座位（讲台边过道），点击隐形空白区可恢复。
        </p>
      </div>

      <div className="h-fit space-y-4">
        {/* 待入座学生（可作为拖拽放置区） */}
        <div
          className="card p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropOnPool}
        >
          <div className="mb-2 text-sm font-medium">待入座 <span className="text-xs text-ink-secondary">({pool.length})</span></div>
          {pool.length ? (
            <div className="flex flex-wrap gap-1.5">
              {pool.map(s => (
                <button
                  key={s.id}
                  draggable
                  onDragStart={(e) => dragFromPool(s.id, e)}
                  onClick={() => clickPool(s.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
                    selected?.pool === s.id ? 'brand-gradient text-white shadow' : 'bg-black/[0.05] text-ink hover:bg-[#0071e3]/10 hover:text-[#0071e3]'
                  }`}
                >{s.name}</button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-secondary">全部学生已入座 ✓</p>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-ink-secondary/70">拖拽座位上的学生到此区域可将其移出座位</p>
        </div>

        {/* 座位方案：多套布局保存与一键切换 */}
        <div className="card p-4">
          <div className="mb-2 text-sm font-medium">座位方案</div>
          <div className="flex gap-1.5">
            <input
              className={`${inputCls} text-xs`}
              placeholder="方案名，如「期中后」"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePlan(); } }}
            />
            <Button variant="secondary" onClick={savePlan} className="shrink-0" title="保存当前座次为方案">
              <Save size={14} />保存
            </Button>
          </div>
          <div className="mt-2 space-y-1.5">
            {plans.length ? plans.map(p => (
              <div key={p.id} className="group flex items-center gap-1 rounded-lg bg-black/[0.03] px-2 py-1.5">
                <button onClick={() => applyPlan(p)} className="min-w-0 flex-1 text-left" title="应用此方案">
                  <div className="truncate text-xs font-medium text-ink">{p.name}</div>
                  <div className="text-[10px] text-ink-secondary">{p.student_count} 人 · {p.created_at?.slice(5, 16)}</div>
                </button>
                <button onClick={() => deletePlan(p)} title="删除方案"
                  className="btn-pill p-1.5 text-ink-secondary opacity-60 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100">
                  <Trash2 size={12} />
                </button>
              </div>
            )) : (
              <p className="text-[10px] text-ink-secondary/70">还没有方案。排好后填个名字保存，随时一键切回。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
