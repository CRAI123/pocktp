/** 作息时间工具：由「第 1 节开始 + 每节时长 + 课间」推算每节课的起止时间 */

export const DEFAULT_SLOTS = { periods: 8, start_time: '08:00', class_minutes: 40, break_minutes: 10 };

/** 第 period 节开始时刻（当天 0 点起的分钟数） */
export function periodStartMin(slots, period) {
  const [h, m] = String(slots?.start_time || DEFAULT_SLOTS.start_time).split(':').map(Number);
  const step = Number(slots?.class_minutes ?? DEFAULT_SLOTS.class_minutes) + Number(slots?.break_minutes ?? DEFAULT_SLOTS.break_minutes);
  return (h || 0) * 60 + (m || 0) + (Math.max(1, Number(period) || 1) - 1) * step;
}

export function fmtMin(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 第 period 节的起止：{ start:'08:00', end:'08:40', startMin, endMin } */
export function periodRange(slots, period) {
  const startMin = periodStartMin(slots, period);
  const endMin = startMin + Number(slots?.class_minutes ?? DEFAULT_SLOTS.class_minutes);
  return { start: fmtMin(startMin), end: fmtMin(endMin), startMin, endMin };
}

/** 今天是周几（1=周一 … 7=周日） */
export function todayWeekday(d = new Date()) {
  return ((d.getDay() + 6) % 7) + 1;
}

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const wdLabel = (v) => WEEKDAY_LABELS[(Number(v) || 1) - 1];
