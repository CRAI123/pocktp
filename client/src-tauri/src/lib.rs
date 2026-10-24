use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      /* 启动后静默检查「壳」更新：软件功能随网站实时更新，此处仅原生壳升级。
       * 有新版本时弹系统原生对话框，确认后自动下载安装并重启。全部在壳侧完成，网站零改动。 */
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let updater = match handle.updater() { Ok(u) => u, Err(_) => return };
        let update = match updater.check().await { Ok(Some(u)) => u, _ => return };
        let body = update.body.as_deref().unwrap_or("体验优化与问题修复");
        let yes = handle
          .dialog()
          .message(format!("发现新版本 v{}\n\n{}\n\n是否立即更新？（约 3MB，几秒完成）", update.version, body))
          .title("教师工作台 · 软件更新")
          .buttons(MessageDialogButtons::YesNo)
          .blocking_show();
        if !yes { return; }
        if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
          handle
            .dialog()
            .message("更新完成，点击确定重启应用。")
            .title("教师工作台 · 软件更新")
            .blocking_show();
          handle.restart();
        }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
