# Tasks

- [x] Task 1: 设计并落地 user_assets 数据表
  - [x] 在 `src/db/schema.ts` 新增 `user_assets` 表定义（drizzle pgTable）
  - [x] 在 `src/lib/db.ts` 的 `ensureNeonSchema` 增加建表 SQL（包含索引与外键）
  - [x] 在 `src/lib/db.ts` 增加插入方法（例如 `createUserAsset`），并在 drizzle schema 中注册

- [x] Task 2: 实现“外部 URL -> Vercel Blob”转存工具函数
  - [x] 新增 `src/lib/blob.ts`（或等价位置）封装：下载远程图片、校验类型/大小、上传到 Blob、返回永久 URL
  - [x] 实现 `generated/` 路径隔离与命名规则 `[UserID]-[Timestamp]-[RandomCode].[ext]`
  - [x] 增加超时与错误信息归一化（供任务失败原因输出）

- [x] Task 3: 修改 `/api/try-on` 生成处理逻辑，确保转存+落库成功后才标记任务成功
  - [x] 在 `POST /api/try-on` 中把 `userId` 传入后台处理函数
  - [x] 在 `processTask` 中：Ark 成功后执行转存；转存成功后写入 `user_assets`；全部成功后再 `setTaskSuccess`
  - [x] 转存失败：记录错误日志，并 `setTaskFailed`（不回退外链 URL）

- [x] Task 4: 验证与回归
  - [x] 本地构建 `npm run build` 通过
  - [x] 通过现有前端流程生成一次任务，`/api/status` 返回的 `resultUrl` 为 Blob URL（路径包含 `generated/`）
  - [x] 验证数据库中 `user_assets` 存在对应记录且关联 userId
  - [x] 提供自动化回归脚本 `scripts/validate-task4.mjs`（需要配置 DATABASE_URL/NEON_DATABASE_URL + BLOB_READ_WRITE_TOKEN + ARK_API_KEY）

# Task Dependencies
- Task 3 depends on Task 1 and Task 2
- Task 4 depends on Task 3
