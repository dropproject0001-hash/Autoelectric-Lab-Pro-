import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../../utils/circuitSolver';
import {
  buildSignedClientDiagnosticEnvelope,
  generateSignedClientDiagnosticPdf,
  verifySignedClientDiagnosticToken,
} from '../../services/clientDiagnosticPdfService';
import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';

let passed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function main() {
  console.log('\n[Client Diagnostic Signed A4 PDF Suite]');

  const psu: PowerSupplyState = {
    isOutputEnabled: true,
    voltageSetting: 12.6,
    currentLimit: 3.0,
    preset: '12V_BENCH',
  };

  const multimeter: MultimeterState = {
    isPowered: true,
    mode: 'V_DC',
    rangeAuto: true,
    holdValue: false,
    redProbe: { attachedToPinId: 'ecu-pin-5', attachedLabel: 'Pin 5 (VREF_5V)' },
    blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'Pin 1 (KL31 GND)' },
  };

  const faults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-7',
      faultType: 'SHORT_TO_GND',
      description: 'TPS Signal shorted to chassis ground (simulated bench fault)',
      timestamp: 1763800000000,
    },
  ];

  const wires = DEFAULT_WIRES.map((w, idx) => (idx === 0 ? { ...w, isCut: true } : w));
  const circuitSolution = solveCircuit(psu, DEFAULT_ECU_PINS, faults, wires, DEFAULT_BENCH_COMPONENTS, multimeter);

  await runTest('1. buildSignedClientDiagnosticEnvelope produces deterministic 64-char SHA-256 digest over bench measurements & fault logs', async () => {
    const fixedTs = '2026-11-22T16:30:00.000Z';
    const envA = await buildSignedClientDiagnosticEnvelope({
      reportTitle: 'Toyota 1KD-FTV Bench Verification',
      clientName: 'R. Santos Auto Works',
      workOrderNumber: 'RO-20261122-07',
      vehicleInfo: '2019 Toyota Hilux 2.4L',
      ecuProfileLabel: 'Toyota Denso 1KD/2KD',
      technicianName: 'Master Tech A. Reyes',
      technicianNotes: 'Confirmed TPS short-to-ground on Pin 7 while 5V VREF remains stable.',
      powerSupply: psu,
      pins: DEFAULT_ECU_PINS,
      wires,
      faults,
      multimeter,
      circuitSolution,
      generatedAtIso: fixedTs,
    });

    const envB = await buildSignedClientDiagnosticEnvelope({
      reportTitle: 'Toyota 1KD-FTV Bench Verification',
      clientName: 'R. Santos Auto Works',
      workOrderNumber: 'RO-20261122-07',
      vehicleInfo: '2019 Toyota Hilux 2.4L',
      ecuProfileLabel: 'Toyota Denso 1KD/2KD',
      technicianName: 'Master Tech A. Reyes',
      technicianNotes: 'Confirmed TPS short-to-ground on Pin 7 while 5V VREF remains stable.',
      powerSupply: psu,
      pins: DEFAULT_ECU_PINS,
      wires,
      faults,
      multimeter,
      circuitSolution,
      generatedAtIso: fixedTs,
    });

    assert.match(envA.sha256Hash, /^[a-f0-9]{64}$/);
    assert.equal(envA.sha256Hash, envB.sha256Hash, 'Identical inputs must yield identical SHA-256 hash');
    assert.match(envA.reportId, /^RPT-20261122-[A-F0-9]{8}$/);
    assert.equal(envA.payload.pinMeasurements.length, DEFAULT_ECU_PINS.length);
    assert.ok(envA.payload.faultLogs.length >= 2, 'Fault logs must include injected fault and cut wire');
    assert.equal(envA.payload.measurementProvenance, 'SIMULATED_BENCH_WORKSTATION');
  });

  await runTest('2. generateSignedClientDiagnosticPdf renders valid A4 PDF bytes with vector pinout diagram, fault logs, and QR code', async () => {
    const out = await generateSignedClientDiagnosticPdf({
      reportTitle: 'Client ECU Bench Certificate',
      clientName: 'Manila Diesel & Auto Electric',
      workOrderNumber: 'RO-20261122-11',
      vehicleInfo: '2020 Mitsubishi Montero Sport',
      ecuProfileLabel: 'Mitsubishi 4N15 Bench Profile',
      technicianName: 'Lead Diagnostician',
      technicianNotes: 'Pin 7 short isolated; harness repair recommended before ECU reinstall.',
      powerSupply: psu,
      pins: DEFAULT_ECU_PINS,
      wires,
      faults,
      multimeter,
      circuitSolution,
      skipBrowserDownload: true,
    });

    assert.ok(out.filename.endsWith('.pdf'));
    assert.ok(out.pdfBytes.byteLength > 4000, `Expected substantial PDF output, got ${out.pdfBytes.byteLength} bytes`);
    const pdfHeader = new TextDecoder().decode(out.pdfBytes.slice(0, 8));
    assert.ok(pdfHeader.startsWith('%PDF-'), `Expected %PDF- header, got ${pdfHeader}`);
    assert.ok(out.pageCount >= 1);
    assert.ok(out.qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL must be generated');

    // Genuine verification check
    const genuine = await verifySignedClientDiagnosticToken(out.envelope.qrToken);
    assert.equal(genuine.valid, true);
    assert.equal(genuine.status, 'GENUINE');
    assert.equal(genuine.recomputedHash, out.envelope.sha256Hash);
  });

  await runTest('3. verifySignedClientDiagnosticToken rejects tampered client report payloads', async () => {
    const env = await buildSignedClientDiagnosticEnvelope({
      reportTitle: 'Tamper Check Report',
      ecuProfileLabel: 'Universal ECU Bench',
      powerSupply: psu,
      pins: DEFAULT_ECU_PINS,
      wires,
      faults,
      multimeter,
      circuitSolution,
    });

    // Forge payload segment while keeping original SHA-256 signature
    const [prefix, hash, payloadB64] = env.qrToken.split('|');
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    decoded.clientName = 'FORGED CLIENT NAME';
    const forgedB64 = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    const forgedToken = `${prefix}|${hash}|${forgedB64}`;

    const tampered = await verifySignedClientDiagnosticToken(forgedToken);
    assert.equal(tampered.valid, false);
    assert.equal(tampered.status, 'TAMPERED');

    const malformed = await verifySignedClientDiagnosticToken('INVALID|TOKEN');
    assert.equal(malformed.valid, false);
    assert.equal(malformed.status, 'INVALID_FORMAT');
  });

  await runTest('4. Diagnostic Report Studio (GoogleDocsModal.tsx) wires Print to PDF (Signed A4) and SHA-256 seal UI', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/GoogleDocsModal.tsx'),
      'utf8'
    );
    assert.ok(src.includes('generateSignedClientDiagnosticPdf'), 'Must call generateSignedClientDiagnosticPdf');
    assert.ok(src.includes('studio-print-to-pdf-btn'), 'Must render Print to PDF button');
    assert.ok(src.includes('Print to PDF (Signed A4)'), 'Must label Print to PDF button clearly');
    assert.ok(src.includes('studio-signed-pdf-seal'), 'Must display cryptographic SHA-256 verification seal');
  });

  await runTest('5. DiagnosticReportModal and GoogleDocsModal call all React hooks before any early return', () => {
    for (const relPath of [
      'src/components/DiagnosticReportModal.tsx',
      'src/components/GoogleDocsModal.tsx',
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      const guardIdx = src.indexOf('if (!isOpen');
      assert.ok(guardIdx > 0, `${relPath} must guard !isOpen`);
      const afterGuard = src.slice(guardIdx);
      const hookAfterGuardMatch = afterGuard.match(
        /\n\s*(?:const\s+[^=]+=\s*)?use(?:State|Effect|Memo|Callback|Ref|Context|Reducer|Id|TrialAccess|Auth)\s*\(/
      );
      assert.equal(
        hookAfterGuardMatch,
        null,
        `${relPath} calls a React hook after early return: ${hookAfterGuardMatch?.[0] ?? ''}`
      );
    }
  });

  console.log(`\n[Client Diagnostic Signed A4 PDF Suite] PASSED ${passed}/5 assertions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
