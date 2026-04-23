import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
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
