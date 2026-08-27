use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::relation_type::{
    CreateRelationTypeRequest, RelationType, UpdateRelationTypeRequest,
};

fn row_to_rt(row: &rusqlite::Row) -> rusqlite::Result<RelationType> {
    Ok(RelationType {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        label: row.get(3)?,
        inverse_name: row.get(4)?,
        inverse_label: row.get(5)?,
        allowed_source_types: row.get(6)?,
        allowed_target_types: row.get(7)?,
        color: row.get(8)?,
        is_system: row.get::<_, i64>(9)? != 0,
        created_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateRelationTypeRequest,
) -> Result<RelationType> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO relation_types
            (id,project_id,name,label,inverse_name,inverse_label,
             allowed_source_types,allowed_target_types,color,is_system,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10)",
        params![
            id,
            project_id,
            req.name,
            req.label,
            req.inverse_name,
            req.inverse_label,
            req.allowed_source_types,
            req.allowed_target_types,
            req.color,
            now
        ],
    )?;
    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<RelationType> {
    conn.query_row(
        "SELECT id,project_id,name,label,inverse_name,inverse_label,
                allowed_source_types,allowed_target_types,color,is_system,
                created_at,deleted_at
         FROM relation_types WHERE id=?1",
        params![id],
        row_to_rt,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("RelationType '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> Result<Vec<RelationType>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,name,label,inverse_name,inverse_label,
                allowed_source_types,allowed_target_types,color,is_system,
                created_at,deleted_at
         FROM relation_types
         WHERE project_id=?1 AND deleted_at IS NULL
         ORDER BY name ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_rt)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(
    conn: &Connection,
    id: &str,
    req: &UpdateRelationTypeRequest,
) -> Result<RelationType> {
    let current = get(conn, id)?;
    let name = req.name.as_deref().unwrap_or(&current.name);
    let label = req.label.as_deref().unwrap_or(&current.label);
    let inverse_name = req
        .inverse_name
        .as_deref()
        .or(current.inverse_name.as_deref());
    let inverse_label = req
        .inverse_label
        .as_deref()
        .or(current.inverse_label.as_deref());
    let allowed_source = req
        .allowed_source_types
        .as_deref()
        .or(current.allowed_source_types.as_deref());
    let allowed_target = req
        .allowed_target_types
        .as_deref()
        .or(current.allowed_target_types.as_deref());
    let color = req.color.as_deref().or(current.color.as_deref());

    conn.execute(
        "UPDATE relation_types
         SET name=?1,label=?2,inverse_name=?3,inverse_label=?4,
             allowed_source_types=?5,allowed_target_types=?6,color=?7
         WHERE id=?8 AND deleted_at IS NULL",
        params![
            name,
            label,
            inverse_name,
            inverse_label,
            allowed_source,
            allowed_target,
            color,
            id
        ],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    let current = get(conn, id)?;
    if current.is_system {
        return Err(InkwellError::Forbidden(format!(
            "RelationType '{id}' is a system type and cannot be deleted"
        )));
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE relation_types SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}
