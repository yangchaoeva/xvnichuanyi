import { NextResponse } from 'next/server';
import { logoutCurrentSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await logoutCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[auth/logout] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '退出登录失败' }, { status: 500 });
  }
}
