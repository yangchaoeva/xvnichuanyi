import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const tryReadTextFile = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
};

const applyEnvFromText = (text) => {
  if (!text) return;

  for (const rawLine of text.split(/\r?\n/)) {
    let trimmed = rawLine.trim().replace(/^\uFEFF/, '');
    if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length > 1) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    const line = trimmed.replace(/^[\-\u2013\u2014\u2022]\s*/, '').trimStart();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    const colonIndex = line.indexOf(':');
    const separatorIndex = equalsIndex >= 0 ? equalsIndex : colonIndex;
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) continue;
    const existing = process.env[key];
    if (existing !== undefined && existing !== '') continue;

    const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    process.env[key] = unquoted;

    if (key === 'DATABASE_URL' || key === 'NEON_DATABASE_URL') {
      console.info('[migrate] env_set', { key, valueLength: unquoted.length });
    }
  }
};

const loadEnv = () => {
  const cwd = process.cwd();
  const envLocal = tryReadTextFile(path.join(cwd, '.env.local'));
  const env = tryReadTextFile(path.join(cwd, '.env'));
  applyEnvFromText(envLocal);
  applyEnvFromText(env);

  const databaseUrl = getDatabaseUrl();

  console.info('[migrate] env_loaded', {
    hasEnvLocal: Boolean(envLocal),
    envLocalLength: typeof envLocal === 'string' ? envLocal.length : 0,
    envLocalHasDatabaseUrlKey: typeof envLocal === 'string' ? envLocal.includes('DATABASE_URL') : false,
    hasEnv: Boolean(env),
    hasDatabaseUrl: Boolean(databaseUrl),
    databaseUrlLength: typeof databaseUrl === 'string' ? databaseUrl.length : 0
  });
};

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || null;

const ensureNeonSchema = async (client) => {
  await client.query(`
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

  await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks ("createdAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);`);
};

const main = async () => {
  loadEnv();

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL (or NEON_DATABASE_URL). Set it in .env.local or environment variables.');
  }

  const sqlitePath = path.join(process.cwd(), 'tasks.db');
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite file not found: ${sqlitePath}`);
  }

  const batchSize = Number(process.env.MIGRATE_BATCH_SIZE || '200');
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('MIGRATE_BATCH_SIZE must be a positive number');
  }

  const sqlite3Module = await import('sqlite3');
  const sqliteModule = await import('sqlite');

  const sqlite3Default = sqlite3Module.default ?? sqlite3Module;
  const sqlite3Database = sqlite3Default.Database;
  const open = sqliteModule.open;

  if (!sqlite3Database || !open) {
    throw new Error('SQLite dependencies are not available. Install sqlite and sqlite3 to run this migration script.');
  }

  const sqliteDb = await open({
    filename: sqlitePath,
    driver: sqlite3Database
  });

  const sqliteCountRow = await sqliteDb.get('SELECT COUNT(*) AS count FROM tasks');
  const sqliteCount = Number(sqliteCountRow?.count || 0);

  console.info('[migrate] source=sqlite', { sqlitePath, sqliteCount, batchSize });

  const pool = new Pool({ connectionString: databaseUrl, ssl: true });
  const client = await pool.connect();

  const upsertSql = `
    INSERT INTO tasks (id, status, "personUrl", "garmentUrl", mode, "resultUrl", error, "retryCount", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      "personUrl" = EXCLUDED."personUrl",
      "garmentUrl" = EXCLUDED."garmentUrl",
      mode = EXCLUDED.mode,
      "resultUrl" = EXCLUDED."resultUrl",
      error = EXCLUDED.error,
      "retryCount" = EXCLUDED."retryCount",
      "createdAt" = EXCLUDED."createdAt"
  `;

  try {
    await client.query('BEGIN');
    await ensureNeonSchema(client);

    let offset = 0;
    let migrated = 0;

    while (true) {
      const rows = await sqliteDb.all(
        `SELECT id, status, personUrl, garmentUrl, mode, resultUrl, error, retryCount, createdAt
         FROM tasks
         ORDER BY createdAt ASC
         LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      if (!rows?.length) break;

      for (const row of rows) {
        await client.query(upsertSql, [
          row.id,
          row.status,
          row.personUrl ?? null,
          row.garmentUrl ?? null,
          row.mode ?? null,
          row.resultUrl ?? null,
          row.error ?? null,
          Number(row.retryCount || 0),
          Number(row.createdAt)
        ]);
        migrated += 1;
      }

      offset += rows.length;

      if (migrated % 200 === 0 || offset >= sqliteCount) {
        console.info('[migrate] progress', { migrated, sqliteCount });
      }
    }

    const neonCountRes = await client.query('SELECT COUNT(*)::bigint AS count FROM tasks');
    const neonCount = Number(neonCountRes.rows?.[0]?.count || 0);

    await client.query('COMMIT');

    console.info('[migrate] done', { migrated, sqliteCount, neonCount });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('[migrate] failed', { errorName: error?.name, errorMessage: error?.message });
  process.exitCode = 1;
});
