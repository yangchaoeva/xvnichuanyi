import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'tasks.db');

export async function openDb() {
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  });
}

export async function initDb() {
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      personUrl TEXT,
      garmentUrl TEXT,
      mode TEXT,
      resultUrl TEXT,
      error TEXT,
      retryCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL
    )
  `);
  return db;
}

// Initialize the database when this module is imported
initDb().catch(console.error);