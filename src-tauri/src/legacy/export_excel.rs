//! `export_excel` — extracted from legacy/mod.rs lines 17860–18248
use super::*;

pub struct ExportSection {
    table_name: &'static str,
    sheet_name: &'static str,
    title: &'static str,
    order_by: Option<&'static str>,
}

pub enum ExcelValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(usize),
}

pub fn export_sections() -> Vec<ExportSection> {
    vec![
        ExportSection {
            table_name: "cars",
            sheet_name: "السيارات",
            title: "قسم السيارات",
            order_by: Some("COALESCE(purchase_date, ''), car_number"),
        },
        ExportSection {
            table_name: "car_partners",
            sheet_name: "شركاء السيارات",
            title: "قسم شركاء السيارات",
            order_by: Some("car_number, partner_name"),
        },
        ExportSection {
            table_name: "car_expenses",
            sheet_name: "مصاريف السيارات",
            title: "قسم مصاريف السيارات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "partners",
            sheet_name: "الشركاء والحسابات",
            title: "قسم الشركاء والحسابات",
            order_by: Some("kind, partner_name"),
        },
        ExportSection {
            table_name: "partner_transactions",
            sheet_name: "حركات الشركاء",
            title: "قسم حركات الشركاء",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "partner_transactions",
            sheet_name: "القاصة",
            title: "قسم القاصة (حركات القاصة من حركات الشركاء)",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "expenses",
            sheet_name: "المصاريف العامة",
            title: "قسم المصاريف العامة",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "agencies",
            sheet_name: "الوكالات",
            title: "قسم الوكالات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "agency_transactions",
            sheet_name: "حركات الوكالات",
            title: "قسم حركات الوكالات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "financial_ledger",
            sheet_name: "الدفتر المالي",
            title: "قسم الدفتر المالي",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "profit_distributions",
            sheet_name: "توزيع الأرباح",
            title: "قسم توزيع الأرباح",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "partner_profit_shares",
            sheet_name: "حصص الأرباح",
            title: "قسم حصص الأرباح",
            order_by: Some("distribution_id, partner_name"),
        },
        ExportSection {
            table_name: "db_version",
            sheet_name: "إصدارات القاعدة",
            title: "قسم إصدارات قاعدة البيانات",
            order_by: Some("version"),
        },
    ]
}

pub fn quote_identifier(identifier: &str) -> String {
    // Audit 2026-07-12: this is a duplicate of `quote_ident` (line ~608).
    // Kept as a thin alias for backwards compatibility with callers that
    // already use the longer name. Both must produce identical output.
    quote_ident(identifier)
}

pub fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(|e| e.to_string())
}

pub fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info({})", quote_identifier(table_name));
    let mut stmt = conn.prepare(&pragma).map_err(|e| e.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(columns)
}

pub fn table_rows(
    conn: &Connection,
    table_name: &str,
    columns: &[String],
    order_by: Option<&str>,
) -> Result<Vec<Vec<ExcelValue>>, String> {
    if columns.is_empty() {
        return Ok(Vec::new());
    }

    let column_sql = columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let order_sql = order_by
        .map(|order| format!(" ORDER BY {order}"))
        .unwrap_or_default();
    let query = format!(
        "SELECT {column_sql} FROM {}{order_sql}",
        quote_identifier(table_name)
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut output = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut values = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            let value = match row.get_ref(index).map_err(|e| e.to_string())? {
                ValueRef::Null => ExcelValue::Null,
                ValueRef::Integer(value) => ExcelValue::Integer(value),
                ValueRef::Real(value) => ExcelValue::Real(value),
                ValueRef::Text(value) => {
                    ExcelValue::Text(String::from_utf8_lossy(value).into_owned())
                }
                ValueRef::Blob(value) => ExcelValue::Blob(value.len()),
            };
            values.push(value);
        }
        output.push(values);
    }

    Ok(output)
}

