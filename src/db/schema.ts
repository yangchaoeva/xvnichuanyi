import { bigint, boolean, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: bigint('createdAt', { mode: 'number' }).notNull(),
  updatedAt: bigint('updatedAt', { mode: 'number' }).notNull(),
  lastLoginAt: bigint('lastLoginAt', { mode: 'number' })
});

export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('tokenHash').notNull().unique(),
  rememberMe: boolean('rememberMe').notNull().default(false),
  ip: text('ip'),
  userAgent: text('userAgent'),
  expiresAt: bigint('expiresAt', { mode: 'number' }).notNull(),
  createdAt: bigint('createdAt', { mode: 'number' }).notNull(),
  revokedAt: bigint('revokedAt', { mode: 'number' })
});

export const authLoginAttempts = pgTable('auth_login_attempts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  ip: text('ip'),
  success: boolean('success').notNull(),
  createdAt: bigint('createdAt', { mode: 'number' }).notNull()
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  personUrl: text('personUrl'),
  garmentUrl: text('garmentUrl'),
  mode: text('mode'),
  resultUrl: text('resultUrl'),
  error: text('error'),
  retryCount: integer('retryCount').default(0).notNull(),
  createdAt: bigint('createdAt', { mode: 'number' }).notNull()
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AuthSessionRow = typeof authSessions.$inferSelect;
