import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateUser,
  mockCountUsers,
  mockGetUserByEmail,
  mockGetUserByUsername,
  mockCreateUserSession,
  mockHashPassword,
  mockSendWelcomeEmail,
  mockGetTurnstileSecretKey,
} = vi.hoisted(() => {
  return {
    mockCreateUser: vi.fn(),
    mockCountUsers: vi.fn(),
    mockGetUserByEmail: vi.fn(),
    mockGetUserByUsername: vi.fn(),
    mockCreateUserSession: vi.fn(),
    mockHashPassword: vi.fn(),
    mockSendWelcomeEmail: vi.fn(),
    mockGetTurnstileSecretKey: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  createUser: mockCreateUser,
  countUsers: mockCountUsers,
  getUserByEmail: mockGetUserByEmail,
  getUserByUsername: mockGetUserByUsername,
}));

vi.mock('@/lib/auth', () => ({
  createUserSession: mockCreateUserSession,
  hashPassword: mockHashPassword,
  normalizeEmail: (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
  normalizeUsername: (value: unknown) => (typeof value === 'string' ? value.trim() : null),
  normalizePassword: (value: unknown) => (typeof value === 'string' && value.length >= 8 ? value : null),
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

vi.mock('@/lib/turnstile', () => ({
  getTurnstileSecretKey: mockGetTurnstileSecretKey,
}));

import { POST } from './route';

const createRegisterRequest = (body: Record<string, unknown>) => {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

beforeEach(() => {
  vi.restoreAllMocks();

  vi.stubGlobal('fetch', vi.fn(async () => {
    return {
      ok: true,
      json: async () => ({ success: true }),
    } as any;
  }) as any);

  mockGetTurnstileSecretKey.mockReturnValue('turnstile_secret');
  mockGetUserByEmail.mockResolvedValue(null);
  mockGetUserByUsername.mockResolvedValue(null);
  mockCountUsers.mockResolvedValue(1);
  mockHashPassword.mockResolvedValue('hashed_password');
  mockCreateUser.mockResolvedValue(undefined);
  mockCreateUserSession.mockResolvedValue(undefined);
  mockSendWelcomeEmail.mockResolvedValue({ id: 'email_1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/register', () => {
  it('registers successfully and triggers welcome email', async () => {
    const req = createRegisterRequest({
      turnstileToken: 'token_1',
      email: 'test@example.com',
      username: 'Alice',
      password: 'password123',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user?.email).toBe('test@example.com');
    expect(body.user?.username).toBe('Alice');
    expect(body.user?.role).toBe('user');
    expect(typeof body.user?.id).toBe('string');
    expect(body.user?.id.length).toBeGreaterThan(0);

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUserSession).toHaveBeenCalledTimes(1);
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('test@example.com', 'Alice');
  });

  it('returns success even when welcome email fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSendWelcomeEmail.mockRejectedValueOnce(new Error('send_failed'));

    const req = createRegisterRequest({
      turnstileToken: 'token_1',
      email: 'test@example.com',
      username: 'Alice',
      password: 'password123',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(typeof body.user?.id).toBe('string');
    expect(body.user?.id.length).toBeGreaterThan(0);
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleErrorSpy.mock.calls[0]?.[0] ?? '')).toContain('[auth/register] welcome_email_failed');
  });

  it('rejects when turnstile token is missing', async () => {
    const req = createRegisterRequest({
      email: 'test@example.com',
      username: 'Alice',
      password: 'password123',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: '请先完成人机验证' });
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });
});
