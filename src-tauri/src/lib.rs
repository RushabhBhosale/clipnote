use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, RunEvent, Size, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Clip {
    id: String,
    title: String,
    raw_content: String,
    normalized_content: String,
    content_type: String,
    source_application: Option<String>,
    created_at: String,
    updated_at: String,
    last_copied_at: String,
    copy_count: i64,
    is_favorite: bool,
    is_sensitive: bool,
    expires_at: Option<String>,
    tags: Vec<String>,
    detected_language: Option<String>,
    image_path: Option<String>,
    ocr_text: Option<String>,
    deleted_at: Option<String>,
    is_snippet: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Credential {
    id: String,
    label: String,
    url: String,
    username: String,
    password: String,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialSummary {
    id: String,
    label: String,
    url: String,
    username: String,
    updated_at: String,
}

impl From<&Credential> for CredentialSummary {
    fn from(credential: &Credential) -> Self {
        Self {
            id: credential.id.clone(),
            label: credential.label.clone(),
            url: credential.url.clone(),
            username: credential.username.clone(),
            updated_at: credential.updated_at.clone(),
        }
    }
}

const CREDENTIAL_KEYCHAIN_SERVICE: &str = "com.clipnote.desktop.credentials";
const CREDENTIAL_KEYCHAIN_ACCOUNT: &str = "vault";

fn validate_credential(credential: &Credential) -> Result<(), String> {
    if credential.id.is_empty()
        || credential.id.len() > 128
        || credential.label.trim().is_empty()
        || credential.label.len() > 200
        || credential.url.len() > 2_048
        || credential.username.len() > 512
        || credential.password.is_empty()
        || credential.password.len() > 32_768
        || credential.updated_at.len() > 64
    {
        return Err("Credential is incomplete or too large".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn read_credential_vault() -> Result<Vec<Credential>, String> {
    use security_framework::passwords::get_generic_password;

    match get_generic_password(CREDENTIAL_KEYCHAIN_SERVICE, CREDENTIAL_KEYCHAIN_ACCOUNT) {
        Ok(data) => serde_json::from_slice(&data).map_err(|_| "Unable to read credentials from macOS Keychain".to_string()),
        Err(error) if error.code() == -25_300 => Ok(Vec::new()),
        Err(_) => Err("Unable to access credentials in macOS Keychain".to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
fn read_credential_vault() -> Result<Vec<Credential>, String> {
    Err("Secure credential storage is currently available in the macOS app".into())
}

#[cfg(target_os = "macos")]
fn write_credential_vault(credentials: &[Credential]) -> Result<(), String> {
    use security_framework::passwords::set_generic_password;

    let data = serde_json::to_vec(credentials).map_err(|_| "Unable to prepare credentials for macOS Keychain".to_string())?;
    if data.len() > 1_000_000 {
        return Err("Credential vault is too large".into());
    }
    set_generic_password(CREDENTIAL_KEYCHAIN_SERVICE, CREDENTIAL_KEYCHAIN_ACCOUNT, &data)
        .map_err(|_| "Unable to save credentials in macOS Keychain".to_string())
}

#[cfg(not(target_os = "macos"))]
fn write_credential_vault(_credentials: &[Credential]) -> Result<(), String> {
    Err("Secure credential storage is currently available in the macOS app".into())
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  source_application TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_copied_at TEXT NOT NULL,
  copy_count INTEGER NOT NULL DEFAULT 1,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  detected_language TEXT,
  image_path TEXT,
  ocr_text TEXT,
  deleted_at TEXT,
  is_snippet INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_clips_last_copied ON clips(last_copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_deleted ON clips(deleted_at);
CREATE INDEX IF NOT EXISTS idx_clips_expires ON clips(expires_at);
"#;

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|_| "Unable to access local app data".to_string())?;
    fs::create_dir_all(&data_dir).map_err(|_| "Unable to prepare local app data".to_string())?;
    Ok(data_dir)
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let db_path = app_data_dir(app)?.join("clipnote.sqlite3");
    let connection = Connection::open(db_path).map_err(|_| "Unable to open local clipboard storage".to_string())?;
    connection.execute_batch(SCHEMA).map_err(|_| "Unable to initialize local clipboard storage".to_string())?;
    connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;").map_err(|_| "Unable to prepare local clipboard storage".to_string())?;
    Ok(connection)
}

fn clip_from_row(row: &Row<'_>) -> rusqlite::Result<Clip> {
    let tags_json: String = row.get("tags_json")?;
    Ok(Clip {
        id: row.get("id")?,
        title: row.get("title")?,
        raw_content: row.get("raw_content")?,
        normalized_content: row.get("normalized_content")?,
        content_type: row.get("content_type")?,
        source_application: row.get("source_application")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_copied_at: row.get("last_copied_at")?,
        copy_count: row.get("copy_count")?,
        is_favorite: row.get::<_, i64>("is_favorite")? != 0,
        is_sensitive: row.get::<_, i64>("is_sensitive")? != 0,
        expires_at: row.get("expires_at")?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        detected_language: row.get("detected_language")?,
        image_path: row.get("image_path")?,
        ocr_text: row.get("ocr_text")?,
        deleted_at: row.get("deleted_at")?,
        is_snippet: Some(row.get::<_, i64>("is_snippet")? != 0),
    })
}

fn validate_clip(clip: &Clip) -> Result<(), String> {
    const CONTENT_TYPES: [&str; 12] = ["text", "code", "link", "email", "phone", "otp", "password", "file", "json", "command", "image", "other"];
    if clip.id.is_empty() || clip.id.len() > 128 || clip.title.len() > 512 || clip.raw_content.len() > 5_000_000 || clip.normalized_content.len() > 5_000_000 {
        return Err("Clipboard entry is too large or invalid".into());
    }
    if !CONTENT_TYPES.contains(&clip.content_type.as_str()) {
        return Err("Clipboard entry has an unsupported content type".into());
    }
    if clip.tags.len() > 50 || clip.tags.iter().any(|tag| tag.trim().is_empty() || tag.len() > 100) {
        return Err("Clipboard entry has invalid tags".into());
    }
    Ok(())
}

fn purge_expired(connection: &Connection) -> Result<(), String> {
    connection.execute(
        "DELETE FROM clips WHERE is_favorite = 0 AND expires_at IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        [],
    ).map_err(|_| "Unable to clean expired clipboard entries".to_string())?;
    Ok(())
}

#[tauri::command]
fn clips_list(app: AppHandle) -> Result<Vec<Clip>, String> {
    let connection = open_database(&app)?;
    purge_expired(&connection)?;
    let mut statement = connection.prepare(
        "SELECT id, title, raw_content, normalized_content, content_type, source_application, created_at, updated_at, last_copied_at, copy_count, is_favorite, is_sensitive, expires_at, tags_json, detected_language, image_path, ocr_text, deleted_at, is_snippet FROM clips ORDER BY last_copied_at DESC"
    ).map_err(|_| "Unable to read clipboard history".to_string())?;
    let clips = statement.query_map([], clip_from_row)
        .map_err(|_| "Unable to read clipboard history".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Unable to read clipboard history".to_string())?;
    Ok(clips)
}

#[tauri::command]
fn clips_upsert(app: AppHandle, clip: Clip) -> Result<Clip, String> {
    validate_clip(&clip)?;
    let connection = open_database(&app)?;
    purge_expired(&connection)?;
    let tags = serde_json::to_string(&clip.tags).map_err(|_| "Unable to save clipboard entry".to_string())?;
    connection.execute(
        r#"INSERT INTO clips (id, title, raw_content, normalized_content, content_type, source_application, created_at, updated_at, last_copied_at, copy_count, is_favorite, is_sensitive, expires_at, tags_json, detected_language, image_path, ocr_text, deleted_at, is_snippet)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
           ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, raw_content=excluded.raw_content, normalized_content=excluded.normalized_content, content_type=excluded.content_type,
             source_application=excluded.source_application, updated_at=excluded.updated_at, last_copied_at=excluded.last_copied_at,
             copy_count=excluded.copy_count, is_favorite=excluded.is_favorite, is_sensitive=excluded.is_sensitive, expires_at=excluded.expires_at,
             tags_json=excluded.tags_json, detected_language=excluded.detected_language, image_path=excluded.image_path, ocr_text=excluded.ocr_text,
             deleted_at=excluded.deleted_at, is_snippet=excluded.is_snippet"#,
        params![
            clip.id, clip.title, clip.raw_content, clip.normalized_content, clip.content_type, clip.source_application,
            clip.created_at, clip.updated_at, clip.last_copied_at, clip.copy_count, clip.is_favorite as i64, clip.is_sensitive as i64,
            clip.expires_at, tags, clip.detected_language, clip.image_path, clip.ocr_text, clip.deleted_at, clip.is_snippet.unwrap_or(false) as i64,
        ],
    ).map_err(|_| "Unable to save clipboard entry".to_string())?;
    Ok(clip)
}

#[tauri::command]
fn clips_remove_permanently(app: AppHandle, id: String) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 { return Err("Invalid clipboard entry".into()); }
    let connection = open_database(&app)?;
    connection.execute("DELETE FROM clips WHERE id = ?1", params![id]).map_err(|_| "Unable to remove clipboard entry".to_string())?;
    Ok(())
}

#[tauri::command]
fn clips_clear(app: AppHandle) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection.execute("DELETE FROM clips", []).map_err(|_| "Unable to clear clipboard history".to_string())?;
    Ok(())
}

#[tauri::command]
fn credentials_list() -> Result<Vec<CredentialSummary>, String> {
    let mut credentials = read_credential_vault()?;
    credentials.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(credentials.iter().map(CredentialSummary::from).collect())
}

#[tauri::command]
fn credential_get(id: String) -> Result<Credential, String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid credential".into());
    }
    read_credential_vault()?
        .into_iter()
        .find(|credential| credential.id == id)
        .ok_or_else(|| "Credential was not found".to_string())
}

#[tauri::command]
fn credential_save(credential: Credential) -> Result<CredentialSummary, String> {
    validate_credential(&credential)?;
    let mut credentials = read_credential_vault()?;
    if let Some(existing) = credentials.iter_mut().find(|existing| existing.id == credential.id) {
        *existing = credential.clone();
    } else {
        if credentials.len() >= 500 {
            return Err("Credential vault has reached its 500-item limit".into());
        }
        credentials.push(credential.clone());
    }
    write_credential_vault(&credentials)?;
    Ok(CredentialSummary::from(&credential))
}

#[tauri::command]
fn credential_delete(id: String) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid credential".into());
    }
    let mut credentials = read_credential_vault()?;
    let original_len = credentials.len();
    credentials.retain(|credential| credential.id != id);
    if credentials.len() == original_len {
        return Err("Credential was not found".into());
    }
    write_credential_vault(&credentials)
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let data_dir = app_data_dir(&app)?;
    #[cfg(target_os = "macos")]
    Command::new("open").arg(data_dir).spawn().map_err(|_| "Unable to open local data folder".to_string())?;
    #[cfg(target_os = "windows")]
    Command::new("explorer").arg(data_dir).spawn().map_err(|_| "Unable to open local data folder".to_string())?;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err("Opening the local data folder is not supported on this platform".into());
    Ok(())
}

#[tauri::command]
fn set_sticky_mode(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    if enabled {
        window.set_size(Size::Logical(LogicalSize::new(420.0, 360.0))).map_err(|_| "Unable to resize ClipNote".to_string())?;
        window.set_always_on_top(true).map_err(|_| "Unable to enable sticky note mode".to_string())?;
    } else {
        window.set_size(Size::Logical(LogicalSize::new(1100.0, 760.0))).map_err(|_| "Unable to resize ClipNote".to_string())?;
        window.set_always_on_top(false).map_err(|_| "Unable to disable sticky note mode".to_string())?;
    }
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn register_global_shortcuts(app: &AppHandle) {
    let shortcuts = app.global_shortcut();
    if let Err(error) = shortcuts.on_shortcut("CommandOrControl+Shift+Space", |app, _, event| {
        if event.state == ShortcutState::Pressed {
            show_main_window(app);
            let _ = app.emit("clipnote://open-sticky", ());
        }
    }) {
        eprintln!("Unable to register Sticky Note shortcut: {error}");
    }
    if let Err(error) = shortcuts.on_shortcut("CommandOrControl+Shift+V", |app, _, event| {
        if event.state == ShortcutState::Pressed {
            show_main_window(app);
            let _ = app.emit("clipnote://open-clipboard", ());
        }
    }) {
        eprintln!("Unable to register Clipboard shortcut: {error}");
    }
    if let Err(error) = shortcuts.on_shortcut("CommandOrControl+Shift+Comma", |app, _, event| {
        if event.state == ShortcutState::Pressed {
            show_main_window(app);
            let _ = app.emit("clipnote://open-credentials", ());
        }
    }) {
        eprintln!("Unable to register Creds shortcut: {error}");
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open ClipNote", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
    let clear = MenuItem::with_id(app, "clear", "Clear Recent History", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &clear, &settings, &quit])?;
    TrayIconBuilder::with_id("clipnote-tray")
        .tooltip("ClipNote")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "pause" => { let _ = app.emit("clipnote://toggle-monitoring", ()); },
            "clear" => { let _ = app.emit("clipnote://clear-history", ()); },
            "settings" => { show_main_window(app); let _ = app.emit("clipnote://open-settings", ()); },
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            setup_tray(app.handle())?;
            register_global_shortcuts(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clips_list,
            clips_upsert,
            clips_remove_permanently,
            clips_clear,
            credentials_list,
            credential_get,
            credential_save,
            credential_delete,
            open_data_folder,
            set_sticky_mode
        ])
        .build(tauri::generate_context!())
        .expect("error while building ClipNote");

    app.run(|app: &AppHandle, event| {
        if let RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } = event {
            if label == "main" {
                if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); }
                api.prevent_close();
            }
        }
    });
}
