use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
struct UpdateInfo {
  version: String,
  notes: String,
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
          if event.state() == ShortcutState::Pressed {
            let _ = app.emit_to("main", "tw-update-check", ());
          }
        })
        .build(),
    )
    .invoke_handler(tauri::generate_handler![check_update, install_update])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

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

      /* 无边框窗口：WebView2 自带的边缘拖拽调整大小 */
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
