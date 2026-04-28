import { bigint, boolean, index, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  lastLoginAt: bigint('last_login_at', { mode: 'number' })
});

export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  rememberMe: boolean('remember_me').notNull().default(false),
  ip: text('ip'),
  userAgent: text('user_agent'),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  revokedAt: bigint('revoked_at', { mode: 'number' })
});

export const authLoginAttempts = pgTable('auth_login_attempts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  ip: text('ip'),
  success: boolean('success').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  personUrl: text('person_url'),
  garmentUrl: text('garment_url'),
  mode: text('mode'),
  resultUrl: text('result_url'),
  error: text('error'),
  retryCount: integer('retry_count').default(0).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
});

export const userAssets = pgTable(
  'user_assets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    sourceUrl: text('source_url').notNull(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
  },
  (table) => ({
    userIdIdx: index('idx_user_assets_user_id').on(table.userId),
    taskIdIdx: index('idx_user_assets_task_id').on(table.taskId),
    createdAtIdx: index('idx_user_assets_created_at').on(table.createdAt)
  })
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type UserAssetRow = typeof userAssets.$inferSelect;
export type NewUserAssetRow = typeof userAssets.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AuthSessionRow = typeof authSessions.$inferSelect;
