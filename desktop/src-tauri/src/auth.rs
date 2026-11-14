//! Google 로그인: 시스템 브라우저로 서버의 로그인 페이지를 열고,
//! 서버가 http://127.0.0.1:<port>/callback?code=... 로 돌려보내면 code 를 받는다.
//! code 는 PKCE verifier 가 있어야만 토큰으로 바꿀 수 있다 (교환은 프론트엔드에서).
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri_plugin_opener::OpenerExt;

fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn url_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

const DONE_HTML: &str = "<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><title>로그인 완료</title><body style=\"font-family:system-ui;padding:40px\"><h2>로그인 완료</h2><p>이 창을 닫고 바탕 달력으로 돌아가세요.</p></body></html>";

#[tauri::command]
pub async fn google_login(app: tauri::AppHandle, server: String, challenge: String, name: String) -> Result<String, String> {
    if !(server.starts_with("https://") || server.starts_with("http://127.0.0.1") || server.starts_with("http://localhost")) {
        return Err("서버 주소는 https:// 로 시작해야 합니다".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let url = format!(
        "{}/auth/google/start?client=desktop&port={}&challenge={}&name={}",
        server.trim_end_matches('/'),
        port,
        url_encode(&challenge),
        url_encode(&name)
    );
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(300);
        loop {
            if Instant::now() > deadline {
                return Err("로그인 시간이 초과됐습니다".to_string());
            }
            let (mut stream, _) = match listener.accept() {
                Ok(s) => s,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            };
            stream.set_nonblocking(false).ok();
            stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
            let mut line = String::new();
            if BufReader::new(&stream).read_line(&mut line).is_err() {
                continue;
            }
            // "GET /callback?code=... HTTP/1.1"
            let path = line.split_whitespace().nth(1).unwrap_or("");
            if !path.starts_with("/callback?") {
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                continue;
            }
            let code = path["/callback?".len()..]
                .split('&')
                .find_map(|kv| kv.strip_prefix("code="))
                .map(url_decode);
            let body = DONE_HTML.as_bytes();
            let _ = stream.write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .as_bytes(),
            );
            let _ = stream.write_all(body);
            return code.ok_or_else(|| "로그인 코드가 없습니다".to_string());
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
