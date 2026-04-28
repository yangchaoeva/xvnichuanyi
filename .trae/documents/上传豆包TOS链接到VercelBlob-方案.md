# 方案：将豆包(Ark)生成的 TOS 链接转存到 Vercel Blob（Plan）

## 1. 总结

当前项目在虚拟试衣生成流程中，Ark 图生图接口返回的是一个外链图片 URL（你称为 “TOS 链接”）。为了避免外链失效、跨域/地区不可达、以及后续下载/分享不稳定，需要在服务端将该外链图片下载后转存到 **Vercel Blob**，并将任务的 `resultUrl` 写成 Blob 的公开 URL。

本方案只修改服务端生成链路的 handler（`/api/try-on` 的后台任务处理逻辑），不改变前端接口：前端仍然创建任务拿 `taskId`，再轮询 `/api/status` 获取 `resultUrl`。

## 2. 现状分析（基于代码库）

### 2.1 生成链路

- API handler：`POST /api/try-on`  
  文件：[try-on/route.ts](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/app/api/try-on/route.ts)
  - 创建任务后异步 `processTask(...)`
  - `processTask` 调用 `generateArkImageToImage(...)` 得到 `result.url`
  - 成功直接 `setTaskSuccess(taskId, result.url)` 写入数据库

- Ark service：  
  文件：[arkImageGeneration.ts](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/services/arkImageGeneration.ts)
  - 当前请求 `response_format: 'url'`，返回 `{ url, size }`

### 2.2 Vercel Blob 上传能力

- 已存在上传 handler：`POST /api/upload`  
  文件：[upload/route.ts](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/app/api/upload/route.ts)
  - 通过 `@vercel/blob` 的 `put(...)` 上传，`access: 'public'`
  - 依赖环境变量 `BLOB_READ_WRITE_TOKEN`

### 2.3 前端对结果 URL 的使用方式

- 首页生成流程：创建任务 -> 轮询 `/api/status` -> `resultUrl` 直接用作 `<img src>` 和下载  
  文件：[page.tsx](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/app/page.tsx#L449-L601)

## 3. 目标与成功标准

### 3.1 目标

- 服务端在任务处理完成时，将 Ark 返回的外链图片 **转存到 Vercel Blob**
- 数据库任务表 `result_url` 最终保存为 **Blob URL**（可公开访问）

### 3.2 成功标准（可验收）

- 任意一次生成成功后：
  - `/api/status?taskId=...` 返回的 `resultUrl` 域名为 Vercel Blob 的公开 URL（而不是 Ark/TOS 域名）
  - 浏览器可直接打开该 `resultUrl`
  - 下载按钮能稳定下载
- 转存失败时：
  - 任务状态变为 `failed`
  - `error` 字段能明确提示是“下载外链失败/Blob 配置缺失/图片类型不支持/图片过大”等

## 4. 方案设计（不改前端调用方式）

### 4.1 关键改动点

修改文件：[try-on/route.ts](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/app/api/try-on/route.ts)

将：

- `setTaskSuccess(taskId, result.url)`

改为：

- `const blobUrl = await uploadRemoteResultToBlob({ taskId, sourceUrl: result.url })`
- `setTaskSuccess(taskId, blobUrl)`

### 4.2 新增服务端工具函数（推荐，便于复用/测试）

新增模块（建议路径）：

- `src/lib/blob.ts`：封装 “下载远程图片 -> 校验 -> put 到 Blob -> 返回 blobUrl”

接口草案：

- `uploadRemoteImageToBlob(input: { sourceUrl: string; blobPath: string; timeoutMs?: number; maxBytes?: number }): Promise<{ url: string; contentType: string; size: number }>`

实现要点：

- **下载**：`fetch(sourceUrl)`，设置 `AbortController` 超时（例如 20s）
- **校验响应**：
  - `res.ok` 必须为 true，否则抛错（包含状态码）
  - `content-type` 必须是 `image/*`（否则拒绝）
  - 若存在 `content-length` 且超过上限（例如 10MB）则拒绝
- **读取与上传**：
  - `const buffer = Buffer.from(await res.arrayBuffer())`
  - 再次校验 `buffer.length` 不超过 `maxBytes`
  - `put(blobPath, buffer, { access: 'public', addRandomSuffix: false, contentType })`
- **命名策略**：
  - `blobPath = tryon/result_${taskId}.${ext}`
  - `ext` 优先来自 `content-type`（png/jpg/webp），否则回退为 `png`

### 4.3 环境变量与失败提示

在 `processTask` 中增加硬性前置检查：

- 若 `process.env.BLOB_READ_WRITE_TOKEN` 缺失：
  - 直接 `setTaskFailed(taskId, '缺少 BLOB_READ_WRITE_TOKEN，无法转存生成结果到 Vercel Blob')`

说明：

- 这是唯一需要平台侧具备的能力；项目已包含 `/api/upload`，通常该 token 已配置。

### 4.4 伪代码（核心流程）

```
processTask(taskId, ...):
  setTaskProcessing(taskId)
  result = await generateArkImageToImage(...)
  if result.url missing -> throw

  if !BLOB_READ_WRITE_TOKEN:
     setTaskFailed(taskId, "缺少 BLOB_READ_WRITE_TOKEN ...")
     return

  blobPath = `tryon/result_${taskId}.${extFromContentTypeOrPng}`
  blobUrl = await uploadRemoteImageToBlob({ sourceUrl: result.url, blobPath })

  setTaskSuccess(taskId, blobUrl)
```

## 5. 边界情况与降级策略

- 远程 URL 403/404/超时：任务失败，错误信息包含 HTTP 状态/超时提示
- 返回的不是图片（`content-type` 非 `image/*`）：任务失败，提示“不支持的内容类型”
- 图片过大：任务失败，提示“图片过大，超过限制”
- Blob 上传失败：任务失败，提示“Blob 上传失败”

不建议的降级（默认不做）：

- 转存失败时仍写入原始 TOS 链接（会导致不稳定继续存在）。除非你明确要求“宁可有结果也不失败”，否则保持严格失败更利于发现配置问题。

## 6. 已确认的决策

- 成功标准：**必须转存到 Vercel Blob 才算成功**；转存失败则任务失败（不回退原始 TOS 链接）
- 访问权限：结果图片上传到 Blob 时使用 `access: 'public'`（前端直接展示与下载）

## 7. 验证步骤（执行阶段会按此逐项验证）

本地验证（无需你手工点平台）：

- 启动本地服务
- 通过现有前端上传两张图（已走 `/api/upload` 的 Blob URL）
- 点击生成，轮询到 success
- 断言：`resultUrl` 为 Blob URL 且能直接打开

线上验证（最少操作）：

- 部署后访问一次生成流程
- 断言：`/api/status` 返回的 `resultUrl` 为 Blob URL

## 8. 改动文件清单（执行阶段）

- 修改：[src/app/api/try-on/route.ts](file:///d:/trae/73%20%E8%99%9A%E6%8B%9F%E6%8D%A2%E8%A1%A3/src/app/api/try-on/route.ts)
- 新增（建议）：`src/lib/blob.ts`
