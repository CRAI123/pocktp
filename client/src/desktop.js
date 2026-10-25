/** 桌面端能力封装：托盘/通知/多窗口/自启/静默打印。
 *  网页端所有函数均为安全空操作——浏览器里调用不会报错，只是什么都不做。
 */
import html2canvas from 'html2canvas';

/* 桌面端识别：壳加载 /?desktop=1，持久化到 localStorage；桌面端隐藏「下载桌面版」入口 */
export function isDesktopApp() {
  try {
    if (new URLSearchParams(window.location.search).get('desktop') === '1') {
      localStorage.setItem('tw_desktop', '1');
    }
    return localStorage.getItem('tw_desktop') === '1';
  } catch {
    return false;
  }
}

const invoke = (cmd, args) => {
  const t = window.__TAURI__;
  if (!t?.core?.invoke) return Promise.reject(new Error('当前不在桌面端'));
  return t.core.invoke(cmd, args);
};

/* ---------------- 系统通知 ---------------- */
export function notifyDone(title, body) {
  if (!isDesktopApp()) return;
  if (localStorage.getItem('tw_notify') === '0') return;
  invoke('native_notify', { title, body }).catch(() => {});
}

/* ---------------- 多窗口 ---------------- */
/** 打开课堂小助手独立窗口；split=true 时与主窗口左右分屏 */
export function openClassroomWindow(split = false) {
  if (!isDesktopApp()) return Promise.reject(new Error('仅桌面版支持独立投屏窗口'));
  return invoke('open_classroom_window', { split });
}

/* ---------------- 开机自启 / 关闭到托盘 ---------------- */
export async function getAutostart() {
  if (!isDesktopApp()) return false;
  try { return await invoke('autostart_status'); } catch { return false; }
}

export async function setAutostart(enabled) {
  if (!isDesktopApp()) return false;
  try { return await invoke('set_autostart', { enabled }); } catch { return false; }
}

export function syncCloseToTray(enabled) {
  if (!isDesktopApp()) return;
  invoke('set_close_to_tray', { enabled }).catch(() => {});
}

/* ---------------- 静默打印（直出默认打印机） ---------------- */
const A4_W = 794;   // 96dpi 下 A4 宽
const PAD = 56;     // 约 15mm 页边距

function cropCanvas(src, y, h) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, h);
  ctx.drawImage(src, 0, y, src.width, h, 0, 0, src.width, h);
  return c;
}

/* 在页尾附近向上找一行全白像素，把分页切在空白处，避免截断文字 */
function findBlankCut(ctx, canvas, from, to) {
  const span = to - from;
  const start = Math.max(from + Math.floor(span * 0.6), to - Math.floor(span * 0.25));
  const h = to - start;
  if (h <= 0) return to;
  const data = ctx.getImageData(0, start, canvas.width, h).data;
  const rowBytes = canvas.width * 4;
  for (let r = h - 1; r >= 0; r--) {
    let blank = true;
    for (let x = 0; x < canvas.width; x += 4) {
      const i = r * rowBytes + x * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) { blank = false; break; }
    }
    if (blank) return start + r;
  }
  return to;
}

/* 把一个超高的渲染结果按 A4 比例切片 */
function sliceToPages(canvas) {
  const pageH = Math.round(canvas.width * (1123 / 794));
  if (canvas.height <= pageH * 1.02) return [canvas];
  const ctx = canvas.getContext('2d');
  const pages = [];
  let y = 0;
  while (y < canvas.height - 4) {
    let end = Math.min(y + pageH, canvas.height);
    if (end < canvas.height) {
      const cut = findBlankCut(ctx, canvas, y, end);
      end = cut > y + pageH * 0.5 ? cut : end;
    }
    pages.push(cropCanvas(canvas, y, end - y));
    y = end;
  }
  return pages;
}

/** 把指定打印元素渲染成 A4 页面图片，直接发送到默认打印机（不弹预览对话框）。
 *  elements 需为可见的打印视图节点（如 .exam-page / .print-sheet）。 */
export async function printSheets(elements) {
  if (!isDesktopApp()) throw new Error('一键打印仅桌面版支持，网页版请使用浏览器打印');
  const els = (elements || []).filter(Boolean);
  if (!els.length) throw new Error('没有可打印的内容');

  const root = document.documentElement;
  const prevZoom = root.style.zoom;
  root.style.zoom = '1';

  /* 打印视图默认 display:none，截图前临时展开 */
  const printOnly = [...document.querySelectorAll('.print-only')];
  const prevDisplay = printOnly.map(el => el.style.display);
  printOnly.forEach(el => { el.style.display = 'block'; });

  const prevStyle = els.map(el => ({
    width: el.style.width,
    minHeight: el.style.minHeight,
    padding: el.style.padding,
    boxSizing: el.style.boxSizing,
  }));
  els.forEach(el => {
    el.style.width = `${A4_W}px`;
    el.style.minHeight = '1123px';
    el.style.padding = `${PAD}px`;
    el.style.boxSizing = 'border-box';
  });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const images = [];
  try {
    for (const el of els) {
      const canvas = await html2canvas(el, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
      });
      sliceToPages(canvas).forEach(c => images.push(c.toDataURL('image/jpeg', 0.92)));
    }
  } finally {
    printOnly.forEach((el, i) => { el.style.display = prevDisplay[i] || ''; });
    els.forEach((el, i) => {
      const p = prevStyle[i];
      el.style.width = p.width;
      el.style.minHeight = p.minHeight;
      el.style.padding = p.padding;
      el.style.boxSizing = p.boxSizing;
    });
    root.style.zoom = prevZoom;
  }

  return invoke('print_images', { images });
}
