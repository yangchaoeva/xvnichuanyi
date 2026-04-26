const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeValue = (value: string | undefined) => value?.trim() || '';

export const isLocalHostname = (hostname: string | null | undefined) => {
  if (!hostname) return false;
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase());
};

export const getTurnstileSiteKey = (hostname: string | null | undefined) => {
  const localSiteKey = normalizeValue(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY_LOCAL);
  const defaultSiteKey = normalizeValue(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  if (isLocalHostname(hostname) && localSiteKey) {
    return localSiteKey;
  }

  return defaultSiteKey;
};

const getHostnameFromOrigin = (origin: string | null) => {
  if (!origin) return null;

  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
};

const getRequestHostname = (request: Request) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const firstHost = forwardedHost.split(',')[0]?.trim();
    if (firstHost) {
      return firstHost.split(':')[0]?.trim().toLowerCase() || null;
    }
  }

  const hostHeader = request.headers.get('host');
  if (hostHeader) {
    return hostHeader.split(':')[0]?.trim().toLowerCase() || null;
  }

  const originHostname = getHostnameFromOrigin(request.headers.get('origin'));
  if (originHostname) {
    return originHostname.toLowerCase();
  }

  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

export const getTurnstileSecretKey = (request: Request) => {
  const localSecretKey = normalizeValue(process.env.TURNSTILE_SECRET_KEY_LOCAL);
  const defaultSecretKey = normalizeValue(process.env.TURNSTILE_SECRET_KEY);

  if (isLocalHostname(getRequestHostname(request)) && localSecretKey) {
    return localSecretKey;
  }

  return defaultSecretKey;
};
