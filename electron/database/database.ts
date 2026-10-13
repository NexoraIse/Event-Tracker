import fs from "fs";
import path from "path";
import os from "os";
import Database, { Database as SQLiteDatabase } from "better-sqlite3";
import { schemaSql } from "./schema";

export const APP_NAME = "StudentEventTracker";

export function getAppDataDir(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  if (process.platform === "win32") return path.join(base, APP_NAME);
  return path.join(os.homedir(), ".config", APP_NAME);
}

export function getDatabasePath(): string {
  const dir = getAppDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "student_event_tracker.sqlite");
}

export function openDatabase(): SQLiteDatabase {
  const dbPath = getDatabasePath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  
  // Add new columns safely
    const columnsToAdd = [
    { table: 'participations', name: 'photo_geo_file', type: 'TEXT' },
    { table: 'participations', name: 'photo_non_geo_file', type: 'TEXT' },
    { table: 'participations', name: 'academic_year', type: 'TEXT' },
    { table: 'participations', name: 'year_of_study', type: 'TEXT' },
    { table: 'participations', name: 'number_of_days', type: 'TEXT' }
  ];
  
  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column might already exist
    }
  }

  return db;
}

export function closeDatabase(db: SQLiteDatabase): void {
  db.close();
}

export function getDatabase(): SQLiteDatabase {
  const db = openDatabase();
  return db;
}
