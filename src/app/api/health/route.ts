import { NextResponse } from 'next/server';
import {
  getTurnstileRequestHostname,
  getTurnstileSecretKey,
  getTurnstileSiteKey,
  hasTurnstileValue,
  isLocalHostname
} from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const hostname = getTurnstileRequestHostname(request);
  const siteKey = getTurnstileSiteKey(hostname);
  const secretKey = getTurnstileSecretKey(request);
  const isLocal = isLocalHostname(hostname);

  return NextResponse.json(
    {
      ok: true,
      hostname,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      turnstile: {
        mode: isLocal ? 'local' : 'production',
        siteKeyConfigured: hasTurnstileValue(siteKey),
        secretKeyConfigured: hasTurnstileValue(secretKey),
        siteKeyPrefix: siteKey ? `${siteKey.slice(0, 12)}...` : null
      }
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
