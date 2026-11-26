/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BenchComponent,
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import {
  createBenchTextures,
  createEcuNameplateTexture,
  BenchTextureBundle,
} from './proceduralTextures';
import {
  buildEcuBenchRig,
  createDisposableRegistry,
  DisposableRegistry,
  EcuBenchRig,
  PickTargetMeta,
} from './ecuHardwareModels';
import { computeCrankAngularVelocityRadPerSec } from '../../simulation/telemetry/harnessDiagnostics';
import {
  EmsCircuitLayer,
  EmsDigitalTwinState,
  EmsEcuSyncProfile,
  evaluateSequentialFiringPhase,
} from '../../simulation/telemetry/emsDigitalTwinSync';

export type CameraPresetKey =
  | 'OVERVIEW'
  | 'ECU_EXPLODED'
  | 'POWER_RELAYS'
  | 'FUEL_IGNITION'
  | 'ENGINE_BAY'
  | 'CONNECTOR_16PIN'
  | 'HARNESS_ACTUATORS';

export type BenchOverlayMode = 'VOLTAGE' | 'THERMAL' | 'WIRE_ID';

export interface BenchTelemetrySnapshot {
  pins: EcuPin[];
  wires: WireConnection[];
  components: BenchComponent[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  multimeter: MultimeterState;
  powerSupply: PowerSupplyState;
  selectedPinId: string | null;
  simulationSpeed: number;
  overlayMode: BenchOverlayMode;
  explodeAmount: number; // 0..1
  rpm?: number;
  isRpmRunning?: boolean;
  ckpSignalLost?: boolean;
  showEngineBlock?: boolean;
  circuitLayerFilter?: EmsCircuitLayer;
  emsProfile?: EmsEcuSyncProfile;
  emsState?: EmsDigitalTwinState;
}

export interface ProjectedCallout {
  x: number;
  y: number;
  visible: boolean;
  label: string;
}

export interface SceneCallbacks {
  onHoverTarget: (meta: PickTargetMeta | null) => void;
  onSelectTarget: (meta: PickTargetMeta | null) => void;
  onToggleIgnition?: () => void;
  onContextLostChange: (lost: boolean) => void;
  onExplodeTargetSync?: (explode: number) => void;
  onCalloutProject?: (callout: ProjectedCallout) => void;
}

interface WireTubeVisual {
  wireId: string;
  sourcePinId: string;
  targetPinId: string;
  layer: EmsCircuitLayer;
  isCut: boolean;
  baseColor: THREE.Color;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  geometry: THREE.BufferGeometry;
}

interface ProbeLeadVisual {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

// Pre-allocated scratch math helpers (Zero-GC render loop)
const _color = new THREE.Color();
const _pointerNdc = new THREE.Vector2();
const _projVec3 = new THREE.Vector3();

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  OVERVIEW: { pos: [0.4, 9.6, 11.4], target: [-0.2, 0.45, 0.2] },
  ECU_EXPLODED: { pos: [-1.4, 4.4, 4.8], target: [-1.35, 0.9, 0.35] },
  POWER_RELAYS: { pos: [-3.4, 5.8, 8.2], target: [-2.2, 0.5, 2.2] },
  FUEL_IGNITION: { pos: [3.2, 6.2, 3.8], target: [2.0, 0.9, -1.5] },
  ENGINE_BAY: { pos: [-7.2, 7.6, 12.2], target: [-4.6, 1.1, 0.1] },
  CONNECTOR_16PIN: { pos: [-1.3, 2.6, 4.7], target: [-1.35, 0.55, 1.9] },
  HARNESS_ACTUATORS: { pos: [4.2, 6.0, 4.6], target: [1.6, 0.75, -1.6] },
};

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function inferWireLayer(sourcePinId: string, targetPinId: string): EmsCircuitLayer {
  const joined = `${sourcePinId}:${targetPinId}`.toLowerCase();
  if (joined.includes('gnd') || joined.includes('ecu-pin-1') || joined.includes('ecu-pin-2') || joined.includes('ecu-pin-6')) {
    return 'GROUNDS';
  }
  if (joined.includes('inj') || joined.includes('coil') || joined.includes('ecu-pin-10') || joined.includes('ecu-pin-11')) {
    return 'INJ_COILS';
  }
  if (joined.includes('relay') || joined.includes('ecu-pin-12')) {
    return 'RELAYS';
  }
  if (joined.includes('fp') || joined.includes('fuel') || joined.includes('ecu-pin-16')) {
    return 'FUEL_SYSTEM';
  }
  if (joined.includes('vcc') || joined.includes('ecu-pin-3') || joined.includes('ecu-pin-4') || joined.includes('ecu-pin-5')) {
    return 'POWER_FUSES';
  }
  return 'ALL';
}

export class BenchSceneManager {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTexture: THREE.Texture;
  private textures: BenchTextureBundle;
  private dynamicNameplateTex: THREE.CanvasTexture | null = null;
  private lastProfileSignature = '';
  private maxAniso = 1;
  private registry: DisposableRegistry;
  private rig: EcuBenchRig;
  private callbacks: SceneCallbacks;

  private wireGroup: THREE.Group;
  private wireVisuals: WireTubeVisual[] = [];
  private lastWireSignature = '';

  private probeLeadGroup: THREE.Group;
  private probeLeadVisuals: ProbeLeadVisual[] = [];
  private lastProbeSignature = '';
  private lastProjectedCallout: ProjectedCallout = {
    x: -1,
    y: -1,
    visible: false,
    label: '',
  };

  private telemetry: BenchTelemetrySnapshot;
  private raycaster = new THREE.Raycaster();
  private lastHoverCheckAt = 0;
  private pointerDownPos = { x: 0, y: 0 };

