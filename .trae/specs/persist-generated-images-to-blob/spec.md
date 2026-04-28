# 生成结果转存到 Vercel Blob Spec

## Why
豆包/Ark 返回的生成结果是外部 URL，存在失效、跨域/地区不可达、以及后续分享/下载不稳定的问题，需要将结果转存到本项目的 Vercel Blob 中并与用户资产绑定落库。

## What Changes
- 在 `/api/try-on` 的后台处理链路中，将 Ark 返回的外部图片 URL 下载并上传到 Vercel Blob
- Blob 存储路径固定前缀为 `generated/`
- 文件命名规则采用 `[UserID]-[Timestamp]-[RandomCode].[ext]`，其中 `ext` 根据实际 `content-type` 推导（jpg/png/webp）
- 转存成功后将 Blob 的永久 URL 写入数据库新表 `user_assets`，并关联当前用户 ID
- 仅当 “转存 + 落库” 全部成功后，才将任务标记为 success 并对外暴露 `resultUrl`
- 转存失败需记录错误日志，并将任务标记为 failed

## Impact
- Affected specs: 生成结果持久化、用户资产管理、任务状态一致性
- Affected code:
  - `src/app/api/try-on/route.ts`（生成处理逻辑）
  - `src/lib/db.ts` + `src/db/schema.ts`（新增 user_assets 表与写入方法）
  - （可能新增）`src/lib/blob.ts`（远程图片下载并上传 Blob 的封装）

## ADDED Requirements

### Requirement: Persist Generated Image
系统 SHALL 在 Ark 生成成功后，将外部结果图片转存到 Vercel Blob，并返回 Blob 的永久 URL 作为最终结果。

#### Scenario: Success case
- **WHEN** 用户在已登录状态下调用 `POST /api/try-on` 发起生成，且 Ark 返回 `result.url`
- **AND WHEN** 服务端成功下载该 `result.url` 指向的图片内容
- **AND WHEN** 服务端成功将图片上传到 Vercel Blob（路径前缀 `generated/`）
- **AND WHEN** 服务端成功写入数据库 `user_assets` 表并关联 `userId`
- **THEN** 服务端 SHALL 将 `tasks.resultUrl` 设置为 Blob 的永久 URL
- **AND THEN** `GET /api/status?taskId=...` SHALL 返回 `status=success` 且 `resultUrl` 为 Blob 永久 URL

#### Scenario: Blob config missing
- **WHEN** 生成流程需要转存结果
- **AND WHEN** `BLOB_READ_WRITE_TOKEN` 缺失或不可用
- **THEN** 服务端 SHALL 记录错误日志
- **AND THEN** SHALL 将任务标记为 `failed` 并返回可读错误信息（例如 “缺少 BLOB_READ_WRITE_TOKEN，无法转存生成结果”）

#### Scenario: Remote download failed
- **WHEN** Ark 返回 `result.url`
- **AND WHEN** 服务端下载外部图片失败（HTTP 非 2xx / 超时 / 非图片 content-type）
- **THEN** 服务端 SHALL 记录错误日志（包含 taskId、userId、失败原因）
- **AND THEN** SHALL 将任务标记为 `failed`，并且不写入 `user_assets`

### Requirement: Blob Path Isolation
系统 SHALL 将生成结果文件写入 Blob 的 `generated/` 目录下。

#### Scenario: Path format
- **WHEN** 生成结果被转存
- **THEN** 上传的 Blob key SHALL 以 `generated/` 作为前缀

### Requirement: File Naming
系统 SHALL 使用 `[UserID]-[Timestamp]-[RandomCode].[ext]` 作为 Blob 文件名。

#### Notes
- `UserID`：来自当前会话 `getCurrentUser().id`
- `Timestamp`：使用 Unix 毫秒时间戳（便于排序与检索）
- `RandomCode`：使用安全随机（例如 `crypto.getRandomValues`/`crypto.randomUUID` 截断）生成 6–10 位
- `ext`：根据下载响应的 `content-type` 推导（`image/jpeg`->`jpg`，`image/png`->`png`，`image/webp`->`webp`）

### Requirement: Database Linkage (user_assets)
系统 SHALL 在转存成功后，将生成图片永久 URL 插入到 `user_assets` 表并关联当前用户。

#### Scenario: Insert record
- **WHEN** Blob 上传成功返回永久 URL
- **THEN** 服务端 SHALL 在 `user_assets` 插入记录包含：
  - `id`（UUID）
  - `userId`
  - `url`（Blob 永久 URL）
  - `sourceUrl`（Ark 外部 URL）
  - `taskId`（生成任务 ID）
  - `createdAt`（Unix 毫秒时间戳）

## MODIFIED Requirements

### Requirement: Task Success Condition
系统 SHALL 仅在 “Blob 转存成功 + user_assets 落库成功” 后，将任务标记为 success。

#### Scenario: No partial success
- **WHEN** Blob 上传成功但 `user_assets` 写入失败
- **THEN** 服务端 SHALL 将任务标记为 failed
- **AND THEN** SHALL 不对外返回 success 的 `resultUrl`

## REMOVED Requirements
无

