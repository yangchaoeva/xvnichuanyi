import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  countRecentFailedLoginAttempts,
  createAuthSession,
  getSessionWithUserByTokenHash,
  recordLoginAttempt,
  revokeSessionByTokenHash
} from '@/lib/db';

const scrypt = promisify(scryptCallback);

export const AUTH_COOKIE_NAME = 'auth_session';
export const SESSION_MAX_AGE_SECONDS = 15 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
export const LOGIN_ATTEMPTS_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_ATTEMPTS_MAX = 8;

const HASH_SEPARATOR = '.';

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
};

const normalizeHex = (value: string) => value.trim().toLowerCase();

const normalizeIp = (request: Request | NextRequest) => {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  return null;
};

export const normalizeEmail = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
};

export const normalizeUsername = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 3 || value.length > 32) return null;
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(value)) return null;
  return value;
};

export const normalizePassword = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 8 || value.length > 128) return null;
  return value;
};

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const keyLength = 64;
  const derived = (await scrypt(password, salt, keyLength)) as Buffer;
  return `${salt.toString('hex')}${HASH_SEPARATOR}${derived.toString('hex')}`;
};

export const verifyPassword = async (password: string, passwordHash: string) => {
  const [saltHex, hashHex] = passwordHash.split(HASH_SEPARATOR);
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(normalizeHex(saltHex), 'hex');
  const storedHash = Buffer.from(normalizeHex(hashHex), 'hex');
  const derived = (await scrypt(password, salt, storedHash.length)) as Buffer;

  if (derived.length !== storedHash.length) return false;
  return timingSafeEqual(derived, storedHash);
};

export const createSessionToken = () => randomBytes(32).toString('hex');

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const setAuthCookie = (token: string, rememberMe: boolean) => {
  const cookieStore = cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(rememberMe ? { maxAge: SESSION_MAX_AGE_SECONDS } : {})
  });
};

export const clearAuthCookie = () => {
  cookies().delete(AUTH_COOKIE_NAME);
};

export const createUserSession = async (params: {
  userId: string;
  rememberMe: boolean;
  request: Request | NextRequest;
}) => {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = Date.now();

  await createAuthSession({
    id: crypto.randomUUID(),
    userId: params.userId,
    tokenHash,
    rememberMe: params.rememberMe,
    expiresAt: now + SESSION_MAX_AGE_MS,
    ip: normalizeIp(params.request),
    userAgent: params.request.headers.get('user-agent')
  });

  setAuthCookie(token, params.rememberMe);
};

export const getCurrentUser = async (): Promise<AuthenticatedUser | null> => {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await getSessionWithUserByTokenHash(hashSessionToken(token));
  if (!session) return null;

  return {
    id: session.userId,
    email: session.email,
    username: session.username,
    role: session.role
  };
};

export const requireUser = async (): Promise<AuthenticatedUser> => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
};

export const logoutCurrentSession = async () => {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await revokeSessionByTokenHash(hashSessionToken(token));
  }
  clearAuthCookie();
};

export const isLoginRateLimited = async (email: string, request: Request | NextRequest) => {
  const failedCount = await countRecentFailedLoginAttempts(email, normalizeIp(request), LOGIN_ATTEMPTS_WINDOW_MS);
  return failedCount >= LOGIN_ATTEMPTS_MAX;
};

export const trackLoginAttempt = async (email: string, request: Request | NextRequest, success: boolean) => {
  await recordLoginAttempt(email, normalizeIp(request), success);
};
