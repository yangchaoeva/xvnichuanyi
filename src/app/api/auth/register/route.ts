import { NextResponse } from 'next/server';
import { createUser, countUsers, getUserByEmail, getUserByUsername } from '@/lib/db';
import {
  createUserSession,
  hashPassword,
  normalizeEmail,
  normalizePassword,
  normalizeUsername
} from '@/lib/auth';
import { getTurnstileSecretKey } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getClientIp = (req: Request) => {
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  return null;
};

const verifyTurnstileToken = async (req: Request, token: string) => {
  const secret = getTurnstileSecretKey(req);
  if (!secret) {
    throw new Error('TURNSTILE secret key is missing');
  }

  const formData = new URLSearchParams();
  formData.set('secret', secret);
  formData.set('response', token);
  const clientIp = getClientIp(req);
  if (clientIp) {
    formData.set('remoteip', clientIp);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: controller.signal
    });

    if (!verifyResponse.ok) {
      return false;
    }

    const verifyResult = (await verifyResponse.json()) as { success?: boolean };
    return verifyResult.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const getAdminEmails = () => {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
    const email = normalizeEmail(body?.email);
    const username = normalizeUsername(body?.username);
    const password = normalizePassword(body?.password);

    if (!turnstileToken) {
      return NextResponse.json({ error: '请先完成人机验证' }, { status: 400 });
    }

    const turnstileOk = await verifyTurnstileToken(req, turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json({ error: '人机验证失败，请重试' }, { status: 403 });
    }

    if (!email) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ error: '用户名需为 3-32 位，仅支持中文、英文、数字、下划线或短横线' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 });
    }

    const [existingEmail, existingUsername] = await Promise.all([getUserByEmail(email), getUserByUsername(username)]);
    if (existingEmail) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 });
    }
    if (existingUsername) {
      return NextResponse.json({ error: '该用户名已被占用' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const currentUserCount = await countUsers();
    const adminEmails = getAdminEmails();
    const role = currentUserCount === 0 || adminEmails.has(email) ? 'admin' : 'user';

    await createUser({
      id: userId,
      email,
      username,
      passwordHash,
      role
    });

    await createUserSession({
      userId,
      rememberMe: true,
      request: req
    });

    return NextResponse.json({
      user: { id: userId, email, username, role }
    });
  } catch (error: any) {
    console.error('[auth/register] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
