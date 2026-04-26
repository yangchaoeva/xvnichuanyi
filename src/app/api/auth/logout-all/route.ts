import { NextResponse } from 'next/server';
import { getCurrentUser, logoutCurrentSession } from '@/lib/auth';
import { revokeAllSessionsForUser } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    await Promise.all([revokeAllSessionsForUser(user.id), logoutCurrentSession()]);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[auth/logout-all] failed', {
      errorName: error?.name,
      errorMessage: error?.message
    });
    return NextResponse.json({ error: '退出全部设备失败' }, { status: 500 });
  }
}
