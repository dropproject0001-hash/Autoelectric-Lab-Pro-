/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useEffect, useState } from 'react';

export const BILLING_CONFIG_DB_NAME = 'AutoLabPro_BillingConfig';
export const BILLING_CONFIG_STORE_NAME = 'payment_qr_config';
export const BILLING_CONFIG_DB_VERSION = 1;

export interface PaymentQrConfig {
  id: 'default';
  providerLabel: 'GCash / Maya';
  accountName: string;
  accountNumber: string;
  qrImageDataUrl: string | null;
  instructionsTaglish: string;
  updatedAtIso: string;
}

const DEFAULT_PAYMENT_QR_CONFIG: PaymentQrConfig = {
  id: 'default',
  providerLabel: 'GCash / Maya',
  accountName: 'AutoElectric Lab Pro — Official Owner Account',
  accountNumber: 'Contact Admin for Verified GCash / Maya Number',
  qrImageDataUrl: null,
  instructionsTaglish:
    'I-scan ang opisyal na GCash / Maya QR, i-send ang screenshot ng resibo sa Owner/Admin para makatanggap ng iyong signed PRO PIN.',
  updatedAtIso: new Date(0).toISOString(),
};

let memoryQrConfig: PaymentQrConfig | null = null;
const configSubscribers = new Set<(cfg: PaymentQrConfig) => void>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openBillingConfigDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BILLING_CONFIG_DB_NAME, BILLING_CONFIG_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BILLING_CONFIG_STORE_NAME)) {
        db.createObjectStore(BILLING_CONFIG_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error('Failed to open AutoLabPro_BillingConfig IndexedDB'));
  });
}

export async function loadPaymentQrConfig(): Promise<PaymentQrConfig> {
  if (memoryQrConfig) return memoryQrConfig;
  if (!hasIndexedDb()) {
    memoryQrConfig = { ...DEFAULT_PAYMENT_QR_CONFIG };
    return memoryQrConfig;
  }

  try {
    const db = await openBillingConfigDb();
    const row = await new Promise<PaymentQrConfig | undefined>((resolve, reject) => {
      const tx = db.transaction(BILLING_CONFIG_STORE_NAME, 'readonly');
      const req = tx.objectStore(BILLING_CONFIG_STORE_NAME).get('default');
      req.onsuccess = () => resolve(req.result as PaymentQrConfig | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    memoryQrConfig = row || { ...DEFAULT_PAYMENT_QR_CONFIG };
    return memoryQrConfig;
  } catch {
    memoryQrConfig = { ...DEFAULT_PAYMENT_QR_CONFIG };
    return memoryQrConfig;
  }
}

export async function savePaymentQrConfig(
  update: Partial<Omit<PaymentQrConfig, 'id'>>
): Promise<PaymentQrConfig> {
  const current = await loadPaymentQrConfig();
  const next: PaymentQrConfig = {
    ...current,
    ...update,
    id: 'default',
    accountName: String(update.accountName ?? current.accountName).trim().slice(0, 120),
    accountNumber: String(update.accountNumber ?? current.accountNumber).trim().slice(0, 64),
    updatedAtIso: new Date().toISOString(),
  };

  memoryQrConfig = next;
  if (hasIndexedDb()) {
    try {
      const db = await openBillingConfigDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BILLING_CONFIG_STORE_NAME, 'readwrite');
        tx.objectStore(BILLING_CONFIG_STORE_NAME).put(next);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Keep memory fallback
    }
  }

  for (const listener of configSubscribers) {
    try {
      listener(next);
    } catch {
      // Isolate errors
    }
  }
  return next;
}

/**
 * Canvas-based QR image auto-compressor clamping uploaded QR photos to max 600x600px
 * to keep IndexedDB AutoLabPro_BillingConfig lightweight and crisp.
 */
export async function compressQrImageFile(
  file: File,
  maxDimension = 600
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read QR image file.'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export function usePaymentQrConfig() {
  const [config, setConfig] = useState<PaymentQrConfig>(
    () => memoryQrConfig || DEFAULT_PAYMENT_QR_CONFIG
  );

  useEffect(() => {
    let active = true;
    void loadPaymentQrConfig().then((loaded) => {
      if (active) setConfig(loaded);
    });
    const listener = (next: PaymentQrConfig) => setConfig(next);
    configSubscribers.add(listener);
    return () => {
      active = false;
      configSubscribers.delete(listener);
    };
  }, []);

  return config;
}

export async function clearBillingConfigForTests(): Promise<void> {
  memoryQrConfig = null;
  if (!hasIndexedDb()) return;
  try {
    const db = await openBillingConfigDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BILLING_CONFIG_STORE_NAME, 'readwrite');
      tx.objectStore(BILLING_CONFIG_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}
