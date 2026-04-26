import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

const getFileExtension = (mimeType: string) => {
  const lower = mimeType.toLowerCase();
  if (lower === 'image/png') return 'png';
  if (lower === 'image/jpeg') return 'jpg';
  if (lower === 'image/webp') return 'webp';
  return null;
};

const normalizeKind = (raw: unknown) => {
  if (raw === 'person') return 'person';
  if (raw === 'garment') return 'garment';
  return null;
};

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Missing BLOB_READ_WRITE_TOKEN. Create a Vercel Blob store and add its read-write token to this deployment.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const kind = normalizeKind(formData.get('kind'));
    const file = formData.get('file');

    if (!kind) {
      return NextResponse.json({ error: 'kind is required' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!file.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 415 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 1MB)' }, { status: 413 });
    }

    const ext = getFileExtension(file.type);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image type (use PNG/JPG/WebP)' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const blobPath = `uploads/${kind}_${id}.${ext}`;

    const result = await put(blobPath, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type
    });

    return NextResponse.json({ url: result.url });
  } catch (error: any) {
    const message = error?.message || 'Upload failed';
    console.error('[upload] failed', { errorName: error?.name, errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
