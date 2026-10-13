import * as XLSX from "xlsx";

export type ExcelRow = Record<string, string | number | boolean | null>;

export function parseExcelFile(filePath: string): ExcelRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: "" });
  
  const rangeStr = sheet['!ref'];
  if (rangeStr) {
    const range = XLSX.utils.decode_range(rangeStr);
    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({c: C, r: range.s.r})];
      headers[C] = cell ? String(cell.v) : "";
    }

    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const row = rows[R - range.s.r - 1];
      if (!row) continue;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({c: C, r: R})];
        const header = headers[C];
        if (cell && cell.l && cell.l.Target && header) {
          row[header] = cell.l.Target;
        }
      }
    }
  }

  return rows;
}

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^student/, "");
}

export function getCellValue(row: Record<string, unknown>, aliases: string[]): string {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  const keys = Object.keys(row);
  const match = keys.find((key) => normalizedAliases.includes(normalizeHeader(key)));
  if (!match) return "";
  const value = row[match];
  return value == null ? "" : String(value).trim();
}

export function normalizeMatchValue(value: unknown): string {
  if (value == null) return "";
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizeEventDate(dateValue: unknown): string {
  console.log("[FORM1] Raw Date:", dateValue);
  console.log("[FORM1] Raw Date Type:", typeof dateValue);
  const result = _normalizeEventDate(dateValue);
  console.log("[FORM1] Normalized Event Date:", result);
  return result;
}

function _normalizeEventDate(dateValue: unknown): string {
  if (!dateValue) return "";
  
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) return "";
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(dateValue).trim();
  if (!str) return "";

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    if (serial > 10000 && serial < 100000) {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  let parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let part1 = parts[0]; 
    let part2 = parts[1]; 
    let part3 = parts[2].split(' ')[0]; 
    
    if (part1.length === 4) {
      return `${part1}-${part2.padStart(2, '0')}-${part3.padStart(2, '0')}`;
    }
    
    if (part3.length === 2) part3 = `20${part3}`;
    
    if (part3.length === 4) {
      let day = parseInt(part1, 10);
      let month = parseInt(part2, 10);
      
      if (month > 12 && day <= 12) {
        const temp = day;
        day = month;
        month = temp;
      }
      
      return `${part3}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    if (year > 3000 || year < 1900) return str; 
    
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
  
  return str;
}