pub fn write_excel_value(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: &ExcelValue,
    text_format: &Format,
    integer_format: &Format,
    number_format: &Format,
) -> Result<(), String> {
    match value {
        ExcelValue::Null => worksheet
            .write_blank(row, col, text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Integer(value) => worksheet
            .write_number_with_format(row, col, *value as f64, integer_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Real(value) => worksheet
            .write_number_with_format(row, col, *value, number_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Text(value) => worksheet
            .write_string_with_format(row, col, value, text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Blob(size) => worksheet
            .write_string_with_format(row, col, format!("ملف مرفق ({size} بايت)"), text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
    }
}

pub fn column_width(column: &str, rows: &[Vec<ExcelValue>], column_index: usize) -> f64 {
    let mut width = column.chars().count().max(10);
    for row in rows.iter().take(200) {
        let value_width = match row.get(column_index) {
            Some(ExcelValue::Text(value)) => value.chars().count(),
            Some(ExcelValue::Integer(value)) => value.to_string().len(),
            Some(ExcelValue::Real(value)) => format!("{value:.2}").len(),
            Some(ExcelValue::Blob(size)) => format!("ملف مرفق ({size} بايت)").chars().count(),
            _ => 0,
        };
        width = width.max(value_width);
    }
    (width as f64 + 4.0).clamp(12.0, 42.0)
}

#[allow(clippy::too_many_arguments)]
pub fn write_section_sheet(
    workbook: &mut Workbook,
    section: &ExportSection,
    columns: &[String],
    rows: &[Vec<ExcelValue>],
    exported_at: &str,
    title_format: &Format,
    meta_format: &Format,
    header_format: &Format,
    text_format: &Format,
    integer_format: &Format,
    number_format: &Format,
) -> Result<(), String> {
    let worksheet = workbook
        .add_worksheet()
        .set_name(section.sheet_name)
        .map_err(|e| e.to_string())?;
    worksheet.set_right_to_left(true);
    worksheet
        .set_freeze_panes(4, 0)
        .map_err(|e| e.to_string())?;

    let last_col = columns.len().saturating_sub(1) as u16;
    worksheet
        .merge_range(0, 0, 0, last_col.max(1), section.title, title_format)
        .map_err(|e| e.to_string())?;
    let meta_text = format!(
        "شركة فجر الوادي | تاريخ التصدير: {exported_at} | عدد السجلات: {}",
        rows.len()
    );
    worksheet
        .merge_range(1, 0, 1, last_col.max(1), &meta_text, meta_format)
        .map_err(|e| e.to_string())?;
    worksheet.set_row_height(0, 26).map_err(|e| e.to_string())?;
    worksheet.set_row_height(1, 21).map_err(|e| e.to_string())?;

    if columns.is_empty() {
        worksheet
            .write_string_with_format(3, 0, "لا توجد أعمدة في هذا القسم", text_format)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    for (index, column) in columns.iter().enumerate() {
        let col = index as u16;
        worksheet
            .write_string_with_format(3, col, column, header_format)
            .map_err(|e| e.to_string())?;
        worksheet
            .set_column_width(col, column_width(column, rows, index))
            .map_err(|e| e.to_string())?;
    }

    for (row_index, values) in rows.iter().enumerate() {
        let excel_row = row_index as u32 + 4;
        for (column_index, value) in values.iter().enumerate() {
            write_excel_value(
                worksheet,
                excel_row,
                column_index as u16,
                value,
                text_format,
                integer_format,
                number_format,
            )?;
        }
    }

    let last_data_row = if rows.is_empty() {
        4
    } else {
        rows.len() as u32 + 3
    };
    worksheet
        .autofilter(3, 0, last_data_row, last_col)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn export_database_to_excel(
    state: State<AppState>,
    session_token: String,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db, Some(&session_token))?;
    let exported_at: String = db
        .query_row(
            "SELECT strftime('%Y-%m-%d %H:%M', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let file_date: String = db
        .query_row(
            "SELECT strftime('%d-%m-%Y', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let output_path = state.app_dir.join(format!("{file_date}.xlsx"));
    let mut workbook = Workbook::new();
    let title_format = Format::new()
        .set_bold()
        .set_font_size(16)
        .set_font_color("FFFFFF")
        .set_background_color("2D2417")
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let meta_format = Format::new()
        .set_font_color("6B4A1D")
        .set_background_color("F7F2E8")
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let header_format = Format::new()
        .set_bold()
        .set_font_color("FFFFFF")
        .set_background_color("B88746")
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let text_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Right)
        .set_reading_direction(2);
    let integer_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0")
        .set_align(FormatAlign::Center);
    let number_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Center);

    for section in export_sections() {
        if !table_exists(&db, section.table_name)? {
            continue;
        }

        let columns = table_columns(&db, section.table_name)?;
        let rows = table_rows(&db, section.table_name, &columns, section.order_by)?;
        write_section_sheet(
            &mut workbook,
            &section,
            &columns,
            &rows,
            &exported_at,
            &title_format,
            &meta_format,
            &header_format,
            &text_format,
            &integer_format,
            &number_format,
        )?;
    }

    workbook
        .save(&output_path)
        .map_err(|e| format!("فشل إنشاء ملف Excel: {e}"))?;

    Ok(output_path.to_string_lossy().into_owned())
}
