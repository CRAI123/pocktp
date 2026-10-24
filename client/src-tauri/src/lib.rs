use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      /* 静默自动更新：后台检查并下载安装壳更新，全程无弹窗、不重启、不打扰。
       * 安装包写入后不影响当前运行，老师下次自行打开软件即为新版。 */
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
