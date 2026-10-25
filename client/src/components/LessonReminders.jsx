/** 上课提醒：教师课表中「我的课」在开课前 10 分钟 / 5 分钟提醒。
 *  - 网页端：应用内悬浮提醒 + 已授权时发浏览器通知
 *  - 桌面端：应用内提醒 + 系统原生通知（跟随「完成提醒」开关）
 *  仅在应用打开时生效；静默分钟数按「作息时间」推算。
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import { api } from '../api.js';
import { isDesktopApp, notifyDone } from '../desktop.js';
import { periodRange, todayWeekday, wdLabel } from '../timetable.js';

const THRESHOLDS = [10, 5];
const ENABLED_KEY = 'tw_class_remind';

export function classRemindEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== '0'; } catch { return true; }
}
export function setClassRemindEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch {}
}

function localDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* 清理非今天的提醒去重标记，避免 localStorage 堆积 */
function pruneKeys(today) {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('tw_remind:') && !k.startsWith(`tw_remind:${today}:`)) stale.push(k);
    }
    stale.forEach(k => localStorage.removeItem(k));
  } catch {}
}

export default function LessonReminders() {
  const dataRef = useRef({ rows: [], slots: null });
  const [toasts, setToasts] = useState([]);

  /* 加载「我的课」与作息时间；每 10 分钟刷新，切回页面时也刷新 */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [rows, slots] = await Promise.all([
          api.get('/timetables?mine=1'),
          api.get('/timetable-settings'),
        ]);
        if (alive) dataRef.current = { rows: Array.isArray(rows) ? rows : [], slots };
      } catch { /* 静默：接口异常不打扰用户 */ }
    };
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, []);

  /* 每 20 秒检查一次：进入开课前 10 / 5 分钟窗口即提醒，同日同课同档只提醒一次 */
  useEffect(() => {
    pruneKeys(localDate());
    const tick = () => {
      if (!classRemindEnabled()) return;
      const { rows, slots } = dataRef.current;
      if (!rows.length || !slots) return;
      const now = new Date();
      const wd = todayWeekday(now);
      const today = localDate(now);
      const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

      for (const r of rows) {
        if (Number(r.weekday) !== wd) continue;
        const range = periodRange(slots, Number(r.period));
        if (range.startMin == null) continue; /* 该节次未设置作息时间，不提醒 */
        const diff = range.startMin - nowMin;
        for (const k of THRESHOLDS) {
          /* 1 分钟窗口：20 秒轮询至少能命中 3 次，配合去重不会重复提醒 */
          if (diff <= k + 0.25 && diff > k - 1) {
            const key = `tw_remind:${today}:${r.id}:${k}`;
            try {
              if (localStorage.getItem(key)) continue;
              localStorage.setItem(key, '1');
            } catch { continue; }
            const title = `${k} 分钟后上课：${r.subject}`;
            const body = `${r.class_name || ''} · ${wdLabel(r.weekday)}第 ${r.period} 节 ${range.start}-${range.end}${r.note ? ` · ${r.note}` : ''}`;
            if (isDesktopApp()) {
              notifyDone(title, body);
            } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try { new Notification(title, { body, icon: '/rayzo-logo.png', tag: key }); } catch {}
            }
            setToasts(list => [...list, { id: key, title, body }]);
            setTimeout(() => setToasts(list => list.filter(t => t.id !== key)), 90000);
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed right-3 top-20 z-[80] w-[min(92vw,360px)] space-y-2 sm:right-6">
      {toasts.map(t => (
        <div key={t.id} className="card overflow-hidden border border-[#0071e3]/20 p-4 shadow-[0_16px_40px_-16px_rgba(0,113,227,0.45)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0071e3]/10 text-[#0071e3]">
              <BellRing size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              <div className="mt-0.5 break-words text-xs leading-relaxed text-ink-secondary">{t.body}</div>
              <Link to="/timetable" className="mt-2 inline-block text-xs font-medium text-[#0071e3] hover:underline">
                查看课程表
              </Link>
            </div>
            <button aria-label="关闭提醒" title="关闭" onClick={() => setToasts(list => list.filter(x => x.id !== t.id))}
              className="rounded-lg p-1 text-ink-secondary transition hover:bg-black/5">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
