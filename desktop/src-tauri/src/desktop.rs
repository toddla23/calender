//! 바탕화면에 붙는 동작.
//! - "desktop": 바탕화면 아이콘 레이어(SHELLDLL_DefView 를 담은 Progman/WorkerW)의 자식 창으로 붙인다.
//!   Win+D(바탕화면 보기)에도 사라지지 않는다. 키보드 입력은 편집하는 동안만 잠시 떼어 내서 받는다.
//! - "bottom": 일반 창이지만 항상 다른 창보다 아래 (WorkerW 부착이 실패하면 자동으로 이 모드)
//! - "normal": 일반 창
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    Desktop,
    Bottom,
    Normal,
}

pub struct DesktopState {
    pub mode: Mutex<Mode>,
    pub attached: Mutex<bool>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self { mode: Mutex::new(Mode::Bottom), attached: Mutex::new(false) }
    }
}

#[cfg(windows)]
mod win {
    use windows::core::{w, BOOL};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::ScreenToClient;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe extern "system" fn find_defview_host(h: HWND, lp: LPARAM) -> BOOL {
        if FindWindowExW(Some(h), None, w!("SHELLDLL_DefView"), None).is_ok() {
            *(lp.0 as *mut HWND) = h;
            return BOOL(0);
        }
        BOOL(1)
    }

