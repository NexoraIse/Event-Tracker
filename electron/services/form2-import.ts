import fs from "fs";
import path from "path";
import { openDatabase } from "../database/database.js";
import { getCellValue, parseExcelFile, normalizeEventDate, normalizeMatchValue, normalizeHeader } from "./excel-parser.js";

export type Form2PreviewRow = {
  email: string;
  usn: string;
  name: string;
  academicYear: string;
  eventName: string;
  eventType: string;
  venue: string;
  eventDate: string;
  certificate_file: string;
  photo_geo_file: string;
  photo_non_geo_file: string;
  error?: string;
  matchStatus?: string;
};

export type Form2PreviewSummary = {
  rowsProcessed: number;
  matchedEvents: number;
  certificatesSubmitted: number;
  geoTagPhotosSubmitted: number;
  nonGeoTagPhotosSubmitted: number;
  unmatchedRecords: number;
  duplicateRecords: number;
};

export type Form2PreviewResult = {
  fileName: string;
  fileSize: number;
  summary: Form2PreviewSummary;
  rows: Form2PreviewRow[];
  errors: string[];
};

export type Form2Summary = {
  rowsProcessed: number;
  matchedEvents: number;
  certificatesSubmitted: number;
  geoTagPhotosSubmitted: number;
  nonGeoTagPhotosSubmitted: number;
  unmatchedRecords: number;
  duplicateRecords: number;
};

export type UnmatchedRecord = {
  usn: string;
  name: string;
  eventName: string;
  eventDate: string;
  reason: string;
};


function buildPreviewRow(row: Record<string, unknown>): Form2PreviewRow {
  console.log("[FORM2] RAW ROW:", row);
  const certRaw = row[Object.keys(row).find(k => normalizeHeader(k) === "certificateproof") || ""];
  const geoRaw = row[Object.keys(row).find(k => normalizeHeader(k) === "photowithgeotag") || ""];
  const nonGeoRaw = row[Object.keys(row).find(k => normalizeHeader(k) === "photowithoutgeotag") || ""];
  
  console.log("[FORM2] CERTIFICATE RAW:", certRaw);
  console.log("[FORM2] GEO PHOTO RAW:", geoRaw);
  console.log("[FORM2] NON GEO PHOTO RAW:", nonGeoRaw);

  const previewRecord = {
    email: getCellValue(row, ["email", "emailaddress"]),
    usn: getCellValue(row, ["usn", "studentusn", "universityserialnumber"]).toUpperCase(),
    name: getCellValue(row, ["name", "studentname", "fullname"]),
    academicYear: getCellValue(row, ["academicyear", "year"]),
    eventName: getCellValue(row, ["nameoftheevent", "eventname", "event"]),
    eventType: getCellValue(row, ["typeofevent", "eventtype", "activitytype"]),
    venue: getCellValue(row, ["venue", "location"]),
    eventDate: normalizeEventDate(getCellValue(row, ["date", "eventdate"])),
    certificate_file: getCellValue(row, ["certificate/proof", "certificate", "proof"]),
    photo_geo_file: getCellValue(row, ["photowithgeotag", "geotagphoto", "photo1"]),
    photo_non_geo_file: getCellValue(row, ["photowithoutgeotag", "nongeotagphoto", "photo2"])
  };
  
  console.log("[FORM2] MAPPED CERTIFICATE:", previewRecord.certificate_file);
  console.log("[FORM2] MAPPED GEO PHOTO:", previewRecord.photo_geo_file);
  console.log("[FORM2] MAPPED NON GEO PHOTO:", previewRecord.photo_non_geo_file);
  console.log("[FORM2] FINAL PREVIEW RECORD:", previewRecord);
  
  return previewRecord;
}

