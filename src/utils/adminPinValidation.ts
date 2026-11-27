/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export interface MasterPinConfigSnapshot {
  masterEnvConfigured: boolean;
  adminClaimed: boolean;
  setupEnabled: boolean;
  pinInitialized: boolean;
}

export interface MasterPinModificationInput {
  currentPin: string;
  newPin: string;
  confirmNewPin: string;
  config: MasterPinConfigSnapshot | null;
}

export interface MasterPinValidationResult {
  valid: boolean;
  errors: string[];
  checks: {
    envNotLocked: boolean;
    pinInitialized: boolean;
    currentPinPresent: boolean;
    newPinFormatValid: boolean;
    newPinNotTrivial: boolean;
    newPinDiffersFromCurrent: boolean;
    confirmMatchesNewPin: boolean;
  };
}

export const SECONDARY_CONFIRMATION_KEYWORD = 'CONFIRM';

/**
 * Always masks an active or entered Master Admin PIN without revealing plaintext digits.
 */
export function maskMasterAdminPin(rawPin: string | null | undefined, minBullets = 8): string {
  const clean = typeof rawPin === 'string' ? rawPin.replace(/[\s-]+/g, '').trim() : '';
  const length = Math.max(minBullets, Math.min(16, clean.length || minBullets));
  return '•'.repeat(length);
}

export function isTrivialNumericMasterPin(pin: string): boolean {
  const clean = pin.replace(/[\s-]+/g, '').trim();
  if (!clean) return true;
  if (/^(\d)\1+$/.test(clean)) return true;

  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(clean) || descending.includes(clean)) {
    return true;
  }
  return false;
}

export function validateMasterPinModification(
  input: MasterPinModificationInput
): MasterPinValidationResult {
  const currentClean = input.currentPin.replace(/[\s-]+/g, '').trim();
  const newClean = input.newPin.replace(/[\s-]+/g, '').trim();
  const confirmClean = input.confirmNewPin.replace(/[\s-]+/g, '').trim();

  const envNotLocked = Boolean(input.config && !input.config.masterEnvConfigured);
  const pinInitialized = Boolean(input.config?.pinInitialized);
  const currentPinPresent = currentClean.length >= 4 && currentClean.length <= 64;
  const newPinFormatValid = /^\d{6,12}$/.test(newClean);
  const newPinNotTrivial = newPinFormatValid && !isTrivialNumericMasterPin(newClean);
  const newPinDiffersFromCurrent = newClean.length > 0 && newClean !== currentClean;
  const confirmMatchesNewPin = newClean.length > 0 && confirmClean === newClean;

  const errors: string[] = [];

  if (!input.config) {
    errors.push('Server Master Admin PIN configuration has not loaded yet.');
  } else if (!envNotLocked) {
    errors.push(
      'Master Admin PIN is managed via the server VECL_ADMIN_MASTER_PIN environment secret and cannot be modified from the UI.'
    );
  } else if (!pinInitialized) {
    errors.push('No claimed Master Admin PIN exists yet. Complete first-run setup first.');
  }

  if (!currentPinPresent) {
    errors.push('Enter your currently active Master Admin PIN (minimum 4 characters).');
  }
  if (!newPinFormatValid) {
    errors.push('New Master Admin PIN must be 6 to 12 numeric digits.');
  } else if (!newPinNotTrivial) {
    errors.push('Choose a stronger PIN (avoid repeated digits or sequential runs like 123456).');
  }
  if (currentPinPresent && newPinFormatValid && !newPinDiffersFromCurrent) {
    errors.push('New Master Admin PIN must be different from the currently active PIN.');
  }
  if (newPinFormatValid && !confirmMatchesNewPin) {
    errors.push('New PIN and confirmation PIN do not match.');
  }

  return {
    valid: errors.length === 0,
    errors,
    checks: {
      envNotLocked,
      pinInitialized,
      currentPinPresent,
      newPinFormatValid,
      newPinNotTrivial,
      newPinDiffersFromCurrent,
      confirmMatchesNewPin,
    },
  };
}

export function isSecondaryConfirmationSatisfied(params: {
  acknowledged: boolean;
  confirmationText: string;
}): boolean {
  return (
    params.acknowledged === true &&
    params.confirmationText.trim().toUpperCase() === SECONDARY_CONFIRMATION_KEYWORD
  );
}
