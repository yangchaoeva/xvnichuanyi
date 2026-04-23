import type { Config } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

const tryReadTextFile = (filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
};

const applyEnvFromText = (text: string | null) => {
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

const loadEnv = () => {
  const cwd = process.cwd();
  applyEnvFromText(tryReadTextFile(path.join(cwd, '.env.local')));
  applyEnvFromText(tryReadTextFile(path.join(cwd, '.env')));
};

loadEnv();

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit');
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl
  }
} satisfies Config;
