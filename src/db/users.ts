/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { diagnosticSessions, users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    const cleanEmail = (email || '').trim();
    const cleanName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;
    const now = new Date();

    const result = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        displayName: cleanName,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          ...(cleanName ? { displayName: cleanName } : {}),
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function listDiagnosticSessionsByUid(uid: string) {
  try {
    const rows = await db
      .select({
        id: diagnosticSessions.id,
        sessionKey: diagnosticSessions.sessionKey,
        vehicleMake: diagnosticSessions.vehicleMake,
        vehicleModel: diagnosticSessions.vehicleModel,
        vehicleYear: diagnosticSessions.vehicleYear,
        chassisCode: diagnosticSessions.chassisCode,
        notes: diagnosticSessions.notes,
        activeDtcs: diagnosticSessions.activeDtcs,
        createdAt: diagnosticSessions.createdAt,
        updatedAt: diagnosticSessions.updatedAt,
      })
      .from(diagnosticSessions)
      .innerJoin(users, eq(diagnosticSessions.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(diagnosticSessions.updatedAt))
      .limit(100);

    return rows;
  } catch (error) {
    console.error('Database diagnostic session list failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export interface UpsertDiagnosticSessionInput {
  sessionKey: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: number | null;
  chassisCode?: string | null;
  notes?: string | null;
  activeDtcs?: string | null;
}

export async function upsertDiagnosticSessionForUid(
  uid: string,
  email: string,
  input: UpsertDiagnosticSessionInput
) {
  const userRecord = await getOrCreateUser(uid, email);
  try {
    const now = new Date();
    const result = await db
      .insert(diagnosticSessions)
      .values({
        userId: userRecord.id,
        sessionKey: input.sessionKey.trim().slice(0, 128),
        vehicleMake: input.vehicleMake.trim().slice(0, 64),
        vehicleModel: input.vehicleModel.trim().slice(0, 80),
        vehicleYear: typeof input.vehicleYear === 'number' ? input.vehicleYear : null,
        chassisCode: input.chassisCode ? input.chassisCode.trim().slice(0, 48) : null,
        notes: input.notes ? input.notes.trim().slice(0, 2000) : null,
        activeDtcs: input.activeDtcs ? input.activeDtcs.trim().slice(0, 500) : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [diagnosticSessions.userId, diagnosticSessions.sessionKey],
        set: {
          vehicleMake: input.vehicleMake.trim().slice(0, 64),
          vehicleModel: input.vehicleModel.trim().slice(0, 80),
          vehicleYear: typeof input.vehicleYear === 'number' ? input.vehicleYear : null,
          chassisCode: input.chassisCode ? input.chassisCode.trim().slice(0, 48) : null,
          notes: input.notes ? input.notes.trim().slice(0, 2000) : null,
          activeDtcs: input.activeDtcs ? input.activeDtcs.trim().slice(0, 500) : null,
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database diagnostic session upsert failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
