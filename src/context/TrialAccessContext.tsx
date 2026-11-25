/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AdminTrialAuditSummary,
  ClientTrialAuditEvent,
  ClientTrialPinRecord,
  fetchAdminTrialPinsList,
  fetchTrialDeviceStatus,
  getAdminPinToken,
  PublicTrialDeviceUsage,
  redeemTrialPinClient,
  setActiveTrialToken,
  setAdminPinToken,
  subscribeTrialLockEvents,
} from '../services/trialPinClientService';
import { useAuth } from './AuthContext';

export type AccessCapabilityMode =
  | 'ADMIN'
  | 'TRIAL_ACTIVE'
  | 'TRIAL_EXPIRED'
  | 'TRIAL_REVOKED'
  | 'UNLICENSED';

export type AccessModalTab = 'TRIAL_PIN' | 'ADMIN_GEN';

interface TrialAccessContextValue {
  accessReady: boolean;
  accessMode: AccessCapabilityMode;
  trialRecord: ClientTrialPinRecord | null;
  expiresAtMs: number | null;
  remainingSeconds: number | null;
  isLowTimeWarning: boolean;
  activeDeviceCount: number;
  activeTotalActivations: number;
  activeUsageHistory: PublicTrialDeviceUsage[];
  hasActiveProAccess: boolean;
  isBenchEntryAuthorized: boolean;
  canUseAi: boolean;
  canUseExports: boolean;
  isAdminUnlocked: boolean;
  adminAuditTrials: ClientTrialPinRecord[];
  adminAuditLog: ClientTrialAuditEvent[];
  adminAuditSummary: AdminTrialAuditSummary | null;
  adminAuditServerSkewMs: number;
  adminAuditLoading: boolean;
  adminAuditError: string | null;
  refreshAdminAuditData: () => Promise<void>;
  lockNotice: string | null;
  isModalOpen: boolean;
  initialModalTab: AccessModalTab;
  openAccessModal: (options?: { tab?: AccessModalTab; notice?: string }) => void;
  closeAccessModal: () => void;
  clearLockNotice: () => void;
  redeemTrialPin: (pin: string, deviceLabel?: string) => Promise<{
    newlyActivated: boolean;
    trial: ClientTrialPinRecord;
  }>;
  refreshAccessStatus: () => Promise<void>;
  markAdminSessionActive: (active: boolean) => void;
  enterBenchAsAdmin: () => void;
  lockBenchSession: () => void;
}

const TrialAccessContext = createContext<TrialAccessContextValue>({
  accessReady: false,
  accessMode: 'UNLICENSED',
  trialRecord: null,
  expiresAtMs: null,
  remainingSeconds: null,
  isLowTimeWarning: false,
  activeDeviceCount: 0,
  activeTotalActivations: 0,
  activeUsageHistory: [],
  hasActiveProAccess: false,
  isBenchEntryAuthorized: false,
  canUseAi: false,
  canUseExports: false,
  isAdminUnlocked: false,
  adminAuditTrials: [],
  adminAuditLog: [],
  adminAuditSummary: null,
  adminAuditServerSkewMs: 0,
  adminAuditLoading: false,
  adminAuditError: null,
  refreshAdminAuditData: async () => {},
  lockNotice: null,
  isModalOpen: false,
  initialModalTab: 'TRIAL_PIN',
  openAccessModal: () => {},
  closeAccessModal: () => {},
  clearLockNotice: () => {},
  redeemTrialPin: async () => {
    throw new Error('TrialAccessProvider not mounted');
  },
  refreshAccessStatus: async () => {},
  markAdminSessionActive: () => {},
  enterBenchAsAdmin: () => {},
  lockBenchSession: () => {},
});

export function formatTrialCountdown(totalSeconds: number | null): string {
  if (totalSeconds === null || totalSeconds <= 0) return '00:00:00';
  const days = Math.floor(totalSeconds / 86400);
  const hrs = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hms = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}

