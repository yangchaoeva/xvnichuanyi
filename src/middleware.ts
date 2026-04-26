import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_session';

const AUTH_PAGES = new Set(['/login', '/register']);
const PROTECTED_PAGE_PREFIXES = ['/', '/admin'];

const isProtectedPage = (pathname: string) => {
  if (pathname === '/') return true;
  return PROTECTED_PAGE_PREFIXES.some((prefix) => prefix !== '/' && pathname.startsWith(prefix));
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (!hasSessionCookie && isProtectedPage(pathname) && !pathname.startsWith('/api')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (hasSessionCookie && AUTH_PAGES.has(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)']
};