export function previewForm2Excel(filePath: string): Form2PreviewResult {
  if (!fs.existsSync(filePath)) {
    return {
      fileName: path.basename(filePath),
      fileSize: 0,
      summary: { rowsProcessed: 0, matchedEvents: 0, certificatesSubmitted: 0, geoTagPhotosSubmitted: 0, nonGeoTagPhotosSubmitted: 0, unmatchedRecords: 0, duplicateRecords: 0 },
      rows: [],
      errors: ["File not found."],
    };
  }

  const rows = parseExcelFile(filePath);
  const previewRows: Form2PreviewRow[] = [];
  const db = openDatabase();
  
  let matchedEvents = 0;
  let certificatesSubmitted = 0;
  let geoTagPhotosSubmitted = 0;
  let nonGeoTagPhotosSubmitted = 0;
  let unmatchedRecords = 0;
  let duplicateRecords = 0;

  for (const row of rows) {
    const previewRow = buildPreviewRow(row);

    if (!previewRow.usn || !previewRow.eventName || !previewRow.eventType) {
      previewRow.error = "Missing USN, Event Name, or Activity Type";
      previewRow.matchStatus = "NOT FOUND";
      unmatchedRecords += 1;
    } else {
      const student = db.prepare(`SELECT * FROM students WHERE usn = ?`).get(previewRow.usn) as { id: number } | undefined;
      
      if (!student) {
        previewRow.error = "Unmatched / Requires Review (Student not found)";
        previewRow.matchStatus = "NOT FOUND";
        unmatchedRecords += 1;
      } else {
        const candidateParticipations = db.prepare(`
          SELECT p.id as participation_id, e.event_name, e.event_type, e.event_date, p.certificate_file, p.photo_geo_file, p.photo_non_geo_file
          FROM participations p
          JOIN events e ON p.event_id = e.id
          WHERE p.student_id = ?
        `).all(student.id) as any[];

        const matches = candidateParticipations.filter(p => 
          normalizeMatchValue(p.event_name) === normalizeMatchValue(previewRow.eventName) &&
          normalizeMatchValue(p.event_type) === normalizeMatchValue(previewRow.eventType)
        );

        if (matches.length === 0) {
          previewRow.error = `Unmatched / Requires Review`;
          previewRow.matchStatus = "NOT FOUND";
          unmatchedRecords += 1;
        } else if (matches.length > 1) {
          previewRow.error = `Multiple Matches / Requires Review`;
          previewRow.matchStatus = "MULTIPLE MATCHES";
          unmatchedRecords += 1;
        } else {
          const participation = matches[0];
          const hasExistingDocs = participation.certificate_file || participation.photo_geo_file || participation.photo_non_geo_file;
          const hasNewDocs = previewRow.certificate_file || previewRow.photo_geo_file || previewRow.photo_non_geo_file;

          if (hasExistingDocs && previewRow.certificate_file === participation.certificate_file) {
            previewRow.matchStatus = "ALREADY IMPORTED";
            duplicateRecords += 1;
          } else if (hasExistingDocs && hasNewDocs) {
            previewRow.matchStatus = "UPDATE REQUIRED";
            matchedEvents += 1;
            if (previewRow.certificate_file) certificatesSubmitted += 1;
            if (previewRow.photo_geo_file) geoTagPhotosSubmitted += 1;
            if (previewRow.photo_non_geo_file) nonGeoTagPhotosSubmitted += 1;
          } else {
            previewRow.matchStatus = "NEW";
            matchedEvents += 1;
            if (previewRow.certificate_file) certificatesSubmitted += 1;
            if (previewRow.photo_geo_file) geoTagPhotosSubmitted += 1;
            if (previewRow.photo_non_geo_file) nonGeoTagPhotosSubmitted += 1;
          }
        }
      }
    }

    if (previewRows.length < 50) {
      previewRows.push(previewRow);
    }
  }

  db.close();
  const stats = fs.statSync(filePath);

  return {
    fileName: path.basename(filePath),
    fileSize: stats.size,
    summary: {
      rowsProcessed: rows.length,
      matchedEvents,
      certificatesSubmitted,
      geoTagPhotosSubmitted,
      nonGeoTagPhotosSubmitted,
      unmatchedRecords,
      duplicateRecords
    },
    rows: previewRows,
    errors: [],
  };
}

