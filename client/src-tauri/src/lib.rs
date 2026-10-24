use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/* F5 手动检查更新（网页层捕获按键后 invoke 此命令）：有更新必弹窗确认 */
#[tauri::command]
async fn manual_update_check(app: tauri::AppHandle) {
  let updater = match app.updater() { Ok(u) => u, Err(_) => return };
  match updater.check().await {
    Ok(Some(update)) => {
      let body = update.body.as_deref().unwrap_or("体验优化与问题修复");
      let yes = app
        .dialog()
        .message(format!("发现新版本 v{}\n\n{}\n\n是否立即更新？", update.version, body))
        .title("教师工作台 · 软件更新")
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show();
      if !yes { return; }
      if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
        app.dialog().message("更新完成，点击确定重启应用。").title("教师工作台 · 软件更新").blocking_show();
        app.restart();
      } else {
        app.dialog().message("更新失败，请检查网络后重试。").title("教师工作台 · 软件更新").blocking_show();
      }
    }
    Ok(None) => {
      app.dialog().message("当前已是最新版本。").title("教师工作台 · 软件更新").blocking_show();
    }
    Err(_) => {
      app.dialog().message("检查更新失败，请检查网络连接。").title("教师工作台 · 软件更新").blocking_show();
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![manual_update_check])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      /* 启动时静默自动更新：后台检查并下载安装，全程无弹窗、不重启、不打扰，
       * 老师下次自行打开软件即为新版 */
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let updater = match handle.updater() { Ok(u) => u, Err(_) => return };
        let update = match updater.check().await { Ok(Some(u)) => u, _ => return };
        let _ = update.download_and_install(|_, _| {}, || {}).await;
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
