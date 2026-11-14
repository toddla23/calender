//! 로컬 캐시·오프라인 큐·설정 파일 저장소, DPAPI 로 암호화한 로그인 토큰.
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ALLOWED: &[&str] = &["cache", "queue", "holidays", "settings"];

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 임시 파일에 쓰고 fsync 후 rename 해서, 쓰는 도중 꺼져도 이전 내용이 깨지지 않게 한다.
fn atomic_write(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn check_name(name: &str) -> Result<(), String> {
    if ALLOWED.contains(&name) {
        Ok(())
    } else {
        Err("허용되지 않은 이름".into())
    }
}

#[tauri::command]
pub fn store_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    check_name(&name)?;
    let p = data_dir(&app)?.join(format!("{name}.json"));
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn store_write(app: AppHandle, name: String, data: String) -> Result<(), String> {
    check_name(&name)?;
    let p = data_dir(&app)?.join(format!("{name}.json"));
    atomic_write(&p, data.as_bytes())
}

#[cfg(windows)]
mod dpapi {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    unsafe fn take(blob: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(blob.pbData as _)));
        v
    }

    /// 현재 Windows 사용자만 풀 수 있게 암호화
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
                .map_err(|e| e.to_string())?;
            Ok(take(out))
        }
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
                .map_err(|e| e.to_string())?;
            Ok(take(out))
        }
    }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn protect(d: &[u8]) -> Result<Vec<u8>, String> {
        Ok(d.to_vec())
    }
    pub fn unprotect(d: &[u8]) -> Result<Vec<u8>, String> {
        Ok(d.to_vec())
    }
}

#[tauri::command]
pub fn token_get(app: AppHandle) -> Result<Option<String>, String> {
    let p = data_dir(&app)?.join("token.bin");
    let enc = match fs::read(&p) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    match dpapi::unprotect(&enc) {
        Ok(v) => Ok(String::from_utf8(v).ok()),
        Err(_) => Ok(None), // 다른 사용자/PC 에서 복사된 파일 등
    }
}

#[tauri::command]
pub fn token_set(app: AppHandle, token: Option<String>) -> Result<(), String> {
    let p = data_dir(&app)?.join("token.bin");
    match token {
        Some(t) => atomic_write(&p, &dpapi::protect(t.as_bytes())?),
        None => match fs::remove_file(&p) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}
