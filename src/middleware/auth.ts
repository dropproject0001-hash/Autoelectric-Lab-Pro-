/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth } from '../lib/firebase-admin.ts';
import { verifyFirebaseIdToken } from '../server/services/firebaseAuthMiddleware';

export interface AuthRequest extends Request {
  user?: Partial<DecodedIdToken> & { uid: string; email?: string };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  try {
    try {
      const adminAuth = await getAdminAuth();
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      return next();
    } catch (adminErr) {
      const code = adminErr && typeof adminErr === 'object' && 'code' in adminErr ? String(adminErr.code) : '';
      if (code === 'ERR_REQUIRE_ESM' || code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
        const verified = await verifyFirebaseIdToken(token);
        req.user = {
          uid: verified.uid,
          email: verified.email ?? undefined,
          email_verified: verified.emailVerified,
        };
        return next();
      }
      throw adminErr;
    }
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
