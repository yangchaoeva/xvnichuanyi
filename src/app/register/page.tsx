'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type TurnstileConfigResponse = {
  ok?: boolean;
  hostname?: string | null;
  issue?: string | null;
  mode?: 'local' | 'production';
  siteKey?: string | null;
};

type TurnstileStatus = 'loading' | 'ready' | 'error';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileHostname, setTurnstileHostname] = useState('');
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const handleLoadTurnstileConfig = async () => {
      setTurnstileStatus('loading');
      setTurnstileToken('');

      try {
        const response = await fetch('/api/turnstile/config', {
          cache: 'no-store',
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as TurnstileConfigResponse | null;
        const nextHostname = payload?.hostname?.trim() || window.location.hostname;

        setTurnstileHostname(nextHostname);

        if (!response.ok || !payload?.ok || !payload.siteKey) {
          setTurnstileSiteKey('');
          setTurnstileStatus('error');
          setErrorMsg('人机验证未正确配置，当前页面无法加载 Turnstile');
          return;
        }

        setTurnstileSiteKey(payload.siteKey);
        setTurnstileStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;

        setTurnstileSiteKey('');
        setTurnstileStatus('error');
        setTurnstileHostname(window.location.hostname);
        setErrorMsg('人机验证配置读取失败，请稍后刷新重试');
      }
    };

    handleLoadTurnstileConfig();

    return () => {
      controller.abort();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!turnstileSiteKey) {
      setErrorMsg('人机验证未配置，请联系管理员');
      return;
    }
    if (!turnstileToken) {
      setErrorMsg('请先完成人机验证');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, turnstileToken })
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(payload?.error || '注册失败');
        setTurnstileToken('');
        return;
      }

      router.replace('/');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
        <h1 className="text-2xl font-semibold text-slate-900">注册账号</h1>
        <p className="mt-2 text-sm text-slate-500">创建账号后可直接登录并使用虚拟换衣。</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">邮箱</div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-200 transition focus:ring"
              placeholder="name@example.com"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">用户名</div>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={32}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-200 transition focus:ring"
              placeholder="请输入用户名"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">密码</div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-200 transition focus:ring"
              placeholder="至少 8 位"
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            {turnstileSiteKey ? (
              <Turnstile
                siteKey={turnstileSiteKey}
                onSuccess={(token) => {
                    setErrorMsg(null);
                  setTurnstileToken(token);
                }}
                onExpire={() => {
                  setTurnstileToken('');
                }}
                onError={() => {
                  setTurnstileToken('');
                    setErrorMsg(
                      turnstileHostname
                        ? `Turnstile 加载失败，当前域名 ${turnstileHostname} 与 Cloudflare 生产配置不匹配`
                        : 'Turnstile 加载失败，请检查当前域名与 Cloudflare 生产配置是否匹配'
                    );
                }}
              />
              ) : turnstileStatus === 'loading' ? (
                <div className="text-sm text-slate-500">正在加载人机验证...</div>
            ) : (
                <div className="space-y-1 text-sm text-amber-700">
                  <div>Turnstile Site Key 未配置或当前域名未被允许</div>
                  {turnstileHostname ? <div className="break-all text-slate-500">当前域名：{turnstileHostname}</div> : null}
                </div>
            )}
          </div>

          {errorMsg ? (
            <div aria-live="polite" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || turnstileStatus !== 'ready' || !turnstileToken || !turnstileSiteKey}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? '注册中...' : '注册并登录'}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-500">
          已有账号？
          <Link href="/login" className="ml-1 font-medium text-blue-600 hover:text-blue-700">
            去登录
          </Link>
        </div>
      </div>
    </main>
  );
}
