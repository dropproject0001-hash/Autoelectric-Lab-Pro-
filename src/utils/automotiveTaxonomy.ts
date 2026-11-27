/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { SYSTEM_CATEGORIES } from '../data/automotiveKnowledgeSeed';
import { SystemCategoryId } from '../types/automotiveKnowledge';

export function normalizeSystemCategory(query: string): SystemCategoryId | null {
  const q = query.toLowerCase().trim();
  for (const cat of SYSTEM_CATEGORIES) {
    if (cat.id === q || cat.name.toLowerCase() === q) {
      return cat.id;
    }
    for (const alias of cat.aliases) {
      if (q.includes(alias) || alias.includes(q)) {
        return cat.id;
      }
    }
  }
  return null;
}

export function getSystemCategoryName(categoryId: SystemCategoryId): string {
  const found = SYSTEM_CATEGORIES.find((c) => c.id === categoryId);
  return found ? found.name : categoryId;
}
