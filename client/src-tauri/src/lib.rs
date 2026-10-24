use tauri::Manager;
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
    .invoke_handler(tauri::generate_handler![check_update, install_update])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      /* 启动时静默自动更新：后台检查并下载安装，全程无弹窗、不重启，
       * 老师下次自行打开软件即为新版 */
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let updater = match handle.updater() {
          Ok(u) => u,
          Err(_) => return,
        };
        let update = match updater.check().await {
          Ok(Some(u)) => u,
          _ => return,
        };
        let _ = update.download_and_install(|_, _| {}, || {}).await;
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
