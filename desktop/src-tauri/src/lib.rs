mod auth;
mod desktop;
mod store;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

fn toggle_main(app: &AppHandle, force_show: bool) {
    if let Some(w) = app.get_webview_window("main") {
        if !force_show && w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
}

#[tauri::command]
fn set_locked(app: AppHandle, locked: bool) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("창 없음")?;
    w.set_resizable(!locked).map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn app_ready(app: AppHandle) {
    // 프론트엔드가 설정(모드·잠금)을 적용한 뒤 창을 보여 준다
    toggle_main(&app, true);
}

#[tauri::command]
fn host_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| toggle_main(app, true)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .build(),
        )
        .manage(desktop::DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            store::store_read,
            store::store_write,
            store::token_get,
            store::token_set,
            auth::google_login,
            desktop::set_desktop_mode,
            desktop::set_editing,
            desktop::desktop_status,
            set_locked,
            autostart_get,
            autostart_set,
            app_ready,
            host_name,
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "toggle", "보이기/숨기기", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "설정", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().ok_or("아이콘 없음")?)
                .tooltip("바탕 달력")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "toggle" => toggle_main(app, false),
                    "settings" => {
                        toggle_main(app, true);
                        let _ = app.emit("open-settings", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        toggle_main(tray.app_handle(), false);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("앱 실행 실패");
}
