/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Local AI (WebGPU + WebLLM) Manager (Master Developer Instruction v1.1, Section 9).
 * - Capability-based quantized model profiles for Android & Desktop
 * - Explicit download size disclosure & user consent gate
 * - Documented storage budget (MAX_LOCAL_MODEL_STORAGE_BUDGET_MB = 2500 MB)
 * - 3 execution states: LOCAL_WEBGPU_INFERENCE -> LOCAL_FALLBACK_EXPLAINER -> DATABASE_ONLY
 * - A failed model load NEVER crashes the app; always drops cleanly to DATABASE_ONLY.
 */

export type LocalAiExecutionState =
  | 'LOCAL_WEBGPU_INFERENCE'
  | 'LOCAL_FALLBACK_EXPLAINER'
  | 'DATABASE_ONLY';

export type DevicePlatformClass = 'ANDROID_MOBILE' | 'LAPTOP_TABLET' | 'DESKTOP_WORKSTATION';

export interface LocalModelProfile {
  profileId: string;
  modelId: string;
  displayName: string;
  quantization: string;
  targetPlatforms: DevicePlatformClass[];
  downloadSizeMb: number;
  storageBudgetMb: number;
  minMemoryGb: number;
  notes: string;
}

export const MAX_LOCAL_MODEL_STORAGE_BUDGET_MB = 2500;
const CONSENT_STORAGE_KEY = 'autolab_local_llm_consent_v1';

export const LOCAL_MODEL_PROFILES: readonly LocalModelProfile[] = [
  {
    profileId: 'android-compact-q4',
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    displayName: 'SmolLM2 360M (Android Compact Q4)',
    quantization: 'q4f16_1',
    targetPlatforms: ['ANDROID_MOBILE', 'LAPTOP_TABLET', 'DESKTOP_WORKSTATION'],
    downloadSizeMb: 240,
    storageBudgetMb: 450,
    minMemoryGb: 2,
    notes: 'Ultra-compact quantized model designed for Android browsers with WebGPU.',
  },
  {
    profileId: 'balanced-q4',
    modelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    displayName: 'Qwen 2.5 1.5B (Balanced Q4)',
    quantization: 'q4f16_1',
    targetPlatforms: ['LAPTOP_TABLET', 'DESKTOP_WORKSTATION'],
    downloadSizeMb: 950,
    storageBudgetMb: 1400,
    minMemoryGb: 4,
    notes: 'Balanced technical explainer for laptops and tablets with 4GB+ unified memory.',
  },
  {
    profileId: 'desktop-pro-q4',
    modelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    displayName: 'Llama 3.2 3B (Desktop Workstation Q4)',
    quantization: 'q4f16_1',
    targetPlatforms: ['DESKTOP_WORKSTATION'],
    downloadSizeMb: 1850,
    storageBudgetMb: 2400,
    minMemoryGb: 6,
    notes: 'High-clarity local explainer for desktop browsers with dedicated WebGPU.',
  },
] as const;

export interface LocalDeviceCapabilityReport {
  platformClass: DevicePlatformClass;
  webGpuApiPresent: boolean;
  webGpuAdapterAvailable: boolean;
  estimatedDeviceMemoryGb: number;
  availableStorageMb: number | null;
  recommendedProfile: LocalModelProfile;
  withinStorageBudget: boolean;
}

export interface LocalAiRuntimeStatus {
  executionState: LocalAiExecutionState;
  activeProfileId: string | null;
  activeModelId: string | null;
  isLoading: boolean;
  loadProgress: number;
  lastError: string | null;
  consentedProfileIds: string[];
  storageBudgetMb: number;
  lastTestedAt: string | null;
}

export type LocalModelLoaderFn = (profile: LocalModelProfile) => Promise<{
  explain: (prompt: string) => Promise<string>;
  unload?: () => Promise<void>;
}>;

const memoryConsentSet = new Set<string>();
let activeModelHandle: {
  profile: LocalModelProfile;
  explain: (prompt: string) => Promise<string>;
  unload?: () => Promise<void>;
} | null = null;

let runtimeStatus: LocalAiRuntimeStatus = {
  executionState: 'DATABASE_ONLY',
  activeProfileId: null,
  activeModelId: null,
  isLoading: false,
  loadProgress: 0,
  lastError: null,
  consentedProfileIds: [],
  storageBudgetMb: MAX_LOCAL_MODEL_STORAGE_BUDGET_MB,
  lastTestedAt: null,
};

let customLoaderForTests: LocalModelLoaderFn | null = null;

function hydrateConsent(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => memoryConsentSet.add(id));
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

function persistConsent(): void {
  runtimeStatus = {
    ...runtimeStatus,
    consentedProfileIds: Array.from(memoryConsentSet),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(Array.from(memoryConsentSet)));
    }
  } catch {
    // Ignore storage write errors
  }
}