  // Smooth exponential damping state
  private currentExplode = 0;
  private targetExplode = 0;
  private cameraAnimating = false;
  private targetCamPos = new THREE.Vector3(...CAMERA_PRESETS.OVERVIEW.pos);
  private targetLookAt = new THREE.Vector3(...CAMERA_PRESETS.OVERVIEW.target);
  private crankSpeedRadPerSec = 0;
  private keyAngle = 0;

  // Frame loop state
  private disposed = false;
  private rafId = 0;
  private timerId: number | null = null;
  private renderBusy = false;
  private renderDirty = false;
  private lastFrameTs = performance.now();
  private elapsedSim = 0;

  private resizeObserver: ResizeObserver | null = null;
  private boundHandlers: {
    onPointerMove: (e: PointerEvent) => void;
    onPointerDown: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onVisibilityChange: () => void;
    onContextLost: (e: Event) => void;
    onContextRestored: () => void;
  };

  constructor(
    container: HTMLElement,
    initialTelemetry: BenchTelemetrySnapshot,
    callbacks: SceneCallbacks
  ) {
    this.container = container;
    this.telemetry = initialTelemetry;
    this.targetExplode = initialTelemetry.explodeAmount;
    this.currentExplode = initialTelemetry.explodeAmount;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.registry = createDisposableRegistry();

    const width = Math.max(320, container.clientWidth || 960);
    const height = Math.max(240, container.clientHeight || 600);

    // 1. Modern ACESFilmic Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 2. Scene + Subtle Horizon Fog + Procedural Studio Reflections (RoomEnvironment)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b111b);
    this.scene.fog = new THREE.FogExp2(0x0b111b, 0.015);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3. Camera & Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(...CAMERA_PRESETS.OVERVIEW.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA_PRESETS.OVERVIEW.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 26.0;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.cameraAnimating = false;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // 4. Calibrated Three-Point Studio Lighting Rig
    const hemiFill = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.72);
    this.scene.add(hemiFill);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
    keyLight.position.set(6.5, 11.5, 6.2);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 36;
      const d = 14.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x94a3b8, 0.62);
    rimLight.position.set(-9.5, 5.2, -7.5);
    this.scene.add(rimLight);

    // 5. Procedural Textures & Composite EMS Bench Hardware
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createBenchTextures(this.maxAniso, initialTelemetry.emsProfile ?? null);
    this.rig = buildEcuBenchRig(this.textures, this.registry, this.isSoftwareGl);
    this.scene.add(this.rig.root);

    if (initialTelemetry.emsProfile) {
      this.lastProfileSignature = this.buildProfileSignature(initialTelemetry.emsProfile);
    }

    // 6. Wire Loom Group, Probe Lead Group & Layer-1 Raycaster
    this.wireGroup = new THREE.Group();
    this.scene.add(this.wireGroup);
    this.probeLeadGroup = new THREE.Group();
    this.scene.add(this.probeLeadGroup);
    this.raycaster.layers.set(1);

