import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createPendingTask, createUserAsset, setTaskFailed, setTaskProcessing, setTaskSuccess } from '@/lib/db';
import { saveBase64Image } from '@/lib/upload';
import { getCurrentUser } from '@/lib/auth';
import { BlobTransferError, normalizeBlobTransferErrorMessage, persistRemoteImageToBlob } from '@/lib/blob';
import {
  ARK_DEFAULT_MODEL,
  ARK_DEFAULT_PROMPT,
  ArkAuthError,
  ArkHttpError,
  ArkRateLimitError,
  ArkTimeoutError,
  generateArkImageToImage
} from '@/services/arkImageGeneration';

export const runtime = 'nodejs';

const getAppPublicUrl = () => {
  const appPublicUrl = process.env.APP_PUBLIC_URL;
  if (!appPublicUrl) return null;
  return appPublicUrl;
};

const toAbsoluteUrl = (maybePath: string, baseUrl: string) => {
  try {
    return new URL(maybePath, baseUrl).toString();
  } catch {
    return null;
  }
};

const shouldFallbackToPublicUrls = (error: unknown) => {
  if (!(error instanceof ArkHttpError)) return false;
  return error.status === 400 || error.status === 415;
};

async function processTask(
  taskId: string,
  userId: string,
  personInput: string,
  garmentInput: string,
  storedPersonUrl: string | null,
  storedGarmentUrl: string | null,
  mode: string
) {
  try {
    await setTaskProcessing(taskId);

    console.info('[TryOnWorker] task_processing_start', { taskId, userId, mode });

    const appPublicUrl = getAppPublicUrl();

    const primaryPayload = {
      model: ARK_DEFAULT_MODEL,
      prompt: ARK_DEFAULT_PROMPT,
      image: [personInput, garmentInput] as [string, string],
      sequential_image_generation: 'disabled' as const,
      response_format: 'url' as const,
      size: '2K',
      stream: false,
      watermark: true
    };

    let result: Awaited<ReturnType<typeof generateArkImageToImage>> | null = null;

    try {
      result = await generateArkImageToImage(primaryPayload, { taskId, timeoutMs: 60_000 });
    } catch (error: any) {
      const canFallback =
        appPublicUrl &&
        storedPersonUrl &&
        storedGarmentUrl &&
        shouldFallbackToPublicUrls(error) &&
        personInput.startsWith('data:image/') &&
        garmentInput.startsWith('data:image/');

      if (!canFallback) {
        throw error;
      }

      const absolutePersonUrl = toAbsoluteUrl(storedPersonUrl, appPublicUrl);
      const absoluteGarmentUrl = toAbsoluteUrl(storedGarmentUrl, appPublicUrl);
      if (!absolutePersonUrl || !absoluteGarmentUrl) {
        throw error;
      }

      console.info('[TryOnWorker] task_processing_retry_with_public_urls', {
        taskId,
        appPublicUrl,
        storedPersonUrl,
        storedGarmentUrl
      });

      result = await generateArkImageToImage(
        { ...primaryPayload, image: [absolutePersonUrl, absoluteGarmentUrl] },
        { taskId, timeoutMs: 60_000 }
      );
    }

    if (!result?.url) {
      throw new Error('Ark response missing result url');
    }

    const sourceUrl = result.url;

    console.info('[TryOnWorker] task_processing_ark_success', { taskId, sourceUrl });

    const persisted = await persistRemoteImageToBlob({ userId, taskId, sourceUrl });

    await createUserAsset({
      userId,
      url: persisted.blobUrl,
      sourceUrl,
      taskId,
      createdAt: persisted.meta.createdAt
    });

    await setTaskSuccess(taskId, persisted.blobUrl);

  } catch (error: any) {
    const mappedMessage =
      error instanceof ArkAuthError
        ? 'Ark 鉴权失败(401)：请检查服务端 .env 的 ARK_API_KEY 是否正确'
        : error instanceof ArkRateLimitError
          ? 'Ark 触发限流(429)：请稍后重试'
          : error instanceof ArkTimeoutError
            ? 'Ark 请求超时：请稍后重试'
            : error instanceof ArkHttpError && (error.status === 400 || error.status === 415)
              ? 'Ark 无法处理当前图片输入：如使用本地上传图片，请配置 .env 的 APP_PUBLIC_URL 为可公网访问地址(例如 ngrok)，或改用 personUrl/garmentUrl 传入公网图片 URL'
              : error instanceof ArkHttpError
                ? `Ark 请求失败(${error.status})`
                : error instanceof BlobTransferError
                  ? normalizeBlobTransferErrorMessage(error)
                : '生成失败';

    console.error('[TryOnWorker] task_processing_failed', {
      taskId,
      errorName: error?.name,
      errorMessage: error?.message
    });

    await setTaskFailed(taskId, mappedMessage);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await req.json();
    const { personBase64, garmentBase64, personUrl: personInputUrl, garmentUrl: garmentInputUrl, mode = 'realistic' } = body;

    const hasBase64Pair = Boolean(personBase64 && garmentBase64);
    const hasUrlPair = Boolean(personInputUrl && garmentInputUrl);

    if (!hasBase64Pair && !hasUrlPair) {
      return NextResponse.json(
        { error: 'personBase64+garmentBase64 or personUrl+garmentUrl are required' },
        { status: 400 }
      );
    }

    const taskId = uuidv4();

    const storedPersonUrl = hasBase64Pair ? await saveBase64Image(personBase64, `person_${taskId}`) : personInputUrl;
    const storedGarmentUrl = hasBase64Pair ? await saveBase64Image(garmentBase64, `garment_${taskId}`) : garmentInputUrl;

    const personInput = hasBase64Pair ? personBase64 : personInputUrl;
    const garmentInput = hasBase64Pair ? garmentBase64 : garmentInputUrl;

    await createPendingTask({
      id: taskId,
      userId: user.id,
      status: 'pending',
      personUrl: storedPersonUrl,
      garmentUrl: storedGarmentUrl,
      mode,
      createdAt: Date.now()
    });

    console.info('[TryOnAPI] task_created', {
      taskId,
      mode,
      personUrl: storedPersonUrl,
      garmentUrl: storedGarmentUrl
    });

    processTask(taskId, user.id, personInput, garmentInput, storedPersonUrl, storedGarmentUrl, mode).catch((error) => {
      console.error('[TryOnWorker] unhandled_error', { taskId, errorName: error?.name, errorMessage: error?.message });
    });

    return NextResponse.json({ taskId });

  } catch (error: any) {
    console.error('[TryOnAPI] request_failed', { errorName: error?.name, errorMessage: error?.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
