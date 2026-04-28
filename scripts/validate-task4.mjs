import { put } from '@vercel/blob';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const AUTH_COOKIE_NAME = 'auth_session';
const SESSION_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;

const tryReadTextFile = async (filePath) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
};

const applyEnvFromText = (text) => {
  if (!text) return;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim().replace(/^\uFEFF/, '');
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;

    const existing = process.env[key];
    if (existing !== undefined && existing !== '') continue;

    const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    process.env[key] = unquoted;
  }
};

const loadEnv = async () => {
  const cwd = process.cwd();
  const envLocal = await tryReadTextFile(path.join(cwd, '.env.local'));
  const env = await tryReadTextFile(path.join(cwd, '.env'));
  applyEnvFromText(envLocal);
  applyEnvFromText(env);
};

const createSessionToken = () => randomBytes(32).toString('hex');
const hashSessionToken = (token) => createHash('sha256').update(token).digest('hex');

const sanitizePathSegment = (input) =>
  input
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'user';

const detectContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
};

const assert = (condition, message) => {
  if (condition) return;
  throw new Error(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postJson = async (url, body, headers) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const errorMessage =
      (json && typeof json === 'object' && 'error' in json && typeof json.error === 'string' && json.error) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`POST ${url} failed: ${errorMessage}`);
  }

  return json;
};

const getJson = async (url, headers) => {
  const res = await fetch(url, { headers: { ...(headers ?? {}) } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const errorMessage =
      (json && typeof json === 'object' && 'error' in json && typeof json.error === 'string' && json.error) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`GET ${url} failed: ${errorMessage}`);
  }

  return json;
};

const uploadLocalImageToBlob = async (filePath, pathnamePrefix) => {
  const contentType = detectContentType(filePath);
  assert(contentType, `不支持的图片后缀：${filePath}`);

  const buffer = await fs.readFile(filePath);
  const randomCode = randomBytes(5).toString('hex');
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const pathname = `${pathnamePrefix}-${Date.now()}-${randomCode}.${ext}`;

  const result = await put(pathname, buffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType
  });

  return result.url;
};

