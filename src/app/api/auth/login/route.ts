import { NextResponse } from 'next/server';
import { getUserByEmail, touchUserLastLogin } from '@/lib/db';
import {
  createUserSession,
  isLoginRateLimited,
  normalizeEmail,
  normalizePassword,
  trackLoginAttempt,
  verifyPassword
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const password = normalizePassword(body?.password);
    const rememberMe = Boolean(body?.rememberMe);

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱或密码不正确' }, { status: 400 });
    }

    const rateLimited = await isLoginRateLimited(email, req);
    if (rateLimited) {
      return NextResponse.json({ error: '尝试次数过多，请 10 分钟后再试' }, { status: 429 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      await trackLoginAttempt(email, req, false);
      return NextResponse.json({ error: '邮箱或密码不正确' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await trackLoginAttempt(email, req, false);
      return NextResponse.json({ error: '邮箱或密码不正确' }, { status: 401 });
    }

    await Promise.all([
      createUserSession({
        userId: user.id,
        rememberMe,
        request: req
      }),
      touchUserLastLogin(user.id),
      trackLoginAttempt(email, req, true)
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('[auth/login] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