export function importForm2Excel(filePath: string): { summary: Form2Summary; unmatched: UnmatchedRecord[]; errors: string[] } {
  if (!fs.existsSync(filePath)) {
    return { summary: { rowsProcessed: 0, matchedEvents: 0, certificatesSubmitted: 0, geoTagPhotosSubmitted: 0, nonGeoTagPhotosSubmitted: 0, unmatchedRecords: 0, duplicateRecords: 0 }, unmatched: [], errors: ["File not found."] };
  }

  const rows = parseExcelFile(filePath);
  const db = openDatabase();
  const summary: Form2Summary = {
    rowsProcessed: rows.length,
    matchedEvents: 0,
    certificatesSubmitted: 0,
    geoTagPhotosSubmitted: 0,
    nonGeoTagPhotosSubmitted: 0,
    unmatchedRecords: 0,
    duplicateRecords: 0,
  };
  const errors: string[] = [];
  const unmatched: UnmatchedRecord[] = [];

  for (const row of rows) {
    try {
      const previewRow = buildPreviewRow(row);

      if (!previewRow.usn || !previewRow.eventName || !previewRow.eventType) {
        summary.unmatchedRecords += 1;
        unmatched.push({ usn: previewRow.usn, name: previewRow.name, eventName: previewRow.eventName, eventDate: previewRow.eventDate, reason: "Missing USN, Event Name, or Activity Type" });
        continue;
      }

      const student = db.prepare(`SELECT * FROM students WHERE usn = ?`).get(previewRow.usn) as { id: number } | undefined;
      
      if (!student) {
        summary.unmatchedRecords += 1;
        unmatched.push({ usn: previewRow.usn, name: previewRow.name, eventName: previewRow.eventName, eventDate: previewRow.eventDate, reason: "Unmatched / Requires Review (Student not found)" });
        continue;
      }

      const candidateParticipations = db.prepare(`
        SELECT p.id as participation_id, e.event_name, e.event_type, e.event_date, p.certificate_file, p.photo_geo_file, p.photo_non_geo_file
        FROM participations p
        JOIN events e ON p.event_id = e.id
        WHERE p.student_id = ?
      `).all(student.id) as any[];

      const matches = candidateParticipations.filter(p => 
        normalizeMatchValue(p.event_name) === normalizeMatchValue(previewRow.eventName) &&
        normalizeMatchValue(p.event_type) === normalizeMatchValue(previewRow.eventType)
      );

      if (matches.length === 0) {
        summary.unmatchedRecords += 1;
        unmatched.push({ usn: previewRow.usn, name: previewRow.name, eventName: previewRow.eventName, eventDate: previewRow.eventDate, reason: "Unmatched / Requires Review" });
        continue;
      } else if (matches.length > 1) {
        summary.unmatchedRecords += 1;
        unmatched.push({ usn: previewRow.usn, name: previewRow.name, eventName: previewRow.eventName, eventDate: previewRow.eventDate, reason: "Multiple Matches / Requires Review" });
        continue;
      }
      
      const participation = matches[0];
          previewRow.matchStatus = "MATCHED";

      if (participation.certificate_file && previewRow.certificate_file === participation.certificate_file) {
         summary.duplicateRecords += 1;
         continue;
      }

      summary.matchedEvents += 1;
      console.log("[FORM2] Matched Participation ID:", participation.participation_id);
      console.log("[FORM2] Updating certificate_file:", previewRow.certificate_file);
      console.log("[FORM2] Updating photo_geo_file:", previewRow.photo_geo_file);
      console.log("[FORM2] Updating photo_non_geo_file:", previewRow.photo_non_geo_file);
      const updateSql = `
        UPDATE participations
        SET certificate_status = 'Submitted', 
            certificate_file = COALESCE(NULLIF(?, ''), certificate_file), 
            photo_geo_file = COALESCE(NULLIF(?, ''), photo_geo_file), 
            photo_non_geo_file = COALESCE(NULLIF(?, ''), photo_non_geo_file), 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.prepare(updateSql).run(previewRow.certificate_file, previewRow.photo_geo_file, previewRow.photo_non_geo_file, participation.participation_id);
      console.log("[FORM2] Participation updated successfully");

      if (previewRow.certificate_file) summary.certificatesSubmitted += 1;
      if (previewRow.photo_geo_file) summary.geoTagPhotosSubmitted += 1;
      if (previewRow.photo_non_geo_file) summary.nonGeoTagPhotosSubmitted += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown error");
      summary.unmatchedRecords += 1;
    }
  }

  db.close();
  return { summary, unmatched, errors };
}
