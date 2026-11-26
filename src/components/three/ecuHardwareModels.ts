/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import * as THREE from 'three';
import type { BenchTextureBundle } from './proceduralTextures';
import type { EmsCircuitLayer, EmsFuseTelemetry } from '../../simulation/telemetry/emsDigitalTwinSync';
import {
  buildOrthogonalTrunkWaypoints,
  EFI_FUNCTIONAL_COLOR_STANDARD,
  EFI_TRUNK_CORRIDORS,
  type EfiTrunkCorridor,
} from '../../simulation/telemetry/efiHarnessStandard';

export interface DisposableRegistry {
  trackGeo: <T extends THREE.BufferGeometry>(geo: T) => T;
  trackMat: <T extends THREE.Material>(mat: T) => T;
  disposeAll: () => void;
}

export function createDisposableRegistry(): DisposableRegistry {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  return {
    trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
      geometries.push(geo);
      return geo;
    },
    trackMat<T extends THREE.Material>(mat: T): T {
      materials.push(mat);
      return mat;
    },
    disposeAll() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      geometries.length = 0;
      materials.length = 0;
    },
  };
}

export interface PickTargetMeta {
  kind:
    | 'pin'
    | 'component'
    | 'mosfet'
    | 'fuse'
    | 'relay'
    | 'ignition_switch'
    | 'injector'
    | 'coil'
    | 'fuel_pump'
    | 'ground';
  pinId?: string;
  componentId?: string;
  fuseId?: EmsFuseTelemetry['id'];
  cylinder?: 1 | 2 | 3 | 4;
  label: string;
  subtitle: string;
}

export interface PinAnchorVisual {
  pinId: string;
  worldAnchor: THREE.Vector3;
  ringMat: THREE.MeshStandardMaterial;
  pinTipMesh: THREE.Mesh;
  colliderMesh: THREE.Mesh;
}

export interface MosfetVisual {
  pinId: string;
  bodyMat: THREE.MeshStandardMaterial;
  tabMat: THREE.MeshStandardMaterial;
}

export interface InjectorCylinderVisual {
  cylinder: 1 | 2 | 3 | 4;
  pintleMesh: THREE.Mesh;
  sprayMat: THREE.MeshBasicMaterial;
  pulseMat: THREE.MeshStandardMaterial;
  terminalAnchor: THREE.Vector3;
}

export interface IgnitionCoilVisual {
  cylinder: 1 | 2 | 3 | 4;
  dwellMat: THREE.MeshStandardMaterial;
  sparkMat: THREE.MeshBasicMaterial;
  sparkMesh: THREE.Mesh;
  terminalAnchor: THREE.Vector3;
}

export interface FuseVisual {
  id: EmsFuseTelemetry['id'];
  mappedPinId: string;
  bladeMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
  worldAnchor: THREE.Vector3;
}

export interface EmsHarnessWireVisual {
  id: string;
  layer: EmsCircuitLayer;
  corridor: EfiTrunkCorridor;
  signalRole:
    | 'kl30'
    | 'kl15'
    | 'switched_rail'
    | 'inj'
    | 'coil'
    | 'mrelay'
    | 'fprelay'
    | 'fuel_pump'
    | 'vref'
    | 'sensor_sig'
    | 'sgnd'
    | 'chassis_gnd'
    | 'can';
  mappedPinId: string;
  baseColor: THREE.Color;
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

export interface EngineBlockFaultOverlayVisuals {
  overlayGroup: THREE.Group;
  blockShellMat: THREE.MeshBasicMaterial;
  injectorWireMats: THREE.MeshBasicMaterial[];
  coilWireMats: THREE.MeshBasicMaterial[];
  sensorBusWireMat: THREE.MeshBasicMaterial;
  groundStrapWireMat: THREE.MeshBasicMaterial;
}

export interface EcuBenchRig {
  root: THREE.Group;
  ecuLidGroup: THREE.Group;
  ecuBoltsInstanced: THREE.InstancedMesh;
  ecuNameplateMat: THREE.MeshStandardMaterial;
  tpsButterflyPivot: THREE.Group;
  // Backwards-compatible primary cylinder 1 injector references
  injectorPintle: THREE.Mesh;
  injectorSprayCone: THREE.Mesh;
  injectorSprayMat: THREE.MeshBasicMaterial;
  injectorPulseMat: THREE.MeshStandardMaterial;
  // Full 4-cylinder injector & ignition coil banks
  injectors: InjectorCylinderVisual[];
  ignitionCoils: IgnitionCoilVisual[];
  // Dual waterproof ISO relays
  relayArmaturePivot: THREE.Group;
  relayCoilGlowMat: THREE.MeshStandardMaterial;
  fuelRelayArmaturePivot: THREE.Group;
  fuelRelayCoilGlowMat: THREE.MeshStandardMaterial;
  // PDU: Ignition key + 5 color-coded blade fuses
  ignitionKeyPivot: THREE.Group;
  ignitionRingMat: THREE.MeshStandardMaterial;
  fuseVisuals: FuseVisual[];
  // Fuel pump module inside cutaway tank
  fuelPumpImpellerGroup: THREE.Group;
  fuelPumpGlowMat: THREE.MeshStandardMaterial;
  fuelFluidMat: THREE.MeshPhysicalMaterial;
  fuelFeedLineMat: THREE.MeshStandardMaterial;
  // Sensors & CAN
  ectThermalRingMat: THREE.MeshStandardMaterial;
  canStatusLedMat: THREE.MeshStandardMaterial;
  // Crankshaft wheel (bench standalone + toggleable 4-cyl engine block)
  crankWheelGroup: THREE.Group;
  standaloneCrankBase: THREE.Group;
  engineBlockGroup: THREE.Group;
  engineBlockFaultOverlay: EngineBlockFaultOverlayVisuals;
  engineCrankPulley: THREE.Group;
  engineCamPulley: THREE.Group;
  engineAltPulley: THREE.Group;
  // Ground buses
  sgndBusMat: THREE.MeshStandardMaterial;
  g1StudMat: THREE.MeshStandardMaterial;
  g2StudMat: THREE.MeshStandardMaterial;
  // DMM Probes
  redProbeGroup: THREE.Group;
  blackProbeGroup: THREE.Group;
  breakoutAnchorWorld: THREE.Vector3;
  pinAnchors: Map<string, PinAnchorVisual>;
  mosfets: MosfetVisual[];
  emsHarnessWires: EmsHarnessWireVisual[];
  currentFlowPulsesInstanced: THREE.InstancedMesh;
  fuelBubblesInstanced: THREE.InstancedMesh;
  pickables: THREE.Object3D[];
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  s.moveTo(x + radius, y);
  s.lineTo(x + width - radius, y);
  s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius);
  s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius);
  s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

function createToothedWheelShape(
  outerR: number,
  rootR: number,
  totalSlots = 36,
  missingToothIndex = 0
): THREE.Shape {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / totalSlots;

  for (let i = 0; i < totalSlots; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.2;
    const a2 = a0 + step * 0.52;
    const a3 = a0 + step * 0.72;
    const isMissing = i === missingToothIndex;

    const rPeak = isMissing ? rootR : outerR;
    const x0 = Math.cos(a0) * rootR;
    const y0 = Math.sin(a0) * rootR;
    if (i === 0) {
      shape.moveTo(x0, y0);
    } else {
      shape.lineTo(x0, y0);
    }
    shape.lineTo(Math.cos(a1) * rPeak, Math.sin(a1) * rPeak);
    shape.lineTo(Math.cos(a2) * rPeak, Math.sin(a2) * rPeak);
    shape.lineTo(Math.cos(a3) * rootR, Math.sin(a3) * rootR);
  }
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, rootR * 0.34, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  return shape;
}

function addContactShadow(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  textures: BenchTextureBundle,
  reg: DisposableRegistry,
  y = 0.008
): void {
  const geo = reg.trackGeo(new THREE.PlaneGeometry(width, depth));
  const mat = reg.trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    })
  );
  const shadow = new THREE.Mesh(geo, mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = y;
  parent.add(shadow);
}

