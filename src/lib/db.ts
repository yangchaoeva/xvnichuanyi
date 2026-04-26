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
        password_hash TEXT NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        last_login_at BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        remember_me BOOLEAN NOT NULL DEFAULT false,
        ip TEXT,
        user_agent TEXT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        revoked_at BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_login_attempts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT,
        success BOOLEAN NOT NULL,
        created_at BIGINT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL,
        person_url TEXT,
        garment_url TEXT,
        mode TEXT,
        result_url TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL
      );
    `);

    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'passwordHash')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash') THEN
          ALTER TABLE users RENAME COLUMN "passwordHash" TO password_hash;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'createdAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_at') THEN
          ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updatedAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
          ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'lastLoginAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
          ALTER TABLE users RENAME COLUMN "lastLoginAt" TO last_login_at;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'userId')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'user_id') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "userId" TO user_id;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'tokenHash')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'token_hash') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "tokenHash" TO token_hash;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'rememberMe')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'remember_me') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "rememberMe" TO remember_me;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'userAgent')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'user_agent') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "userAgent" TO user_agent;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'expiresAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'expires_at') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "expiresAt" TO expires_at;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'createdAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'created_at') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "createdAt" TO created_at;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'revokedAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_sessions' AND column_name = 'revoked_at') THEN
          ALTER TABLE auth_sessions RENAME COLUMN "revokedAt" TO revoked_at;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_login_attempts' AND column_name = 'createdAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_login_attempts' AND column_name = 'created_at') THEN
          ALTER TABLE auth_login_attempts RENAME COLUMN "createdAt" TO created_at;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'userId')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'user_id') THEN
          ALTER TABLE tasks RENAME COLUMN "userId" TO user_id;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'personUrl')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'person_url') THEN
          ALTER TABLE tasks RENAME COLUMN "personUrl" TO person_url;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'garmentUrl')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'garment_url') THEN
          ALTER TABLE tasks RENAME COLUMN "garmentUrl" TO garment_url;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'resultUrl')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'result_url') THEN
          ALTER TABLE tasks RENAME COLUMN "resultUrl" TO result_url;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'retryCount')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'retry_count') THEN
          ALTER TABLE tasks RENAME COLUMN "retryCount" TO retry_count;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'createdAt')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_at') THEN
          ALTER TABLE tasks RENAME COLUMN "createdAt" TO created_at;
        END IF;
      END $$;
    `);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at BIGINT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at BIGINT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at BIGINT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS remember_me BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS expires_at BIGINT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS created_at BIGINT;`);
    await pool.query(`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS revoked_at BIGINT;`);
    await pool.query(`ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS created_at BIGINT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS person_url TEXT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS garment_url TEXT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_url TEXT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at BIGINT;`);

    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_user_id_fkey') THEN
          ALTER TABLE auth_sessions
            ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_id_fkey') THEN
          ALTER TABLE tasks
            ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks (user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (token_hash);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email ON auth_login_attempts (email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_created_at ON auth_login_attempts (created_at);`);
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
