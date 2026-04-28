import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const getNormalizedContentType = (raw: string | null) => {
  if (!raw) return null;
  const value = raw.split(';')[0]?.trim().toLowerCase();
  return value || null;
};

const getFileExtensionFromContentType = (contentType: string) => {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return null;
};

const sanitizePathSegment = (input: string) =>
  input
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'user';

const buildRandomCode = () => randomBytes(5).toString('hex');

export type BlobTransferErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_URL'
  | 'HTTPS_REQUIRED'
  | 'REDIRECT_NOT_ALLOWED'
  | 'REMOTE_HTTP_ERROR'
  | 'REMOTE_TIMEOUT'
  | 'REMOTE_NO_BODY'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'CONTENT_TOO_LARGE'
  | 'BLOB_TOKEN_MISSING'
  | 'BLOB_UPLOAD_FAILED';

export class BlobTransferError extends Error {
  readonly name = 'BlobTransferError';
  readonly code: BlobTransferErrorCode;
  readonly status?: number;

  constructor(params: { code: BlobTransferErrorCode; message: string; status?: number }) {
    super(params.message);
    this.code = params.code;
    this.status = params.status;
  }
}

export const normalizeBlobTransferErrorMessage = (error: unknown) => {
  if (error instanceof BlobTransferError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return message || '转存失败';
};

export type PersistRemoteImageToBlobResult = {
  blobUrl: string;
  pathname: string;
  meta: {
    userId: string;
    taskId: string;
    sourceUrl: string;
    contentType: string;
    extension: 'jpg' | 'png' | 'webp';
    bytes: number;
    createdAt: number;
  };
};

const readStreamAsBufferWithLimit = async (body: ReadableStream<Uint8Array>, maxBytes: number) => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;

    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new BlobTransferError({
        code: 'CONTENT_TOO_LARGE',
        message: `图片过大：超过限制 ${maxBytes} bytes`
      });
    }
    chunks.push(value);
  }

  const buffers = chunks.map((chunk) => Buffer.from(chunk));
  return { buffer: Buffer.concat(buffers, total), bytes: total };
};

const parseHttpsUrl = (raw: string) => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlobTransferError({ code: 'INVALID_URL', message: '无效的 sourceUrl' });
  }

  if (url.protocol !== 'https:') {
    throw new BlobTransferError({ code: 'HTTPS_REQUIRED', message: '仅支持 https 的 sourceUrl' });
  }

  if (url.username || url.password) {
    throw new BlobTransferError({ code: 'INVALID_URL', message: 'sourceUrl 不允许包含用户名或密码' });
  }

  return url;
};

const fetchWithHttpsRedirects = async (initialUrl: URL, init: RequestInit, maxRedirects: number) => {
  let currentUrl = initialUrl;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(currentUrl, { ...init, redirect: 'manual' });

    const redirectStatuses = new Set([301, 302, 303, 307, 308]);
    if (!redirectStatuses.has(res.status)) return res;

    const location = res.headers.get('location');
    if (!location) {
      throw new BlobTransferError({
        code: 'REDIRECT_NOT_ALLOWED',
        message: `远程资源发生重定向但缺少 Location（HTTP ${res.status}）`,
        status: res.status
      });
    }

    const nextUrl = parseHttpsUrl(new URL(location, currentUrl).toString());
    currentUrl = nextUrl;
  }

  throw new BlobTransferError({
    code: 'REDIRECT_NOT_ALLOWED',
    message: `重定向次数超过限制（>${maxRedirects}）`
  });
};

export const persistRemoteImageToBlob = async (params: {
  userId: string;
  taskId: string;
  sourceUrl: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<PersistRemoteImageToBlobResult> => {
  if (!params.userId?.trim() || !params.taskId?.trim() || !params.sourceUrl?.trim()) {
    throw new BlobTransferError({ code: 'INVALID_INPUT', message: '缺少 userId、taskId 或 sourceUrl' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new BlobTransferError({
      code: 'BLOB_TOKEN_MISSING',
      message: '缺少 BLOB_READ_WRITE_TOKEN，无法转存生成结果'
    });
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  const startedAt = Date.now();

  const url = parseHttpsUrl(params.sourceUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithHttpsRedirects(
      url,
      {
        method: 'GET',
        headers: { Accept: 'image/*' },
        signal: controller.signal
      },
      MAX_REDIRECTS
    );

    if (!res.ok) {
      const status = res.status;
      throw new BlobTransferError({
        code: 'REMOTE_HTTP_ERROR',
        message: `远程下载失败（HTTP ${status}）`,
        status
      });
    }

    const contentType = getNormalizedContentType(res.headers.get('content-type'));
    if (!contentType) {
      throw new BlobTransferError({
        code: 'UNSUPPORTED_CONTENT_TYPE',
        message: '远程资源缺少 content-type，无法确认图片类型'
      });
    }

    const extension = getFileExtensionFromContentType(contentType);
    if (!extension) {
      throw new BlobTransferError({
        code: 'UNSUPPORTED_CONTENT_TYPE',
        message: `不支持的图片类型：${contentType}（仅支持 PNG/JPG/WebP）`
      });
    }

    const contentLengthHeader = res.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new BlobTransferError({
        code: 'CONTENT_TOO_LARGE',
        message: `图片过大：${contentLength} bytes，超过限制 ${maxBytes} bytes`
      });
    }

    if (!res.body) {
      throw new BlobTransferError({ code: 'REMOTE_NO_BODY', message: '远程响应缺少 body' });
    }

    const { buffer, bytes } = await readStreamAsBufferWithLimit(res.body, maxBytes);

    const safeUserId = sanitizePathSegment(params.userId);
    const createdAt = Date.now();
    const randomCode = buildRandomCode();
    const filename = `${safeUserId}-${createdAt}-${randomCode}.${extension}`;
    const pathname = `generated/${filename}`;

    let result: Awaited<ReturnType<typeof put>>;
    try {
      result = await put(pathname, buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BlobTransferError({
        code: 'BLOB_UPLOAD_FAILED',
        message: message || '上传到 Blob 失败'
      });
    }

    return {
      blobUrl: result.url,
      pathname: result.pathname,
      meta: {
        userId: params.userId,
        taskId: params.taskId,
        sourceUrl: res.url,
        contentType,
        extension,
        bytes,
        createdAt
      }
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new BlobTransferError({
        code: 'REMOTE_TIMEOUT',
        message: `远程下载超时（${timeoutMs}ms）`
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    console.info('[Blob] persist_done', {
      taskId: params.taskId,
      ms: Date.now() - startedAt
    });
  }
};

