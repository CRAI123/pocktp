use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
struct UpdateInfo {
  version: String,
  notes: String,
}

/* 桌面端本地状态：仅管「关闭到托盘」这类壳行为，业务数据全部在网站服务端 */
#[derive(Default)]
struct DesktopState {
  close_to_tray: Mutex<bool>,
  tray_hint_shown: AtomicBool,
}

/* ---------- 应用内更新 ---------- */
/* 手动检查更新（网页按 F5 触发）：返回是否有新版本，不弹任何原生框 */
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
  let updater = app.updater().map_err(|e| e.to_string())?;
  match updater.check().await {
    Ok(Some(update)) => Ok(Some(UpdateInfo {
      version: update.version.clone(),
      notes: update.body.clone().unwrap_or_default(),
    })),
    Ok(None) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

/* 立即更新：重新检查、下载校验并安装，完成后自动重启 */
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
  let updater = app.updater().map_err(|e| e.to_string())?;
  let update = match updater.check().await {
    Ok(Some(u)) => u,
    Ok(None) => return Err("当前已是最新版本".into()),
    Err(e) => return Err(e.to_string()),
  };
  update
    .download_and_install(|_, _| {}, || {})
    .await
    .map_err(|e| e.to_string())?;
  app.restart();
}

/* ---------- 桌面设置 ---------- */
/* 关闭窗口行为：网页启动时把用户偏好（localStorage）同步过来 */
#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, DesktopState>, enabled: bool) {
  if let Ok(mut v) = state.close_to_tray.lock() {
    *v = enabled;
  }
}

/* 开机自启：读写系统注册表，状态以系统为准 */
#[tauri::command]
fn autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
  use tauri_plugin_autostart::ManagerExt;
  app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
  use tauri_plugin_autostart::ManagerExt;
  let al = app.autolaunch();
  if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
  al.is_enabled().map_err(|e| e.to_string())
}

/* 原生系统通知：AI 出卷/周报生成完成后由网页调用 */
#[tauri::command]
fn native_notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
  use tauri_plugin_notification::NotificationExt;
  app
    .notification()
    .builder()
    .title(title)
    .body(body)
    .show()
    .map_err(|e| e.to_string())
}

/* ---------- 多窗口 ---------- */
/* 站点地址取自主窗口当前 URL，开发环境自动落在 localhost:5173 */
fn app_origin(app: &tauri::AppHandle) -> String {
  if let Some(w) = app.get_webview_window("main") {
    if let Ok(u) = w.url() {
      let mut s = format!("{}://{}", u.scheme(), u.host_str().unwrap_or("teach.rayzo.cn"));
      if let Some(p) = u.port() {
        s.push_str(&format!(":{}", p));
      }
      return s;
    }
  }
  "https://teach.rayzo.cn".to_string()
}

fn focus_main(app: &tauri::AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

/* 课堂小助手独立窗口：split=true 时主窗口与小助手左右各占一半屏幕 */
#[tauri::command]
fn open_classroom_window(app: tauri::AppHandle, split: Option<bool>) -> Result<(), String> {
  let label = "classroom";
  let win = match app.get_webview_window(label) {
    Some(w) => {
      let _ = w.unminimize();
      let _ = w.show();
      let _ = w.set_focus();
      w
    }
    None => {
      let url = format!("{}/classroom?desktop=1&monitor=1", app_origin(&app));
      let parsed = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
      tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(parsed))
        .title("课堂小助手")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?
    }
  };

  if split.unwrap_or(false) {
    if let Ok(Some(mon)) = app.primary_monitor() {
      let scale = mon.scale_factor();
      let size = mon.size();
      let pos = mon.position();
      let w = size.width as f64 / scale;
      let h = size.height as f64 / scale;
      let ox = pos.x as f64 / scale;
      let oy = pos.y as f64 / scale;
      let half = (w / 2.0).floor();
      if let Some(main) = app.get_webview_window("main") {
        let _ = main.unmaximize();
        let _ = main.set_position(tauri::LogicalPosition::new(ox, oy));
        let _ = main.set_size(tauri::LogicalSize::new(half, h));
      }
      let _ = win.unmaximize();
      let _ = win.set_position(tauri::LogicalPosition::new(ox + half, oy));
      let _ = win.set_size(tauri::LogicalSize::new(half, h));
    }
  }
  Ok(())
}

