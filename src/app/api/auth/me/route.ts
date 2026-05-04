import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    const authStartedAt = Date.now();
    const user = await getCurrentUser();
    const authDurationMs = Date.now() - authStartedAt;

    if (!user) {
      console.info('[perf/auth/me]', {
        status: 401,
        authDurationMs,
        totalDurationMs: Date.now() - startedAt
      });
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    console.info('[perf/auth/me]', {
      status: 200,
      authDurationMs,
      totalDurationMs: Date.now() - startedAt
    });
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('[auth/me] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
  }
}
