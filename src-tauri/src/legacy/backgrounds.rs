//! `backgrounds` — extracted from legacy/mod.rs lines 16570–16846
use super::*;

#[tauri::command]
pub fn get_backgrounds() -> Result<Vec<String>, String> {
    let base_dir = backgrounds_base_dir()?;

    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut bgs = Vec::new();
    let entries =
        std::fs::read_dir(base_dir).map_err(|e| format!("فشل قراءة مجلد الخلفيات: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if is_background_image_extension(&ext_lower) {
                    if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                        if !filename.to_lowercase().contains("logo") {
                            bgs.push(format!("/backgrounds/{}", filename));
                        }
                    }
                }
            }
        }
    }

    bgs.sort();
    Ok(bgs)
}

#[derive(Serialize, Deserialize)]
pub struct BackgroundSelection {
    selected_background: String,
}

pub fn project_backgrounds_dir() -> Result<PathBuf, String> {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    Ok(manifest_dir
        .parent()
        .ok_or_else(|| "تعذر العثور على المجلد الأب لمشروع Rust".to_string())?
        .join("public")
        .join("backgrounds"))
}

pub fn bundled_backgrounds_dir() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?;

    let public_path = exe_dir.join("public").join("backgrounds");
    if public_path.exists() {
        Ok(public_path)
    } else {
        Ok(exe_dir.join("backgrounds"))
    }
}

pub fn backgrounds_base_dir() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        project_backgrounds_dir()
    } else {
        bundled_backgrounds_dir()
    }
}

pub fn is_background_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp")
}

pub fn normalize_background_path(value: &str) -> Result<String, String> {
    let normalized = value.trim().replace('\\', "/");
    let path_part = normalized.split(['?', '#']).next().unwrap_or("").trim();
    let filename = path_part
        .rsplit('/')
        .next()
        .ok_or_else(|| "مسار الخلفية غير صالح".to_string())?
        .trim();

    if filename.is_empty() || filename.contains('/') || filename.contains('\\') {
        return Err("اسم ملف الخلفية غير صالح".to_string());
    }

    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .ok_or_else(|| "الخلفية لا تحتوي على امتداد صورة صالح".to_string())?;

    if !is_background_image_extension(&ext) || filename.to_lowercase().contains("logo") {
        return Err("نوع ملف الخلفية غير مدعوم".to_string());
    }

    Ok(format!("/backgrounds/{filename}"))
}

pub fn read_selected_background_file(path: &std::path::Path) -> Result<Option<String>, String> {
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("تعذر قراءة إعداد الخلفية: {error}")),
    };

    if let Ok(selection) = serde_json::from_str::<BackgroundSelection>(&contents) {
        return normalize_background_path(&selection.selected_background).map(Some);
    }

    if let Ok(selection) = serde_json::from_str::<String>(&contents) {
        return normalize_background_path(&selection).map(Some);
    }

    normalize_background_path(contents.trim()).map(Some)
}