export const TrialAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: googleUser, authReady: firebaseAuthReady } = useAuth();
  const isGoogleSignedIn = Boolean(googleUser && googleUser.emailVerified);
  const [accessReady, setAccessReady] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessCapabilityMode>('UNLICENSED');
  const [trialRecord, setTrialRecord] = useState<ClientTrialPinRecord | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [serverSkewMs, setServerSkewMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => Boolean(getAdminPinToken()));
  const [adminEnteredBench, setAdminEnteredBench] = useState(false);
  const [isManuallyLocked, setIsManuallyLocked] = useState(false);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState<AccessModalTab>('TRIAL_PIN');
  const [adminAuditTrials, setAdminAuditTrials] = useState<ClientTrialPinRecord[]>([]);
  const [adminAuditLog, setAdminAuditLog] = useState<ClientTrialAuditEvent[]>([]);
  const [adminAuditSummary, setAdminAuditSummary] = useState<AdminTrialAuditSummary | null>(null);
  const [adminAuditServerSkewMs, setAdminAuditServerSkewMs] = useState(0);
  const [adminAuditLoading, setAdminAuditLoading] = useState(false);
  const [adminAuditError, setAdminAuditError] = useState<string | null>(null);

  const computeRemaining = useCallback(
    (targetExpiryMs: number | null, skewMs: number): number | null => {
      if (!targetExpiryMs) return null;
      const estimatedServerNow = Date.now() + skewMs;
      return Math.max(0, Math.floor((targetExpiryMs - estimatedServerNow) / 1000));
    },
    []
  );

  const refreshAccessStatus = useCallback(async () => {
    try {
      // 1. Check Master Admin in-memory PIN session
      if (getAdminPinToken()) {
        setIsAdminUnlocked(true);
        setAccessMode('ADMIN');
        setTrialRecord(null);
        setExpiresAtMs(null);
        setRemainingSeconds(null);
        setLockNotice(null);
        return;
      }

      // 2. Check 8-digit Trial PIN status bound to this single workstation
      const trialStatus = await fetchTrialDeviceStatus();
      const skew = trialStatus.serverNowMs - Date.now();
      setServerSkewMs(skew);
      setTrialRecord(trialStatus.trial);

      if (
        trialStatus.accessState === 'TRIAL_ACTIVE' &&
        trialStatus.hasAccess &&
        Boolean(trialStatus.trialToken) &&
        trialStatus.trial?.expiresAtMs
      ) {
        setAccessMode('TRIAL_ACTIVE');
        setExpiresAtMs(trialStatus.trial.expiresAtMs);
        setRemainingSeconds(computeRemaining(trialStatus.trial.expiresAtMs, skew));
        setLockNotice(null);
      } else if (trialStatus.accessState === 'TRIAL_EXPIRED') {
        setAccessMode('TRIAL_EXPIRED');
        setExpiresAtMs(trialStatus.trial?.expiresAtMs ?? null);
        setRemainingSeconds(0);
      } else if (trialStatus.accessState === 'TRIAL_REVOKED') {
        setAccessMode('TRIAL_REVOKED');
        setExpiresAtMs(trialStatus.trial?.expiresAtMs ?? null);
        setRemainingSeconds(0);
      } else {
        setAccessMode('UNLICENSED');
        setExpiresAtMs(null);
        setRemainingSeconds(null);
      }
    } catch {
      // Non-fatal offline tolerance: keep existing client state unless expired
    } finally {
      setAccessReady(true);
    }
  }, [computeRemaining]);

  useEffect(() => {
    void refreshAccessStatus();
  }, [refreshAccessStatus]);

  // Listen for server 403 TRIAL_EXPIRED / TRIAL_REVOKED events on any AI route
  useEffect(() => {
    return subscribeTrialLockEvents((code, message) => {
      setAccessMode(code === 'TRIAL_REVOKED' ? 'TRIAL_REVOKED' : 'TRIAL_EXPIRED');
      setRemainingSeconds(0);
      setLockNotice(message);
      setInitialModalTab('TRIAL_PIN');
      setIsModalOpen(false);
    });
  }, []);

  // 1-second live countdown ticker + automatic expiry transition when clock hits zero
  useEffect(() => {
    if (accessMode !== 'TRIAL_ACTIVE' || !expiresAtMs) return;

    const tick = () => {
      const rem = computeRemaining(expiresAtMs, serverSkewMs);
      setRemainingSeconds(rem);
      if (rem !== null && rem <= 0) {
        setActiveTrialToken(null);
        setAccessMode('TRIAL_EXPIRED');
        setLockNotice(
          'Your trial PIN session has expired. AI tools and local exports are now locked.'
        );
        setIsModalOpen(false);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [accessMode, computeRemaining, expiresAtMs, serverSkewMs]);

  const openAccessModal = useCallback(
    (options?: { tab?: AccessModalTab; notice?: string }) => {
      if (options?.tab) {
        setInitialModalTab(options.tab);
      } else if (accessMode === 'ADMIN') {
        setInitialModalTab('ADMIN_GEN');
      } else {
        setInitialModalTab('TRIAL_PIN');
      }
      if (options?.notice) {
        setLockNotice(options.notice);
      }
      setIsModalOpen(true);
    },
    [accessMode]
  );

  const closeAccessModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const clearLockNotice = useCallback(() => {
    setLockNotice(null);
  }, []);

  const redeemTrialPin = useCallback(
    async (pin: string, deviceLabel?: string) => {
      const res = await redeemTrialPinClient(pin, deviceLabel);
      const skew = res.serverNowMs - Date.now();
      setServerSkewMs(skew);
      setTrialRecord(res.trial);
      setExpiresAtMs(res.trial.expiresAtMs);
      setRemainingSeconds(computeRemaining(res.trial.expiresAtMs, skew));
      setAccessMode('TRIAL_ACTIVE');
      setIsManuallyLocked(false);
      setLockNotice(null);
      return {
        newlyActivated: res.newlyActivated,
        trial: res.trial,
      };
    },
    [computeRemaining]
  );

  const refreshAdminAuditData = useCallback(async () => {
    setAdminAuditLoading(true);
    setAdminAuditError(null);
    try {
      const snapshot = await fetchAdminTrialPinsList();
      setAdminAuditTrials(snapshot.trials);
      setAdminAuditLog(snapshot.auditLog);
      setAdminAuditSummary(snapshot.summary);
      setAdminAuditServerSkewMs(snapshot.serverNowMs - Date.now());
      setIsAdminUnlocked(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load admin audit log.';
      setAdminAuditError(message);
      if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('unlock')) {
        setIsAdminUnlocked(false);
        setAdminAuditTrials([]);
        setAdminAuditLog([]);
        setAdminAuditSummary(null);
      }
    } finally {
      setAdminAuditLoading(false);
    }
  }, []);

  const markAdminSessionActive = useCallback(
    (active: boolean) => {
      setIsAdminUnlocked(active);
      if (!active) {
        setAdminPinToken(null);
        setAdminEnteredBench(false);
        setAdminAuditTrials([]);
        setAdminAuditLog([]);
        setAdminAuditSummary(null);
        setAdminAuditError(null);
        void refreshAccessStatus();
      } else {
        setAccessMode('ADMIN');
        setLockNotice(null);
      }
    },
    [refreshAccessStatus]
  );

  const enterBenchAsAdmin = useCallback(() => {
    setIsManuallyLocked(false);
    setAdminEnteredBench(true);
    setAccessMode('ADMIN');
    setLockNotice(null);
    setIsModalOpen(false);
  }, []);

  const lockBenchSession = useCallback(() => {
    setIsManuallyLocked(true);
    setAdminEnteredBench(false);
    setIsModalOpen(false);
  }, []);

  const isLowTimeWarning =
    accessMode === 'TRIAL_ACTIVE' &&
    remainingSeconds !== null &&
    remainingSeconds > 0 &&
    remainingSeconds < 1800;

  const activeDeviceCount = trialRecord?.totalDevicesUsed ?? (trialRecord?.boundDeviceId ? 1 : 0);
  const activeTotalActivations = trialRecord?.totalActivations ?? (trialRecord?.activatedAtMs ? 1 : 0);
  const activeUsageHistory = useMemo(
    () => trialRecord?.usageHistory ?? [],
    [trialRecord?.usageHistory]
  );

  useEffect(() => {
    if (isGoogleSignedIn) {
      setIsManuallyLocked(false);
      setLockNotice(null);
    }
  }, [isGoogleSignedIn]);

  const hasActiveProAccess =
    isGoogleSignedIn ||
    accessMode === 'ADMIN' ||
    (accessMode === 'TRIAL_ACTIVE' && (remainingSeconds === null || remainingSeconds > 0));

  // Authorize Bench Lab entry via verified Google Sign-In, Admin-issued Trial PIN, or Master Admin PIN
  const isBenchEntryAuthorized =
    !isManuallyLocked &&
    (isGoogleSignedIn ||
      (accessMode === 'ADMIN' && adminEnteredBench) ||
      (accessMode === 'TRIAL_ACTIVE' && (remainingSeconds === null || remainingSeconds > 0)));

  // Lock AI & Exports strictly when not holding active verified account or PIN access
  const canUseAi = hasActiveProAccess;
  const canUseExports = hasActiveProAccess;
  const effectiveAccessReady = accessReady && firebaseAuthReady;

  const value = useMemo<TrialAccessContextValue>(
    () => ({
      accessReady: effectiveAccessReady,
      accessMode,
      trialRecord,
      expiresAtMs,
      remainingSeconds,
      isLowTimeWarning,
      activeDeviceCount,
      activeTotalActivations,
      activeUsageHistory,
      hasActiveProAccess,
      isBenchEntryAuthorized,
      canUseAi,
      canUseExports,
      isAdminUnlocked,
      adminAuditTrials,
      adminAuditLog,
      adminAuditSummary,
      adminAuditServerSkewMs,
      adminAuditLoading,
      adminAuditError,
      refreshAdminAuditData,
      lockNotice,
      isModalOpen,
      initialModalTab,
      openAccessModal,
      closeAccessModal,
      clearLockNotice,
      redeemTrialPin,
      refreshAccessStatus,
      markAdminSessionActive,
      enterBenchAsAdmin,
      lockBenchSession,
    }),
    [
      effectiveAccessReady,
      accessMode,
      trialRecord,
      expiresAtMs,
      remainingSeconds,
      isLowTimeWarning,
      activeDeviceCount,
      activeTotalActivations,
      activeUsageHistory,
      hasActiveProAccess,
      isBenchEntryAuthorized,
      canUseAi,
      canUseExports,
      isAdminUnlocked,
      adminAuditTrials,
      adminAuditLog,
      adminAuditSummary,
      adminAuditServerSkewMs,
      adminAuditLoading,
      adminAuditError,
      refreshAdminAuditData,
      lockNotice,
      isModalOpen,
      initialModalTab,
      openAccessModal,
      closeAccessModal,
      clearLockNotice,
      redeemTrialPin,
      refreshAccessStatus,
      markAdminSessionActive,
      enterBenchAsAdmin,
      lockBenchSession,
    ]
  );

  return <TrialAccessContext.Provider value={value}>{children}</TrialAccessContext.Provider>;
};

export function useTrialAccess(): TrialAccessContextValue {
  return useContext(TrialAccessContext);
}
