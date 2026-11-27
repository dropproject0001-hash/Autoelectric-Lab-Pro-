/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const diagnosticSessions = pgTable(
  'diagnostic_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionKey: text('session_key').notNull(),
    vehicleMake: text('vehicle_make').notNull(),
    vehicleModel: text('vehicle_model').notNull(),
    vehicleYear: integer('vehicle_year'),
    chassisCode: text('chassis_code'),
    notes: text('notes'),
    activeDtcs: text('active_dtcs'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('diagnostic_sessions_user_session_idx').on(table.userId, table.sessionKey),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  diagnosticSessions: many(diagnosticSessions),
}));

export const diagnosticSessionsRelations = relations(diagnosticSessions, ({ one }) => ({
  author: one(users, {
    fields: [diagnosticSessions.userId],
    references: [users.id],
  }),
}));
