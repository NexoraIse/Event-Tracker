import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { openDatabase } from "../database/database.js";
import { getCellValue, normalizeEventDate } from "./excel-parser.js";
import { upsertStudent } from "../database/queries/students.js";
import { upsertEvent } from "../database/queries/events.js";
import { createParticipation } from "../database/queries/participations.js";

export type ImportSummary = {
  rowsProcessed: number;
  newStudents: number;
  existingStudents: number;
  newEvents: number;
  newParticipations: number;
  duplicatesSkipped: number;
  usnMismatches: number;
  errors: number;
};

export type Form1PreviewRow = {
  usn: string;
  name: string;
  email: string;
  phone: string;
  academicYear: string;
  yearOfStudy: string;
  eventName: string;
  activityType: string;
  venue: string;
  eventDate: string;
  numberOfDays: string;
  permissionFile: string;
  eventType?: string;
  eventVenue?: string;
  concernForm?: string;
};

export type Form1PreviewSummary = {
  rowsProcessed: number;
  newStudents: number;
  newEvents: number;
  duplicateRecords: number;
  invalidRows: number;
};

export type Form1PreviewResult = {
  fileName: string;
  fileSize: number;
  summary: Form1PreviewSummary;
  rows: Form1PreviewRow[];
  errors: string[];
};

function normalizeConcernHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "");
}

function normalizeConcernValue(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function getValueFromHeader(row: unknown[], headerMap: Map<string, number>, aliases: string[]): string {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeConcernHeader(alias));
    if (index === undefined) continue;
    const rawValue = row[index];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    return normalizeConcernValue(rawValue);
  }
  return "";
}

function getPermissionFileFromRow(
  row: unknown[],
  worksheet: XLSX.WorkSheet,
  rowNumber: number,
  headerMap: Map<string, number>
): string {
  const aliases = ["Upload Permission Letter", "Permission Letter", "Permission File", "Permission", "Upload File"];

  for (const alias of aliases) {
    const columnIndex = headerMap.get(normalizeConcernHeader(alias));
    if (columnIndex === undefined) continue;

    const cellAddress = XLSX.utils.encode_cell({ r: rowNumber, c: columnIndex });
    const cell = worksheet[cellAddress];
    const linkedTarget = cell?.l?.Target ? String(cell.l.Target).trim() : "";
    if (linkedTarget) return linkedTarget;

    const rawValue = row[columnIndex];
    if (rawValue != null && rawValue !== "") {
      return normalizeConcernValue(rawValue);
    }
  }

  return "";
}

function normalizeBranch(value: string): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "ISE";

  const normalized = text.toLowerCase();
  if (normalized.includes("ise") || normalized.includes("information science")) {
    return "ISE";
  }

  return text;
}

function buildConcernMappedRow(
  row: unknown[],
  headers: unknown[],
  worksheet: XLSX.WorkSheet,
  rowNumber: number
): Form1PreviewRow {
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeConcernHeader(header);
    if (normalized) headerMap.set(normalized, index);
  });

  const activityType = getValueFromHeader(row, headerMap, ["Type of Event", "Activity Type", "Event Type"]);
  const venue = getValueFromHeader(row, headerMap, ["Venue", "Event Venue", "Venue Name"]);
  const permissionFile = getPermissionFileFromRow(row, worksheet, rowNumber, headerMap);

  const mappedRow: Form1PreviewRow = {
    usn: getValueFromHeader(row, headerMap, ["USN"]).toUpperCase(),
    name: getValueFromHeader(row, headerMap, ["Name", "Student Name", "Full Name"]),
    email: getValueFromHeader(row, headerMap, ["Email address", "Email Address", "Email"]),
    phone: getValueFromHeader(row, headerMap, ["Phone Number", "Phone", "Mobile Number"]),
    academicYear: getValueFromHeader(row, headerMap, ["Academic Year"]),
    yearOfStudy: getValueFromHeader(row, headerMap, ["Year of Study", "Year of study", "Semester"]),
    eventName: getValueFromHeader(row, headerMap, ["Name of the Event", "Event Name", "Event"]),
    activityType,
    venue,
    eventDate: normalizeEventDate(getValueFromHeader(row, headerMap, ["Date", "Event Date"])),
    numberOfDays: getValueFromHeader(row, headerMap, ["Number of Days"]),
    permissionFile,
    eventType: activityType,
    eventVenue: venue,
    concernForm: permissionFile,
  };

  return mappedRow;
}

