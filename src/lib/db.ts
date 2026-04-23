import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { tasks } from '@/db/schema';

const dbPath = path.join(process.cwd(), 'tasks.db');

export type TaskRecord = {
  id: string;
  status: string;
  personUrl: string | null;
  garmentUrl: string | null;
  mode: string | null;
  resultUrl: string | null;
  error: string | null;
  retryCount: number;
  createdAt: number;
};

type DbProvider = 'sqlite' | 'neon';

const getDbProvider = (): DbProvider => {
  const raw = process.env.DB_PROVIDER?.toLowerCase();
  if (raw === 'neon' || raw === 'postgres' || raw === 'postgresql') return 'neon';
  return 'sqlite';
};

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || null;

let sqliteSchemaReady: Promise<void> | null = null;
let neonSchemaReady: Promise<void> | null = null;

const ensureSqliteSchema = async () => {
  if (sqliteSchemaReady) return sqliteSchemaReady;

  sqliteSchemaReady = (async () => {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

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
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);
  })();

  return sqliteSchemaReady;
};

const openSqliteDb = async () => {
  await ensureSqliteSchema();
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  });
};

const getNeonPool = () => {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when DB_PROVIDER=neon');
  }

  const globalForDb = globalThis as unknown as { __neonPool?: Pool };
  if (globalForDb.__neonPool) return globalForDb.__neonPool;

  globalForDb.__neonPool = new Pool({
    connectionString: databaseUrl,
    ssl: true
  });

  return globalForDb.__neonPool;
};

const createNeonDrizzleDb = () => drizzle(getNeonPool(), { schema: { tasks } });

const getNeonDrizzleDb = () => {
  const globalForDb = globalThis as unknown as { __neonDrizzleDb?: ReturnType<typeof createNeonDrizzleDb> };
  if (globalForDb.__neonDrizzleDb) return globalForDb.__neonDrizzleDb;
  globalForDb.__neonDrizzleDb = createNeonDrizzleDb();
  return globalForDb.__neonDrizzleDb;
};

const ensureNeonSchema = async () => {
  if (neonSchemaReady) return neonSchemaReady;

  neonSchemaReady = (async () => {
    const pool = getNeonPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        "personUrl" TEXT,
        "garmentUrl" TEXT,
        mode TEXT,
        "resultUrl" TEXT,
        error TEXT,
        "retryCount" INTEGER DEFAULT 0,
        "createdAt" BIGINT NOT NULL
      );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks ("createdAt");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);`);
  })();

  return neonSchemaReady;
};

export const createPendingTask = async (task: Pick<TaskRecord, 'id' | 'status' | 'personUrl' | 'garmentUrl' | 'mode' | 'createdAt'>) => {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    const db = await openSqliteDb();
    await db.run(
      `INSERT INTO tasks (id, status, personUrl, garmentUrl, mode, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [task.id, task.status, task.personUrl, task.garmentUrl, task.mode, task.createdAt]
    );
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.insert(tasks).values({
    id: task.id,
    status: task.status,
    personUrl: task.personUrl,
    garmentUrl: task.garmentUrl,
    mode: task.mode,
    createdAt: task.createdAt
  });
};

export const setTaskProcessing = async (taskId: string) => {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    const db = await openSqliteDb();
    await db.run('UPDATE tasks SET status = ? WHERE id = ?', ['processing', taskId]);
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.update(tasks).set({ status: 'processing' }).where(eq(tasks.id, taskId));
};

export const setTaskSuccess = async (taskId: string, resultUrl: string) => {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    const db = await openSqliteDb();
    await db.run('UPDATE tasks SET status = ?, resultUrl = ? WHERE id = ?', ['success', resultUrl, taskId]);
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(tasks)
    .set({ status: 'success', resultUrl })
    .where(eq(tasks.id, taskId));
};

export const setTaskFailed = async (taskId: string, errorMessage: string) => {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    const db = await openSqliteDb();
    await db.run('UPDATE tasks SET status = ?, error = ? WHERE id = ?', ['failed', errorMessage, taskId]);
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(tasks)
    .set({ status: 'failed', error: errorMessage })
    .where(eq(tasks.id, taskId));
};

export const getTaskById = async (taskId: string): Promise<Pick<TaskRecord, 'status' | 'resultUrl' | 'error'> | null> => {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    const db = await openSqliteDb();
    const row = (await db.get('SELECT status, resultUrl, error FROM tasks WHERE id = ?', [taskId])) as
      | Pick<TaskRecord, 'status' | 'resultUrl' | 'error'>
      | undefined;
    return row || null;
  }

  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select({ status: tasks.status, resultUrl: tasks.resultUrl, error: tasks.error })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return rows[0] || null;
};
