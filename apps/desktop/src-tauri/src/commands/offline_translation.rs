use crate::AppState;
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineTranslation {
    pub id: String,
    pub source_pdf: String,
    pub name: String,
    pub format: String,
    pub content: String,
    pub created_at: String,
}

fn translation_dir(state: &AppState, paper_id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(paper_id).map_err(|_| "Invalid paper ID".to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let exists: bool = db
        .conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM papers WHERE id = ?1)",
            [paper_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("Paper no longer exists".into());
    }
    Ok(state.data_dir.join("offline-translations").join(paper_id))
}

fn translation_path(dir: PathBuf, id: &str) -> Result<PathBuf, String> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "Invalid translation ID".to_string())?;
    Ok(dir.join(format!("{id}.json")))
}

fn save_document(dir: PathBuf, document: &OfflineTranslation) -> Result<(), String> {
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = translation_path(dir, &document.id)?;
    let temporary = path.with_extension("tmp");
    let bytes = serde_json::to_vec(document).map_err(|e| e.to_string())?;
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &path)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(temporary);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_offline_translations(
    state: State<'_, AppState>,
    paper_id: String,
    source_pdf: String,
) -> Result<Vec<OfflineTranslation>, String> {
    let dir = translation_dir(&state, &paper_id)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut documents = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let document: OfflineTranslation =
            serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if document.source_pdf == source_pdf {
            documents.push(document);
        }
    }
    documents.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(documents)
}

#[tauri::command]
pub async fn import_offline_translation(
    state: State<'_, AppState>,
    paper_id: String,
    source_pdf: String,
    name: String,
    content: String,
) -> Result<OfflineTranslation, String> {
    let dir = translation_dir(&state, &paper_id)?;
    let format = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !matches!(format.as_str(), "md" | "txt") {
        return Err("Only .md and .txt files are supported".into());
    }
    if content.trim().is_empty() || content.len() > 10 * 1024 * 1024 || content.contains('\0') {
        return Err(
            "Document must contain text, have no NUL characters, and be at most 10 MiB".into(),
        );
    }
    let document = OfflineTranslation {
        id: uuid::Uuid::new_v4().to_string(),
        source_pdf,
        name,
        format,
        content,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_document(dir, &document)?;
    Ok(document)
}

#[tauri::command]
pub async fn delete_offline_translation(
    state: State<'_, AppState>,
    paper_id: String,
    id: String,
) -> Result<(), String> {
    let path = translation_path(translation_dir(&state, &paper_id)?, &id)?;
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translation_paths_reject_traversal() {
        assert!(translation_path(PathBuf::from("translations"), "../../paper.pdf").is_err());
        let id = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            translation_path(PathBuf::from("translations"), &id).unwrap(),
            PathBuf::from("translations").join(format!("{id}.json"))
        );
    }

    #[test]
    fn test_saved_versions_survive_reopen_and_delete_preserves_original() {
        let dir = std::env::temp_dir().join(format!("zoro-offline-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let original = dir.join("paper.pdf");
        fs::write(&original, b"original PDF").unwrap();
        let document = OfflineTranslation {
            id: uuid::Uuid::new_v4().to_string(),
            source_pdf: "paper.pdf".into(),
            name: "translation.md".into(),
            format: "md".into(),
            content: "繁體中文 α β μ Δ ≤ ≥".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        save_document(dir.clone(), &document).unwrap();
        let mut second = document.clone();
        second.id = uuid::Uuid::new_v4().to_string();
        save_document(dir.clone(), &second).unwrap();
        let path = translation_path(dir.clone(), &document.id).unwrap();
        let restored: OfflineTranslation =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(restored.content, document.content);
        fs::remove_file(path).unwrap();
        assert!(translation_path(dir.clone(), &second.id).unwrap().exists());
        assert_eq!(fs::read(original).unwrap(), b"original PDF");
        fs::remove_dir_all(dir).unwrap();
    }
}