export function previewForm1Excel(filePath: string): Form1PreviewResult {
  if (!fs.existsSync(filePath)) {
    return {
      fileName: path.basename(filePath),
      fileSize: 0,
      summary: { rowsProcessed: 0, newStudents: 0, newEvents: 0, duplicateRecords: 0, invalidRows: 0 },
      rows: [],
      errors: ["File not found."],
    };
  }

  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
  const headers = rawRows[0] ?? [];
  const firstDataRow = rawRows[1] ?? [];

  console.log("[CONCERN RAW HEADERS]", headers);
  console.log("[CONCERN RAW FIRST ROW]", JSON.stringify(firstDataRow, null, 2));

  const firstMappedRow = buildConcernMappedRow(firstDataRow, headers, worksheet, 1);
  console.log("[CONCERN MAPPED FIRST ROW]", JSON.stringify(firstMappedRow, null, 2));

  const previewRows: Form1PreviewRow[] = [];
  const uniqueStudents = new Set<string>();
  const uniqueEvents = new Set<string>();
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  let invalidRows = 0;

  for (const [index, row] of rawRows.slice(1).entries()) {
    const rowNumber = index + 1;
    const previewRow = buildConcernMappedRow(row, headers, worksheet, rowNumber);
    const registrationKey = `${previewRow.usn}|${previewRow.eventName}|${previewRow.eventDate}`;

    if (!previewRow.usn || !previewRow.eventName || !previewRow.eventDate) {
      invalidRows += 1;
      if (previewRows.length < 10) {
        previewRows.push(previewRow);
      }
      continue;
    }

    if (seenKeys.has(registrationKey)) {
      duplicateKeys.add(registrationKey);
    } else {
      seenKeys.add(registrationKey);
    }

    uniqueStudents.add(previewRow.usn);
    uniqueEvents.add(`${previewRow.eventName}|${previewRow.eventDate}`);

    if (previewRows.length < 10) {
      previewRows.push(previewRow);
    }
  }

  console.log("[CONCERN PREVIEW ROWS]", JSON.stringify(previewRows, null, 2));

  const stats = fs.statSync(filePath);

  return {
    fileName: path.basename(filePath),
    fileSize: stats.size,
    summary: {
      rowsProcessed: rawRows.length - 1,
      newStudents: uniqueStudents.size,
      newEvents: uniqueEvents.size,
      duplicateRecords: duplicateKeys.size,
      invalidRows,
    },
    rows: previewRows,
    errors: [],
  };
}

export function importForm1Excel(filePath: string): { summary: ImportSummary; errors: string[] } {
  if (!fs.existsSync(filePath)) {
    return { summary: { rowsProcessed: 0, newStudents: 0, existingStudents: 0, newEvents: 0, newParticipations: 0, duplicatesSkipped: 0, usnMismatches: 0, errors: 1 }, errors: ["File not found."] };
  }

  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
  const headers = rawRows[0] ?? [];

  const summary: ImportSummary = {
    rowsProcessed: rawRows.length - 1,
    newStudents: 0,
    existingStudents: 0,
    newEvents: 0,
    newParticipations: 0,
    duplicatesSkipped: 0,
    usnMismatches: 0,
    errors: 0,
  };
  const errors: string[] = [];

  const db = openDatabase();

  for (const [index, row] of rawRows.slice(1).entries()) {
    try {
      const mappedRow = buildConcernMappedRow(row, headers, worksheet, index + 1);
      const usn = mappedRow.usn.toUpperCase();
      const name = mappedRow.name;
      const email = mappedRow.email;
      const phone = mappedRow.phone;
      const branch = normalizeBranch("");
      const semester = mappedRow.yearOfStudy;
      const yearOfPassing = "";
      const eventName = mappedRow.eventName;
      const eventType = mappedRow.activityType;
      const hostCollege = mappedRow.venue;
      const eventDate = mappedRow.eventDate;

      if (!usn || !eventName || !eventDate) {
        summary.usnMismatches += 1;
        continue;
      }

      const student = upsertStudent({ usn, name: name || usn, email, phone, branch, semester, year_of_passing: yearOfPassing });
      const studentRecord = db.prepare(`SELECT * FROM students WHERE usn = ?`).get(usn) as { id: number } | undefined;
      if (!studentRecord) {
        summary.errors += 1;
        continue;
      }

      const event = upsertEvent({
        event_name: eventName,
        event_type: eventType,
        host_college: hostCollege,
        event_date: eventDate,
      });

      const eventRecord = db.prepare(`SELECT * FROM events WHERE event_name = ? AND event_date = ?`).get(eventName, eventDate) as { id: number } | undefined;
      if (!eventRecord) {
        summary.errors += 1;
        continue;
      }

      const existingParticipation = db.prepare(`SELECT id FROM participations WHERE student_id = ? AND event_id = ?`).get(studentRecord.id, eventRecord.id);
      if (existingParticipation) {
        summary.duplicatesSkipped += 1;
        continue;
      }

      createParticipation({
        student_id: studentRecord.id,
        event_id: eventRecord.id,
        event_status: "Attended",
        certificate_status: "Pending",
        achievement: "",
        academic_year: mappedRow.academicYear,
        year_of_study: mappedRow.yearOfStudy,
        number_of_days: mappedRow.numberOfDays,
        permission_file: mappedRow.permissionFile,
      });

      const prior = db.prepare(`SELECT id FROM students WHERE usn = ?`).get(usn) ? 1 : 0;
      if (prior && student) {
        summary.existingStudents += 1;
      } else {
        summary.newStudents += 1;
      }
      summary.newEvents += 1;
      summary.newParticipations += 1;
    } catch (error) {
      summary.errors += 1;
      errors.push(error instanceof Error ? error.message : "Unknown error");
    }
  }

  db.close();
  return { summary, errors };
}
