import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { authLoginAttempts, authSessions, tasks, users, type UserRow } from '@/db/schema';

export type TaskRecord = {
  id: string;
  userId: string | null;
  status: string;
  personUrl: string | null;
  garmentUrl: string | null;
  mode: string | null;
  resultUrl: string | null;
  error: string | null;
  retryCount: number;
  createdAt: number;
};

export type SessionUserRecord = Pick<UserRow, 'id' | 'email' | 'username' | 'role'>;

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

const createNeonDrizzleDb = () =>
  drizzle(getNeonPool(), {
    schema: { tasks, users, authSessions, authLoginAttempts }
  });

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
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('user', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        "createdAt" BIGINT NOT NULL,
        "updatedAt" BIGINT NOT NULL,
        "lastLoginAt" BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" TEXT NOT NULL UNIQUE,
        "rememberMe" BOOLEAN NOT NULL DEFAULT false,
        ip TEXT,
        "userAgent" TEXT,
        "expiresAt" BIGINT NOT NULL,
        "createdAt" BIGINT NOT NULL,
        "revokedAt" BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_login_attempts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT,
        success BOOLEAN NOT NULL,
        "createdAt" BIGINT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        "userId" TEXT REFERENCES users(id) ON DELETE SET NULL,
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
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_userId ON tasks ("userId");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_tokenHash ON auth_sessions ("tokenHash");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_userId ON auth_sessions ("userId");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiresAt ON auth_sessions ("expiresAt");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email ON auth_login_attempts (email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_createdAt ON auth_login_attempts ("createdAt");`);
  })();

  return neonSchemaReady;
};

export const createPendingTask = async (
  task: Pick<TaskRecord, 'id' | 'userId' | 'status' | 'personUrl' | 'garmentUrl' | 'mode' | 'createdAt'>
) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.insert(tasks).values({
    id: task.id,
    userId: task.userId,
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

export const getTaskById = async (
  taskId: string
): Promise<Pick<TaskRecord, 'userId' | 'status' | 'resultUrl' | 'error'> | null> => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select({ userId: tasks.userId, status: tasks.status, resultUrl: tasks.resultUrl, error: tasks.error })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return rows[0] || null;
};

export const getUserByEmail = async (email: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] || null;
};

export const getUserByUsername = async (username: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] || null;
};

export const getUserById = async (userId: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] || null;
};

export const countUsers = async () => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const rows = await db.select({ total: count() }).from(users);
  return Number(rows[0]?.total ?? 0);
};

type CreateUserInput = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role?: 'user' | 'admin';
};

export const createUser = async (input: CreateUserInput) => {
  await ensureNeonSchema();
  const now = Date.now();
  const db = getNeonDrizzleDb();
  await db.insert(users).values({
    id: input.id,
    email: input.email,
    username: input.username,
    passwordHash: input.passwordHash,
    role: input.role ?? 'user',
    createdAt: now,
    updatedAt: now
  });
};

type CreateAuthSessionInput = {
  id: string;
  userId: string;
  tokenHash: string;
  rememberMe: boolean;
  expiresAt: number;
  ip?: string | null;
  userAgent?: string | null;
};

export const createAuthSession = async (input: CreateAuthSessionInput) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.insert(authSessions).values({
    id: input.id,
    userId: input.userId,
    tokenHash: input.tokenHash,
    rememberMe: input.rememberMe,
    expiresAt: input.expiresAt,
    createdAt: Date.now(),
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null
  });
};

export const touchUserLastLogin = async (userId: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(users)
    .set({ lastLoginAt: Date.now(), updatedAt: Date.now() })
    .where(eq(users.id, userId));
};

export const getSessionWithUserByTokenHash = async (tokenHash: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const now = Date.now();
  const rows = await db
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      expiresAt: authSessions.expiresAt
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now)
      )
    )
    .limit(1);

  return rows[0] || null;
};

export const revokeSessionByTokenHash = async (tokenHash: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(authSessions)
    .set({ revokedAt: Date.now() })
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
};

export const revokeAllSessionsForUser = async (userId: string) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db
    .update(authSessions)
    .set({ revokedAt: Date.now() })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
};

export const recordLoginAttempt = async (email: string, ip: string | null, success: boolean) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  await db.insert(authLoginAttempts).values({
    id: crypto.randomUUID(),
    email,
    ip,
    success,
    createdAt: Date.now()
  });
};

export const countRecentFailedLoginAttempts = async (email: string, ip: string | null, windowMs: number) => {
  await ensureNeonSchema();
  const db = getNeonDrizzleDb();
  const threshold = Date.now() - windowMs;

  const where = ip
    ? and(eq(authLoginAttempts.email, email), eq(authLoginAttempts.ip, ip), eq(authLoginAttempts.success, false), gt(authLoginAttempts.createdAt, threshold))
    : and(eq(authLoginAttempts.email, email), eq(authLoginAttempts.success, false), gt(authLoginAttempts.createdAt, threshold));

  const rows = await db.select({ total: count() }).from(authLoginAttempts).where(where);
  return Number(rows[0]?.total ?? 0);
};
