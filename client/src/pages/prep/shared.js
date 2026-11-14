/** 语文备考模块共用常量与小工具 */
export const POEM_STATUS = ['未查', '背诵', '默写过关'];
export const MASTER = ['未掌握', '复习中', '已掌握'];
export const MAT_TYPES = ['课本素材', '时事焦点', '哲学思想素材'];
export const READ_SECTIONS = ['信息类阅读', '散文阅读', '小说阅读', '文言文阅读', '古诗阅读', '语言文字运用'];
export const EXAM_SECTIONS = [...READ_SECTIONS, '作文'];
export const VOLUMES = ['必修 上', '必修 下', '选必 上', '选必 中', '选必 下'];
export const GROUPS = ['拓展组', '普通组', '基础组'];

/** 顿号/逗号/空格分隔的姓名 → 数组 */
export function splitNames(s) {
  if (!s) return [];
  return String(s).split(/[、，,\s]+/).map(t => t.trim()).filter(Boolean);
}

/** 学生按班级聚合（姓名为键） */
export function studentClsMap(students) {
  const m = {};
  (students || []).forEach(s => { if (s.name) m[s.name] = s.class_id; });
  return m;
}

/** 未背过/未交名单：按班级汇总人次 */
export function groupByClass(students, rows, { names, classOf }) {
  const smap = studentClsMap(students);
  const groups = {};
  const push = (cid, name) => {
    const key = cid || 'unsorted';
    (groups[key] = groups[key] || []).push(name);
  };
  rows.forEach(r => {
    const cid = classOf(r) || null;
    splitNames(names(r)).forEach(nm => push(cid || smap[nm] || null, nm));
  });
  return Object.entries(groups).map(([cid, names]) => {
    const cnt = {};
    names.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
    return {
      key: cid,
      label: cid === 'unsorted' ? '未分班' : (classesName(students, cid) || '未分班'),
      total: names.length,
      items: Object.entries(cnt).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  });
}

function classesName(students, cid) {
  const s = (students || []).find(x => String(x.class_id) === String(cid));
  return s?.class_name || '';
}

export const todayStr = () => new Date().toLocaleDateString('sv-SE');

/** 相对截止日文案 */
export function dueLabel(date) {
  if (!date) return '未设日期';
  const d = new Date(`${date}T00:00:00`);
  const now = new Date(`${todayStr()}T00:00:00`);
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0) return '今天截止';
  if (diff < 0) return `已逾期 ${-diff} 天`;
  if (diff === 1) return '明天截止';
  return `还有 ${diff} 天`;
}

export const poemTone = { 未查: 'gray', 背诵: 'orange', 默写过关: 'green' };
export const masterTone = { 未掌握: 'red', 复习中: 'orange', 已掌握: 'green' };
export const groupTone = { 拓展组: 'green', 普通组: 'gray', 基础组: 'red' };