pub fn write_selected_background_file(
    path: &std::path::Path,
    background: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("تعذر إنشاء مجلد إعداد الخلفية: {e}"))?;
    }

    let selection = BackgroundSelection {
        selected_background: background.to_string(),
    };
    let json = serde_json::to_string_pretty(&selection)
        .map_err(|e| format!("تعذر تجهيز إعداد الخلفية: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("تعذر حفظ الخلفية المختارة: {e}"))
}

#[tauri::command]
pub fn get_selected_background(state: State<AppState>) -> Result<Option<String>, String> {
    let bundled_path = backgrounds_base_dir()?.join(SELECTED_BACKGROUND_FILE);
    let runtime_path = if cfg!(debug_assertions) {
        bundled_path.clone()
    } else {
        state.app_dir.join(SELECTED_BACKGROUND_FILE)
    };

    if let Some(background) = read_selected_background_file(&runtime_path)? {
        return Ok(Some(background));
    }

    if runtime_path != bundled_path {
        if let Some(background) = read_selected_background_file(&bundled_path)? {
            return Ok(Some(background));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod selected_background_tests {
    use super::*;

    #[test]
    fn missing_selection_file_is_a_normal_empty_state() {
        let path = std::env::temp_dir().join(format!(
            "fajr-missing-background-{}-{}.json",
            std::process::id(),
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        assert_eq!(read_selected_background_file(&path).unwrap(), None);
    }

    #[test]
    fn selection_read_error_is_not_silently_treated_as_missing() {
        let directory = std::env::temp_dir().join(format!(
            "fajr-background-directory-{}-{}",
            std::process::id(),
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        assert!(read_selected_background_file(&directory).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[tauri::command]
pub fn set_selected_background(
    state: State<AppState>,
    session_token: String,
    background: String,
) -> Result<String, String> {
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        require_admin_session(&db_guard, Some(&session_token))?;
    }
    let normalized = normalize_background_path(&background)?;
    let target_path = if cfg!(debug_assertions) {
        backgrounds_base_dir()?.join(SELECTED_BACKGROUND_FILE)
    } else {
        state.app_dir.join(SELECTED_BACKGROUND_FILE)
    };

    write_selected_background_file(&target_path, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn rename_background(
    state: State<AppState>,
    session_token: String,
    file_path: String,
) -> Result<String, String> {
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        require_admin_session(&db_guard, Some(&session_token))?;
    }
    let base_dir = backgrounds_base_dir()?;

    if !base_dir.exists() {
        return Err("مجلد الخلفيات غير موجود".to_string());
    }

    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .ok_or_else(|| "اسم ملف غير صالح".to_string())?
        .to_str()
        .ok_or_else(|| "فشل تحويل اسم الملف".to_string())?;

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "الملف لا يحتوي على امتداد صالح".to_string())?;

    let source_file = base_dir.join(filename);
    if !source_file.exists() {
        return Err(format!("الملف غير موجود في المسار: {:?}", source_file));
    }

    let entries = std::fs::read_dir(&base_dir).map_err(|e| format!("فشل قراءة المجلد: {e}"))?;

    let mut bg_exists = false;
    let mut max_num = -1;

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Some(fname) = p.file_stem().and_then(|s| s.to_str()) {
                let fname_lower = fname.to_lowercase();
                if fname_lower == "bg" {
                    bg_exists = true;
                } else if let Some(num_str) = fname_lower.strip_prefix("bg") {
                    if let Ok(num) = num_str.parse::<i32>() {
                        if num > max_num {
                            max_num = num;
                        }
                    }
                }
            }
        }
    }

    let new_stem = if !bg_exists {
        "bg".to_string()
    } else if max_num == -1 {
        "bg1".to_string()
    } else {
        format!("bg{}", max_num + 1)
    };

    let new_filename = format!("{}.{}", new_stem, ext);
    let dest_file = base_dir.join(&new_filename);

    if dest_file.exists() {
        return Err(format!("اسم الملف الجديد {} موجود بالفعل!", new_filename));
    }

    std::fs::rename(&source_file, &dest_file).map_err(|e| format!("فشل إعادة تسمية الملف: {e}"))?;

    Ok(format!("/backgrounds/{}", new_filename))
}

#[tauri::command]
pub fn delete_background(
    state: State<AppState>,
    session_token: String,
    file_path: String,
) -> Result<(), String> {
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        require_admin_session(&db_guard, Some(&session_token))?;
    }
    let base_dir = backgrounds_base_dir()?;

    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .ok_or_else(|| "اسم ملف غير صالح".to_string())?
        .to_str()
        .ok_or_else(|| "فشل تحويل اسم الملف".to_string())?;

    let source_file = base_dir.join(filename);
    if !source_file.exists() {
        return Err(format!("الملف غير موجود: {:?}", source_file));
    }

    trash::delete(&source_file).map_err(|e| format!("فشل نقل الملف إلى سلة المهملات: {e}"))?;

    Ok(())
}