export function grantModelDownloadConsent(profileId: string): void {
  hydrateConsent();
  memoryConsentSet.add(profileId);
  persistConsent();
}

export function revokeModelDownloadConsent(profileId: string): void {
  hydrateConsent();
  memoryConsentSet.delete(profileId);
  persistConsent();
}

export function hasModelDownloadConsent(profileId: string): boolean {
  hydrateConsent();
  return memoryConsentSet.has(profileId);
}

export function detectPlatformClass(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  deviceMemoryGb: number = typeof navigator !== 'undefined' && 'deviceMemory' in navigator
    ? Number((navigator as unknown as { deviceMemory?: number }).deviceMemory || 4)
    : 4
): DevicePlatformClass {
  if (/android|mobile/i.test(userAgent)) {
    return 'ANDROID_MOBILE';
  }
  if (deviceMemoryGb >= 8 && !/tablet|ipad/i.test(userAgent)) {
    return 'DESKTOP_WORKSTATION';
  }
  return 'LAPTOP_TABLET';
}

export function selectRecommendedModelProfile(
  platformClass: DevicePlatformClass,
  deviceMemoryGb: number
): LocalModelProfile {
  if (platformClass === 'ANDROID_MOBILE' || deviceMemoryGb < 4) {
    return LOCAL_MODEL_PROFILES[0];
  }
  if (platformClass === 'DESKTOP_WORKSTATION' && deviceMemoryGb >= 8) {
    return LOCAL_MODEL_PROFILES[2];
  }
  return LOCAL_MODEL_PROFILES[1];
}

export async function inspectLocalAiCapabilities(overrides?: {
  userAgent?: string;
  deviceMemoryGb?: number;
  availableStorageMb?: number | null;
}): Promise<LocalDeviceCapabilityReport> {
  const deviceMemoryGb =
    overrides?.deviceMemoryGb ??
    (typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? Number((navigator as unknown as { deviceMemory?: number }).deviceMemory || 4)
      : 4);
  const platformClass = detectPlatformClass(overrides?.userAgent, deviceMemoryGb);
  const recommendedProfile = selectRecommendedModelProfile(platformClass, deviceMemoryGb);

  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as Record<string, unknown>) : {};
  const gpu = nav.gpu as { requestAdapter?: () => Promise<unknown> } | undefined;
  const webGpuApiPresent = Boolean(gpu && typeof gpu.requestAdapter === 'function');
  let webGpuAdapterAvailable = false;
  if (webGpuApiPresent && gpu?.requestAdapter) {
    try {
      const adapter = await gpu.requestAdapter();
      webGpuAdapterAvailable = Boolean(adapter);
    } catch {
      webGpuAdapterAvailable = false;
    }
  }

  let availableStorageMb: number | null =
    overrides?.availableStorageMb !== undefined ? overrides.availableStorageMb : null;
  if (
    availableStorageMb === null &&
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.estimate === 'function'
  ) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number' && typeof est.usage === 'number') {
        availableStorageMb = Math.max(0, Math.floor((est.quota - est.usage) / (1024 * 1024)));
      }
    } catch {
      availableStorageMb = null;
    }
  }

  const withinStorageBudget =
    recommendedProfile.storageBudgetMb <= MAX_LOCAL_MODEL_STORAGE_BUDGET_MB &&
    (availableStorageMb === null || availableStorageMb >= recommendedProfile.storageBudgetMb);

  return {
    platformClass,
    webGpuApiPresent,
    webGpuAdapterAvailable,
    estimatedDeviceMemoryGb: deviceMemoryGb,
    availableStorageMb,
    recommendedProfile,
    withinStorageBudget,
  };
}

export function getLocalAiRuntimeStatus(): LocalAiRuntimeStatus {
  hydrateConsent();
  return {
    ...runtimeStatus,
    consentedProfileIds: Array.from(memoryConsentSet),
  };
}

export function setLocalModelLoaderForTests(loader: LocalModelLoaderFn | null): void {
  customLoaderForTests = loader;
}

export async function resetLocalAiServiceForTests(): Promise<void> {
  if (activeModelHandle?.unload) {
    try {
      await activeModelHandle.unload();
    } catch {
      // Ignore cleanup errors
    }
  }
  activeModelHandle = null;
  customLoaderForTests = null;
  memoryConsentSet.clear();
  runtimeStatus = {
    executionState: 'DATABASE_ONLY',
    activeProfileId: null,
    activeModelId: null,
    isLoading: false,
    loadProgress: 0,
    lastError: null,
    consentedProfileIds: [],
    storageBudgetMb: MAX_LOCAL_MODEL_STORAGE_BUDGET_MB,
    lastTestedAt: null,
  };
}

