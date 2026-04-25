import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { tasks } from '@/db/schema';

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

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || null;

let neonSchemaReady: Promise<void> | null = null;

const getNeonPool = () => {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL (or NEON_DATABASE_URL) is required');
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
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.update(tasks).set({ status: 'processing' }).where(eq(tasks.id, taskId));
};

export const setTaskSuccess = async (taskId: string, resultUrl: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(tasks)
    .set({ status: 'success', resultUrl })
    .where(eq(tasks.id, taskId));
};

export const setTaskFailed = async (taskId: string, errorMessage: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(tasks)
    .set({ status: 'failed', error: errorMessage })
    .where(eq(tasks.id, taskId));
};

export const getTaskById = async (taskId: string): Promise<Pick<TaskRecord, 'status' | 'resultUrl' | 'error'> | null> => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select({ status: tasks.status, resultUrl: tasks.resultUrl, error: tasks.error })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return rows[0] || null;
};
