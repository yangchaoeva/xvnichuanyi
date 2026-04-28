* [x] `/api/try-on` 在 Ark 生成成功后会把外链结果转存到 Blob，且 Blob key 以 `generated/` 开头

* [x] Blob 文件名遵循 `[UserID]-[Timestamp]-[RandomCode].[ext]`，`Timestamp` 为 Unix 毫秒，`ext` 与 `content-type` 匹配

* [x] 转存成功后会向 `user_assets` 写入记录并关联当前 userId，包含 url/sourceUrl/taskId/createdAt

* [x] 仅当转存 + 落库都成功时任务才会标记 `success`，`/api/status` 返回的 `resultUrl` 为 Blob 永久 URL

* [x] 转存失败会记录错误日志并将任务标记 `failed`，不会回退原始外链 URL

* [x] `npm run build` 通过，生成/轮询链路回归可用

* [x] 提供可重复执行的自动化验证脚本：`node scripts/validate-task4.mjs`（依赖 DATABASE_URL/NEON_DATABASE_URL、BLOB_READ_WRITE_TOKEN、ARK_API_KEY）
