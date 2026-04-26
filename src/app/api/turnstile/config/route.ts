import { NextResponse } from 'next/server';
import { getTurnstileRequestHostname, getTurnstileSiteKey, hasTurnstileValue, isLocalHostname } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const hostname = getTurnstileRequestHostname(request);
  const siteKey = getTurnstileSiteKey(hostname);
  const configured = hasTurnstileValue(siteKey);

  return NextResponse.json(
    {
      ok: configured,
      hostname,
      mode: isLocalHostname(hostname) ? 'local' : 'production',
      siteKey: configured ? siteKey : null,
      issue: configured ? null : 'missing_site_key'
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