    /// 바탕화면 아이콘(SHELLDLL_DefView)을 담고 있는 창을 찾는다.
    /// 보통 Progman, 배경 슬라이드쇼 등을 쓰면 WorkerW 일 수 있다.
    pub fn desktop_host() -> Option<HWND> {
        unsafe {
            let progman = FindWindowW(w!("Progman"), None).ok()?;
            if FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), None).is_ok() {
                return Some(progman);
            }
            let mut found = HWND::default();
            let _ = EnumWindows(Some(find_defview_host), LPARAM(&mut found as *mut HWND as isize));
            if found.is_invalid() {
                None
            } else {
                Some(found)
            }
        }
    }

    pub fn attach(hwnd: HWND) -> Result<(), String> {
        unsafe {
            let host = desktop_host().ok_or("바탕화면 창을 찾지 못했습니다")?;
            let mut r = RECT::default();
            GetWindowRect(hwnd, &mut r).map_err(|e| e.to_string())?;
            SetParent(hwnd, Some(host)).map_err(|e| e.to_string())?;
            let mut pt = POINT { x: r.left, y: r.top };
            let _ = ScreenToClient(host, &mut pt);
            // 아이콘 레이어(SHELLDLL_DefView)보다 위에 오도록 형제 창 중 맨 위
            SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                pt.x,
                pt.y,
                r.right - r.left,
                r.bottom - r.top,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        }
    }

    pub fn detach(hwnd: HWND) -> Result<(), String> {
        unsafe {
            let mut r = RECT::default();
            GetWindowRect(hwnd, &mut r).map_err(|e| e.to_string())?;
            SetParent(hwnd, None).map_err(|e| e.to_string())?;
            SetWindowPos(hwnd, None, r.left, r.top, r.right - r.left, r.bottom - r.top, SWP_NOZORDER | SWP_NOACTIVATE)
                .map_err(|e| e.to_string())?;
            Ok(())
        }
    }

    pub fn parent_is_desktop(hwnd: HWND) -> bool {
        unsafe {
            // WS_CHILD 스타일 없이 SetParent 하면 GetParent 는 0 을 돌려주므로 GetAncestor 로 확인
            match desktop_host() {
                Some(h) => GetAncestor(hwnd, GA_PARENT) == h,
                None => false,
            }
        }
    }

    pub fn focus(hwnd: HWND) {
        unsafe {
            let _ = SetForegroundWindow(hwnd);
        }
    }

    pub fn send_to_bottom(hwnd: HWND) {
        unsafe {
            let _ = SetWindowPos(hwnd, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

pub fn parse_mode(s: &str) -> Mode {
    match s {
        "desktop" => Mode::Desktop,
        "normal" => Mode::Normal,
        _ => Mode::Bottom,
    }
}

/// 모드를 적용하고 실제로 적용된 모드를 돌려준다 (desktop 실패 시 bottom)
pub fn apply(win: &WebviewWindow, mode: Mode) -> Mode {
    let st = win.state::<DesktopState>();
    #[cfg(windows)]
    {
        let hwnd = match win.hwnd() {
            Ok(h) => windows::Win32::Foundation::HWND(h.0 as _),
            Err(_) => return Mode::Normal,
        };
        let mut attached = st.attached.lock().unwrap();
        if *attached && mode != Mode::Desktop {
            let _ = win::detach(hwnd);
            *attached = false;
        }
        let applied = match mode {
            Mode::Desktop => {
                let _ = win.set_always_on_bottom(false);
                if *attached || win::attach(hwnd).is_ok() {
                    *attached = true;
                    Mode::Desktop
                } else {
                    let _ = win.set_always_on_bottom(true);
                    win::send_to_bottom(hwnd);
                    Mode::Bottom
                }
            }
            Mode::Bottom => {
                let _ = win.set_always_on_bottom(true);
                win::send_to_bottom(hwnd);
                Mode::Bottom
            }
            Mode::Normal => {
                let _ = win.set_always_on_bottom(false);
                Mode::Normal
            }
        };
        *st.mode.lock().unwrap() = applied;
        applied
    }
    #[cfg(not(windows))]
    {
        let _ = win.set_always_on_bottom(mode != Mode::Normal);
        *st.mode.lock().unwrap() = mode;
        mode
    }
}

#[tauri::command]
pub fn set_desktop_mode(app: AppHandle, mode: String) -> Result<String, String> {
    let win = app.get_webview_window("main").ok_or("창 없음")?;
    let applied = apply(&win, parse_mode(&mode));
    Ok(match applied {
        Mode::Desktop => "desktop",
        Mode::Bottom => "bottom",
        Mode::Normal => "normal",
    }
    .into())
}

/// 편집을 시작하면 바탕화면에서 잠시 떼어 내 키보드 입력을 받고, 끝나면 다시 붙인다.
#[tauri::command]
pub fn set_editing(app: AppHandle, editing: bool) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("창 없음")?;
    let st = win.state::<DesktopState>();
    let mode = *st.mode.lock().unwrap();
    #[cfg(windows)]
    {
        let hwnd = windows::Win32::Foundation::HWND(win.hwnd().map_err(|e| e.to_string())?.0 as _);
        if mode == Mode::Desktop {
            let mut attached = st.attached.lock().unwrap();
            if editing && *attached {
                win::detach(hwnd)?;
                *attached = false;
                win::focus(hwnd);
            } else if !editing && !*attached {
                win::attach(hwnd)?;
                *attached = true;
            }
        } else if editing {
            win::focus(hwnd);
        } else if mode == Mode::Bottom {
            win::send_to_bottom(hwnd);
        }
    }
    #[cfg(not(windows))]
    let _ = (editing, mode);
    Ok(())
}

/// 진단용: 현재 창이 바탕화면에 붙어 있는지
#[tauri::command]
pub fn desktop_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let win = app.get_webview_window("main").ok_or("창 없음")?;
    let st = win.state::<DesktopState>();
    let mode = *st.mode.lock().unwrap();
    #[cfg(windows)]
    let parent_ok = {
        let hwnd = windows::Win32::Foundation::HWND(win.hwnd().map_err(|e| e.to_string())?.0 as _);
        win::parent_is_desktop(hwnd)
    };
    #[cfg(not(windows))]
    let parent_ok = false;
    Ok(serde_json::json!({ "mode": format!("{mode:?}"), "attachedToDesktop": parent_ok }))
}
