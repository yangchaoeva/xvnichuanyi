export const ARK_IMAGE_GENERATIONS_ENDPOINT =
  'https://ark.cn-beijing.volces.com/api/v3/images/generations';

export const ARK_DEFAULT_MODEL = 'doubao-seedream-4-0-250828';
export const ARK_DEFAULT_PROMPT = '将图1的服装换为图2的服装';

export type ArkImageToImageRequest = {
  model: string;
  prompt: string;
  image: [string, string];
  sequential_image_generation: 'disabled' | 'enabled';
  response_format: 'url' | 'b64_json';
  size: string;
  stream: boolean;
  watermark: boolean;
};

export type ArkImageToImageResponse = {
  model?: string;
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    size?: string;
  }>;
};

export type ArkGenerateOptions = {
  taskId: string;
  timeoutMs?: number;
};

export class ArkAuthError extends Error {
  readonly name = 'ArkAuthError';
}

export class ArkRateLimitError extends Error {
  readonly name = 'ArkRateLimitError';
}

export class ArkTimeoutError extends Error {
  readonly name = 'ArkTimeoutError';
}

export class ArkBadResponseError extends Error {
  readonly name = 'ArkBadResponseError';
}

export class ArkHttpError extends Error {
  readonly name = 'ArkHttpError';
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const readResponseBodyAsText = async (res: Response) => {
  try {
    return await res.text();
  } catch {
    return '';
  }
};

const getArkApiKey = () => {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new ArkAuthError('ARK_API_KEY is missing');
  }
  return apiKey;
};

const getDataUrlInfo = (input: string) => {
  const match = input.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeSubtype: match[1], base64Length: match[2]?.length ?? 0 };
};

export const generateArkImageToImage = async (
  payload: ArkImageToImageRequest,
  options: ArkGenerateOptions
) => {
  const apiKey = getArkApiKey();
  const timeoutMs = options.timeoutMs ?? 60_000;

  const image0Info = getDataUrlInfo(payload.image[0]);
  const image1Info = getDataUrlInfo(payload.image[1]);

  console.info('[Ark] request_start', {
    taskId: options.taskId,
    model: payload.model,
    response_format: payload.response_format,
    size: payload.size,
    timeoutMs,
    image0: image0Info ?? { type: 'non-data-url', length: payload.image[0].length },
    image1: image1Info ?? { type: 'non-data-url', length: payload.image[1].length }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(ARK_IMAGE_GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (res.status === 401) {
      throw new ArkAuthError('Ark AuthenticationError (401)');
    }
    if (res.status === 429) {
      throw new ArkRateLimitError('Ark RateLimit (429)');
    }
    if (!res.ok) {
      const bodyText = await readResponseBodyAsText(res);
      throw new ArkHttpError(
        `Ark HTTP error (${res.status}) ${bodyText ? `- ${bodyText.slice(0, 800)}` : ''}`,
        res.status
      );
    }

    const json = (await res.json()) as ArkImageToImageResponse;
    const url = json?.data?.[0]?.url;
    if (!url) {
      throw new ArkBadResponseError('Ark response missing data[0].url');
    }

    console.info('[Ark] request_done', {
      taskId: options.taskId,
      ms: Date.now() - startedAt
    });

    return { url, size: json?.data?.[0]?.size };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ArkTimeoutError(`Ark request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
