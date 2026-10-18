import { useEffect, useMemo, useState } from 'react';
import { Save, Shuffle, RefreshCw, Plus, Minus, UserX, MonitorPlay, Ban } from 'lucide-react';
import { api } from '../../api.js';
import { Button } from '../../components/ui.jsx';

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

  /* 大屏模式：只读全屏座次图（空置区不渲染，呈现不规则布局原貌） */
  if (bigScreen) return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white p-6" onClick={() => setBigScreen(false)}>
      <div className="mb-4 text-center text-sm text-ink-secondary">讲台 ↑ · 点击任意处退出大屏</div>
      <div className="flex flex-1 items-center justify-center">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {grid.flatMap((row, r) => row.map((cell, c) => (
            <div key={`${r}-${c}`} className={`flex h-20 w-28 items-center justify-center rounded-2xl text-lg font-medium ${
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
    <div className="flex w-5 shrink-0 flex-col gap-0.5 opacity-0 transition group-hover/row:opacity-100">
      <button title={fromRight ? '删除本行右侧座位' : '删除本行左侧座位'} disabled={!rowCanRemove(r)}
        onClick={() => rowRemoveSeat(r, fromRight)}
        className="btn-pill p-0.5 text-ink-secondary hover:bg-black/5 hover:text-[#ff3b30] disabled:opacity-25 disabled:hover:text-ink-secondary">
        <Minus size={11} />
      </button>
      <button title={fromRight ? '本行右侧补一个座位' : '本行左侧补一个座位'} disabled={!rowCanAdd(r)}
        onClick={() => rowAddSeat(r, fromRight)}
        className="btn-pill p-0.5 text-ink-secondary hover:bg-[#0071e3]/10 hover:text-[#0071e3] disabled:opacity-25 disabled:hover:text-ink-secondary">
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
          <Button variant="secondary" onClick={autoFill}><Shuffle size={15} />一键编排</Button>
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
        <div className="space-y-2">
          {grid.map((row, r) => (
            <div key={r} className="group/row flex items-center">
              <RowCtrl r={r} fromRight={false} />
              <div className="grid flex-1 gap-2 px-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
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
                          className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 text-ink-secondary shadow-md hover:text-[#ff3b30] group-hover:block"
                          title="移出座位"
                        ><UserX size={12} /></button>
                      )}
                      {!cell && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markDisabled(r, c); }}
                          className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 text-ink-secondary shadow-md hover:text-[#ff9500] group-hover:block"
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

      {/* 待入座学生（可作为拖拽放置区） */}
      <div
        className="card h-fit p-4"
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
    </div>
  );
}
