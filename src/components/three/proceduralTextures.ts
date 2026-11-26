/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import * as THREE from 'three';
import type { EmsEcuSyncProfile } from '../../simulation/telemetry/emsDigitalTwinSync';

export interface BenchTextureBundle {
  benchMatMap: THREE.CanvasTexture;
  carbonFiberMap: THREE.CanvasTexture;
  pcbAlbedoMap: THREE.CanvasTexture;
  brushedMetalRoughnessMap: THREE.CanvasTexture;
  connectorLegendMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  mainRelaySchematicMap: THREE.CanvasTexture;
  fuelRelaySchematicMap: THREE.CanvasTexture;
  fuseBlockLabelMap: THREE.CanvasTexture;
  batteryTopLabelMap: THREE.CanvasTexture;
  ecuNameplateMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable for procedural textures');
  }
  return [canvas, ctx];
}

function createBenchMatTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);

  // Matte dark charcoal ESD silicone mat base
  ctx.fillStyle = '#0e131b';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle matte elastomer speckle grain
  for (let i = 0; i < 4500; i++) {
    const x = (i * 73) % 1024;
    const y = (i * 137 + Math.floor(i / 14) * 19) % 1024;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Minor steel-gray 10mm calibration grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
  ctx.lineWidth = 1;
  const step = 32;
  for (let p = 0; p <= 1024; p += step) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(1024, p);
    ctx.stroke();
  }

  // Major 128px calibration grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1.5;
  for (let p = 0; p <= 1024; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(1024, p);
    ctx.stroke();
  }

  // Border framing & EMS bench zone markings
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.34)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 984, 984);

  // Subtle zone outlines matching Schematic Reference 1
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 620, 310, 355); // PDU zone (bottom-left)
  ctx.strokeRect(700, 560, 286, 415); // Fuel pump tank zone (right)

  ctx.fillStyle = 'rgba(148, 163, 184, 0.56)';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('AUTOMOTIVE ENGINE MANAGEMENT SYSTEM // 3D DIGITAL TWIN BENCH', 38, 54);
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = 'rgba(251, 191, 36, 0.62)';
  ctx.fillText('POWER DISTRIBUTION UNIT (PDU)', 48, 646);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.62)';
  ctx.fillText('FUEL PUMP MODULE & TANK', 714, 586);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.52)';
  ctx.fillText('SYSTEM GND (G1 / G2) & SENSOR GND (SGND)', 365, 976);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createCarbonFiberTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#151921';
  ctx.fillRect(0, 0, 256, 256);

  const cell = 16;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const diag = ((x / cell + y / cell) % 4 + 4) % 4;
      const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      if (diag < 2) {
        grad.addColorStop(0, '#2a313e');
        grad.addColorStop(0.5, '#191e27');
        grad.addColorStop(1, '#10141c');
      } else {
        grad.addColorStop(0, '#10141c');
        grad.addColorStop(0.5, '#252c38');
        grad.addColorStop(1, '#151921');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createPcbTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);

  // FR4 deep teal-emerald solder mask
  ctx.fillStyle = '#0a4a3c';
  ctx.fillRect(0, 0, 1024, 512);

  ctx.fillStyle = '#0d5b49';
  ctx.fillRect(28, 28, 968, 456);

  ctx.strokeStyle = '#d1fae5';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, 988, 476);

  ctx.strokeStyle = '#188f70';
  ctx.lineWidth = 5;
  for (let i = 0; i < 16; i++) {
    const y = 52 + i * 26;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(240 + (i % 4) * 32, y);
    ctx.lineTo(310 + (i % 3) * 28, y + (i < 8 ? 16 : -16));
    ctx.lineTo(680, y + (i < 8 ? 16 : -16));
    ctx.stroke();
  }

  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 22; col++) {
      const x = 48 + col * 43;
      const y = 44 + row * 38;
      if ((row + col) % 3 === 0) {
        ctx.fillStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#052e25';
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = '#ecfdf5';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('EMS MULTI-LAYER ENGINE ECU PCB REV 5.0', 42, 48);
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('U1: 32-BIT POWERTRAIN MCU', 355, 130);
  ctx.fillText('REG: 5.00V VREF / SGND', 140, 390);
  ctx.fillText('INJ / COIL / RELAY MOSFET DRIVERS', 585, 74);
  ctx.fillText('J1 MULTI-PLUG HEADER ->', 735, 466);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createBrushedMetalRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y++) {
    const tone = 98 + Math.floor(Math.sin(y * 0.45) * 20 + ((y * 37) % 34));
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.fillRect(0, y, 512, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createConnectorLegendTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 256);
  ctx.fillStyle = '#141820';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 1012, 244);

  const topPins = ['1 KL31', '2 KL31', '3 KL30', '4 KL15', '5 VREF', '6 SGND', '7 TPS', '8 MAP'];
  const botPins = ['9 ECT', '10 INJ1', '11 IGN1', '12 MRLY', '13 CANH', '14 CANL', '15 O2', '16 FPR'];

  ctx.font = 'bold 21px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < 8; i++) {
    const x = 64 + i * 128;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(topPins[i], x, 88);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(botPins[i], x, 194);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createRelaySchematicTexture(
  title: string,
  subtitle: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle recessed border
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, 472, 472);

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px monospace';
  ctx.fillText(title, 256, 82);
  ctx.fillStyle = '#bfdbfe';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(subtitle, 256, 118);

  // ISO 4-pin Relay internal schematic diagram
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 5;

  // Coil box (85 - 86)
  ctx.strokeRect(120, 232, 90, 56);
  ctx.beginPath();
  ctx.moveTo(120, 288);
  ctx.lineTo(210, 232);
  ctx.stroke();

  // Horizontal leads to 86 & 85
  ctx.beginPath();
  ctx.moveTo(165, 175);
  ctx.lineTo(165, 232);
  ctx.moveTo(165, 288);
  ctx.lineTo(165, 355);
  ctx.stroke();

  // Switch contact (30 - 87)
  ctx.beginPath();
  ctx.moveTo(340, 175);
  ctx.lineTo(340, 235);
  ctx.moveTo(340, 355);
  ctx.lineTo(340, 295);
  ctx.moveTo(340, 295);
  ctx.lineTo(372, 236);
  ctx.stroke();

  // Dashed magnetic link
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(215, 260);
  ctx.lineTo(335, 260);
  ctx.stroke();
  ctx.setLineDash([]);

  // ISO Pin numbers 85 / 86 / 87 / 30
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px monospace';
  ctx.fillText('85', 165, 164);
  ctx.fillText('86', 165, 408);
  ctx.fillText('87', 340, 164);
  ctx.fillText('30', 340, 408);

  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('WATERPROOF ISO 40A / 12V', 256, 466);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createFuseBlockLabelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 768);
  ctx.fillStyle = '#181e29';
  ctx.fillRect(0, 0, 512, 768);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 484, 740);

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('PDU FUSE BLOCK', 256, 68);

  const rows: [string, string, string][] = [
    ['F1 · 50A', 'MAIN BUS', '#ef4444'],
    ['F2 · 20A', 'INJECTORS', '#facc15'],
    ['F3 · 20A', 'FUEL PUMP', '#eab308'],
    ['F4 · 15A', 'IGN COILS', '#3b82f6'],
    ['F5 · 10A', 'ECU BATT', '#f97316'],
  ];

  rows.forEach(([amp, name, color], idx) => {
    const y = 138 + idx * 120;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(34, y - 34, 444, 92);
    ctx.fillStyle = color;
    ctx.fillRect(46, y - 22, 18, 68);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(amp, 84, y + 6);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(name, 84, y + 38);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createBatteryLabelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 320);
  ctx.fillStyle = '#161b24';
  ctx.fillRect(0, 0, 512, 320);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 484, 292);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 54px monospace';
  ctx.fillText('+', 46, 86);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('-', 428, 86);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('12V AGM BATTERY', 256, 152);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('KL30 PRIMARY POWER · 60Ah', 256, 200);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('DEDICATED CHASSIS GND (G1)', 256, 258);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createEcuNameplateTexture(
  profile: EmsEcuSyncProfile | null,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 640);

  // Dark anodized aluminum specification plate
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 640);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 480, 608);

  // Top manufacturer accent strip
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(28, 28, 456, 92);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('EMS ECU', 256, 94);

  const modelCode = profile?.modelCode || 'EMS-32-801';
  const brand = (profile?.brandLabel || 'UNIVERSAL 4-CYL EFI').toUpperCase().slice(0, 24);
  const modeTag =
    profile?.powertrainMode === 'DIESEL_CRDI' ? '4-CYL DIESEL CRDi' : '4-CYL GASOLINE EFI';
  const firingTag = `FIRING ORDER: ${(profile?.firingOrder || [1, 3, 4, 2]).join('-')}`;

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 38px monospace';
  ctx.fillText(modelCode.slice(0, 18), 256, 210);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(brand, 256, 266);

  // Divider
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 306);
  ctx.lineTo(464, 306);
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(modeTag, 256, 362);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(firingTag, 256, 412);

  // Sync status stamp
  const isVerified = profile?.verificationStatus === 'VERIFIED' || !profile;
  ctx.fillStyle = isVerified ? '#064e3b' : '#78350f';
  ctx.fillRect(58, 466, 396, 66);
  ctx.strokeStyle = isVerified ? '#10b981' : '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(58, 466, 396, 66);

  ctx.fillStyle = isVerified ? '#6ee7b7' : '#fde68a';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(isVerified ? 'DIGITAL TWIN SYNCED' : 'OCR VERIFY REQUIRED', 256, 508);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('12V KL30 / KL15 / SGND / CAN 500K', 256, 588);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.5, 'rgba(2, 6, 23, 0.34)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createBenchTextures(
  maxAnisotropy: number,
  initialProfile: EmsEcuSyncProfile | null = null
): BenchTextureBundle {
  const benchMatMap = createBenchMatTexture(maxAnisotropy);
  const carbonFiberMap = createCarbonFiberTexture(maxAnisotropy);
  const pcbAlbedoMap = createPcbTexture(maxAnisotropy);
  const brushedMetalRoughnessMap = createBrushedMetalRoughnessTexture(maxAnisotropy);
  const connectorLegendMap = createConnectorLegendTexture(maxAnisotropy);
  const contactShadowMap = createContactShadowTexture();
  const mainRelaySchematicMap = createRelaySchematicTexture(
    'MAIN RELAY',
    '12V SW · ECU + RAIL',
    maxAnisotropy
  );
  const fuelRelaySchematicMap = createRelaySchematicTexture(
    'FUEL RELAY',
    'FP_RELAY · 20A PUMP',
    maxAnisotropy
  );
  const fuseBlockLabelMap = createFuseBlockLabelTexture(maxAnisotropy);
  const batteryTopLabelMap = createBatteryLabelTexture(maxAnisotropy);
  const ecuNameplateMap = createEcuNameplateTexture(initialProfile, maxAnisotropy);

  return {
    benchMatMap,
    carbonFiberMap,
    pcbAlbedoMap,
    brushedMetalRoughnessMap,
    connectorLegendMap,
    contactShadowMap,
    mainRelaySchematicMap,
    fuelRelaySchematicMap,
    fuseBlockLabelMap,
    batteryTopLabelMap,
    ecuNameplateMap,
    dispose: () => {
      benchMatMap.dispose();
      carbonFiberMap.dispose();
      pcbAlbedoMap.dispose();
      brushedMetalRoughnessMap.dispose();
      connectorLegendMap.dispose();
      contactShadowMap.dispose();
      mainRelaySchematicMap.dispose();
      fuelRelaySchematicMap.dispose();
      fuseBlockLabelMap.dispose();
      batteryTopLabelMap.dispose();
      ecuNameplateMap.dispose();
    },
  };
}