const ensureSchema = async (pool) => {
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
    CREATE TABLE IF NOT EXISTS user_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      source_url TEXT NOT NULL,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL
    );
  `);
};

const main = async () => {
  await loadEnv();

  const appUrl = process.env.APP_URL?.trim() || 'http://127.0.0.1:3001';
  const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim() || null;

  assert(databaseUrl, '缺少 DATABASE_URL (或 NEON_DATABASE_URL)');
  assert(process.env.BLOB_READ_WRITE_TOKEN, '缺少 BLOB_READ_WRITE_TOKEN');

  const defaultPersonPath =
    'stitch_minimalist_virtual_fitting/stitch_minimalist_virtual_fitting/apple_style/screen.png';
  const defaultGarmentPath =
    'stitch_minimalist_virtual_fitting/stitch_minimalist_virtual_fitting/image.png/screen.png';

  const personImagePath = process.env.PERSON_IMAGE_PATH?.trim() || defaultPersonPath;
  const garmentImagePath = process.env.GARMENT_IMAGE_PATH?.trim() || defaultGarmentPath;

  await fs.access(personImagePath);
  await fs.access(garmentImagePath);

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await ensureSchema(pool);

  const userId = randomUUID();
  const now = Date.now();
  const email = `task4_${now}_${randomBytes(4).toString('hex')}@example.com`;
  const username = `task4_${now}_${randomBytes(3).toString('hex')}`;

  await pool.query(
    `INSERT INTO users (id, email, username, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7);`,
    [userId, email, username, 'not_used_for_task4', 'user', now, now]
  );

  const sessionToken = createSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const sessionId = randomUUID();
  const expiresAt = now + SESSION_MAX_AGE_MS;

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, remember_me, expires_at, created_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
    [sessionId, userId, sessionTokenHash, true, expiresAt, now, null, 'task4-validate-script']
  );

  const personUrl = await uploadLocalImageToBlob(personImagePath, `task4-inputs/${userId}/person`);
  const garmentUrl = await uploadLocalImageToBlob(garmentImagePath, `task4-inputs/${userId}/garment`);

  assert(personUrl.startsWith('https://'), `personUrl 不是 https：${personUrl}`);
  assert(garmentUrl.startsWith('https://'), `garmentUrl 不是 https：${garmentUrl}`);

  const cookieHeader = `${AUTH_COOKIE_NAME}=${sessionToken}`;

  const { taskId } = await postJson(
    `${appUrl}/api/try-on`,
    {
      personUrl,
      garmentUrl,
      mode: 'realistic'
    },
    { cookie: cookieHeader }
  );

  assert(typeof taskId === 'string' && taskId.length > 0, 'POST /api/try-on 返回缺少 taskId');

  const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS || 120_000);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 1_000);
  const startedAt = Date.now();

  let finalStatus = null;
  let finalResultUrl = null;
  let finalError = null;

  while (Date.now() - startedAt < pollTimeoutMs) {
    const data = await getJson(`${appUrl}/api/status?taskId=${encodeURIComponent(taskId)}`, {
      cookie: cookieHeader
    });

    const status = data?.status;
    if (status === 'success') {
      finalStatus = 'success';
      finalResultUrl = data?.resultUrl ?? null;
      break;
    }
    if (status === 'failed') {
      finalStatus = 'failed';
      finalError = data?.error ?? null;
      break;
    }

    await sleep(pollIntervalMs);
  }

  assert(finalStatus, `轮询超时：${pollTimeoutMs}ms 内未返回 success/failed`);
  assert(finalStatus === 'success', `任务失败：${finalError ?? 'unknown error'}`);

  assert(typeof finalResultUrl === 'string' && finalResultUrl.length > 0, 'success 但 resultUrl 为空');

  const parsedResultUrl = new URL(finalResultUrl);
  assert(parsedResultUrl.protocol === 'https:', `resultUrl 不是 https：${finalResultUrl}`);
  assert(
    parsedResultUrl.hostname.includes('vercel-storage') || parsedResultUrl.hostname.includes('blob'),
    `resultUrl 看起来不是 Blob URL：${finalResultUrl}`
  );
  assert(parsedResultUrl.pathname.includes('/generated/'), `resultUrl 路径未包含 generated/：${finalResultUrl}`);

  const filename = parsedResultUrl.pathname.split('/').filter(Boolean).pop() || '';
  const safeUserId = sanitizePathSegment(userId);
  const filenameRegex = new RegExp(`^${safeUserId}-\\d{13}-[0-9a-f]{10}\\.(png|jpg|webp)$`);
  assert(filenameRegex.test(filename), `resultUrl 文件名不匹配规则：${filename}`);

  const expectedPathSuffix = `/generated/${filename}`;
  assert(
    parsedResultUrl.pathname.endsWith(expectedPathSuffix),
    `resultUrl pathname 不匹配（期望以 ${expectedPathSuffix} 结尾）：${parsedResultUrl.pathname}`
  );

  const assetRow = await pool.query(
    `SELECT id, user_id, url, source_url, task_id, created_at
     FROM user_assets
     WHERE user_id = $1 AND task_id = $2 AND url = $3
     LIMIT 1;`,
    [userId, taskId, finalResultUrl]
  );

  assert(assetRow.rows.length === 1, '数据库未找到对应 user_assets 记录');
  assert(assetRow.rows[0].user_id === userId, 'user_assets.user_id 不匹配');

  console.info(JSON.stringify({ ok: true, userId, taskId, resultUrl: finalResultUrl }, null, 2));

  await pool.end();
};

main().catch((error) => {
  console.error('[validate-task4] failed', error?.message || error);
  process.exitCode = 1;
});
