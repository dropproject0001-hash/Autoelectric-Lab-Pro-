/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaPlatformType =
  | 'IOS_SAFARI'
  | 'ANDROID_CHROME'
  | 'SAMSUNG_INTERNET'
  | 'DESKTOP_CHROMIUM'
  | 'OTHER_BROWSER';

export interface PwaPlatformProfile {
  platform: PwaPlatformType;
  isIOS: boolean;
  isAndroid: boolean;
  isSamsungInternet: boolean;
  isStandalone: boolean;
}

/**
 * Pure helper to detect platform & standalone state from User-Agent and media queries.
 */
export function detectPwaPlatformProfile(
  userAgent: string,
  maxTouchPoints = 0,
  matchStandalone = false,
  navigatorStandalone = false
): PwaPlatformProfile {
  const ua = (userAgent || '').toLowerCase();
  const isIPhoneOrIPod = /iphone|ipod/.test(ua);
  const isIPad = /ipad/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1);
  const isIOS = isIPhoneOrIPod || isIPad;
  const isAndroid = /android/.test(ua);
  const isSamsungInternet = /samsungbrowser/.test(ua);
  const isChromium = /chrome|crios|edg|opr/.test(ua);
  const isStandalone = Boolean(matchStandalone || navigatorStandalone);

  let platform: PwaPlatformType = 'OTHER_BROWSER';
  if (isIOS) {
    platform = 'IOS_SAFARI';
  } else if (isSamsungInternet) {
    platform = 'SAMSUNG_INTERNET';
  } else if (isAndroid && isChromium) {
    platform = 'ANDROID_CHROME';
  } else if (isChromium) {
    platform = 'DESKTOP_CHROMIUM';
  }

  return {
    platform,
    isIOS,
    isAndroid,
    isSamsungInternet,
    isStandalone,
  };
}

/**
 * Pure security policy evaluator mirroring `/public/sw.js` `isSecuritySensitiveOrExcludedRequest`.
 * Used by both runtime diagnostics and automated security regression tests.
 */
export function evaluateSwRequestSecurityPolicy(params: {
  method: string;
  url: string;
  hasAuthHeader?: boolean;
  hasLicenseEnforceHeader?: boolean;
}): {
  allowCache: boolean;
  strategy: 'NETWORK_ONLY' | 'APP_SHELL_NAVIGATION' | 'FONT_CACHE_FIRST' | 'STATIC_ASSET_SWR';
  reason: string;
} {
  if (params.method.toUpperCase() !== 'GET') {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Non-GET mutations are strictly Network-Only.',
    };
  }

  if (params.hasAuthHeader || params.hasLicenseEnforceHeader) {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Authenticated requests with Bearer tokens or license headers are never cached.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(params.url, 'https://virtualeculab.local');
  } catch {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Malformed URL',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/api/autoelectric/license') ||
    pathname.startsWith('/api/autoelectric/analyze-schematic') ||
    pathname.startsWith('/api/autoelectric/grounded-search') ||
    pathname.startsWith('/__/auth/')
  ) {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Protected API, License, Admin, and Gemini AI endpoints are strictly Network-Only.',
    };
  }

  if (
    host.includes('securetoken.googleapis.com') ||
    host.includes('identitytoolkit.googleapis.com') ||
    host.includes('firestore.googleapis.com') ||
    host.includes('firebaseio.com') ||
    host.includes('accounts.google.com') ||
    host.includes('oauth2.googleapis.com') ||
    host.includes('generativelanguage.googleapis.com') ||
    host.includes('apis.google.com')
  ) {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Firebase Auth, Firestore, OAuth, and Google API hosts are never cached.',
    };
  }

  if (
    pathname.endsWith('.zip') ||
    pathname.endsWith('.map') ||
    pathname.startsWith('/assets/aistudio/')
  ) {
    return {
      allowCache: false,
      strategy: 'NETWORK_ONLY',
      reason: 'Large archives and temporary aistudio dumps are excluded from SW cache.',
    };
  }

  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
    return {
      allowCache: true,
      strategy: 'FONT_CACHE_FIRST',
      reason: 'Public typography assets use bounded Cache-First policy.',
    };
  }

  if (pathname === '/' || pathname === '/index.html' || pathname === '/offline.html') {
    return {
      allowCache: true,
      strategy: 'APP_SHELL_NAVIGATION',
      reason: 'Core application shell HTML.',
    };
  }

  return {
    allowCache: true,
    strategy: 'STATIC_ASSET_SWR',
    reason: 'Static application shell asset.',
  };
}

export interface PwaStateAndActions {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSamsungInternet: boolean;
  platform: PwaPlatformType;
  isOnline: boolean;
  swRegistered: boolean;
  updateAvailable: boolean;
  checkingUpdate: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  applyUpdate: () => void;
  checkForUpdates: () => Promise<boolean>;
}

// Module-level singleton capture so if `beforeinstallprompt` fires early before React mounts, it is preserved
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
}

export function usePWA(): PwaStateAndActions {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [profile, setProfile] = useState<PwaPlatformProfile>(() => {
    if (typeof window === 'undefined') {
      return {
        platform: 'OTHER_BROWSER',
        isIOS: false,
        isAndroid: false,
        isSamsungInternet: false,
        isStandalone: false,
      };
    }
    const matchStandalone =
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches);
    const navStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return detectPwaPlatformProfile(
      window.navigator.userAgent,
      window.navigator.maxTouchPoints || 0,
      matchStandalone,
      navStandalone
    );
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swRegistered, setSwRegistered] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncPrompt = () => {
      setDeferredPrompt(globalDeferredPrompt);
    };
    promptListeners.add(syncPrompt);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(globalDeferredPrompt);
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setProfile((prev) => ({ ...prev, isStandalone: true }));
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        setProfile((prev) => ({ ...prev, isStandalone: true }));
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    // Register Service Worker (/sw.js)
    if ('serviceWorker' in navigator) {
      const handleControllerChange = () => {
        if (refreshingRef.current) return;
        refreshingRef.current = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          registrationRef.current = reg;
          setSwRegistered(true);

          if (reg.waiting) {
            waitingWorkerRef.current = reg.waiting;
            setUpdateAvailable(true);
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (
                installing.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                waitingWorkerRef.current = reg.waiting || installing;
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration skipped/failed:', err);
        });

      return () => {
        promptListeners.delete(syncPrompt);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
      };
    }

    return () => {
      promptListeners.delete(syncPrompt);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    const activePrompt = deferredPrompt || globalDeferredPrompt;
    if (!activePrompt) {
      return 'unavailable';
    }
    try {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        setProfile((prev) => ({ ...prev, isStandalone: true }));
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current || registrationRef.current?.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
    } else {
      window.location.reload();
    }
  }, []);

  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    if (!registrationRef.current) return false;
    setCheckingUpdate(true);
    try {
      await registrationRef.current.update();
      if (registrationRef.current.waiting) {
        waitingWorkerRef.current = registrationRef.current.waiting;
        setUpdateAvailable(true);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt || globalDeferredPrompt),
    isInstalled: profile.isStandalone,
    isIOS: profile.isIOS,
    isAndroid: profile.isAndroid,
    isSamsungInternet: profile.isSamsungInternet,
    platform: profile.platform,
    isOnline,
    swRegistered,
    updateAvailable,
    checkingUpdate,
    promptInstall,
    applyUpdate,
    checkForUpdates,
  };
}