/* ---------- 静默打印：直出默认打印机（不弹预览） ----------
 * 前端把每一页渲染成 JPEG（base64），这里落盘后交给 Windows 打印子系统逐页输出 */
#[tauri::command]
async fn print_images(images: Vec<String>) -> Result<String, String> {
  if images.is_empty() {
    return Err("没有可打印的内容".into());
  }
  tauri::async_runtime::spawn_blocking(move || do_print(images))
    .await
    .map_err(|e| e.to_string())?
}

fn do_print(images: Vec<String>) -> Result<String, String> {
  use base64::Engine as _;

  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  let dir = std::env::temp_dir().join(format!("tw-print-{}", stamp));
  std::fs::create_dir_all(&dir).map_err(|e| format!("创建临时目录失败：{}", e))?;

  let mut files: Vec<std::path::PathBuf> = Vec::new();
  for (i, raw) in images.iter().enumerate() {
    /* 兼容 dataURL（data:image/jpeg;base64,xxx）与纯 base64 */
    let b64 = raw.split(',').next_back().unwrap_or(raw).trim();
    let bytes = base64::engine::general_purpose::STANDARD
      .decode(b64)
      .map_err(|e| format!("第 {} 页图像解码失败：{}", i + 1, e))?;
    let p = dir.join(format!("page-{:02}.jpg", i + 1));
    std::fs::write(&p, bytes).map_err(|e| format!("写入临时文件失败：{}", e))?;
    files.push(p);
  }

  let list = files
    .iter()
    .map(|p| format!("'{}'", p.to_string_lossy().replace('\'', "''")))
    .collect::<Vec<_>>()
    .join(", ");

  let script = format!(
    r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = '教师工作台'
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(40, 40, 40, 40)
$script:files = @({list})
$script:i = 0
$doc.add_PrintPage({{
  param($s, $e)
  $img = [System.Drawing.Image]::FromFile($script:files[$script:i])
  $m = $e.MarginBounds
  $ratio = [Math]::Min(($m.Width / $img.Width), ($m.Height / $img.Height))
  $dw = [int]($img.Width * $ratio)
  $dh = [int]($img.Height * $ratio)
  $dx = $m.X + [int](($m.Width - $dw) / 2)
  $dy = $m.Y + [int](($m.Height - $dh) / 2)
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $e.Graphics.DrawImage($img, $dx, $dy, $dw, $dh)
  $img.Dispose()
  $script:i++
  $e.HasMorePages = ($script:i -lt $script:files.Count)
}})
$doc.Print()
$doc.Dispose()
Write-Output 'OK'
"#,
    list = list
  );

  let script_path = dir.join("print.ps1");
  let mut buf: Vec<u8> = vec![0xEF, 0xBB, 0xBF]; /* UTF-8 BOM，保证中文路径不乱码 */
  buf.extend_from_slice(script.as_bytes());
  std::fs::write(&script_path, buf).map_err(|e| format!("写入打印脚本失败：{}", e))?;

  let output = std::process::Command::new("powershell")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
    ])
    .arg(&script_path)
    .output()
    .map_err(|e| format!("无法调用系统打印服务：{}", e))?;

  let _ = std::fs::remove_dir_all(&dir);

  if !output.status.success() {
    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let msg = if err.is_empty() { "打印失败：请检查打印机是否在线".to_string() } else { format!("打印失败：{}", err) };
    return Err(msg);
  }
  Ok(format!("已发送 {} 页到默认打印机", images.len()))
}