export const DEFAULT_WEBLLM_INIT_TIMEOUT_MS = 180_000;
export const DEFAULT_WEBLLM_INFERENCE_TIMEOUT_MS = 45_000;

const statusListeners = new Set<(status: LocalAiRuntimeStatus) => void>();

function notifyLocalAiStatus(): void {
  const snapshot = getLocalAiRuntimeStatus();
  statusListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeLocalAiStatus(
  listener: (status: LocalAiRuntimeStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(getLocalAiRuntimeStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

export async function unloadLocalWebGpuModel(): Promise<void> {
  if (activeModelHandle?.unload) {
    try {
      await activeModelHandle.unload();
    } catch {
      // Ignore cleanup errors
    }
  }
  activeModelHandle = null;
  runtimeStatus = {
    ...runtimeStatus,
    executionState: 'DATABASE_ONLY',
    activeProfileId: null,
    activeModelId: null,
    isLoading: false,
    loadProgress: 0,
  };
  notifyLocalAiStatus();
}

/**
 * Loads a quantized local model after verifying:
 * 1) Explicit user consent for the model download size
 * 2) Storage budget compliance
 * 3) Real worker initialization + inference self-test (with timeout & crash recovery)
 * On ANY failure, drops gracefully to DATABASE_ONLY without throwing an unhandled crash.
 */
export async function loadLocalWebGpuModel(
  profileId: string,
  options?: {
    availableStorageMb?: number | null;
    initTimeoutMs?: number;
    inferenceTimeoutMs?: number;
  }
): Promise<{
  ok: boolean;
  executionState: LocalAiExecutionState;
  error?: string;
  requiresConsent?: boolean;
  downloadSizeMb?: number;
}> {
  const profile = LOCAL_MODEL_PROFILES.find((p) => p.profileId === profileId);
  if (!profile) {
    return {
      ok: false,
      executionState: 'DATABASE_ONLY',
      error: `Unknown local model profile: ${profileId}`,
    };
  }

  if (!hasModelDownloadConsent(profile.profileId)) {
    return {
      ok: false,
      executionState: 'DATABASE_ONLY',
      requiresConsent: true,
      downloadSizeMb: profile.downloadSizeMb,
      error: `Explicit user consent is required before downloading ${profile.displayName} (~${profile.downloadSizeMb} MB).`,
    };
  }

  if (
    profile.storageBudgetMb > MAX_LOCAL_MODEL_STORAGE_BUDGET_MB ||
    (typeof options?.availableStorageMb === 'number' &&
      options.availableStorageMb < profile.storageBudgetMb)
  ) {
    runtimeStatus = {
      ...runtimeStatus,
      executionState: 'DATABASE_ONLY',
      lastError: `Insufficient storage for ${profile.displayName} (requires ${profile.storageBudgetMb} MB within ${MAX_LOCAL_MODEL_STORAGE_BUDGET_MB} MB budget).`,
      lastTestedAt: new Date().toISOString(),
    };
    notifyLocalAiStatus();
    return {
      ok: false,
      executionState: 'DATABASE_ONLY',
      error: runtimeStatus.lastError || undefined,
    };
  }

  // Cleanly unload any previously loaded worker before starting a new one
  if (activeModelHandle?.unload) {
    await unloadLocalWebGpuModel();
  }

  const initTimeoutMs = options?.initTimeoutMs ?? DEFAULT_WEBLLM_INIT_TIMEOUT_MS;
  const inferenceTimeoutMs = options?.inferenceTimeoutMs ?? DEFAULT_WEBLLM_INFERENCE_TIMEOUT_MS;

  runtimeStatus = {
    ...runtimeStatus,
    isLoading: true,
    loadProgress: 0.1,
    lastError: null,
  };
  notifyLocalAiStatus();

  let workerRef: Worker | null = null;

  try {
    if (customLoaderForTests) {
      const handle = await customLoaderForTests(profile);
      activeModelHandle = { profile, ...handle };
      runtimeStatus = {
        ...runtimeStatus,
        executionState: 'LOCAL_WEBGPU_INFERENCE',
        activeProfileId: profile.profileId,
        activeModelId: profile.modelId,
        isLoading: false,
        loadProgress: 1,
        lastError: null,
        lastTestedAt: new Date().toISOString(),
      };
      notifyLocalAiStatus();
      return { ok: true, executionState: 'LOCAL_WEBGPU_INFERENCE' };
    }

    if (typeof Worker === 'undefined') {
      throw new Error(
        'Web Worker / WebGPU runtime unavailable in this environment; continuing in Database-Only mode.'
      );
    }

    const worker = new Worker(new URL('../../workers/webLlmWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef = worker;

    const terminateOnCrash = (reason: string) => {
      try {
        worker.terminate();
      } catch {
        // Ignore terminate error
      }
      if (activeModelHandle?.profile.profileId === profile.profileId) {
        activeModelHandle = null;
        runtimeStatus = {
          ...runtimeStatus,
          executionState: 'DATABASE_ONLY',
          activeProfileId: null,
          activeModelId: null,
          isLoading: false,
          loadProgress: 0,
          lastError: reason,
          lastTestedAt: new Date().toISOString(),
        };
        notifyLocalAiStatus();
      }
    };

    await new Promise<void>((resolve, reject) => {
      const reqId = `init-${Date.now()}`;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`WebLLM worker initialization timed out after ${initTimeoutMs}ms.`));
      }, initTimeoutMs);

      const onMessage = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== reqId) return;
        if (msg.type === 'PROGRESS') {
          runtimeStatus = { ...runtimeStatus, loadProgress: Number(msg.progress || 0) };
          notifyLocalAiStatus();
        } else if (msg.type === 'READY') {
          cleanup();
          resolve();
        } else if (msg.type === 'ERROR') {
          cleanup();
          reject(new Error(msg.error || 'WebLLM worker failed to initialize.'));
        }
      };

      const onError = (ev: ErrorEvent) => {
        cleanup();
        reject(new Error(ev.message || 'WebLLM worker crashed during initialization.'));
      };

      const onMessageError = () => {
        cleanup();
        reject(new Error('WebLLM worker message deserialization error.'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      worker.postMessage({ type: 'INIT_MODEL', requestId: reqId, modelId: profile.modelId });
    });

    worker.addEventListener('error', (ev: ErrorEvent) => {
      terminateOnCrash(ev.message || 'WebLLM worker runtime crashed; fell back to Database-Only mode.');
    });

    activeModelHandle = {
      profile,
      explain: async (prompt: string) =>
        new Promise<string>((resolve, reject) => {
          const reqId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const timer = setTimeout(() => {
            cleanup();
            terminateOnCrash(`Local WebLLM inference timed out after ${inferenceTimeoutMs}ms.`);
            reject(new Error(`Local WebLLM inference timed out after ${inferenceTimeoutMs}ms.`));
          }, inferenceTimeoutMs);

          const onMessage = (ev: MessageEvent) => {
            const msg = ev.data;
            if (!msg || msg.requestId !== reqId) return;
            if (msg.type === 'RESULT') {
              cleanup();
              resolve(String(msg.text || ''));
            } else if (msg.type === 'ERROR') {
              cleanup();
              reject(new Error(msg.error || 'Local WebLLM inference error.'));
            }
          };

          const onError = (ev: ErrorEvent) => {
            cleanup();
            reject(new Error(ev.message || 'WebLLM worker error during inference.'));
          };

          const cleanup = () => {
            clearTimeout(timer);
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
          };

          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', onError);
          worker.postMessage({
            type: 'GENERATE',
            requestId: reqId,
            systemPrompt:
              'You are an automotive electronics bench assistant. Explain ONLY the provided database evidence verbatim; never invent pinouts, voltages, resistances, or frequencies.',
            userPrompt: prompt,
          });
        }),
      unload: async () => {
        try {
          worker.postMessage({ type: 'UNLOAD', requestId: `unload-${Date.now()}` });
        } finally {
          worker.terminate();
        }
      },
    };

    runtimeStatus = {
      ...runtimeStatus,
      executionState: 'LOCAL_WEBGPU_INFERENCE',
      activeProfileId: profile.profileId,
      activeModelId: profile.modelId,
      isLoading: false,
      loadProgress: 1,
      lastError: null,
      lastTestedAt: new Date().toISOString(),
    };
    notifyLocalAiStatus();

    return { ok: true, executionState: 'LOCAL_WEBGPU_INFERENCE' };
  } catch (err: unknown) {
    if (workerRef) {
      try {
        workerRef.terminate();
      } catch {
        // Ignore terminate error
      }
    }
    activeModelHandle = null;
    const message = err instanceof Error ? err.message : String(err);
    runtimeStatus = {
      ...runtimeStatus,
      executionState: 'DATABASE_ONLY',
      activeProfileId: null,
      activeModelId: null,
      isLoading: false,
      loadProgress: 0,
      lastError: message,
      lastTestedAt: new Date().toISOString(),
    };
    notifyLocalAiStatus();
    return {
      ok: false,
      executionState: 'DATABASE_ONLY',
      error: message,
    };
  }
}

export function getActiveLocalExplainer(): ((prompt: string) => Promise<string>) | null {
  return activeModelHandle ? activeModelHandle.explain : null;
}