export function buildEcuBenchRig(
  textures: BenchTextureBundle,
  reg: DisposableRegistry,
  isSoftwareGl: boolean
): EcuBenchRig {
  const root = new THREE.Group();
  const pinAnchors = new Map<string, PinAnchorVisual>();
  const mosfets: MosfetVisual[] = [];
  const pickables: THREE.Object3D[] = [];
  const injectors: InjectorCylinderVisual[] = [];
  const ignitionCoils: IgnitionCoilVisual[] = [];
  const fuseVisuals: FuseVisual[] = [];
  const emsHarnessWires: EmsHarnessWireVisual[] = [];

  // Shared Calibrated PBR Materials
  const castAluminumMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8e0ea,
      metalness: 0.85,
      roughness: 0.32,
      roughnessMap: textures.brushedMetalRoughnessMap,
    })
  );
  const engineBlockAlumMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb4bfcc,
      metalness: 0.78,
      roughness: 0.44,
      roughnessMap: textures.brushedMetalRoughnessMap,
    })
  );
  const darkAnodizedMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x252d3b,
      metalness: 0.65,
      roughness: 0.42,
    })
  );
  const nylonPolymerMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1f28,
      metalness: 0.08,
      roughness: 0.72,
    })
  );
  const darkRubberMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x12151b,
      metalness: 0.04,
      roughness: 0.9,
    })
  );
  const ceramicWhiteMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.06,
      roughness: 0.25,
    })
  );
  const brassMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.26,
    })
  );
  const goldPinMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf5d061,
      metalness: 0.94,
      roughness: 0.22,
    })
  );
  const copperCoilMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb87333,
      metalness: 0.88,
      roughness: 0.32,
    })
  );
  const siliconeSealMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.04,
      roughness: 0.62,
    })
  );
  const blueAnodizedMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.42,
      roughness: 0.34,
    })
  );
  const carbonPlateMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.carbonFiberMap,
      metalness: 0.22,
      roughness: 0.38,
    })
  );
  const invisiblePickMat = reg.trackMat(
    new THREE.MeshBasicMaterial({
      visible: false,
    })
  );

  // Helper: clickable brass/gold pin terminal socket
  const addTerminalSocket = (
    parent: THREE.Object3D,
    localPos: THREE.Vector3,
    pinId: string,
    label: string,
    subtitle: string,
    pinRadius = 0.036,
    pinHeight = 0.2,
    pickKind: PickTargetMeta['kind'] = 'pin'
  ): PinAnchorVisual => {
    const holder = new THREE.Group();
    holder.position.copy(localPos);

    const pinGeo = reg.trackGeo(new THREE.CylinderGeometry(pinRadius, pinRadius, pinHeight, 12));
    const pinMesh = new THREE.Mesh(pinGeo, goldPinMat);
    pinMesh.position.y = pinHeight * 0.5;
    pinMesh.castShadow = !isSoftwareGl;
    holder.add(pinMesh);

    const ringGeo = reg.trackGeo(new THREE.TorusGeometry(pinRadius * 1.65, 0.02, 10, 18));
    const ringMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0891b2,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.3,
      })
    );
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.024;
    holder.add(ring);

    const colGeo = reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8));
    const col = new THREE.Mesh(colGeo, invisiblePickMat);
    col.position.y = 0.12;
    col.layers.set(1);
    col.userData.pickMeta = {
      kind: pickKind,
      pinId,
      label,
      subtitle,
    } satisfies PickTargetMeta;
    holder.add(col);
    pickables.push(col);

    parent.add(holder);

    parent.updateMatrixWorld(true);
    const worldAnchor = new THREE.Vector3(0, pinHeight, 0);
    holder.localToWorld(worldAnchor);

    const anchor: PinAnchorVisual = {
      pinId,
      worldAnchor,
      ringMat,
      pinTipMesh: pinMesh,
      colliderMesh: col,
    };
    pinAnchors.set(pinId, anchor);
    return anchor;
  };

  // Helper: route a dedicated color-coded EMS harness wire tube along structured EMI trunks
  const addEmsWire = (
    id: string,
    points: THREE.Vector3[],
    colorHex: number,
    radius: number,
    layer: EmsCircuitLayer,
    signalRole: EmsHarnessWireVisual['signalRole'],
    mappedPinId: string,
    corridor: EfiTrunkCorridor = 'POWER_TRUNK'
  ) => {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.15);
    const geo = reg.trackGeo(new THREE.TubeGeometry(curve, 30, radius, 8, false));
    const baseColor = new THREE.Color(colorHex);
    const mat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.48,
        metalness: 0.1,
        transparent: true,
        opacity: 1,
      })
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !isSoftwareGl;
    root.add(mesh);

    emsHarnessWires.push({
      id,
      layer,
      corridor,
      signalRole,
      mappedPinId,
      baseColor,
      curve,
      mesh,
      material: mat,
    });
  };

  // =========================================================================
  // 1. ESD WORKBENCH SURFACE (y = 0 grounded)
  // =========================================================================
  const benchSlab = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(19.2, 0.28, 12.6)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.24,
        roughness: 0.72,
      })
    )
  );
  benchSlab.position.set(0, -0.15, 0);
  benchSlab.receiveShadow = !isSoftwareGl;
  root.add(benchSlab);

  const esdMat = new THREE.Mesh(
    reg.trackGeo(new THREE.PlaneGeometry(18.2, 11.6)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.benchMatMap,
        roughness: 0.86,
        metalness: 0.05,
      })
    )
  );
  esdMat.rotation.x = -Math.PI / 2;
  esdMat.position.set(0, 0.002, 0);
  esdMat.receiveShadow = !isSoftwareGl;
  root.add(esdMat);

  // =========================================================================
  // 2. CARBON-FIBER MOUNTING BACKPLATE (Matching Schematic Reference 1)
  // =========================================================================
  const backplateGroup = new THREE.Group();
  backplateGroup.position.set(0.25, 0, 0.35);
  addContactShadow(backplateGroup, 8.2, 5.1, textures, reg);

  const plateShape = createRoundedRectShape(7.6, 4.5, 0.24);
  const plateGeo = reg.trackGeo(
    new THREE.ExtrudeGeometry(plateShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 2,
    })
  );
  plateGeo.rotateX(Math.PI / 2);
  const backplateMesh = new THREE.Mesh(plateGeo, carbonPlateMat);
  backplateMesh.position.y = 0.14;
  backplateMesh.castShadow = !isSoftwareGl;
  backplateMesh.receiveShadow = !isSoftwareGl;
  backplateGroup.add(backplateMesh);

  // 4 stainless corner standoffs on carbon backplate
  const standoffGeo = reg.trackGeo(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 6));
  [
    [-3.45, -1.9],
    [3.45, -1.9],
    [-3.45, 1.9],
    [3.45, 1.9],
  ].forEach(([sx, sz]) => {
    const bolt = new THREE.Mesh(standoffGeo, castAluminumMat);
    bolt.position.set(sx, 0.13, sz);
    backplateGroup.add(bolt);
  });
  root.add(backplateGroup);

  // =========================================================================
  // 3. COMPOSITE EXPLODABLE EMS ECU + INTERNAL PCB + MULTI-PLUG 16-PIN HEADER
  // =========================================================================
  const ecuGroup = new THREE.Group();
  ecuGroup.position.set(-1.35, 0.15, 0.35);
  addContactShadow(ecuGroup, 4.4, 3.6, textures, reg, 0.01);

  const dummy = new THREE.Object3D();

  // Rubber anti-vibration feet
  const footGeo = reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.07, 12));
  [
    [-1.75, -1.3],
    [1.75, -1.3],
    [-1.75, 1.3],
    [1.75, 1.3],
  ].forEach(([fx, fz]) => {
    const foot = new THREE.Mesh(footGeo, darkRubberMat);
    foot.position.set(fx, 0.035, fz);
    ecuGroup.add(foot);
  });

  // Lower cast-aluminum ECU tray
  const trayShape = createRoundedRectShape(3.85, 2.95, 0.2);
  const trayGeo = reg.trackGeo(
    new THREE.ExtrudeGeometry(trayShape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 2,
    })
  );
  trayGeo.rotateX(Math.PI / 2);
  const ecuTray = new THREE.Mesh(trayGeo, darkAnodizedMat);
  ecuTray.position.y = 0.34;
  ecuTray.castShadow = !isSoftwareGl;
  ecuTray.receiveShadow = !isSoftwareGl;
  ecuGroup.add(ecuTray);

  // Multi-layer FR4 PCB inside ECU
  const pcbMesh = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(3.48, 0.07, 2.55)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.pcbAlbedoMap,
        roughness: 0.42,
        metalness: 0.18,
      })
    )
  );
  pcbMesh.position.set(0, 0.4, 0);
  ecuGroup.add(pcbMesh);

  // QFP-64 MCU + Crystal + Electrolytic Capacitors + Instanced SMD array
  const mcuBody = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.7, 0.11, 0.7)),
    nylonPolymerMat
  );
  mcuBody.position.set(-0.35, 0.49, -0.15);
  ecuGroup.add(mcuBody);

  const capPoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.14, 0),
    new THREE.Vector2(0.14, 0.34),
    new THREE.Vector2(0.11, 0.38),
    new THREE.Vector2(0, 0.38),
  ];
  const capGeo = reg.trackGeo(new THREE.LatheGeometry(capPoints, 16));
  [-1.25, -0.92, -0.58].forEach((cx, idx) => {
    const cap = new THREE.Mesh(capGeo, idx === 0 ? blueAnodizedMat : darkAnodizedMat);
    cap.position.set(cx, 0.435, -0.82);
    ecuGroup.add(cap);
  });

  const smdInst = new THREE.InstancedMesh(
    reg.trackGeo(new THREE.BoxGeometry(0.08, 0.03, 0.05)),
    brassMat,
    28
  );
  for (let i = 0; i < 28; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    dummy.position.set(-1.2 + col * 0.25, 0.45, 0.52 + row * 0.15);
    dummy.rotation.set(0, (i % 2) * (Math.PI / 2), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    smdInst.setMatrixAt(i, dummy.matrix);
  }
  smdInst.instanceMatrix.needsUpdate = true;
  smdInst.computeBoundingSphere();
  ecuGroup.add(smdInst);

  // 4 Low-Side MOSFET Driver ICs (Q1: INJ_1, Q2: IGN_1, Q3: MRELAY, Q4: FP_RELAY)
  const mosfetSpecs = [
    { pinId: 'ecu-pin-10', label: 'Q1: INJ_1-4 Low-Side Driver', zPos: -0.72 },
    { pinId: 'ecu-pin-11', label: 'Q2: COIL_1-4 Ignition Driver', zPos: -0.24 },
    { pinId: 'ecu-pin-12', label: 'Q3: MRELAY Pull-Down MOSFET', zPos: 0.24 },
    { pinId: 'ecu-pin-16', label: 'Q4: FP_RELAY Pull-Down MOSFET', zPos: 0.72 },
  ];
  const mosfetBodyGeo = reg.trackGeo(new THREE.BoxGeometry(0.28, 0.11, 0.26));
  const mosfetTabGeo = reg.trackGeo(new THREE.BoxGeometry(0.13, 0.05, 0.26));
  const mosfetPickGeo = reg.trackGeo(new THREE.BoxGeometry(0.42, 0.24, 0.34));

  mosfetSpecs.forEach((mSpec) => {
    const bodyMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.65,
        metalness: 0.15,
      })
    );
    const tabMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.25,
        metalness: 0.9,
      })
    );
    const mBody = new THREE.Mesh(mosfetBodyGeo, bodyMat);
    mBody.position.set(0.62, 0.49, mSpec.zPos);
    ecuGroup.add(mBody);
    const mTab = new THREE.Mesh(mosfetTabGeo, tabMat);
    mTab.position.set(0.8, 0.46, mSpec.zPos);
    ecuGroup.add(mTab);

    const mPick = new THREE.Mesh(mosfetPickGeo, invisiblePickMat);
    mPick.position.set(0.68, 0.5, mSpec.zPos);
    mPick.layers.set(1);
    mPick.userData.pickMeta = {
      kind: 'mosfet',
      pinId: mSpec.pinId,
      label: mSpec.label,
      subtitle: 'Click to inspect internal ECU MOSFET output driver',
    } satisfies PickTargetMeta;
    ecuGroup.add(mPick);
    pickables.push(mPick);
    mosfets.push({ pinId: mSpec.pinId, bodyMat, tabMat });
  });

  // Explodable Finned Cast-Aluminum ECU Lid + Dynamic Synced ECU Nameplate
  const ecuLidGroup = new THREE.Group();
  const lidShape = createRoundedRectShape(3.9, 3.0, 0.2);
  const lidGeo = reg.trackGeo(
    new THREE.ExtrudeGeometry(lidShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
  );
  lidGeo.rotateX(Math.PI / 2);
  const lidPlate = new THREE.Mesh(lidGeo, castAluminumMat);
  lidPlate.position.y = 0.85;
  lidPlate.castShadow = !isSoftwareGl;
  lidPlate.receiveShadow = !isSoftwareGl;
  ecuLidGroup.add(lidPlate);

  // Cooling heatsink fins flanking the center nameplate
  const sideFinGeo = reg.trackGeo(new THREE.BoxGeometry(0.75, 0.12, 0.09));
  for (let i = 0; i < 8; i++) {
    const zf = -1.05 + i * 0.3;
    const finL = new THREE.Mesh(sideFinGeo, castAluminumMat);
    finL.position.set(-1.32, 0.94, zf);
    finL.castShadow = !isSoftwareGl;
    ecuLidGroup.add(finL);

    const finR = new THREE.Mesh(sideFinGeo, castAluminumMat);
    finR.position.set(1.32, 0.94, zf);
    finR.castShadow = !isSoftwareGl;
    ecuLidGroup.add(finR);
  }

  // Dynamic ECU Nameplate Texture (syncs live to selected vehicle ECU model!)
  const ecuNameplateMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ecuNameplateMap,
      roughness: 0.32,
      metalness: 0.25,
    })
  );
  const ecuNameplate = new THREE.Mesh(
    reg.trackGeo(new THREE.PlaneGeometry(1.62, 2.02)),
    ecuNameplateMat
  );
  ecuNameplate.rotation.x = -Math.PI / 2;
  ecuNameplate.position.set(0, 0.905, 0);
  ecuLidGroup.add(ecuNameplate);

  // 4 Corner Hex Bolts (InstancedMesh)
  const ecuBoltsInstanced = new THREE.InstancedMesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 6)),
    brassMat,
    4
  );
  [
    [-1.68, -1.2],
    [1.68, -1.2],
    [-1.68, 1.2],
    [1.68, 1.2],
  ].forEach(([bx, bz], idx) => {
    dummy.position.set(bx, 0.93, bz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    ecuBoltsInstanced.setMatrixAt(idx, dummy.matrix);
  });
  ecuBoltsInstanced.instanceMatrix.needsUpdate = true;
  ecuBoltsInstanced.computeBoundingSphere();
  ecuLidGroup.add(ecuBoltsInstanced);
  ecuGroup.add(ecuLidGroup);

  // Multi-plug waterproof ECU connectors along front (+Z) edge (3 plugs matching Image 1) + 16-pin probeable header
  const connGroup = new THREE.Group();
  connGroup.position.set(0, 0.36, 1.56);

  [-1.12, 0, 1.12].forEach((px) => {
    const plugBody = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.96, 0.5, 0.44)),
      nylonPolymerMat
    );
    plugBody.position.set(px, 0.08, 0.12);
    plugBody.castShadow = !isSoftwareGl;
    connGroup.add(plugBody);

    const plugSeal = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.88, 0.44, 0.1)),
      siliconeSealMat
    );
    plugSeal.position.set(px, 0.08, 0.32);
    connGroup.add(plugSeal);
  });

  // Pin Legend Strip across top of ECU multi-plug shroud
  const legendStrip = new THREE.Mesh(
    reg.trackGeo(new THREE.PlaneGeometry(3.15, 0.38)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.connectorLegendMap,
        roughness: 0.45,
        metalness: 0.1,
      })
    )
  );
  legendStrip.rotation.x = -Math.PI / 2;
  legendStrip.position.set(0, 0.335, 0.12);
  connGroup.add(legendStrip);

  ecuGroup.add(connGroup);
  root.add(ecuGroup);

  // All 16 ECU Pins protruding neatly along +Z front header (2 rows × 8 cols)
  const ecuPinLabels = [
    ['ecu-pin-1', 'KL31', 'Power Ground 1 (System GND)'],
    ['ecu-pin-2', 'KL31_2', 'Power Ground 2 (Engine GND)'],
    ['ecu-pin-3', 'KL30', 'Battery Constant +12V (BATT)'],
    ['ecu-pin-4', 'KL15', 'Ignition Switch +12V (IGN)'],
    ['ecu-pin-5', 'VREF_5V', 'Sensor 5V Reference Supply'],
    ['ecu-pin-6', 'SGND', 'Isolated Sensor Clean Ground'],
    ['ecu-pin-7', 'TPS_SIG', 'Throttle Position Sensor Signal'],
    ['ecu-pin-8', 'MAP_SIG', 'Manifold Pressure Signal'],
    ['ecu-pin-9', 'ECT_SIG', 'Coolant Temp Signal'],
    ['ecu-pin-10', 'INJ_1', 'Injector 1–4 Low-Side Driver'],
    ['ecu-pin-11', 'IGN_1', 'Ignition Coil 1–4 Trigger'],
    ['ecu-pin-12', 'MRELAY', 'Main Relay Coil Pull-Down (Pin 85)'],
    ['ecu-pin-13', 'CAN_H', 'High-Speed CAN High (500 kbps)'],
    ['ecu-pin-14', 'CAN_L', 'High-Speed CAN Low (500 kbps)'],
    ['ecu-pin-15', 'O2_SIG', 'Oxygen Sensor Signal'],
    ['ecu-pin-16', 'FP_RELAY', 'Fuel Pump Relay Driver (Pin 85)'],
  ];

  ecuPinLabels.forEach(([pinId, label, subtitle], idx) => {
    const row = idx < 8 ? 0 : 1;
    const col = idx % 8;
    const xOffset = -1.4 + col * 0.4;
    const yOffset = row === 0 ? 0.18 : -0.04;

    const pinHolder = new THREE.Group();
    pinHolder.position.set(xOffset, yOffset, 0.36);
    pinHolder.rotation.x = Math.PI / 2;
    connGroup.add(pinHolder);

    addTerminalSocket(
      pinHolder,
      new THREE.Vector3(0, 0, 0),
      pinId,
      `Pin ${idx + 1}: ${label}`,
      subtitle,
      0.034,
      0.22
    );
  });

  ecuGroup.updateMatrixWorld(true);
  const breakoutAnchorWorld = new THREE.Vector3(0, 0.34, 0.25);
  connGroup.localToWorld(breakoutAnchorWorld);

  // =========================================================================
  // 4. WATERPROOF BLUE ISO RELAYS ON CARBON BACKPLATE (Main + Fuel Pump)
  // =========================================================================
  const buildWaterproofIsoRelay = (
    x: number,
    z: number,
    topMap: THREE.CanvasTexture,
    relayTitle: string,
    terminalIds: [string, string, string, string],
    mappedMetaPrefix: string
  ) => {
    const g = new THREE.Group();
    g.position.set(x, 0.15, z);
    addContactShadow(g, 1.35, 1.45, textures, reg, 0.01);

    // Lower waterproof plug socket
    const socket = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(1.02, 0.34, 1.06)),
      nylonPolymerMat
    );
    socket.position.y = 0.17;
    socket.castShadow = !isSoftwareGl;
    g.add(socket);

    // Blue waterproof relay body
    const body = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.96, 0.62, 0.96)),
      blueAnodizedMat
    );
    body.position.y = 0.64;
    body.castShadow = !isSoftwareGl;
    g.add(body);

    // Printed ISO 30/85/86/87 schematic faceplate on top
    const topFace = new THREE.Mesh(
      reg.trackGeo(new THREE.PlaneGeometry(0.88, 0.88)),
      reg.trackMat(
        new THREE.MeshStandardMaterial({
          map: topMap,
          roughness: 0.38,
          metalness: 0.12,
        })
      )
    );
    topFace.rotation.x = -Math.PI / 2;
    topFace.position.y = 0.955;
    g.add(topFace);

    // Internal visible side inspection window with animated brass armature & status LED
    const coilGlowMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x16a34a,
        emissiveIntensity: 0.7,
        roughness: 0.3,
      })
    );
    const led = new THREE.Mesh(reg.trackGeo(new THREE.SphereGeometry(0.07, 12, 12)), coilGlowMat);
    led.position.set(0.32, 0.96, -0.32);
    g.add(led);

    const armaturePivot = new THREE.Group();
    armaturePivot.position.set(-0.2, 0.99, 0.25);
    const armBar = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.36, 0.045, 0.14)),
      brassMat
    );
    armBar.position.set(0.18, 0, 0);
    armaturePivot.add(armBar);
    g.add(armaturePivot);

    // Front clickable terminal tabs (30, 87, 86, 85)
    const termLabels = [
      [terminalIds[0], `${mappedMetaPrefix} PIN 30`, '+12V Fused Input'],
      [terminalIds[1], `${mappedMetaPrefix} PIN 87`, 'Switched +12V Output'],
      [terminalIds[2], `${mappedMetaPrefix} PIN 86`, 'Relay Coil +12V Feed'],
      [terminalIds[3], `${mappedMetaPrefix} PIN 85`, 'ECU Low-Side Trigger'],
    ];
    termLabels.forEach(([tid, tLabel, tSub], i) => {
      addTerminalSocket(
        g,
        new THREE.Vector3(-0.33 + i * 0.22, 0.32, 0.54),
        tid,
        tLabel,
        `${relayTitle} · ${tSub}`,
        0.032,
        0.16,
        'relay'
      );
    });

    root.add(g);
    return { group: g, armaturePivot, coilGlowMat };
  };

  const mainRelayRig = buildWaterproofIsoRelay(
    1.62,
    0.45,
    textures.mainRelaySchematicMap,
    'Main Relay (12V SW)',
    ['relay-30', 'relay-87', 'relay-86', 'relay-85'],
    'MAIN RELAY'
  );
  const fuelRelayRig = buildWaterproofIsoRelay(
    2.96,
    0.45,
    textures.fuelRelaySchematicMap,
    'Fuel Pump Relay',
    ['ems-fp-30', 'ems-fp-87', 'ems-fp-86', 'ems-fp-85'],
    'FUEL RELAY'
  );

  // =========================================================================
  // 5. 4x FUEL INJECTORS MOUNTED ON BRUSHED ALUMINUM FUEL RAIL (Upper-Left)
  // =========================================================================
  const fuelRailGroup = new THREE.Group();
  fuelRailGroup.position.set(-2.2, 0, -3.55);
  addContactShadow(fuelRailGroup, 5.2, 1.5, textures, reg);

  // Brushed aluminum tubular fuel rail bar
  const railBar = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 4.7, 20)),
    castAluminumMat
  );
  railBar.rotation.z = Math.PI / 2;
  railBar.position.set(0, 1.38, 0);
  railBar.castShadow = !isSoftwareGl;
  fuelRailGroup.add(railBar);

  // Fuel pressure regulator cap on right end + inlet fitting on left end
  const fprCap = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.24, 0.22, 0.38, 18)),
    darkAnodizedMat
  );
  fprCap.rotation.z = Math.PI / 2;
  fprCap.position.set(2.45, 1.38, 0);
  fuelRailGroup.add(fprCap);

  const railInlet = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 14)),
    brassMat
  );
  railInlet.rotation.z = Math.PI / 2;
  railInlet.position.set(-2.45, 1.38, 0);
  fuelRailGroup.add(railInlet);

  // Rail mounting stand brackets
  [-2.05, 2.05].forEach((bx) => {
    const stand = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.18, 1.38, 0.42)),
      darkAnodizedMat
    );
    stand.position.set(bx, 0.69, -0.25);
    stand.castShadow = !isSoftwareGl;
    fuelRailGroup.add(stand);
  });

  // Rail shared +12V terminal (`inj-vbat`)
  addTerminalSocket(
    fuelRailGroup,
    new THREE.Vector3(-2.15, 1.54, 0.18),
    'inj-vbat',
    'FUEL RAIL +12V (20A FUSE)',
    'Shared Switched +12V Supply to Injectors 1–4',
    0.036,
    0.18,
    'injector'
  );

  let primaryInjectorPintle!: THREE.Mesh;
  let primaryInjectorSprayCone!: THREE.Mesh;
  let primaryInjectorSprayMat!: THREE.MeshBasicMaterial;
  let primaryInjectorPulseMat!: THREE.MeshStandardMaterial;

  ([1, 2, 3, 4] as const).forEach((cyl, idx) => {
    const ix = -1.62 + idx * 1.08;
    const singleInj = new THREE.Group();
    singleInj.position.set(ix, 0, 0);

    const injBody = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.18, 0.13, 0.82, 18)),
      nylonPolymerMat
    );
    injBody.position.y = 0.84;
    injBody.castShadow = !isSoftwareGl;
    singleInj.add(injBody);

    const injCollar = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.21, 0.21, 0.22, 18)),
      blueAnodizedMat
    );
    injCollar.position.y = 1.12;
    singleInj.add(injCollar);

    const pulseMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
        roughness: 0.28,
        metalness: 0.2,
      })
    );
    const ledRing = new THREE.Mesh(
      reg.trackGeo(new THREE.TorusGeometry(0.2, 0.025, 8, 20)),
      pulseMat
    );
    ledRing.rotation.x = Math.PI / 2;
    ledRing.position.y = 0.92;
    singleInj.add(ledRing);

    const pintle = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.045, 0.028, 0.18, 12)),
      brassMat
    );
    pintle.position.y = 0.38;
    singleInj.add(pintle);

    const sprayMat = reg.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const sprayCone = new THREE.Mesh(
      reg.trackGeo(new THREE.ConeGeometry(0.26, 0.36, 16, 1, true)),
      sprayMat
    );
    sprayCone.position.y = 0.2;
    singleInj.add(sprayCone);

    const pinId = cyl === 1 ? 'inj-ctrl' : `ems-inj-${cyl}`;
    const anchor = addTerminalSocket(
      singleInj,
      new THREE.Vector3(0, 1.12, 0.24),
      pinId,
      `INJ ${cyl} ECU SINK`,
      `Cylinder ${cyl} Fuel Injector Low-Side Driver`,
      0.032,
      0.16,
      'injector'
    );

    if (cyl === 1) {
      primaryInjectorPintle = pintle;
      primaryInjectorSprayCone = sprayCone;
      primaryInjectorSprayMat = sprayMat;
      primaryInjectorPulseMat = pulseMat;
    }

    fuelRailGroup.add(singleInj);
    injectors.push({
      cylinder: cyl,
      pintleMesh: pintle,
      sprayMat,
      pulseMat,
      terminalAnchor: anchor.worldAnchor,
    });
  });

  root.add(fuelRailGroup);
  fuelRailGroup.updateMatrixWorld(true);
  // Refresh world anchors after attaching fuelRailGroup to root
  injectors.forEach((inj) => {
    const pid = inj.cylinder === 1 ? 'inj-ctrl' : `ems-inj-${inj.cylinder}`;
    const a = pinAnchors.get(pid);
    if (a) {
      const wp = new THREE.Vector3();
      a.pinTipMesh.getWorldPosition(wp);
      a.worldAnchor.copy(wp);
      inj.terminalAnchor.copy(wp);
    }
  });

  // =========================================================================
  // 6. 4x COIL-ON-PLUG (COP) IGNITION COILS + SPARK PLUGS (Upper-Right)
  // =========================================================================
  const coilBankGroup = new THREE.Group();
  coilBankGroup.position.set(2.95, 0, -3.55);
  addContactShadow(coilBankGroup, 4.7, 1.5, textures, reg);

  // Anodized display rack holding the 4 COP + spark plug assemblies cleanly above bench
  const coilRack = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(4.2, 0.14, 0.62)),
    darkAnodizedMat
  );
  coilRack.position.set(0, 0.07, 0);
  coilBankGroup.add(coilRack);

  ([1, 2, 3, 4] as const).forEach((cyl, idx) => {
    const cx = -1.56 + idx * 1.04;
    const cop = new THREE.Group();
    cop.position.set(cx, 0, 0);

    // Top COP ignition transformer pack head
    const head = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.46, 0.34, 0.42)),
      nylonPolymerMat
    );
    head.position.y = 1.46;
    head.castShadow = !isSoftwareGl;
    cop.add(head);

    // Dwell thermal indicator ring around COP head
    const dwellMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.2,
        roughness: 0.35,
      })
    );
    const dwellBand = new THREE.Mesh(
      reg.trackGeo(new THREE.TorusGeometry(0.22, 0.024, 8, 18)),
      dwellMat
    );
    dwellBand.rotation.x = Math.PI / 2;
    dwellBand.position.y = 1.27;
    cop.add(dwellBand);

    // Rubber dielectric stalk boot
    const stalk = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.58, 16)),
      darkRubberMat
    );
    stalk.position.y = 0.98;
    stalk.castShadow = !isSoftwareGl;
    cop.add(stalk);

    // White ceramic spark plug insulator + hex metal shell + threaded tip
    const ceramic = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.085, 0.095, 0.32, 16)),
      ceramicWhiteMat
    );
    ceramic.position.y = 0.56;
    cop.add(ceramic);

    const hexShell = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 6)),
      castAluminumMat
    );
    hexShell.position.y = 0.38;
    cop.add(hexShell);

    const threadTip = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 14)),
      darkAnodizedMat
    );
    threadTip.position.y = 0.26;
    cop.add(threadTip);

    // Bright electric spark arc at electrode gap!
    const sparkMat = reg.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const sparkMesh = new THREE.Mesh(
      reg.trackGeo(new THREE.OctahedronGeometry(0.13, 0)),
      sparkMat
    );
    sparkMesh.position.y = 0.17;
    cop.add(sparkMesh);

    const pinId = `ems-coil-${cyl}`;
    const anchor = addTerminalSocket(
      cop,
      new THREE.Vector3(0, 1.48, 0.25),
      pinId,
      `COIL ${cyl} TRIGGER`,
      `Cylinder ${cyl} Coil-on-Plug Ignition Trigger (15A Fuse)`,
      0.032,
      0.16,
      'coil'
    );

    coilBankGroup.add(cop);
    ignitionCoils.push({
      cylinder: cyl,
      dwellMat,
      sparkMat,
      sparkMesh,
      terminalAnchor: anchor.worldAnchor,
    });
  });

  root.add(coilBankGroup);
  coilBankGroup.updateMatrixWorld(true);
  ignitionCoils.forEach((coil) => {
    const a = pinAnchors.get(`ems-coil-${coil.cylinder}`);
    if (a) {
      const wp = new THREE.Vector3();
      a.pinTipMesh.getWorldPosition(wp);
      a.worldAnchor.copy(wp);
      coil.terminalAnchor.copy(wp);
    }
  });

  // =========================================================================
  // 7. FUEL PUMP MODULE INSIDE CUTAWAY TRANSLUCENT FUEL TANK (Far Right)
  // =========================================================================
  const fuelTankGroup = new THREE.Group();
  fuelTankGroup.position.set(6.55, 0, 1.15);
  addContactShadow(fuelTankGroup, 3.3, 3.2, textures, reg);

  // Translucent cutaway tank body
  const tankShellMat = reg.trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: isSoftwareGl ? 0.24 : 0.2,
      roughness: 0.16,
      metalness: 0.08,
      depthWrite: false,
    })
  );
  const tankShell = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.75, 1.85, 2.55)),
    tankShellMat
  );
  tankShell.position.y = 0.94;
  tankShell.renderOrder = 3;
  fuelTankGroup.add(tankShell);

  // Wireframe edges accent on cutaway tank for clear industrial silhouette
  const tankEdges = new THREE.LineSegments(
    reg.trackGeo(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.76, 1.86, 2.56))),
    reg.trackMat(new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 }))
  );
  tankEdges.position.y = 0.94;
  fuelTankGroup.add(tankEdges);

  // Internal fuel fluid level volume (68% fill)
  const fuelFluidMat = reg.trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.38,
      roughness: 0.12,
      depthWrite: false,
    })
  );
  const fuelFluid = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.6, 1.18, 2.4)),
    fuelFluidMat
  );
  fuelFluid.position.y = 0.62;
  fuelFluid.renderOrder = 1;
  fuelTankGroup.add(fuelFluid);

  // Submerged Fuel Pump Module Flange, Strut Rods, Pump Canister & Spinning Impeller
  const flangeDisc = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.66, 0.66, 0.14, 24)),
    ceramicWhiteMat
  );
  flangeDisc.position.y = 1.92;
  flangeDisc.castShadow = !isSoftwareGl;
  fuelTankGroup.add(flangeDisc);

  const pumpCanister = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.42, 0.45, 1.05, 20)),
    castAluminumMat
  );
  pumpCanister.position.y = 0.62;
  fuelTankGroup.add(pumpCanister);

  const fuelPumpGlowMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    })
  );
  const pumpStatusRing = new THREE.Mesh(
    reg.trackGeo(new THREE.TorusGeometry(0.46, 0.035, 10, 22)),
    fuelPumpGlowMat
  );
  pumpStatusRing.rotation.x = Math.PI / 2;
  pumpStatusRing.position.y = 1.14;
  fuelTankGroup.add(pumpStatusRing);

  // Animated impeller rotor visible at top of pump canister
  const fuelPumpImpellerGroup = new THREE.Group();
  fuelPumpImpellerGroup.position.set(0, 1.24, 0);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.46, 0.06, 0.09)),
      brassMat
    );
    blade.rotation.y = (b * Math.PI) / 4;
    fuelPumpImpellerGroup.add(blade);
  }
  fuelTankGroup.add(fuelPumpImpellerGroup);

  // Two stainless guide rods connecting flange to pump canister
  [-0.36, 0.36].forEach((rx) => {
    const rod = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.86, 10)),
      castAluminumMat
    );
    rod.position.set(rx, 1.48, 0);
    fuelTankGroup.add(rod);
  });

  // Clickable fuel pump terminals (+12V from Fuel Pump Relay 87 & System Ground)
  addTerminalSocket(
    fuelTankGroup,
    new THREE.Vector3(-0.3, 1.98, 0.18),
    'ems-fuel-pump-pos',
    'FUEL PUMP +12V (20A)',
    'Submerged Fuel Pump Feed from Fuel Pump Relay Pin 87',
    0.036,
    0.18,
    'fuel_pump'
  );
  addTerminalSocket(
    fuelTankGroup,
    new THREE.Vector3(0.3, 1.98, 0.18),
    'ems-fuel-pump-gnd',
    'FUEL PUMP GND',
    'Dedicated Return to System Chassis Ground',
    0.036,
    0.18,
    'fuel_pump'
  );
  root.add(fuelTankGroup);

  // Pressurized Fuel Supply Line routing from Tank Flange to Fuel Rail Inlet!
  const fuelFeedLineMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
      roughness: 0.32,
      metalness: 0.45,
    })
  );
  const fuelLineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(6.55, 2.02, 0.8),
    new THREE.Vector3(6.1, 2.25, -1.6),
    new THREE.Vector3(4.2, 2.1, -4.6),
    new THREE.Vector3(-4.5, 1.8, -4.5),
    new THREE.Vector3(-4.65, 1.38, -3.55),
  ]);
  const fuelFeedTube = new THREE.Mesh(
    reg.trackGeo(new THREE.TubeGeometry(fuelLineCurve, 34, 0.055, 10, false)),
    fuelFeedLineMat
  );
  fuelFeedTube.castShadow = !isSoftwareGl;
  root.add(fuelFeedTube);

  // =========================================================================
  // 8. POWER DISTRIBUTION UNIT (PDU): 12V BATTERY, IGNITION SWITCH, FUSE BLOCK
  // =========================================================================
  const pduGroup = new THREE.Group();
  pduGroup.position.set(-6.05, 0, 2.75);
  root.add(pduGroup);

  // 8a. 12V AGM Battery
  const battGroup = new THREE.Group();
  battGroup.position.set(-1.05, 0, 0.95);
  addContactShadow(battGroup, 2.5, 1.85, textures, reg);

  const battBox = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.15, 1.28, 1.48)),
    nylonPolymerMat
  );
  battBox.position.y = 0.64;
  battBox.castShadow = !isSoftwareGl;
  battGroup.add(battBox);

  const battTopLabel = new THREE.Mesh(
    reg.trackGeo(new THREE.PlaneGeometry(1.98, 1.32)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.batteryTopLabelMap,
        roughness: 0.45,
        metalness: 0.08,
      })
    )
  );
  battTopLabel.rotation.x = -Math.PI / 2;
  battTopLabel.position.y = 1.286;
  battGroup.add(battTopLabel);

  // Red (+) & Black (-) Battery Posts
  const redPostBase = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 16)),
    siliconeSealMat
  );
  redPostBase.position.set(-0.72, 1.34, -0.42);
  battGroup.add(redPostBase);

  const blackPostBase = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 16)),
    darkAnodizedMat
  );
  blackPostBase.position.set(0.72, 1.34, -0.42);
  battGroup.add(blackPostBase);

  addTerminalSocket(
    battGroup,
    new THREE.Vector3(-0.72, 1.4, -0.42),
    'ems-batt-pos',
    '12V BATTERY POS (+KL30)',
    'Primary Unswitched Battery Feed -> 50A Main Fuse',
    0.055,
    0.22
  );
  addTerminalSocket(
    battGroup,
    new THREE.Vector3(0.72, 1.4, -0.42),
    'ems-batt-neg',
    '12V BATTERY NEG (-KL31)',
    'Primary Battery Return -> Chassis Ground G1',
    0.055,
    0.22,
    'ground'
  );
  pduGroup.add(battGroup);

  // 8b. Interactive Rotary Ignition Key Switch (KL15)
  const ignGroup = new THREE.Group();
  ignGroup.position.set(-1.15, 0, -1.1);
  addContactShadow(ignGroup, 1.2, 1.2, textures, reg);

  const ignHousing = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.46, 0.5, 0.65, 24)),
    darkAnodizedMat
  );
  ignHousing.position.y = 0.325;
  ignHousing.castShadow = !isSoftwareGl;
  ignGroup.add(ignHousing);

  const ignBezel = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 24)),
    castAluminumMat
  );
  ignBezel.position.y = 0.7;
  ignGroup.add(ignBezel);

  const ignitionRingMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.75,
      roughness: 0.3,
    })
  );
  const ignRing = new THREE.Mesh(
    reg.trackGeo(new THREE.TorusGeometry(0.41, 0.032, 10, 24)),
    ignitionRingMat
  );
  ignRing.rotation.x = Math.PI / 2;
  ignRing.position.y = 0.72;
  ignGroup.add(ignRing);

  const ignitionKeyPivot = new THREE.Group();
  ignitionKeyPivot.position.set(0, 0.78, 0);
  const keyGrip = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.44, 0.28, 0.08)),
    nylonPolymerMat
  );
  keyGrip.position.y = 0.16;
  ignitionKeyPivot.add(keyGrip);
  const keyBlade = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.14, 0.16, 0.04)),
    brassMat
  );
  keyBlade.position.y = 0.02;
  ignitionKeyPivot.add(keyBlade);
  ignGroup.add(ignitionKeyPivot);

  // Layer-1 clickable collider for interactive Ignition Key toggle!
  const ignCollider = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.54, 0.54, 1.15, 12)),
    invisiblePickMat
  );
  ignCollider.position.y = 0.58;
  ignCollider.layers.set(1);
  ignCollider.userData.pickMeta = {
    kind: 'ignition_switch',
    pinId: 'ecu-pin-4',
    label: 'IGNITION SWITCH (KL15)',
    subtitle: 'Click to toggle Bench Power & Switched +12V Ignition',
  } satisfies PickTargetMeta;
  ignGroup.add(ignCollider);
  pickables.push(ignCollider);
  pduGroup.add(ignGroup);

  // 8c. Color-Coded Automotive Blade Fuse Block (5 Dedicated Fuses)
  const fuseBoxGroup = new THREE.Group();
  fuseBoxGroup.position.set(1.2, 0, 0.15);
  addContactShadow(fuseBoxGroup, 2.0, 3.2, textures, reg);

  const fuseBoxBody = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(1.62, 0.54, 2.86)),
    nylonPolymerMat
  );
  fuseBoxBody.position.y = 0.27;
  fuseBoxBody.castShadow = !isSoftwareGl;
  fuseBoxGroup.add(fuseBoxBody);

  const fuseLegendPlate = new THREE.Mesh(
    reg.trackGeo(new THREE.PlaneGeometry(0.84, 2.66)),
    reg.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.fuseBlockLabelMap,
        roughness: 0.42,
        metalness: 0.1,
      })
    )
  );
  fuseLegendPlate.rotation.x = -Math.PI / 2;
  fuseLegendPlate.position.set(-0.34, 0.546, 0);
  fuseBoxGroup.add(fuseLegendPlate);

  const fuseSpecs: {
    id: EmsFuseTelemetry['id'];
    label: string;
    circuit: string;
    colorHex: number;
    mappedPinId: string;
    zOffset: number;
  }[] = [
    { id: 'fuse-main-50a', label: 'F1 · 50A MAIN', circuit: 'Primary KL30 Power Bus', colorHex: 0xef4444, mappedPinId: 'ecu-pin-3', zOffset: -0.96 },
    { id: 'fuse-inj-20a', label: 'F2 · 20A INJ', circuit: 'Fuel Rail & Injectors 1–4', colorHex: 0xfacc15, mappedPinId: 'ecu-pin-10', zOffset: -0.48 },
    { id: 'fuse-fp-20a', label: 'F3 · 20A FUEL', circuit: 'Fuel Pump Relay & Module', colorHex: 0xeab308, mappedPinId: 'ecu-pin-16', zOffset: 0.0 },
    { id: 'fuse-ign-15a', label: 'F4 · 15A COIL', circuit: 'Ignition Coils 1–4', colorHex: 0x3b82f6, mappedPinId: 'ecu-pin-11', zOffset: 0.48 },
    { id: 'fuse-ecu-10a', label: 'F5 · 10A ECU', circuit: 'ECU BATT / KL15 Logic Supply', colorHex: 0xf97316, mappedPinId: 'ecu-pin-4', zOffset: 0.96 },
  ];

  fuseSpecs.forEach((fSpec) => {
    const fHolder = new THREE.Group();
    fHolder.position.set(0.36, 0.54, fSpec.zOffset);

    const bladeMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: fSpec.colorHex,
        emissive: fSpec.colorHex,
        emissiveIntensity: 0.22,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.88,
      })
    );
    const bladeBody = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.56, 0.24, 0.22)),
      bladeMat
    );
    bladeBody.position.y = 0.12;
    bladeBody.castShadow = !isSoftwareGl;
    fHolder.add(bladeBody);

    const glowMat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x22c55e,
        emissiveIntensity: 0.75,
        roughness: 0.3,
      })
    );
    const linkDot = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.18, 0.05, 0.08)),
      glowMat
    );
    linkDot.position.y = 0.25;
    fHolder.add(linkDot);

    const fCollider = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(0.75, 0.38, 0.36)),
      invisiblePickMat
    );
    fCollider.position.y = 0.18;
    fCollider.layers.set(1);
    fCollider.userData.pickMeta = {
      kind: 'fuse',
      fuseId: fSpec.id,
      pinId: fSpec.mappedPinId,
      label: fSpec.label,
      subtitle: `${fSpec.circuit} — Click to inspect fuse circuit`,
    } satisfies PickTargetMeta;
    fHolder.add(fCollider);
    pickables.push(fCollider);

    fuseBoxGroup.add(fHolder);
    pduGroup.updateMatrixWorld(true);
    const wp = new THREE.Vector3(0.28, 0.12, 0);
    fHolder.localToWorld(wp);

    fuseVisuals.push({
      id: fSpec.id,
      mappedPinId: fSpec.mappedPinId,
      bladeMat,
      glowMat,
      worldAnchor: wp,
    });
  });
  pduGroup.add(fuseBoxGroup);

  // =========================================================================
  // 9. SENSORS (TPS, MAP, ECT) & CAN BUS TERMINATOR
  // =========================================================================
  // 9a. TPS (Left of ECU, matching Reference Image 1!)
  const tpsGroup = new THREE.Group();
  tpsGroup.position.set(-6.05, 0, -1.05);
  addContactShadow(tpsGroup, 2.0, 1.5, textures, reg);

  const tpsBore = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 0.68, 22)),
    castAluminumMat
  );
  tpsBore.rotation.z = Math.PI / 2;
  tpsBore.position.set(-0.18, 0.52, 0);
  tpsBore.castShadow = !isSoftwareGl;
  tpsGroup.add(tpsBore);

  const tpsHousing = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.62, 0.74, 0.88)),
    nylonPolymerMat
  );
  tpsHousing.position.set(0.36, 0.39, 0);
  tpsHousing.castShadow = !isSoftwareGl;
  tpsGroup.add(tpsHousing);

  const tpsButterflyPivot = new THREE.Group();
  tpsButterflyPivot.position.set(-0.18, 0.52, 0);
  tpsButterflyPivot.add(
    new THREE.Mesh(reg.trackGeo(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 22)), brassMat)
  );
  const tShaft = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 12)),
    darkAnodizedMat
  );
  tShaft.rotation.z = Math.PI / 2;
  tpsButterflyPivot.add(tShaft);
  tpsGroup.add(tpsButterflyPivot);

  addTerminalSocket(tpsGroup, new THREE.Vector3(0.68, 0.56, -0.24), 'tps-vcc', 'TPS 5V VCC', 'Throttle Sensor 5V Reference', 0.034, 0.16);
  addTerminalSocket(tpsGroup, new THREE.Vector3(0.68, 0.56, 0.0), 'tps-sig', 'TPS_SIG WIPER', 'Analog Throttle Signal (0.5V–4.5V)', 0.034, 0.16);
  addTerminalSocket(tpsGroup, new THREE.Vector3(0.68, 0.56, 0.24), 'tps-gnd', 'TPS SGND', 'Isolated Sensor Ground Return', 0.034, 0.16);
  root.add(tpsGroup);

  // 9b. MAP Sensor (Rear-left above TPS)
  const mapGroup = new THREE.Group();
  mapGroup.position.set(-6.15, 0, -3.15);
  addContactShadow(mapGroup, 1.4, 1.2, textures, reg);
  const mapBody = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.84, 0.48, 0.7)),
    nylonPolymerMat
  );
  mapBody.position.y = 0.24;
  mapBody.castShadow = !isSoftwareGl;
  mapGroup.add(mapBody);
  const vacBarb = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.08, 0.11, 0.36, 14)),
    brassMat
  );
  vacBarb.rotation.z = Math.PI / 2;
  vacBarb.position.set(-0.48, 0.24, 0);
  mapGroup.add(vacBarb);

  addTerminalSocket(mapGroup, new THREE.Vector3(0.44, 0.44, -0.2), 'map-vcc', 'MAP 5V VCC', 'MAP 5V Supply', 0.032, 0.15);
  addTerminalSocket(mapGroup, new THREE.Vector3(0.44, 0.44, 0.0), 'map-sig', 'MAP SIG', 'Manifold Absolute Pressure', 0.032, 0.15);
  addTerminalSocket(mapGroup, new THREE.Vector3(0.44, 0.44, 0.2), 'map-gnd', 'MAP SGND', 'Isolated Sensor Ground', 0.032, 0.15);
  root.add(mapGroup);

  // 9c. ECT Coolant Sensor (Rear-left beside fuel rail)
  const ectGroup = new THREE.Group();
  ectGroup.position.set(-6.15, 0, -4.55);
  addContactShadow(ectGroup, 1.2, 1.0, textures, reg);
  const ectHex = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 6)),
    brassMat
  );
  ectHex.position.y = 0.22;
  ectGroup.add(ectHex);
  const ectProbe = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.12, 0.09, 0.42, 14)),
    brassMat
  );
  ectProbe.rotation.z = Math.PI / 2;
  ectProbe.position.set(-0.28, 0.22, 0);
  ectGroup.add(ectProbe);
  const ectCap = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 14)),
    blueAnodizedMat
  );
  ectCap.rotation.z = Math.PI / 2;
  ectCap.position.set(0.2, 0.24, 0);
  ectGroup.add(ectCap);

  const ectThermalRingMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    })
  );
  const ectRing = new THREE.Mesh(
    reg.trackGeo(new THREE.TorusGeometry(0.15, 0.03, 10, 18)),
    ectThermalRingMat
  );
  ectRing.rotation.y = Math.PI / 2;
  ectRing.position.set(-0.34, 0.22, 0);
  ectGroup.add(ectRing);

  addTerminalSocket(ectGroup, new THREE.Vector3(0.34, 0.36, -0.1), 'ect-sig', 'ECT THERMISTOR +', 'Coolant Temp NTC Signal', 0.032, 0.15);
  addTerminalSocket(ectGroup, new THREE.Vector3(0.34, 0.36, 0.1), 'ect-gnd', 'ECT SGND', 'Isolated Sensor Ground', 0.032, 0.15);
  root.add(ectGroup);

  // 9d. CAN Bus 120Ω Terminator (Upper Far-Right)
  const canGroup = new THREE.Group();
  canGroup.position.set(6.55, 0, -3.45);
  addContactShadow(canGroup, 1.3, 1.1, textures, reg);
  const canBox = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.92, 0.44, 0.72)),
    darkAnodizedMat
  );
  canBox.position.y = 0.22;
  canBox.castShadow = !isSoftwareGl;
  canGroup.add(canBox);

  const canStatusLedMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    })
  );
  const canLed = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 14)),
    canStatusLedMat
  );
  canLed.position.set(0.2, 0.45, 0);
  canGroup.add(canLed);

  addTerminalSocket(canGroup, new THREE.Vector3(-0.34, 0.44, -0.15), 'can-term-h', 'CAN-H 120Ω', 'High-Speed CAN High Terminator', 0.034, 0.16);
  addTerminalSocket(canGroup, new THREE.Vector3(-0.34, 0.44, 0.15), 'can-term-l', 'CAN-L 120Ω', 'High-Speed CAN Low Terminator', 0.034, 0.16);
  root.add(canGroup);

  // =========================================================================
  // 10. DEDICATED GROUND STUDS (G1 CHASSIS, SGND SENSOR BUS, G2 ENGINE/ECU)
  // =========================================================================
  const buildGroundStud = (
    x: number,
    z: number,
    pinId: string,
    label: string,
    subtitle: string,
    baseColorHex: number
  ) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    addContactShadow(g, 0.85, 0.85, textures, reg);
    const mat = reg.trackMat(
      new THREE.MeshStandardMaterial({
        color: baseColorHex,
        metalness: 0.7,
        roughness: 0.35,
      })
    );
    const base = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16)),
      mat
    );
    base.position.y = 0.06;
    g.add(base);
    addTerminalSocket(g, new THREE.Vector3(0, 0.12, 0), pinId, label, subtitle, 0.065, 0.24, 'ground');
    root.add(g);
    return mat;
  };

  const g1StudMat = buildGroundStud(
    -2.45,
    4.65,
    'chassis-gnd',
    'SYSTEM GND G1 (KL31)',
    'Chassis / Battery Negative Ground Stud',
    0x334155
  );
  const sgndBusMat = buildGroundStud(
    0.0,
    4.65,
    'ems-sgnd-bus',
    'SENSOR GND BUS (SGND)',
    'Isolated Clean Analog Ground (TPS / MAP / ECT -> ECU Pin 6)',
    0x78716c
  );
  const g2StudMat = buildGroundStud(
    2.45,
    4.65,
    'ems-gnd-g2',
    'ENGINE GND G2 (KL31)',
    'Engine Block / High-Current Coil & Pump Ground Stud',
    0x334155
  );

  // =========================================================================
  // 11. STANDALONE CRANKSHAFT 36-1 VR TRIGGER WHEEL (Bench Assembly Mode)
  // =========================================================================
  const standaloneCrankBase = new THREE.Group();
  standaloneCrankBase.position.set(6.25, 0, 4.25);
  addContactShadow(standaloneCrankBase, 1.9, 1.3, textures, reg);

  const crankPedestal = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(0.85, 0.26, 0.44)),
    darkAnodizedMat
  );
  crankPedestal.position.y = 0.13;
  standaloneCrankBase.add(crankPedestal);

  const crankWheelGroup = new THREE.Group();
  crankWheelGroup.position.set(0, 0.85, 0);
  const wheelShape = createToothedWheelShape(0.66, 0.54, 36, 0);
  const wheelGeo = reg.trackGeo(
    new THREE.ExtrudeGeometry(wheelShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
    })
  );
  wheelGeo.center();
  const crankDisc = new THREE.Mesh(wheelGeo, castAluminumMat);
  crankDisc.castShadow = !isSoftwareGl;
  crankWheelGroup.add(crankDisc);
  const hubShaft = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 16)),
    brassMat
  );
  hubShaft.rotation.x = Math.PI / 2;
  crankWheelGroup.add(hubShaft);
  standaloneCrankBase.add(crankWheelGroup);

  const vrPickup = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 14)),
    brassMat
  );
  vrPickup.rotation.z = Math.PI / 2;
  vrPickup.position.set(0.92, 0.85, 0);
  standaloneCrankBase.add(vrPickup);
  root.add(standaloneCrankBase);

  // =========================================================================
  // 12. TOGGLEABLE 4-CYLINDER DOHC ENGINE BLOCK BAY (Matching Reference Image 2)
  // =========================================================================
  const engineBlockGroup = new THREE.Group();
  engineBlockGroup.position.set(-10.8, 0, -0.8);
  engineBlockGroup.rotation.y = Math.PI * 0.12;
  engineBlockGroup.visible = false; // Default: Bench Assembly; toggled smoothly from HUD!
  addContactShadow(engineBlockGroup, 5.4, 6.2, textures, reg);

  // Lower Sump / Oil Pan (grounded y = 0)
  const oilPan = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.35, 0.68, 4.2)),
    darkAnodizedMat
  );
  oilPan.position.set(0, 0.36, 0);
  oilPan.castShadow = !isSoftwareGl;
  engineBlockGroup.add(oilPan);

  // Cast-Aluminum 4-Cylinder Engine Block
  const cylBlock = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.55, 1.65, 4.45)),
    engineBlockAlumMat
  );
  cylBlock.position.set(0, 1.52, 0);
  cylBlock.castShadow = !isSoftwareGl;
  cylBlock.receiveShadow = !isSoftwareGl;
  engineBlockGroup.add(cylBlock);

  // External block structural stiffening ribs (4 cylinders)
  for (let c = 0; c < 4; c++) {
    const rib = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(2.68, 0.95, 0.14)),
      castAluminumMat
    );
    rib.position.set(0, 1.5, -1.5 + c * 1.0);
    engineBlockGroup.add(rib);
  }

  // Aluminum Cylinder Head
  const cylHead = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.75, 0.72, 4.55)),
    castAluminumMat
  );
  cylHead.position.set(0, 2.7, 0);
  cylHead.castShadow = !isSoftwareGl;
  engineBlockGroup.add(cylHead);

  // Black DOHC 16V Valve Cover with 4 COP Spark Wells + Billet Oil Cap
  const valveCover = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.38, 0.44, 4.3)),
    nylonPolymerMat
  );
  valveCover.position.set(0, 3.28, 0);
  valveCover.castShadow = !isSoftwareGl;
  engineBlockGroup.add(valveCover);

  // 4 Coil Wells along center of DOHC valve cover
  for (let c = 0; c < 4; c++) {
    const well = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.24, 0.26, 0.16, 16)),
      darkAnodizedMat
    );
    well.position.set(0, 3.55, -1.45 + c * 0.96);
    engineBlockGroup.add(well);
  }

  const oilCap = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16)),
    brassMat
  );
  oilCap.position.set(0.75, 3.56, 1.55);
  engineBlockGroup.add(oilCap);

  // Brushed Aluminum 4-Runner Intake Manifold (+X side facing ECU bench)
  const intakePlenum = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 3.9, 18)),
    castAluminumMat
  );
  intakePlenum.rotation.x = Math.PI / 2;
  intakePlenum.position.set(1.85, 2.45, 0);
  intakePlenum.castShadow = !isSoftwareGl;
  engineBlockGroup.add(intakePlenum);

  for (let r = 0; r < 4; r++) {
    const runner = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.95, 14)),
      castAluminumMat
    );
    runner.rotation.z = Math.PI / 2;
    runner.position.set(1.42, 2.55, -1.45 + r * 0.96);
    engineBlockGroup.add(runner);
  }

  // Front Accessory Drive Pulleys (Crank, Cam, Alternator) + Serpentine Belt (+Z front face)
  const makePulley = (radius: number, x: number, y: number, z: number): THREE.Group => {
    const pg = new THREE.Group();
    pg.position.set(x, y, z);
    const disc = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(radius, radius, 0.22, 24)),
      darkAnodizedMat
    );
    disc.rotation.x = Math.PI / 2;
    pg.add(disc);
    // Spoke cross so rotation is unmistakably visible
    const spoke = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(radius * 1.5, 0.08, 0.25)),
      castAluminumMat
    );
    pg.add(spoke);
    const bolt = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 6)),
      brassMat
    );
    bolt.rotation.x = Math.PI / 2;
    pg.add(bolt);
    engineBlockGroup.add(pg);
    return pg;
  };

  const engineCrankPulley = makePulley(0.62, 0, 1.15, 2.38);
  const engineCamPulley = makePulley(0.46, 0, 2.85, 2.38);
  const engineAltPulley = makePulley(0.32, 1.32, 1.85, 2.38);

  // Alternator housing behind alt pulley
  const altBody = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.72, 18)),
    castAluminumMat
  );
  altBody.rotation.x = Math.PI / 2;
  altBody.position.set(1.32, 1.85, 1.72);
  engineBlockGroup.add(altBody);

  // Serpentine belt loop around Crank -> Cam -> Alt
  const beltCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.52, 1.15, 2.38),
      new THREE.Vector3(-0.42, 2.85, 2.38),
      new THREE.Vector3(0.42, 2.85, 2.38),
      new THREE.Vector3(1.56, 1.85, 2.38),
      new THREE.Vector3(0.48, 0.72, 2.38),
    ],
    true
  );
  const beltMesh = new THREE.Mesh(
    reg.trackGeo(new THREE.TubeGeometry(beltCurve, 32, 0.065, 8, true)),
    darkRubberMat
  );
  engineBlockGroup.add(beltMesh);

  // Engine Block ground strap routing visually toward bench Engine Ground G2
  const engineStrapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.25, 0.65, 2.1),
    new THREE.Vector3(2.8, 0.2, 3.2),
    new THREE.Vector3(6.2, 0.12, 4.7),
  ]);
  const engineStrap = new THREE.Mesh(
    reg.trackGeo(new THREE.TubeGeometry(engineStrapCurve, 18, 0.055, 8, false)),
    darkRubberMat
  );
  engineBlockGroup.add(engineStrap);

  // 12b. Live Diagnostic Wire-Mesh Fault Overlay over 4-Cylinder DOHC Engine Block
  // Highlights MNA electrical faults (injector open/short, coil short/open, sensor bus, ground strap)
  const faultOverlayGroup = new THREE.Group();
  faultOverlayGroup.renderOrder = 4;

  const makeWireMeshMat = (colorHex: number, opacity: number) =>
    reg.trackMat(
      new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );

  // Outer DOHC block & head wireframe diagnostic cage (zero Z-fighting offset +0.08)
  const blockShellMat = makeWireMeshMat(0x38bdf8, 0.2);
  const blockShellWire = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.74, 1.82, 4.62, 4, 3, 6)),
    blockShellMat
  );
  blockShellWire.position.set(0, 1.54, 0);
  faultOverlayGroup.add(blockShellWire);

  const headShellWire = new THREE.Mesh(
    reg.trackGeo(new THREE.BoxGeometry(2.88, 0.84, 4.68, 4, 2, 6)),
    blockShellMat
  );
  headShellWire.position.set(0, 2.72, 0);
  faultOverlayGroup.add(headShellWire);

  // 4x Cylinder Injector Port Wire-Mesh Sleeves along Intake Manifold Runners
  const injectorWireMats: THREE.MeshBasicMaterial[] = [];
  for (let c = 0; c < 4; c++) {
    const cylNum = (c + 1) as 1 | 2 | 3 | 4;
    const mat = makeWireMeshMat(0x38bdf8, 0.34);
    const sleeve = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.27, 0.27, 1.04, 10, 2, true)),
      mat
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(1.42, 2.55, -1.45 + c * 0.96);
    faultOverlayGroup.add(sleeve);

    // Pickable zone on engine block runner for direct fault inspection
    const injZoneHit = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(1.05, 0.56, 0.56)),
      invisiblePickMat
    );
    injZoneHit.position.set(1.42, 2.55, -1.45 + c * 0.96);
    injZoneHit.layers.set(1);
    injZoneHit.userData.pickMeta = {
      kind: 'injector',
      pinId: cylNum === 1 ? 'ecu-pin-10' : `ems-inj-${cylNum}`,
      cylinder: cylNum,
      label: `ENGINE BLOCK INJ #${cylNum}`,
      subtitle: `Cylinder ${cylNum} Intake Runner Fuel Injector Zone`,
    } satisfies PickTargetMeta;
    faultOverlayGroup.add(injZoneHit);
    pickables.push(injZoneHit);

    injectorWireMats.push(mat);
  }

  // 4x Cylinder COP Ignition Well Wire-Mesh Cages atop DOHC Valve Cover
  const coilWireMats: THREE.MeshBasicMaterial[] = [];
  for (let c = 0; c < 4; c++) {
    const cylNum = (c + 1) as 1 | 2 | 3 | 4;
    const mat = makeWireMeshMat(0x38bdf8, 0.36);
    const cage = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.35, 0.38, 0.54, 10, 2, true)),
      mat
    );
    cage.position.set(0, 3.68, -1.45 + c * 0.96);
    faultOverlayGroup.add(cage);

    const coilZoneHit = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 8)),
      invisiblePickMat
    );
    coilZoneHit.position.set(0, 3.68, -1.45 + c * 0.96);
    coilZoneHit.layers.set(1);
    coilZoneHit.userData.pickMeta = {
      kind: 'coil',
      pinId: cylNum === 1 ? 'ecu-pin-11' : `ems-coil-${cylNum}`,
      cylinder: cylNum,
      label: `ENGINE BLOCK COIL #${cylNum}`,
      subtitle: `Cylinder ${cylNum} DOHC Coil-on-Plug Well Zone`,
    } satisfies PickTargetMeta;
    faultOverlayGroup.add(coilZoneHit);
    pickables.push(coilZoneHit);

    coilWireMats.push(mat);
  }

  // Intake Plenum / Sensor Bus Wire-Mesh Sleeve (TPS / MAP / ECT / CKP)
  const sensorBusWireMat = makeWireMeshMat(0x22d3ee, 0.3);
  const sensorPlenumWire = new THREE.Mesh(
    reg.trackGeo(new THREE.CylinderGeometry(0.51, 0.51, 4.02, 12, 4, true)),
    sensorBusWireMat
  );
  sensorPlenumWire.rotation.x = Math.PI / 2;
  sensorPlenumWire.position.set(1.85, 2.45, 0);
  faultOverlayGroup.add(sensorPlenumWire);

  // Engine Block Ground Strap Wire-Mesh Sleeve (SGND / G2 Ground Continuity)
  const groundStrapWireMat = makeWireMeshMat(0x22c55e, 0.32);
  const groundStrapWire = new THREE.Mesh(
    reg.trackGeo(new THREE.TubeGeometry(engineStrapCurve, 18, 0.11, 8, false)),
    groundStrapWireMat
  );
  faultOverlayGroup.add(groundStrapWire);

  engineBlockGroup.add(faultOverlayGroup);
  const engineBlockFaultOverlay: EngineBlockFaultOverlayVisuals = {
    overlayGroup: faultOverlayGroup,
    blockShellMat,
    injectorWireMats,
    coilWireMats,
    sensorBusWireMat,
    groundStrapWireMat,
  };

  root.add(engineBlockGroup);

  // =========================================================================
  // 13. COMPLETE DEDICATED COLOR-CODED 3D EMS WIRING HARNESSES
  // =========================================================================
  // Ensure world matrices are current before reading anchor coordinates
  root.updateMatrixWorld(true);
  const getAnchorPos = (id: string, fallback: THREE.Vector3): THREE.Vector3 => {
    const a = pinAnchors.get(id);
    if (!a) return fallback.clone();
    const wp = new THREE.Vector3();
    a.pinTipMesh.getWorldPosition(wp);
    a.worldAnchor.copy(wp);
    return wp;
  };

  const pBattPos = getAnchorPos('ems-batt-pos', new THREE.Vector3(-7.8, 1.6, 3.2));
  const pBattNeg = getAnchorPos('ems-batt-neg', new THREE.Vector3(-6.3, 1.6, 3.2));
  const pG1 = getAnchorPos('chassis-gnd', new THREE.Vector3(-2.45, 0.35, 4.65));
  const pSgndBus = getAnchorPos('ems-sgnd-bus', new THREE.Vector3(0, 0.35, 4.65));
  const pG2 = getAnchorPos('ems-gnd-g2', new THREE.Vector3(2.45, 0.35, 4.65));
  const pEcuGnd1 = getAnchorPos('ecu-pin-1', new THREE.Vector3(-2.75, 0.68, 2.35));
  const pEcuGnd2 = getAnchorPos('ecu-pin-2', new THREE.Vector3(-2.35, 0.68, 2.35));
  const pEcuKl30 = getAnchorPos('ecu-pin-3', new THREE.Vector3(-1.95, 0.68, 2.35));
  const pEcuKl15 = getAnchorPos('ecu-pin-4', new THREE.Vector3(-1.55, 0.68, 2.35));
  const pEcuSgnd = getAnchorPos('ecu-pin-6', new THREE.Vector3(-0.75, 0.68, 2.35));
  const pEcuInj = getAnchorPos('ecu-pin-10', new THREE.Vector3(-2.35, 0.46, 2.35));
  const pEcuIgn = getAnchorPos('ecu-pin-11', new THREE.Vector3(-1.95, 0.46, 2.35));
  const pEcuMRelay = getAnchorPos('ecu-pin-12', new THREE.Vector3(-1.55, 0.46, 2.35));
  const pEcuFpRelay = getAnchorPos('ecu-pin-16', new THREE.Vector3(0.05, 0.46, 2.35));
  const pMain30 = getAnchorPos('relay-30', new THREE.Vector3(1.29, 0.62, 1.0));
  const pMain87 = getAnchorPos('relay-87', new THREE.Vector3(1.51, 0.62, 1.0));
  const pMain86 = getAnchorPos('relay-86', new THREE.Vector3(1.73, 0.62, 1.0));
  const pMain85 = getAnchorPos('relay-85', new THREE.Vector3(1.95, 0.62, 1.0));
  const pFp30 = getAnchorPos('ems-fp-30', new THREE.Vector3(2.63, 0.62, 1.0));
  const pFp87 = getAnchorPos('ems-fp-87', new THREE.Vector3(2.85, 0.62, 1.0));
  const pFp86 = getAnchorPos('ems-fp-86', new THREE.Vector3(3.07, 0.62, 1.0));
  const pFp85 = getAnchorPos('ems-fp-85', new THREE.Vector3(3.29, 0.62, 1.0));
  const pFuelPos = getAnchorPos('ems-fuel-pump-pos', new THREE.Vector3(6.25, 2.15, 1.33));
  const pFuelGnd = getAnchorPos('ems-fuel-pump-gnd', new THREE.Vector3(6.85, 2.15, 1.33));
  const pRailVbat = getAnchorPos('inj-vbat', new THREE.Vector3(-4.35, 1.7, -3.37));

  const fMain = fuseVisuals[0].worldAnchor;
  const fInj = fuseVisuals[1].worldAnchor;
  const fFuel = fuseVisuals[2].worldAnchor;
  const fCoil = fuseVisuals[3].worldAnchor;
  const fEcu = fuseVisuals[4].worldAnchor;
  const pIgnSw = new THREE.Vector3(-7.2, 0.65, 1.65);

  // --- Helper for clean orthogonal chassis-trunk routing (CHK-01: Zero crossed diagonals) ---
  const orthoPts = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    corridor: EfiTrunkCorridor,
    laneOffset = 0,
    bypassX?: number
  ): THREE.Vector3[] =>
    buildOrthogonalTrunkWaypoints(start, end, corridor, laneOffset, bypassX).map(
      (p) => new THREE.Vector3(p.x, p.y, p.z)
    );

  // --- Physical Corrugated Split-Loom Conduits & Instanced Virtual Zip-Ties ---
  const splitLoomMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.88,
      metalness: 0.08,
    })
  );
  const zipTieMat = reg.trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.45,
      metalness: 0.15,
    })
  );

  const trunkSpines: Array<{
    x0: number;
    x1: number;
    z: number;
    y: number;
    radius: number;
    stripeHex: number;
  }> = [
    // High-Current Power Trunk (KL30 / KL15 Red-Amber)
    {
      x0: -6.8,
      x1: 5.2,
      z: EFI_TRUNK_CORRIDORS.POWER_TRUNK.spineZ,
      y: EFI_TRUNK_CORRIDORS.POWER_TRUNK.spineY - 0.04,
      radius: 0.115,
      stripeHex: EFI_FUNCTIONAL_COLOR_STANDARD.CONSTANT_POWER_KL30.primaryHex,
    },
    // Dedicated Star-Ground Bus Conduit (Black / Brown SGND)
    {
      x0: -5.8,
      x1: 5.8,
      z: EFI_TRUNK_CORRIDORS.GROUND_BUS.spineZ,
      y: EFI_TRUNK_CORRIDORS.GROUND_BUS.spineY - 0.03,
      radius: 0.095,
      stripeHex: 0x94a3b8,
    },
    // High-Noise Actuator Driver Spine (Green Injectors / Violet Coils)
    {
      x0: -4.8,
      x1: 4.8,
      z: EFI_TRUNK_CORRIDORS.ACTUATOR_SPINE.spineZ,
      y: EFI_TRUNK_CORRIDORS.ACTUATOR_SPINE.spineY - 0.04,
      radius: 0.105,
      stripeHex: EFI_FUNCTIONAL_COLOR_STANDARD.ACTUATOR_DRIVERS.primaryHex,
    },
  ];

  const zipTiePositions: Array<{ x: number; y: number; z: number; scaleR: number }> = [];
  for (const spine of trunkSpines) {
    const length = spine.x1 - spine.x0;
    const midX = (spine.x0 + spine.x1) * 0.5;
    const conduit = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(spine.radius, spine.radius, length, 12, 1)),
      splitLoomMat
    );
    conduit.rotation.z = Math.PI / 2;
    conduit.position.set(midX, spine.y, spine.z);
    root.add(conduit);

    // Subtle color-coded EMI corridor identification tracer strip along conduit top
    const tracer = new THREE.Mesh(
      reg.trackGeo(new THREE.BoxGeometry(length, 0.014, 0.035)),
      reg.trackMat(
        new THREE.MeshStandardMaterial({
          color: spine.stripeHex,
          emissive: spine.stripeHex,
          emissiveIntensity: 0.18,
          roughness: 0.4,
        })
      )
    );
    tracer.position.set(midX, spine.y + spine.radius + 0.005, spine.z);
    root.add(tracer);

    for (let x = spine.x0 + 0.6; x <= spine.x1 - 0.4; x += 1.45) {
      zipTiePositions.push({ x, y: spine.y, z: spine.z, scaleR: spine.radius * 1.15 });
    }
  }

  const zipTieGeo = reg.trackGeo(new THREE.TorusGeometry(1.0, 0.14, 6, 14));
  const zipTiesInstanced = new THREE.InstancedMesh(zipTieGeo, zipTieMat, zipTiePositions.length);
  const _zipDummy = new THREE.Object3D();
  zipTiePositions.forEach((zt, idx) => {
    _zipDummy.position.set(zt.x, zt.y, zt.z);
    _zipDummy.rotation.set(0, Math.PI / 2, 0);
    _zipDummy.scale.set(zt.scaleR, zt.scaleR, zt.scaleR);
    _zipDummy.updateMatrix();
    zipTiesInstanced.setMatrixAt(idx, _zipDummy.matrix);
  });
  zipTiesInstanced.instanceMatrix.needsUpdate = true;
  zipTiesInstanced.computeBoundingSphere();
  root.add(zipTiesInstanced);

  const cKl30 = EFI_FUNCTIONAL_COLOR_STANDARD.CONSTANT_POWER_KL30.primaryHex;
  const cKl30Branch = EFI_FUNCTIONAL_COLOR_STANDARD.CONSTANT_POWER_KL30.secondaryHex;
  const cKl15 = EFI_FUNCTIONAL_COLOR_STANDARD.SWITCHED_IGNITION_KL15.primaryHex;
  const cKl15Sw = EFI_FUNCTIONAL_COLOR_STANDARD.SWITCHED_IGNITION_KL15.secondaryHex;
  const cInj = EFI_FUNCTIONAL_COLOR_STANDARD.ACTUATOR_DRIVERS.primaryHex; // Green
  const cCoil = EFI_FUNCTIONAL_COLOR_STANDARD.ACTUATOR_DRIVERS.secondaryHex; // Violet
  const cGnd = EFI_FUNCTIONAL_COLOR_STANDARD.CHASSIS_ECU_GROUND.primaryHex; // Black
  const cSgnd = EFI_FUNCTIONAL_COLOR_STANDARD.CHASSIS_ECU_GROUND.secondaryHex; // Brown

  // --- A. DEDICATED HEAVY-GAUGE RED +12V POWER TRUNK (KL30) ---
  addEmsWire(
    'ems-w-batt-fmain',
    orthoPts(pBattPos, fMain, 'POWER_TRUNK', -1.5),
    cKl30,
    0.052,
    'POWER_FUSES',
    'kl30',
    'ecu-pin-3',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-fmain-ign',
    [fMain, new THREE.Vector3(fMain.x, 0.42, pIgnSw.z), pIgnSw],
    cKl30,
    0.042,
    'POWER_FUSES',
    'kl30',
    'ecu-pin-3',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-fecu-kl30',
    orthoPts(fEcu, pEcuKl30, 'POWER_TRUNK', -0.6),
    cKl30,
    0.042,
    'POWER_FUSES',
    'kl30',
    'ecu-pin-3',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-fmain-mrelay30',
    orthoPts(fMain, pMain30, 'POWER_TRUNK', 0.2),
    cKl30Branch,
    0.044,
    'POWER_FUSES',
    'kl30',
    'relay-30',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-ffuel-fprelay30',
    orthoPts(fFuel, pFp30, 'POWER_TRUNK', 1.0),
    cKl30Branch,
    0.042,
    'FUEL_SYSTEM',
    'kl30',
    'ecu-pin-16',
    'POWER_TRUNK'
  );

  // --- B. SWITCHED IGNITION (KL15 YELLOW/ORANGE) & RELAY TRIGGERS ---
  addEmsWire(
    'ems-w-ign-kl15',
    orthoPts(pIgnSw, pEcuKl15, 'POWER_TRUNK', -2.0),
    cKl15,
    0.036,
    'POWER_FUSES',
    'kl15',
    'ecu-pin-4',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-ign-mrelay86',
    orthoPts(pEcuKl15, pMain86, 'POWER_TRUNK', -1.2),
    cKl15,
    0.032,
    'RELAYS',
    'kl15',
    'relay-86',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-ecu-mrelay85',
    orthoPts(pEcuMRelay, pMain85, 'POWER_TRUNK', -0.2),
    cKl15Sw,
    0.03,
    'RELAYS',
    'mrelay',
    'ecu-pin-12',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-mrelay87-fprelay86',
    [pMain87, new THREE.Vector3(pMain87.x, 0.36, 1.55), new THREE.Vector3(pFp86.x, 0.36, 1.55), pFp86],
    cKl15Sw,
    0.032,
    'RELAYS',
    'switched_rail',
    'relay-87',
    'POWER_TRUNK'
  );
  addEmsWire(
    'ems-w-ecu-fprelay85',
    orthoPts(pEcuFpRelay, pFp85, 'POWER_TRUNK', 0.6),
    cKl15Sw,
    0.03,
    'FUEL_SYSTEM',
    'fprelay',
    'ecu-pin-16',
    'POWER_TRUNK'
  );

  // --- C. FUEL PUMP RELAY 87 -> SUBMERGED FUEL PUMP (+12V SWITCHED) ---
  addEmsWire(
    'ems-w-fp87-pump',
    orthoPts(pFp87, pFuelPos, 'POWER_TRUNK', 1.6),
    cKl30,
    0.044,
    'FUEL_SYSTEM',
    'fuel_pump',
    'ecu-pin-16',
    'POWER_TRUNK'
  );

  // --- D. HIGH-NOISE ACTUATOR SPINE (GREEN INJECTORS / VIOLET COILS) ---
  addEmsWire(
    'ems-w-finj-rail',
    orthoPts(fInj, pRailVbat, 'ACTUATOR_SPINE', -1.6, -4.65),
    cKl15Sw,
    0.038,
    'INJ_COILS',
    'switched_rail',
    'ecu-pin-10',
    'ACTUATOR_SPINE'
  );
  addEmsWire(
    'ems-w-fcoil-coils',
    orthoPts(pMain87, new THREE.Vector3(4.5, 1.52, -3.55), 'ACTUATOR_SPINE', -1.0, 0.85),
    cKl15Sw,
    0.038,
    'INJ_COILS',
    'switched_rail',
    'ecu-pin-11',
    'ACTUATOR_SPINE'
  );

  // 4x Sequential Injector Control Lines (ECU -> Orthogonal Actuator Spine -> INJ 1..4 GREEN)
  injectors.forEach((inj, idx) => {
    const startPt = pEcuInj.clone().add(new THREE.Vector3(idx * 0.08, 0, 0));
    addEmsWire(
      `ems-w-inj-ctrl-${inj.cylinder}`,
      orthoPts(startPt, inj.terminalAnchor, 'ACTUATOR_SPINE', idx * 0.55 - 0.5, -3.95 - idx * 0.06),
      cInj,
      0.026,
      'INJ_COILS',
      'inj',
      'ecu-pin-10',
      'ACTUATOR_SPINE'
    );
  });

  // 4x Ignition Coil Control Lines (ECU -> Orthogonal Actuator Spine -> COIL 1..4 VIOLET)
  ignitionCoils.forEach((coil, idx) => {
    const startPt = pEcuIgn.clone().add(new THREE.Vector3(idx * 0.08, 0, 0));
    addEmsWire(
      `ems-w-coil-ctrl-${coil.cylinder}`,
      orthoPts(startPt, coil.terminalAnchor, 'ACTUATOR_SPINE', idx * 0.55 + 0.8, 0.52 + idx * 0.06),
      cCoil,
      0.026,
      'INJ_COILS',
      'coil',
      'ecu-pin-11',
      'ACTUATOR_SPINE'
    );
  });

  // --- E. STAR-TOPOLOGY CHASSIS GROUNDS (BLACK PGND) & ISOLATED SENSOR GROUND (BROWN SGND) ---
  addEmsWire(
    'ems-w-sgnd-ecu',
    orthoPts(pEcuSgnd, pSgndBus, 'GROUND_BUS', -1.4),
    cSgnd,
    0.032,
    'GROUNDS',
    'sgnd',
    'ecu-pin-6',
    'GROUND_BUS'
  );
  addEmsWire(
    'ems-w-batt-g1',
    orthoPts(pBattNeg, pG1, 'GROUND_BUS', -0.6),
    cGnd,
    0.05,
    'GROUNDS',
    'chassis_gnd',
    'chassis-gnd',
    'GROUND_BUS'
  );
  addEmsWire(
    'ems-w-ecu-g1',
    orthoPts(pEcuGnd1, pG1, 'GROUND_BUS', 0.2),
    cGnd,
    0.042,
    'GROUNDS',
    'chassis_gnd',
    'ecu-pin-1',
    'GROUND_BUS'
  );
  addEmsWire(
    'ems-w-ecu-g2',
    orthoPts(pEcuGnd2, pG2, 'GROUND_BUS', 0.9),
    cGnd,
    0.042,
    'GROUNDS',
    'chassis_gnd',
    'ecu-pin-2',
    'GROUND_BUS'
  );
  addEmsWire(
    'ems-w-g1-g2-bond',
    [pG1, new THREE.Vector3(pG1.x, 0.14, 5.05), new THREE.Vector3(pG2.x, 0.14, 5.05), pG2],
    0x111827,
    0.042,
    'GROUNDS',
    'chassis_gnd',
    'chassis-gnd',
    'GROUND_BUS'
  );
  addEmsWire(
    'ems-w-fuelpump-g2',
    orthoPts(pFuelGnd, pG2, 'GROUND_BUS', 1.5),
    cGnd,
    0.04,
    'GROUNDS',
    'chassis_gnd',
    'chassis-gnd',
    'GROUND_BUS'
  );

  // =========================================================================
  // 13B. INSTANCED LIVE CURRENT-FLOW ENERGY PULSE BEADS & FUEL TANK BUBBLES
  // =========================================================================
  const pulseCount = Math.max(48, emsHarnessWires.length * 3);
  const pulseBeadGeo = reg.trackGeo(new THREE.SphereGeometry(0.055, 8, 8));
  const pulseBeadMat = reg.trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    })
  );
  const currentFlowPulsesInstanced = new THREE.InstancedMesh(
    pulseBeadGeo,
    pulseBeadMat,
    pulseCount
  );
  currentFlowPulsesInstanced.frustumCulled = false;
  const _zeroScaleDummy = new THREE.Object3D();
  _zeroScaleDummy.scale.set(0.0001, 0.0001, 0.0001);
  _zeroScaleDummy.updateMatrix();
  for (let i = 0; i < pulseCount; i++) {
    currentFlowPulsesInstanced.setMatrixAt(i, _zeroScaleDummy.matrix);
    currentFlowPulsesInstanced.setColorAt(i, new THREE.Color(0x38bdf8));
  }
  currentFlowPulsesInstanced.instanceMatrix.needsUpdate = true;
  if (currentFlowPulsesInstanced.instanceColor) {
    currentFlowPulsesInstanced.instanceColor.needsUpdate = true;
  }
  root.add(currentFlowPulsesInstanced);

  const fuelBubbleCount = 18;
  const fuelBubbleGeo = reg.trackGeo(new THREE.SphereGeometry(0.05, 8, 8));
  const fuelBubbleMat = reg.trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.65,
    })
  );
  const fuelBubblesInstanced = new THREE.InstancedMesh(
    fuelBubbleGeo,
    fuelBubbleMat,
    fuelBubbleCount
  );
  fuelBubblesInstanced.frustumCulled = false;
  for (let i = 0; i < fuelBubbleCount; i++) {
    fuelBubblesInstanced.setMatrixAt(i, _zeroScaleDummy.matrix);
  }
  fuelBubblesInstanced.instanceMatrix.needsUpdate = true;
  root.add(fuelBubblesInstanced);

  // =========================================================================
  // 14. 3D DMM PROBE MARKERS (RED + AND BLACK -)
  // =========================================================================
  const buildProbeMesh = (collarColor: number): THREE.Group => {
    const g = new THREE.Group();
    const tip = new THREE.Mesh(
      reg.trackGeo(new THREE.ConeGeometry(0.028, 0.2, 12)),
      castAluminumMat
    );
    tip.rotation.x = Math.PI;
    tip.position.y = 0.1;
    g.add(tip);

    const flange = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 14)),
      darkAnodizedMat
    );
    flange.position.y = 0.21;
    g.add(flange);

    const sleeve = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.064, 0.048, 0.5, 14)),
      reg.trackMat(
        new THREE.MeshStandardMaterial({
          color: collarColor,
          roughness: 0.42,
          metalness: 0.12,
        })
      )
    );
    sleeve.position.y = 0.46;
    g.add(sleeve);

    const boot = new THREE.Mesh(
      reg.trackGeo(new THREE.CylinderGeometry(0.038, 0.05, 0.12, 12)),
      darkRubberMat
    );
    boot.position.y = 0.76;
    g.add(boot);

    return g;
  };

  const redProbeGroup = buildProbeMesh(0xef4444);
  const blackProbeGroup = buildProbeMesh(0x334155);
  root.add(redProbeGroup);
  root.add(blackProbeGroup);

  return {
    root,
    ecuLidGroup,
    ecuBoltsInstanced,
    ecuNameplateMat,
    tpsButterflyPivot,
    injectorPintle: primaryInjectorPintle,
    injectorSprayCone: primaryInjectorSprayCone,
    injectorSprayMat: primaryInjectorSprayMat,
    injectorPulseMat: primaryInjectorPulseMat,
    injectors,
    ignitionCoils,
    relayArmaturePivot: mainRelayRig.armaturePivot,
    relayCoilGlowMat: mainRelayRig.coilGlowMat,
    fuelRelayArmaturePivot: fuelRelayRig.armaturePivot,
    fuelRelayCoilGlowMat: fuelRelayRig.coilGlowMat,
    ignitionKeyPivot,
    ignitionRingMat,
    fuseVisuals,
    fuelPumpImpellerGroup,
    fuelPumpGlowMat,
    fuelFluidMat,
    fuelFeedLineMat,
    ectThermalRingMat,
    canStatusLedMat,
    crankWheelGroup,
    standaloneCrankBase,
    engineBlockGroup,
    engineBlockFaultOverlay,
    engineCrankPulley,
    engineCamPulley,
    engineAltPulley,
    sgndBusMat,
    g1StudMat,
    g2StudMat,
    redProbeGroup,
    blackProbeGroup,
    breakoutAnchorWorld,
    pinAnchors,
    mosfets,
    emsHarnessWires,
    currentFlowPulsesInstanced,
    fuelBubblesInstanced,
    pickables,
  };
}
