import { NextResponse } from 'next/server';
import { logoutCurrentSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const startedAt = Date.now();
  try {
    const logoutStartedAt = Date.now();
    await logoutCurrentSession();
    const logoutDurationMs = Date.now() - logoutStartedAt;

    console.info('[perf/auth/logout]', {
      status: 200,
      logoutDurationMs,
      totalDurationMs: Date.now() - startedAt
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[auth/logout] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '退出登录失败' }, { status: 500 });
  }
}
