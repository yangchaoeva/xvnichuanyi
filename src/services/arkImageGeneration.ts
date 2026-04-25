// Ark 图像生成 API 端点
export const ARK_IMAGE_GENERATIONS_ENDPOINT =
  'https://ark.cn-beijing.volces.com/api/v3/images/generations';

// 默认模型
export const ARK_DEFAULT_MODEL = 'doubao-seedream-4-0-250828';
// 默认提示词：将图1的服装换为图2的服装
export const ARK_DEFAULT_PROMPT = '将图1的服装换为图2的服装';

// 请求体类型：图生图
export type ArkImageToImageRequest = {
  model: string;                      // 模型名称
  prompt: string;                     // 提示词
  image: [string, string];            // 两张图片（data URL 或 URL）
  sequential_image_generation: 'disabled' | 'enabled'; // 是否顺序生成
  response_format: 'url' | 'b64_json'; // 返回格式：url 或 base64
  size: string;                       // 输出尺寸
  stream: boolean;                    // 是否流式
  watermark: boolean;                 // 是否带水印
};

// 响应体类型
export type ArkImageToImageResponse = {
  model?: string;                     // 实际使用的模型
  created?: number;                   // 创建时间戳
  data?: Array<{                      // 生成结果数组
    url?: string;                     // 图片 URL
    b64_json?: string;                // base64 图片数据
    size?: string;                    // 图片尺寸
  }>;
};

// 调用选项
export type ArkGenerateOptions = {
  taskId: string;                     // 任务唯一标识
  timeoutMs?: number;                 // 超时时间（毫秒）
};

// 认证失败错误
export class ArkAuthError extends Error {
  readonly name = 'ArkAuthError';
}

// 限流错误
export class ArkRateLimitError extends Error {
  readonly name = 'ArkRateLimitError';
}

// 超时错误
export class ArkTimeoutError extends Error {
  readonly name = 'ArkTimeoutError';
}

// 响应格式错误
export class ArkBadResponseError extends Error {
  readonly name = 'ArkBadResponseError';
}

// HTTP 异常错误
export class ArkHttpError extends Error {
  readonly name = 'ArkHttpError';
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 读取响应体为文本
const readResponseBodyAsText = async (res: Response) => {
  try {
    return await res.text();
  } catch {
    return '';
  }
};

// 从环境变量获取 Ark API Key
const getArkApiKey = () => {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new ArkAuthError('ARK_API_KEY is missing');
  }
  return apiKey;
};

// 解析 data URL 信息
const getDataUrlInfo = (input: string) => {
  const match = input.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeSubtype: match[1], base64Length: match[2]?.length ?? 0 };
};

// 调用 Ark 图生图接口
export const generateArkImageToImage = async (
  payload: ArkImageToImageRequest,
  options: ArkGenerateOptions
) => {
  const apiKey = getArkApiKey();                // 获取 API Key
  const timeoutMs = options.timeoutMs ?? 60_000; // 默认 60 秒超时

  // 解析两张图片的 data URL 信息
  const image0Info = getDataUrlInfo(payload.image[0]);
  const image1Info = getDataUrlInfo(payload.image[1]);

  // 打印请求开始日志
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
    // 发起 fetch 请求
    const res = await fetch(ARK_IMAGE_GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    // 401 认证失败
    if (res.status === 401) {
      throw new ArkAuthError('Ark AuthenticationError (401)');
    }
    // 429 限流
    if (res.status === 429) {
      throw new ArkRateLimitError('Ark RateLimit (429)');
    }
    // 其它 HTTP 错误
    if (!res.ok) {
      const bodyText = await readResponseBodyAsText(res);
      throw new ArkHttpError(
        `Ark HTTP error (${res.status}) ${bodyText ? `- ${bodyText.slice(0, 800)}` : ''}`,
        res.status
      );
    }

    // 解析 JSON 响应
    const json = (await res.json()) as ArkImageToImageResponse;
    const url = json?.data?.[0]?.url;
    if (!url) {
      throw new ArkBadResponseError('Ark response missing data[0].url');
    }

    // 打印请求完成日志
    console.info('[Ark] request_done', {
      taskId: options.taskId,
      ms: Date.now() - startedAt
    });

    return { url, size: json?.data?.[0]?.size };
  } catch (error: any) {
    // 超时处理
    if (error?.name === 'AbortError') {
      throw new ArkTimeoutError(`Ark request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