    this.syncWiresGeometry(initialTelemetry.wires);
    this.applyTelemetryVisuals(0);
    this.syncProbeLeads(initialTelemetry.multimeter);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. DOM, ResizeObserver & WebGL Context Recovery Listeners
    this.boundHandlers = {
      onPointerMove: (e) => this.handlePointerMove(e),
      onPointerDown: (e) => {
        this.pointerDownPos.x = e.clientX;
        this.pointerDownPos.y = e.clientY;
      },
      onPointerUp: (e) => this.handlePointerUp(e),
      onVisibilityChange: () => {
        if (!document.hidden) {
          this.lastFrameTs = performance.now();
          this.requestRender();
        }
      },
      onContextLost: (e) => {
        e.preventDefault();
        this.callbacks.onContextLostChange(true);
      },
      onContextRestored: () => {
        this.callbacks.onContextLostChange(false);
        this.requestRender();
      },
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.boundHandlers.onPointerMove);
    canvas.addEventListener('pointerdown', this.boundHandlers.onPointerDown);
    canvas.addEventListener('pointerup', this.boundHandlers.onPointerUp);
    canvas.addEventListener('webglcontextlost', this.boundHandlers.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.boundHandlers.onContextRestored);
    document.addEventListener('visibilitychange', this.boundHandlers.onVisibilityChange);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        this.requestRender();
      });
      this.resizeObserver.observe(container);
    }

    this.requestRender();
  }

  private buildProfileSignature(profile: EmsEcuSyncProfile): string {
    return `${profile.profileId}|${profile.modelCode}|${profile.powertrainMode}|${profile.verificationStatus}`;
  }

  private syncEcuNameplate(profile?: EmsEcuSyncProfile): void {
    if (!profile) return;
    const sig = this.buildProfileSignature(profile);
    if (sig === this.lastProfileSignature) return;
    this.lastProfileSignature = sig;

    const nextTex = createEcuNameplateTexture(profile, this.maxAniso);
    this.rig.ecuNameplateMat.map = nextTex;
    this.rig.ecuNameplateMat.needsUpdate = true;
    if (this.dynamicNameplateTex) {
      this.dynamicNameplateTex.dispose();
    }
    this.dynamicNameplateTex = nextTex;
  }

  public updateTelemetry(next: BenchTelemetrySnapshot): void {
    const prevBlock = Boolean(this.telemetry.showEngineBlock);
    this.telemetry = next;
    this.targetExplode = THREE.MathUtils.clamp(next.explodeAmount, 0, 1);

    this.syncEcuNameplate(next.emsProfile);

    // Sync toggleable 4-cylinder engine block visibility
    const showBlock = Boolean(next.showEngineBlock);
    this.rig.engineBlockGroup.visible = showBlock;
    this.rig.standaloneCrankBase.visible = !showBlock;

    if (showBlock !== prevBlock) {
      this.flyToPreset(showBlock ? 'ENGINE_BAY' : 'OVERVIEW');
    }

    const wireSig = next.wires
      .map((w) => `${w.id}:${w.sourcePinId}->${w.targetPinId}:${w.isCut ? 1 : 0}:${w.color}`)
      .join('|');
    if (wireSig !== this.lastWireSignature) {
      this.syncWiresGeometry(next.wires);
      this.lastWireSignature = wireSig;
    }

    this.applyTelemetryVisuals(0);
    this.syncProbeLeads(next.multimeter);
    this.requestRender();
  }

  private syncProbeLeads(multimeter: MultimeterState): void {
    const redId = multimeter.redProbe.attachedToPinId || 'none';
    const blackId = multimeter.blackProbe.attachedToPinId || 'none';
    const sig = `${redId}|${blackId}`;
    if (sig === this.lastProbeSignature) return;
    this.lastProbeSignature = sig;

    for (const pl of this.probeLeadVisuals) {
      this.probeLeadGroup.remove(pl.mesh);
      pl.geometry.dispose();
      pl.material.dispose();
    }
    this.probeLeadVisuals = [];

    const addLead = (
      probeGroup: THREE.Group,
      benchOrigin: THREE.Vector3,
      colorHex: number
    ) => {
      probeGroup.updateMatrixWorld(true);
      const tailEnd = new THREE.Vector3(0, 0.8, 0);
      probeGroup.localToWorld(tailEnd);

      const midA = tailEnd.clone().lerp(benchOrigin, 0.35);
      midA.y = Math.max(0.24, tailEnd.y * 0.65);
      const midB = tailEnd.clone().lerp(benchOrigin, 0.72);
      midB.y = 0.08;

      const curve = new THREE.CatmullRomCurve3([tailEnd, midA, midB, benchOrigin]);
      const geo = new THREE.TubeGeometry(curve, 18, 0.022, 7, false);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.6,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !this.isSoftwareGl;
      this.probeLeadGroup.add(mesh);
      this.probeLeadVisuals.push({ mesh, geometry: geo, material: mat });
    };

    addLead(this.rig.redProbeGroup, new THREE.Vector3(-4.2, 0.04, 5.4), 0xef4444);
    addLead(this.rig.blackProbeGroup, new THREE.Vector3(-4.8, 0.04, 5.4), 0x334155);
  }

  public flyToPreset(preset: CameraPresetKey): void {
    const spec = CAMERA_PRESETS[preset] || CAMERA_PRESETS.OVERVIEW;
    this.targetCamPos.set(...spec.pos);
    this.targetLookAt.set(...spec.target);
    this.cameraAnimating = true;

    if (preset === 'ECU_EXPLODED' && this.targetExplode < 0.75) {
      this.targetExplode = 0.85;
      this.callbacks.onExplodeTargetSync?.(0.85);
    } else if (preset === 'OVERVIEW' && this.targetExplode > 0.2) {
      this.targetExplode = 0;
      this.callbacks.onExplodeTargetSync?.(0);
    }

    this.requestRender();
  }

  private syncWiresGeometry(wires: WireConnection[]): void {
    for (const wv of this.wireVisuals) {
      this.wireGroup.remove(wv.mesh);
      wv.geometry.dispose();
      wv.material.dispose();
    }
    this.wireVisuals = [];

    for (let i = 0; i < wires.length; i++) {
      const wire = wires[i];
      // Skip inj-ctrl duplicate if already covered cleanly by dedicated 4-cyl injector loom
      if (wire.sourcePinId === 'ecu-pin-10' && wire.targetPinId === 'inj-ctrl') {
        continue;
      }
      const srcAnchor = this.rig.pinAnchors.get(wire.sourcePinId);
      const dstAnchor = this.rig.pinAnchors.get(wire.targetPinId);
      if (!srcAnchor || !dstAnchor) continue;

      const p0 = srcAnchor.worldAnchor.clone();
      const p3 = dstAnchor.worldAnchor.clone();

      const archHeight = 0.28 + (i % 5) * 0.07;
      const midA = p0.clone().lerp(p3, 0.35);
      midA.y = Math.max(p0.y, p3.y) + archHeight;
      midA.z += (i % 2 === 0 ? 1 : -1) * 0.1;

      const midB = p0.clone().lerp(p3, 0.68);
      midB.y = Math.max(p0.y, p3.y) + archHeight * 0.82;

      const curve = new THREE.CatmullRomCurve3([p0, midA, midB, p3]);
      const geo = new THREE.TubeGeometry(curve, 24, wire.isCut ? 0.016 : 0.025, 7, false);
      const baseColor = new THREE.Color(wire.color || '#38bdf8');
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.55,
        metalness: 0.08,
        transparent: true,
        opacity: wire.isCut ? 0.25 : 1.0,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !this.isSoftwareGl && !wire.isCut;
      this.wireGroup.add(mesh);

      this.wireVisuals.push({
        wireId: wire.id,
        sourcePinId: wire.sourcePinId,
        targetPinId: wire.targetPinId,
        layer: inferWireLayer(wire.sourcePinId, wire.targetPinId),
        isCut: wire.isCut,
        baseColor,
        mesh,
        material: mat,
        geometry: geo,
      });
    }
  }

  private getVoltageColor(v: number, out: THREE.Color): THREE.Color {
    if (v >= 10.0) return out.setHex(0xef4444); // +12V B+ energized red
    if (v >= 3.8) return out.setHex(0x22d3ee); // 5V logic cyan
    if (v >= 0.35) return out.setHex(0x34d399); // Active sensor signal emerald
    return out.setHex(0x475569); // Ground / 0V cool slate
  }

  private applyTelemetryVisuals(dt: number): void {
    const {
      nodeVoltages,
      faults,
      components,
      powerSupply,
      multimeter,
      selectedPinId,
      overlayMode,
      simulationSpeed,
      emsState,
      emsProfile,
    } = this.telemetry;

    const layerFilter: EmsCircuitLayer = this.telemetry.circuitLayerFilter ?? 'ALL';

    const faultByPin = new Map<string, InjectedFault>();
    for (const f of faults) {
      if (f.faultType !== 'NONE') {
        faultByPin.set(f.pinId, f);
      }
    }

    const isPowerActive = emsState ? emsState.isPowerActive : powerSupply.isOutputEnabled;
    const isIgnitionOn = emsState ? emsState.isIgnitionOn : isPowerActive;

    // 1. Update Pin Terminal Collars (Voltage / Fault / Selection highlights)
    this.rig.pinAnchors.forEach((anchor, pinId) => {
      const fault = faultByPin.get(pinId);
      const voltage = nodeVoltages[pinId] ?? 0;
      const isSelected = selectedPinId === pinId;

      if (isSelected) {
        anchor.ringMat.color.setHex(0xfbbf24);
        anchor.ringMat.emissive.setHex(0xf59e0b);
        anchor.ringMat.emissiveIntensity = 1.45;
      } else if (fault) {
        const isShort =
          fault.faultType === 'SHORT_TO_GND' || fault.faultType === 'SHORT_TO_VBAT';
        anchor.ringMat.color.setHex(isShort ? 0xf43f5e : 0xf59e0b);
        anchor.ringMat.emissive.setHex(isShort ? 0xe11d48 : 0xd97706);
        anchor.ringMat.emissiveIntensity = isShort ? 1.35 : 0.95;
      } else if (overlayMode === 'THERMAL') {
        anchor.ringMat.color.setHex(0x334155);
        anchor.ringMat.emissive.setHex(0x0f172a);
        anchor.ringMat.emissiveIntensity = 0.25;
      } else {
        this.getVoltageColor(voltage, _color);
        anchor.ringMat.color.copy(_color);
        anchor.ringMat.emissive.copy(_color);
        anchor.ringMat.emissiveIntensity = isPowerActive && voltage > 0.35 ? 0.85 : 0.25;
      }
    });

    // 2. Update Internal PCB MOSFET Driver Thermal Glow
    for (const mosfet of this.rig.mosfets) {
      const fault = faultByPin.get(mosfet.pinId);
      const v = nodeVoltages[mosfet.pinId] ?? 0;
      const isShortFault =
        fault?.faultType === 'SHORT_TO_VBAT' || fault?.faultType === 'SHORT_TO_GND';
      const isResFault = Boolean(fault && !isShortFault);

      if (isShortFault) {
        mosfet.bodyMat.emissive.setHex(0xdc2626);
        mosfet.bodyMat.emissiveIntensity = 1.4;
        mosfet.tabMat.emissive.setHex(0xf97316);
        mosfet.tabMat.emissiveIntensity = 1.1;
      } else if (isResFault) {
        mosfet.bodyMat.emissive.setHex(0xd97706);
        mosfet.bodyMat.emissiveIntensity = 0.75;
        mosfet.tabMat.emissive.setHex(0x000000);
        mosfet.tabMat.emissiveIntensity = 0;
      } else if (overlayMode === 'THERMAL' && isPowerActive && v > 0.5) {
        mosfet.bodyMat.emissive.setHex(0x0891b2);
        mosfet.bodyMat.emissiveIntensity = 0.35;
        mosfet.tabMat.emissive.setHex(0x000000);
        mosfet.tabMat.emissiveIntensity = 0;
      } else {
        mosfet.bodyMat.emissive.setHex(0x000000);
        mosfet.bodyMat.emissiveIntensity = 0;
        mosfet.tabMat.emissive.setHex(0x000000);
        mosfet.tabMat.emissiveIntensity = 0;
      }
    }

    // 3. Update Dedicated EMS Harness Wires (Layer Filter + Wire Color / Voltage / Thermal)
    for (const ew of this.rig.emsHarnessWires) {
      const isLayerActive = layerFilter === 'ALL' || ew.layer === layerFilter;
      ew.material.opacity = isLayerActive ? 1.0 : 0.14;
      ew.material.depthWrite = isLayerActive;

      const fault = faultByPin.get(ew.mappedPinId);
      let branchV = nodeVoltages[ew.mappedPinId] ?? 0;
      if (emsState) {
        switch (ew.signalRole) {
          case 'kl30':
            branchV = emsState.batteryVoltageV;
            break;
          case 'kl15':
            branchV = isIgnitionOn ? emsState.batteryVoltageV : 0;
            break;
          case 'switched_rail':
            branchV = emsState.switchedRailVoltageV;
            break;
          case 'fuel_pump':
            branchV = emsState.fuelSystem.pumpVoltageV;
            break;
          case 'sgnd':
            branchV = emsState.grounds.sgndVoltageV;
            break;
          case 'chassis_gnd':
            branchV = emsState.grounds.g2EngineVoltageV;
            break;
          default:
            break;
        }
      }

      if (overlayMode === 'WIRE_ID') {
        ew.material.color.copy(ew.baseColor);
        if (fault && isLayerActive) {
          ew.material.emissive.setHex(0xe11d48);
          ew.material.emissiveIntensity = 0.55;
        } else {
          ew.material.emissive.setHex(0x000000);
          ew.material.emissiveIntensity = 0;
        }
      } else if (overlayMode === 'THERMAL') {
        if (fault) {
          const isShort =
            fault.faultType === 'SHORT_TO_GND' || fault.faultType === 'SHORT_TO_VBAT';
          ew.material.color.setHex(isShort ? 0xef4444 : 0xf59e0b);
          ew.material.emissive.setHex(isShort ? 0xdc2626 : 0xb45309);
          ew.material.emissiveIntensity = isLayerActive ? 0.95 : 0.15;
        } else if (isPowerActive && (ew.signalRole === 'fuel_pump' || ew.signalRole === 'switched_rail' || ew.signalRole === 'kl30') && branchV > 10) {
          ew.material.color.setHex(0x0284c7);
          ew.material.emissive.setHex(0x0369a1);
          ew.material.emissiveIntensity = isLayerActive ? 0.35 : 0.05;
        } else {
          ew.material.color.setHex(0x1e293b);
          ew.material.emissive.setHex(0x000000);
          ew.material.emissiveIntensity = 0;
        }
      } else {
        // VOLTAGE overlay mode
        this.getVoltageColor(branchV, _color);
        ew.material.color.copy(_color);
        if (fault) {
          ew.material.emissive.setHex(0xe11d48);
          ew.material.emissiveIntensity = isLayerActive ? 0.6 : 0.1;
        } else {
          ew.material.emissive.copy(_color);
          ew.material.emissiveIntensity =
            isLayerActive && isPowerActive && branchV > 0.35 ? 0.35 : 0.04;
        }
      }
    }

    // 4. Update Dynamic Bench Wires (TPS, MAP, ECT, CAN)
    for (const wv of this.wireVisuals) {
      const isLayerActive =
        layerFilter === 'ALL' || wv.layer === layerFilter || wv.layer === 'ALL';
      wv.material.opacity = wv.isCut ? 0.22 : isLayerActive ? 1.0 : 0.14;
      wv.material.depthWrite = !wv.isCut && isLayerActive;

      const fault = faultByPin.get(wv.sourcePinId) || faultByPin.get(wv.targetPinId);
      const srcV = nodeVoltages[wv.sourcePinId] ?? 0;
      const dstV = nodeVoltages[wv.targetPinId] ?? 0;
      const wireV = Math.max(srcV, dstV);

      if (wv.isCut) {
        wv.material.color.setHex(0x475569);
        wv.material.emissive.setHex(0x000000);
        wv.material.emissiveIntensity = 0;
        continue;
      }

      if (overlayMode === 'WIRE_ID') {
        wv.material.color.copy(wv.baseColor);
        wv.material.emissive.setHex(0x000000);
        wv.material.emissiveIntensity = 0;
      } else if (overlayMode === 'THERMAL') {
        if (fault) {
          const isShort =
            fault.faultType === 'SHORT_TO_GND' || fault.faultType === 'SHORT_TO_VBAT';
          wv.material.color.setHex(isShort ? 0xef4444 : 0xf59e0b);
          wv.material.emissive.setHex(isShort ? 0xdc2626 : 0xb45309);
          wv.material.emissiveIntensity = isLayerActive ? 0.9 : 0.1;
        } else {
          wv.material.color.setHex(0x1e293b);
          wv.material.emissive.setHex(0x000000);
          wv.material.emissiveIntensity = 0;
        }
      } else {
        this.getVoltageColor(wireV, _color);
        wv.material.color.copy(_color);
        if (fault) {
          wv.material.emissive.setHex(0xe11d48);
          wv.material.emissiveIntensity = isLayerActive ? 0.45 : 0.1;
        } else {
          wv.material.emissive.copy(_color);
          wv.material.emissiveIntensity =
            isLayerActive && isPowerActive && wireV > 0.35 ? 0.32 : 0.04;
        }
      }
    }

    // 5. Sync DMM Red (+) and Black (-) 3D Probes
    const placeProbe = (probeGroup: THREE.Group, pinId: string | null, fallbackX: number) => {
      const anchor = pinId ? this.rig.pinAnchors.get(pinId) : undefined;
      if (anchor) {
        probeGroup.visible = true;
        probeGroup.position.copy(anchor.worldAnchor);
        probeGroup.position.y += 0.02;
        probeGroup.rotation.set(0.18, 0, -0.18);
      } else {
        probeGroup.visible = true;
        probeGroup.position.set(fallbackX, 0.06, 5.15);
        probeGroup.rotation.set(Math.PI / 2, 0, 0.25);
      }
    };
    placeProbe(this.rig.redProbeGroup, multimeter.redProbe.attachedToPinId, -3.4);
    placeProbe(this.rig.blackProbeGroup, multimeter.blackProbe.attachedToPinId, -4.1);

    // 6. PDU Ignition Switch Key Rotation & 5x Blade Fuse States
    const targetKeyAngle = isIgnitionOn ? Math.PI * 0.36 : 0;
    this.keyAngle = dt > 0 ? THREE.MathUtils.damp(this.keyAngle, targetKeyAngle, 12, dt) : targetKeyAngle;
    this.rig.ignitionKeyPivot.rotation.y = this.keyAngle;
    this.rig.ignitionRingMat.color.setHex(isIgnitionOn ? 0x22c55e : 0x475569);
    this.rig.ignitionRingMat.emissive.setHex(isIgnitionOn ? 0x16a34a : 0x0f172a);
    this.rig.ignitionRingMat.emissiveIntensity = isIgnitionOn ? 0.95 : 0.15;

    if (emsState) {
      for (const fv of this.rig.fuseVisuals) {
        const ft = emsState.fuses.find((f) => f.id === fv.id);
        if (!ft) continue;
        if (ft.isBlown) {
          fv.glowMat.color.setHex(0xef4444);
          fv.glowMat.emissive.setHex(0xdc2626);
          fv.glowMat.emissiveIntensity = 1.4;
          fv.bladeMat.emissiveIntensity = 0.05;
        } else if (ft.isEnergized) {
          fv.glowMat.color.setHex(0x4ade80);
          fv.glowMat.emissive.setHex(0x22c55e);
          fv.glowMat.emissiveIntensity = 0.85;
          fv.bladeMat.emissiveIntensity = 0.35;
        } else {
          fv.glowMat.color.setHex(0x334155);
          fv.glowMat.emissive.setHex(0x000000);
          fv.glowMat.emissiveIntensity = 0;
          fv.bladeMat.emissiveIntensity = 0.05;
        }
      }
    }

    // 7. Dual Waterproof ISO Relays (Main Relay & Fuel Pump Relay)
    const isMainLatched = emsState
      ? emsState.mainRelay.isLatched
      : Boolean(components.find((c) => c.id === 'comp-relay')?.state?.isLatched) && isPowerActive;
    const isMainFault = emsState ? emsState.mainRelay.isFaulted : false;
    this.rig.relayArmaturePivot.rotation.z = isMainLatched ? -0.15 : 0.08;
    this.rig.relayCoilGlowMat.color.setHex(
      isMainFault ? 0xef4444 : isMainLatched ? 0x22c55e : 0x475569
    );
    this.rig.relayCoilGlowMat.emissive.setHex(
      isMainFault ? 0xdc2626 : isMainLatched ? 0x16a34a : 0x000000
    );
    this.rig.relayCoilGlowMat.emissiveIntensity = isMainFault || isMainLatched ? 1.0 : 0;

    const isFpLatched = emsState ? emsState.fuelPumpRelay.isLatched : isMainLatched;
    const isFpFault = emsState ? emsState.fuelPumpRelay.isFaulted : false;
    this.rig.fuelRelayArmaturePivot.rotation.z = isFpLatched ? -0.15 : 0.08;
    this.rig.fuelRelayCoilGlowMat.color.setHex(
      isFpFault ? 0xef4444 : isFpLatched ? 0x22d3ee : 0x475569
    );
    this.rig.fuelRelayCoilGlowMat.emissive.setHex(
      isFpFault ? 0xdc2626 : isFpLatched ? 0x06b6d4 : 0x000000
    );
    this.rig.fuelRelayCoilGlowMat.emissiveIntensity = isFpFault || isFpLatched ? 1.0 : 0;

    // 8. Fuel Pump Module & Pressurized Feed Line
    const isPumpRunning = emsState ? emsState.fuelSystem.isPumpRunning : isFpLatched;
    if (dt > 0 && isPumpRunning) {
      this.rig.fuelPumpImpellerGroup.rotation.y += dt * 11.0 * simulationSpeed;
    }
    this.rig.fuelPumpGlowMat.color.setHex(
      isFpFault ? 0xef4444 : isPumpRunning ? 0x22d3ee : 0x334155
    );
    this.rig.fuelPumpGlowMat.emissive.setHex(
      isFpFault ? 0xdc2626 : isPumpRunning ? 0x0891b2 : 0x000000
    );
    this.rig.fuelPumpGlowMat.emissiveIntensity = isFpFault ? 1.1 : isPumpRunning ? 0.95 : 0.05;
    this.rig.fuelFeedLineMat.emissive.setHex(isPumpRunning ? 0x0284c7 : 0x000000);
    this.rig.fuelFeedLineMat.emissiveIntensity = isPumpRunning ? 0.5 : 0;
    this.rig.fuelFluidMat.emissiveIntensity = isPumpRunning ? 0.42 : 0.12;

    // 9. TPS Butterfly, ECT Thermal Ring, CAN Status LED & Ground Bus Alert
    const tps = components.find((c) => c.id === 'comp-tps');
    const throttlePct = Number(tps?.state?.throttleAnglePercent ?? 20);
    const targetButterAngle = THREE.MathUtils.clamp(throttlePct / 100, 0, 1) * (Math.PI * 0.46);
    if (dt > 0) {
      this.rig.tpsButterflyPivot.rotation.z = THREE.MathUtils.damp(
        this.rig.tpsButterflyPivot.rotation.z,
        targetButterAngle,
        10,
        dt
      );
    } else {
      this.rig.tpsButterflyPivot.rotation.z = targetButterAngle;
    }

    const ect = components.find((c) => c.id === 'comp-ect');
    const tempC = Number(ect?.state?.tempCelsius ?? 85);
    const tempNorm = THREE.MathUtils.clamp((tempC - 10) / 110, 0, 1);
    if (tempNorm < 0.55) {
      this.rig.ectThermalRingMat.color
        .setHex(0x38bdf8)
        .lerp(_color.setHex(0xf59e0b), tempNorm / 0.55);
    } else {
      this.rig.ectThermalRingMat.color
        .setHex(0xf59e0b)
        .lerp(_color.setHex(0xef4444), (tempNorm - 0.55) / 0.45);
    }
    this.rig.ectThermalRingMat.emissive.copy(this.rig.ectThermalRingMat.color);

    const hasCanFault = faultByPin.has('ecu-pin-13') || faultByPin.has('ecu-pin-14');
    this.rig.canStatusLedMat.color.setHex(
      !isPowerActive ? 0x334155 : hasCanFault ? 0xef4444 : 0x22d3ee
    );
    this.rig.canStatusLedMat.emissive.setHex(
      !isPowerActive ? 0x000000 : hasCanFault ? 0xdc2626 : 0x06b6d4
    );
    this.rig.canStatusLedMat.emissiveIntensity = isPowerActive ? 0.95 : 0;

    // Ground Bus fault lift indicator
    const hasGndFault = emsState ? emsState.grounds.hasGroundFault : false;
    this.rig.sgndBusMat.emissive.setHex(hasGndFault ? 0xd97706 : 0x000000);
    this.rig.sgndBusMat.emissiveIntensity = hasGndFault ? 0.85 : 0;

    // 10. Crankshaft VR 36-1 Wheel & Engine Block Pulleys + 4-Cyl 1-3-4-2 Sequential Firing
    const liveRpm = emsState ? emsState.rpm : Number(this.telemetry.rpm ?? 0);
    const isRunning = emsState
      ? emsState.isEngineRunning
      : Boolean(this.telemetry.isRpmRunning) && isPowerActive && !this.telemetry.ckpSignalLost;

    if (dt > 0) {
      const targetSpeed = computeCrankAngularVelocityRadPerSec({
        isPowerActive,
        isRpmRunning: isRunning,
        ckpSignalLost: Boolean(this.telemetry.ckpSignalLost),
        rpm: liveRpm,
        simulationSpeed,
      });
      this.crankSpeedRadPerSec = THREE.MathUtils.damp(
        this.crankSpeedRadPerSec,
        targetSpeed,
        5.5,
        dt
      );
      const dTheta = this.crankSpeedRadPerSec * dt;
      this.rig.crankWheelGroup.rotation.z -= dTheta;
      this.rig.engineCrankPulley.rotation.z -= dTheta;
      this.rig.engineCamPulley.rotation.z -= dTheta * 0.5;
      this.rig.engineAltPulley.rotation.z -= dTheta * 1.8;
      this.elapsedSim += dt * simulationSpeed;
    }

    // Sequential 1-3-4-2 4x Injectors & 4x COP Ignition Coils + Spark Plugs
    const cylinders =
      emsState?.cylinders ??
      ([1, 2, 3, 4] as const).map((c) => ({
        cylinder: c,
        firingSlot: (c === 1 ? 0 : c === 3 ? 1 : c === 4 ? 2 : 3) as 0 | 1 | 2 | 3,
        injectorVoltageV: isPowerActive ? 12.4 : 0,
        coilVoltageV: isPowerActive ? 12.4 : 0,
        injectorDutyPercent: isRunning ? 25 : 0,
        isInjectorFaulted: false,
        isCoilFaulted: false,
      }));

    const phases = evaluateSequentialFiringPhase({
      elapsedSec: this.elapsedSim,
      rpm: isRunning ? Math.max(liveRpm, 850) : 0,
      isEngineRunning: isRunning,
      powertrainMode: emsProfile?.powertrainMode ?? 'GASOLINE_EFI',
      cylinders,
    });

    for (let i = 0; i < 4; i++) {
      const phase = phases[i];
      const cylState = cylinders[i];
      const injVis = this.rig.injectors[i];
      const coilVis = this.rig.ignitionCoils[i];

      if (injVis) {
        if (cylState.isInjectorFaulted && isPowerActive) {
          injVis.pintleMesh.position.y = 0.38;
          injVis.sprayMat.opacity = 0;
          injVis.pulseMat.emissive.setHex(0xef4444);
          injVis.pulseMat.emissiveIntensity = 0.9;
        } else if (phase.injectorPulse > 0.02) {
          injVis.pintleMesh.position.y = 0.38 - phase.injectorPulse * 0.045;
          injVis.sprayMat.opacity = 0.62 * phase.injectorPulse;
          injVis.pulseMat.emissive.setHex(0x38bdf8);
          injVis.pulseMat.emissiveIntensity = 0.4 + phase.injectorPulse * 1.3;
        } else {
          injVis.pintleMesh.position.y = 0.38;
          injVis.sprayMat.opacity = 0;
          injVis.pulseMat.emissive.setHex(isMainLatched ? 0x0369a1 : 0x000000);
          injVis.pulseMat.emissiveIntensity = isMainLatched ? 0.25 : 0;
        }
      }

      if (coilVis) {
        if (cylState.isCoilFaulted && isPowerActive) {
          coilVis.dwellMat.emissive.setHex(0xef4444);
          coilVis.dwellMat.emissiveIntensity = 0.9;
          coilVis.sparkMat.opacity = 0;
        } else {
          coilVis.dwellMat.emissive.setHex(
            emsProfile?.powertrainMode === 'DIESEL_CRDI' ? 0xf59e0b : 0xf97316
          );
          coilVis.dwellMat.emissiveIntensity = isMainLatched ? 0.15 + phase.coilDwell * 1.15 : 0;

          if (phase.sparkArc > 0.05) {
            coilVis.sparkMat.opacity = Math.min(1, phase.sparkArc * 1.3);
            const scale = 0.8 + phase.sparkArc * 0.9;
            coilVis.sparkMesh.scale.set(scale, scale * 1.15, scale);
            coilVis.sparkMesh.rotation.y += 0.7;
          } else {
            coilVis.sparkMat.opacity = 0;
          }
        }
      }
    }
  }

  private updateKinematics(dt: number): boolean {
    let needsMoreFrames = false;

    // Smooth ECU Explode Housing transition
    const explodeDelta = Math.abs(this.targetExplode - this.currentExplode);
    if (explodeDelta > 0.001) {
      this.currentExplode = THREE.MathUtils.damp(this.currentExplode, this.targetExplode, 8.5, dt);
      needsMoreFrames = true;
    } else {
      this.currentExplode = this.targetExplode;
    }
    this.rig.ecuLidGroup.position.y = this.currentExplode * 1.5;
    this.rig.ecuBoltsInstanced.position.y = this.currentExplode * 0.55;

    // Smooth camera preset fly-to transition
    if (this.cameraAnimating) {
      const alpha = 1 - Math.exp(-7.5 * dt);
      this.camera.position.lerp(this.targetCamPos, alpha);
      this.controls.target.lerp(this.targetLookAt, alpha);

      if (
        this.camera.position.distanceToSquared(this.targetCamPos) < 0.002 &&
        this.controls.target.distanceToSquared(this.targetLookAt) < 0.002
      ) {
        this.camera.position.copy(this.targetCamPos);
        this.controls.target.copy(this.targetLookAt);
        this.cameraAnimating = false;
      } else {
        needsMoreFrames = true;
      }
    }

    // Active continuous motion while Bench Power is ON (Fuel pump impeller, 1-3-4-2 firing, pulleys)
    if (this.telemetry.powerSupply.isOutputEnabled || this.crankSpeedRadPerSec > 0.02) {
      needsMoreFrames = true;
    }

    // Smooth TPS butterfly damping
    const tps = this.telemetry.components.find((c) => c.id === 'comp-tps');
    const targetButterAngle =
      THREE.MathUtils.clamp(Number(tps?.state?.throttleAnglePercent ?? 20) / 100, 0, 1) *
      (Math.PI * 0.46);
    if (Math.abs(this.rig.tpsButterflyPivot.rotation.z - targetButterAngle) > 0.002) {
      needsMoreFrames = true;
    }

    this.applyTelemetryVisuals(dt);
    return needsMoreFrames;
  }

  private raycastAtEvent(event: PointerEvent): PickTargetMeta | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.rig.pickables, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.pickMeta as PickTargetMeta) || null;
    }
    return null;
  }

  private handlePointerMove(event: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastHoverCheckAt < 50) return;
    this.lastHoverCheckAt = now;

    const hit = this.raycastAtEvent(event);
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    this.callbacks.onHoverTarget(hit);
  }

  private handlePointerUp(event: PointerEvent): void {
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 25) return;

    const hit = this.raycastAtEvent(event);
    if (hit?.kind === 'ignition_switch') {
      this.callbacks.onToggleIgnition?.();
    }
    this.callbacks.onSelectTarget(hit);
  }

  private scheduleAfterDraw(cb: () => void): void {
    const scheduleTimer = (fn: () => void, ms: number) => {
      if (this.timerId !== null) {
        clearTimeout(this.timerId);
      }
      this.timerId = window.setTimeout(() => {
        this.timerId = null;
        fn();
      }, ms);
    };

    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            scheduleTimer(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            scheduleTimer(cb, 80);
          }
        };
        scheduleTimer(poll, 5);
        return;
      }
    } catch {
      // Fallback if fenceSync unavailable
    }
    scheduleTimer(cb, 80);
  }

  public requestRender(): void {
    if (this.disposed || (typeof document !== 'undefined' && document.hidden)) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (this.disposed) return;
      this.renderDirty = false;

      const now = performance.now();
      const rawDt = (now - this.lastFrameTs) / 1000;
      this.lastFrameTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.1);

      const controlsSettling = this.controls.update();
      const simActive = this.updateKinematics(dt);
      this.renderer.render(this.scene, this.camera);
      this.emitProjectedCallout();

      const done = () => {
        this.renderBusy = false;
        if (!this.disposed && (this.renderDirty || simActive || controlsSettling)) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.scheduleAfterDraw(done);
      } else {
        done();
      }
    });
  }

  private emitProjectedCallout(): void {
    if (!this.callbacks.onCalloutProject) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const selectedPinAnchor = this.telemetry.selectedPinId
      ? this.rig.pinAnchors.get(this.telemetry.selectedPinId)
      : undefined;
    const worldPoint = selectedPinAnchor
      ? selectedPinAnchor.worldAnchor
      : this.rig.breakoutAnchorWorld;

    const pinMeta = selectedPinAnchor?.colliderMesh.userData.pickMeta as PickTargetMeta | undefined;
    const label = selectedPinAnchor ? pinMeta?.label || 'EMS Multi-Plug' : 'EMS Multi-Plug';

    _projVec3.copy(worldPoint);
    _projVec3.project(this.camera);

    const visible = _projVec3.z < 1 && _projVec3.z > -1;
    const x = Math.round((_projVec3.x * 0.5 + 0.5) * width);
    const y = Math.round((-_projVec3.y * 0.5 + 0.5) * height);

    const prev = this.lastProjectedCallout;
    if (
      prev.visible !== visible ||
      prev.label !== label ||
      Math.abs(prev.x - x) >= 2 ||
      Math.abs(prev.y - y) >= 2
    ) {
      const next = { x, y, visible, label };
      this.lastProjectedCallout = next;
      this.callbacks.onCalloutProject(next);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.boundHandlers.onPointerMove);
    canvas.removeEventListener('pointerdown', this.boundHandlers.onPointerDown);
    canvas.removeEventListener('pointerup', this.boundHandlers.onPointerUp);
    canvas.removeEventListener('webglcontextlost', this.boundHandlers.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.boundHandlers.onContextRestored);
    document.removeEventListener('visibilitychange', this.boundHandlers.onVisibilityChange);

    this.resizeObserver?.disconnect();
    this.controls.dispose();

    for (const wv of this.wireVisuals) {
      wv.geometry.dispose();
      wv.material.dispose();
    }
    this.wireVisuals = [];

    for (const pl of this.probeLeadVisuals) {
      pl.geometry.dispose();
      pl.material.dispose();
    }
    this.probeLeadVisuals = [];

    if (this.dynamicNameplateTex) {
      this.dynamicNameplateTex.dispose();
      this.dynamicNameplateTex = null;
    }

    this.registry.disposeAll();
    this.textures.dispose();
    this.envTexture.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