/* 用系统默认浏览器打开外部链接（浏览器快捷登录用）：仅允许本站域名 */
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
  let allowed = [
    "https://teach.rayzo.cn/",
    "https://rayzo.cn/",
    "http://localhost:5173/",
  ]
  .iter()
  .any(|p| url.starts_with(p));
  if !allowed {
    return Err("不支持的链接".into());
  }
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("cmd")
      .args(["/C", "start", "", &url])
      .creation_flags(0x08000000) /* CREATE_NO_WINDOW，避免闪黑框 */
      .spawn()
      .map_err(|e| format!("打开浏览器失败：{}", e))?;
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ))
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
          if event.state() == ShortcutState::Pressed {
            let _ = app.emit_to("main", "tw-update-check", ());
          }
        })
        .build(),
    )
    .manage(DesktopState::default())
    .invoke_handler(tauri::generate_handler![
      check_update,
      install_update,
      set_close_to_tray,
      autostart_status,
      set_autostart,
      native_notify,
      open_classroom_window,
      print_images,
      open_url
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      /* ---- 系统托盘：常驻图标 + 右键菜单，左键唤起主窗口 ---- */
      let show_i = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
      let classroom_i = MenuItem::with_id(app, "classroom", "课堂小助手（投屏）", true, None::<&str>)?;
      let update_i = MenuItem::with_id(app, "update", "检查更新", true, None::<&str>)?;
      let quit_i = MenuItem::with_id(app, "quit", "退出教师工作台", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &classroom_i, &update_i, &quit_i])?;

      let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("缺少应用图标，无法创建托盘")?;

      TrayIconBuilder::with_id("tw-tray")
        .icon(icon)
        .tooltip("教师工作台")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
          "show" => focus_main(app),
          "classroom" => {
            let _ = open_classroom_window(app.clone(), Some(false));
          }
          "update" => {
            focus_main(app);
            let _ = app.emit_to("main", "tw-update-check", ());
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = ev
          {
            focus_main(tray.app_handle());
          }
        })
        .build(app)?;

      /* F5 由系统热键接管（WebView2 会自己吃掉 F5 做刷新），
       * 仅窗口聚焦时注册，失焦注销；按下后通知网页弹出应用内更新弹窗 */
      if let Some(win) = app.get_webview_window("main") {
        let handle = app.handle().clone();
        let _ = handle.global_shortcut().register("F5");
        win.on_window_event(move |event| match event {
          tauri::WindowEvent::Focused(true) => {
            let _ = handle.global_shortcut().register("F5");
          }
          tauri::WindowEvent::Focused(false) => {
            let _ = handle.global_shortcut().unregister("F5");
          }
          _ => {}
        });
      }

      /* 关闭行为：默认直接退出（干净）；用户开启「最小化到托盘」后隐藏窗口并首次提示 */
      if let Some(win) = app.get_webview_window("main") {
        let state_handle = app.handle().clone();
        let win2 = win.clone();
        win.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let st = state_handle.state::<DesktopState>();
            let to_tray = st.close_to_tray.lock().map(|v| *v).unwrap_or(false);
            if to_tray {
              api.prevent_close();
              let _ = win2.hide();
              if !st.tray_hint_shown.swap(true, Ordering::Relaxed) {
                use tauri_plugin_notification::NotificationExt;
                let _ = state_handle
                  .notification()
                  .builder()
                  .title("教师工作台仍在后台运行")
                  .body("已最小化到系统托盘，点击托盘图标可恢复窗口")
                  .show();
              }
            }
          }
        });
      }

      /* 启动更新检查：只静默「检查」，发现新版本后发事件让网页弹确认框，
       * 由老师点「立即更新」才下载安装——不做任何静默下载/静默安装 */
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        /* 等网页加载完成并注册好事件监听再发，避免事件丢失 */
        tauri::async_runtime::spawn(async move {
          std::thread::sleep(std::time::Duration::from_secs(4));
        })
        .await
        .ok();
        let updater = match handle.updater() {
          Ok(u) => u,
          Err(_) => return,
        };
        match updater.check().await {
          Ok(Some(_)) => {
            let _ = handle.emit_to("main", "tw-update-check", ());
          }
          _ => {}
        }
      });

      if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
