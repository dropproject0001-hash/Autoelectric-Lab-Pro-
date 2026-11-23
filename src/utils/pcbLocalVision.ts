import {
  ImageAnalysisComponent,
  ImageAnalysisHotspot,
  ImageAnalysisNet,
  ImageAnalysisPinSpec,
  ImageAnalysisResult,
  PcbNormalizedBox,
} from '../server/services/imageAnalysisTypes';

export interface LocalPcbCvOutput {
  components: ImageAnalysisComponent[];
  nets: ImageAnalysisNet[];
  hotspots: ImageAnalysisHotspot[];
  analysisSummary: string;
}

export function clampCoord(v: number, min = 0, max = 1000): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function clampBbox(box: PcbNormalizedBox, minSize = 16): PcbNormalizedBox {
  let ymin = clampCoord(box.ymin, 0, 1000 - minSize);
  let xmin = clampCoord(box.xmin, 0, 1000 - minSize);
  let ymax = clampCoord(box.ymax, ymin + minSize, 1000);
  let xmax = clampCoord(box.xmax, xmin + minSize, 1000);
  if (ymax - ymin < minSize) ymax = Math.min(1000, ymin + minSize);
  if (xmax - xmin < minSize) xmax = Math.min(1000, xmin + minSize);
  return { ymin, xmin, ymax, xmax };
}

export function computeBoxIoU(a: PcbNormalizedBox, b: PcbNormalizedBox): number {
  const xOverlap = Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin));
  const yOverlap = Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
  const intersection = xOverlap * yOverlap;
  if (intersection <= 0) return 0;
  const areaA = Math.max(1, (a.xmax - a.xmin) * (a.ymax - a.ymin));
  const areaB = Math.max(1, (b.xmax - b.xmin) * (b.ymax - b.ymin));
  return intersection / (areaA + areaB - intersection);
}

export function getBoxCenter(box: PcbNormalizedBox): { x: number; y: number } {
  return {
    x: Math.round((box.xmin + box.xmax) / 2),
    y: Math.round((box.ymin + box.ymax) / 2),
  };
}

/**
 * Deterministic client-side computer vision pass over a PCB photo canvas/image.
 * Downsamples to a compact 320x240 buffer, extracts:
 * 1) Dark IC package & high-contrast SMD component bounding boxes (0..1000)
 * 2) Trace-ridge / solder-pad connectivity skeleton lines (0..1000)
 * 3) Thermal scorch / burn and copper oxidation fault hotspots (0..1000)
 * Always frees temporary offscreen canvas backing memory before returning.
 */
export function runLocalPcbCv(
  source: HTMLImageElement | HTMLCanvasElement,
  gridW = 320,
  gridH = 240
): LocalPcbCvOutput {
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;
  if (!srcW || !srcH) {
    return {
      components: [],
      nets: [],
      hotspots: [],
      analysisSummary: 'Local CV skipped: image dimensions unavailable.',
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = gridW;
  canvas.height = gridH;

  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        components: [],
        nets: [],
        hotspots: [],
        analysisSummary: 'Local CV skipped: 2D context unavailable.',
      };
    }

    ctx.drawImage(source, 0, 0, gridW, gridH);
    const { data } = ctx.getImageData(0, 0, gridW, gridH);

    // Precompute luminance & edge energy maps
    const totalPixels = gridW * gridH;
    const lum = new Float32Array(totalPixels);
    const burnScore = new Uint8Array(totalPixels);
    const oxScore = new Uint8Array(totalPixels);

    let lumSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = yVal;
      lumSum += yVal;

      // Thermal scorch / carbonized solder: very low brightness with warm charred brown/amber edge or soot matte
      if (yVal < 46 && r >= b && r - b >= 8 && g < 65) {
        burnScore[i] = 1;
      }
      // Copper / flux oxidation: pale chalky cyan/green-white crystalline crust
      if (g > 135 && b > 125 && r < g - 22 && Math.abs(g - b) < 35) {
        oxScore[i] = 1;
      }
    }

    const meanLum = lumSum / totalPixels;
    let lumSqDiff = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = lum[i] - meanLum;
      lumSqDiff += diff * diff;
    }
    const lumStdDev = Math.sqrt(lumSqDiff / totalPixels);

    // Anti-fabrication guard: blank/solid/low-contrast images yield zero invented parts or nets
    if (lumStdDev < 8) {
      return {
        components: [],
        nets: [],
        hotspots: [],
        analysisSummary:
          'Anti-fabrication guard: Image lacks sufficient contrast (blank or uniform surface). Zero components or traces invented.',
      };
    }

    // 40x30 coarse macro-grid (each cell = 8x8 px) for fast connected-component clustering
    const cellSize = 8;
    const cols = Math.floor(gridW / cellSize); // 40
    const rows = Math.floor(gridH / cellSize); // 30
    const compGrid = new Uint8Array(cols * rows);
    const burnGrid = new Uint8Array(cols * rows);
    const oxGrid = new Uint8Array(cols * rows);
    const traceGrid = new Uint8Array(cols * rows);

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let darkCount = 0;
        let brightPadCount = 0;
        let edgeAccum = 0;
        let burnCount = 0;
        let oxCount = 0;

        for (let py = 0; py < cellSize; py++) {
          const y = cy * cellSize + py;
          for (let px = 0; px < cellSize; px++) {
            const x = cx * cellSize + px;
            const idx = y * gridW + x;
            const val = lum[idx];
            if (val < Math.min(72, meanLum * 0.58)) darkCount++;
            if (val > Math.max(175, meanLum * 1.38)) brightPadCount++;
            if (burnScore[idx]) burnCount++;
            if (oxScore[idx]) oxCount++;

            if (x > 0 && y > 0 && x < gridW - 1 && y < gridH - 1) {
              const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
              const gy = Math.abs(lum[idx + gridW] - lum[idx - gridW]);
              edgeAccum += gx + gy;
            }
          }
        }

        const cellIdx = cy * cols + cx;
        const avgEdge = edgeAccum / (cellSize * cellSize);
        // Component candidates: either dark IC body with sharp perimeter edges OR dense SMD solder-pad cluster
        if ((darkCount >= 22 && avgEdge > 24) || (brightPadCount >= 18 && avgEdge > 38)) {
          compGrid[cellIdx] = 1;
        }
        // Copper trace ridges: moderate-to-high directional edges without full dark IC mass
        if (avgEdge > 28 && darkCount < 45) {
          traceGrid[cellIdx] = 1;
        }
        if (burnCount >= 10) burnGrid[cellIdx] = 1;
        if (oxCount >= 10) oxGrid[cellIdx] = 1;
      }
    }

    // BFS connected-region extractor on the 40x30 grid
    const extractRegions = (grid: Uint8Array, minCells: number, maxCells: number) => {
      const visited = new Uint8Array(cols * rows);
      const regions: { minX: number; minY: number; maxX: number; maxY: number; area: number }[] = [];
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const start = y * cols + x;
          if (!grid[start] || visited[start]) continue;

          const queue: [number, number][] = [[x, y]];
          visited[start] = 1;
          let minX = x;
          let maxX = x;
          let minY = y;
          let maxY = y;
          let area = 0;

          while (queue.length > 0) {
            const [cx, cy] = queue.pop()!;
            area++;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            for (const [dx, dy] of dirs) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
              const nIdx = ny * cols + nx;
              if (grid[nIdx] && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push([nx, ny]);
              }
            }
          }

          if (area >= minCells && area <= maxCells) {
            regions.push({ minX, minY, maxX: maxX + 1, maxY: maxY + 1, area });
          }
        }
      }
      return regions;
    };

    const compRegions = extractRegions(compGrid, 2, 160)
      .sort((a, b) => b.area - a.area)
      .slice(0, 18);

    const components: ImageAnalysisComponent[] = [];
    let icCount = 0;
    let smdCount = 0;

    for (const reg of compRegions) {
      const bbox = clampBbox({
        ymin: (reg.minY / rows) * 1000,
        xmin: (reg.minX / cols) * 1000,
        ymax: (reg.maxY / rows) * 1000,
        xmax: (reg.maxX / cols) * 1000,
      });

      const w = bbox.xmax - bbox.xmin;
      const h = bbox.ymax - bbox.ymin;
      const boxArea = w * h;
      const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));

      let refDes = '';
      let category = 'UNIDENTIFIED_SMD';
      let packageType = 'Unverified SMD cluster';
      let circuitFunction = 'Contrast-detected surface-mount region (marking not readable by local CV)';

      if (boxArea >= 8000 && aspect < 2.2) {
        icCount++;
        refDes = `U${icCount}`;
        category = 'UNVERIFIED_IC_PACKAGE';
        packageType = 'Unverified IC-sized footprint';
        circuitFunction = 'IC-sized dark package outline detected; verify actual part number with Macro Crop';
      } else if (aspect >= 2.2 && boxArea >= 2500) {
        smdCount++;
        refDes = `X${smdCount}`;
        category = 'UNVERIFIED_ELONGATED_SMD';
        packageType = 'Unverified elongated SMD';
        circuitFunction = 'Elongated 2-terminal SMD outline; electrical type unverified until inspected';
      } else {
        smdCount++;
        refDes = `C${smdCount}`;
        category = 'UNVERIFIED_SMD_CLUSTER';
        packageType = 'Unverified passive-sized cluster';
        circuitFunction = 'Small SMD pad/body cluster detected; component type & value unverified';
      }

      const pinCount = category === 'UNVERIFIED_IC_PACKAGE' ? 4 : 2;
      const pinSpecs: ImageAnalysisPinSpec[] = Array.from({ length: pinCount }, (_, idx) => ({
        pinNumber: idx + 1,
        pinName: `PAD_${idx + 1}`,
        category: 'signal_in',
        nominalVoltage: 0.0,
        connectedNetId: 'NET_UNASSIGNED',
        notes: 'Contrast-only pad placeholder — voltage & net unverified; never assume power/ground without DMM.',
      }));

      components.push({
        refDes,
        category,
        marking: 'UNREADABLE',
        decodedValue: 'Unverified contrast cluster (Macro Crop required)',
        packageType,
        bbox,
        confidenceScore: 0.42,
        verificationStatus: 'UNKNOWN',
        circuitFunction,
        terminalIds: pinSpecs.map((p) => `${refDes}-P${p.pinNumber}`),
        operatingVoltageRange: 'UNKNOWN',
        maxCurrentRating: 'UNKNOWN',
        datasheetSummary:
          'Detected via local contrast grid only. Markings, voltage rails, and current ratings are intentionally withheld until verified.',
        pinSpecs,
        source: 'LOCAL_CV',
      });
    }

    // Build local trace candidates ONLY where trace-ridge cells physically exist between components (never fabricate rails)
    const nets: ImageAnalysisNet[] = [];
    if (components.length >= 2) {
      const sorted = [...components].sort((a, b) => a.bbox.xmin - b.bbox.xmin);
      const maxLinks = Math.min(8, sorted.length - 1);
      let traceNum = 1;
      for (let i = 0; i < maxLinks; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const ca = getBoxCenter(a.bbox);
        const cb = getBoxCenter(b.bbox);

        const midX = Math.round((ca.x + cb.x) / 2);
        const q1X = Math.round((ca.x + midX) / 2);
        const q3X = Math.round((cb.x + midX) / 2);
        const samplePoints = [
          { x: midX, y: Math.round((ca.y + cb.y) / 2) },
          { x: q1X, y: ca.y },
          { x: q3X, y: cb.y },
        ];
        const hasRidge = samplePoints.some((pt) => {
          const cx = Math.min(cols - 1, Math.max(0, Math.floor((pt.x / 1000) * cols)));
          const cy = Math.min(rows - 1, Math.max(0, Math.floor((pt.y / 1000) * rows)));
          return traceGrid[cy * cols + cx] === 1;
        });

        if (!hasRidge) continue;
        const netName = `NET_UNVERIFIED_TRACE_${traceNum++}`;
        nets.push({
          name: netName,
          signalType: 'UNVERIFIED_CONTINUITY',
          connectedComponentRefs: [a.refDes, b.refDes],
          connectedTerminalIds: [`${a.refDes}-P1`, `${b.refDes}-P1`],
          tracePoints: [
            { x: ca.x, y: ca.y },
            { x: midX, y: ca.y },
            { x: midX, y: cb.y },
            { x: cb.x, y: cb.y },
          ],
          confidenceScore: 0.42,
          verificationStatus: 'UNKNOWN',
          isComplete: false,
          incompleteNotes:
            'Local contrast edge ridge only — electrical continuity and rail identity unverified; confirm with DMM.',
        });
      }
    }

    // Extract Thermal Scorch & Copper Oxidation Hotspots
    const hotspots: ImageAnalysisHotspot[] = [];
    const burnRegions = extractRegions(burnGrid, 1, 80).slice(0, 5);
    burnRegions.forEach((reg, idx) => {
      const bbox = clampBbox({
        ymin: (reg.minY / rows) * 1000,
        xmin: (reg.minX / cols) * 1000,
        ymax: (reg.maxY / rows) * 1000,
        xmax: (reg.maxX / cols) * 1000,
      });
      const nearComp = components.find((c) => computeBoxIoU(c.bbox, bbox) > 0.08);
      hotspots.push({
        id: `cv-burn-${idx + 1}`,
        label: 'Thermal Scorch / Carbonized Zone',
        severity: 'CRITICAL',
        bbox,
        suspectComponentRef: nearComp?.refDes,
        notes: 'Local CV detected dark charred solder mask surrounded by warm heat-discoloration halo. Inspect for shorted driver or overheated regulator.',
        source: 'LOCAL_CV',
      });
    });

    const oxRegions = extractRegions(oxGrid, 2, 80).slice(0, 5);
    oxRegions.forEach((reg, idx) => {
      const bbox = clampBbox({
        ymin: (reg.minY / rows) * 1000,
        xmin: (reg.minX / cols) * 1000,
        ymax: (reg.maxY / rows) * 1000,
        xmax: (reg.maxX / cols) * 1000,
      });
      const nearComp = components.find((c) => computeBoxIoU(c.bbox, bbox) > 0.08);
      hotspots.push({
        id: `cv-ox-${idx + 1}`,
        label: 'Oxidation / Residue Anomaly',
        severity: 'WARNING',
        bbox,
        suspectComponentRef: nearComp?.refDes,
        notes: 'Local CV detected chalky green/cyan residue consistent with moisture ingress or flux corrosion around pads.',
        source: 'LOCAL_CV',
      });
    });

    return {
      components,
      nets,
      hotspots,
      analysisSummary: `Local CV mapped ${components.length} part clusters, ${nets.length} trace paths, and ${hotspots.length} physical anomaly zones.`,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Combines AI vision extraction (gemini-4-hydrogen) with local browser CV trace & hotspot analysis.
 * Ensures pinSpecs synchronize properly with detected nets and preserves AI semantic intelligence.
 */
export function fusePcbVisionResults(
  aiResult: ImageAnalysisResult | null,
  localCv: LocalPcbCvOutput
): ImageAnalysisResult {
  const aiRejectedAsBlankOrNonPcb = Boolean(
    aiResult &&
      aiResult.detectionMethod === 'AI_ANALYZED' &&
      aiResult.components.length === 0 &&
      aiResult.confidenceScore <= 0.2
  );
  if (aiRejectedAsBlankOrNonPcb) {
    return {
      documentType: aiResult?.documentType || 'pcb',
      confidenceScore: aiResult!.confidenceScore,
      detectionMethod: 'AI_ANALYZED',
      analysisSummary:
        aiResult!.analysisSummary ||
        'Anti-fabrication guard: No legible PCB components or traces verified in this image.',
      components: [],
      terminals: [],
      nets: [],
      hotspots: [],
      warnings:
        aiResult!.warnings && aiResult!.warnings.length > 0
          ? aiResult!.warnings
          : ['Anti-fabrication guard: Image rejected as blank, blurry, or non-PCB; zero parts or nets invented.'],
      model: aiResult!.model,
      provider: aiResult!.provider,
    };
  }

  const aiHasComponents = Boolean(aiResult && aiResult.components && aiResult.components.length > 0);
  const baseComponents = aiHasComponents ? aiResult!.components : localCv.components;

  const existingRefs = new Set<string>();
  const normalizedComponents: ImageAnalysisComponent[] = baseComponents.map((comp, idx) => {
    let refDes = (comp.refDes || `PART${idx + 1}`).trim();
    while (existingRefs.has(refDes)) {
      refDes = `${refDes}_${idx + 1}`;
    }
    existingRefs.add(refDes);

    const bbox = clampBbox(comp.bbox);
    const pinSpecs: ImageAnalysisPinSpec[] =
      comp.pinSpecs && comp.pinSpecs.length > 0
        ? comp.pinSpecs.map((p, pIdx) => ({
            pinNumber: Number(p.pinNumber) || pIdx + 1,
            pinName: p.pinName || `PAD_${pIdx + 1}`,
            category: p.category || 'signal_in',
            nominalVoltage: Number.isFinite(Number(p.nominalVoltage)) ? Number(p.nominalVoltage) : 0,
            connectedNetId: p.connectedNetId || 'NET_UNASSIGNED',
            notes: p.notes || 'Mapped by AI/CV fusion.',
          }))
        : (comp.terminalIds && comp.terminalIds.length > 0 ? comp.terminalIds : []).map(
            (term, pIdx) => ({
              pinNumber: pIdx + 1,
              pinName: term,
              category: 'signal_in' as const,
              nominalVoltage: 0.0,
              connectedNetId: 'NET_UNASSIGNED',
              notes: 'Terminal placeholder — voltage & net unassigned until verified.',
            })
          );

    return {
      ...comp,
      refDes,
      bbox,
      verificationStatus: comp.verificationStatus || 'UNKNOWN',
      pinSpecs,
      source: comp.source || (aiHasComponents ? 'AI' : 'LOCAL_CV'),
    };
  });

  // Supplement with non-overlapping local CV components only when AI found parts and didn't reject image
  if (aiHasComponents && localCv.components.length > 0) {
    let extraIndex = 1;
    for (const cvComp of localCv.components) {
      if (normalizedComponents.length >= 28) break;
      const overlaps = normalizedComponents.some((c) => computeBoxIoU(c.bbox, cvComp.bbox) > 0.18);
      if (!overlaps) {
        let refDes = `CV${extraIndex++}`;
        while (existingRefs.has(refDes)) refDes = `CV${extraIndex++}`;
        existingRefs.add(refDes);
        normalizedComponents.push({
          ...cvComp,
          refDes,
          source: 'LOCAL_CV',
        });
      }
    }
  }

  // Merge Nets only if components actually exist
  const rawNets: ImageAnalysisNet[] =
    normalizedComponents.length === 0
      ? []
      : aiResult && aiResult.nets && aiResult.nets.length > 0
      ? [...aiResult.nets]
      : [...localCv.nets];

  if (
    normalizedComponents.length > 0 &&
    aiResult &&
    aiResult.nets &&
    aiResult.nets.length < 3 &&
    localCv.nets.length > 0
  ) {
    for (const cvNet of localCv.nets) {
      if (!rawNets.some((n) => n.name === cvNet.name)) {
        rawNets.push(cvNet);
      }
    }
  }

  // Synchronize component pinSpecs with net connectedComponentRefs without fabricating geometry
  const netByName = new Map<string, ImageAnalysisNet>();
  for (const net of rawNets) {
    const cleanPoints = (net.tracePoints || []).map((pt) => ({
      x: clampCoord(pt.x),
      y: clampCoord(pt.y),
    }));
    const validConnectedRefs = Array.from(
      new Set((net.connectedComponentRefs || []).filter((ref) => existingRefs.has(ref)))
    );

    const hasObservedGeometry = cleanPoints.length >= 2;
    let finalPoints = cleanPoints;
    if (!hasObservedGeometry && validConnectedRefs.length >= 2) {
      finalPoints = validConnectedRefs
        .map((ref) => normalizedComponents.find((c) => c.refDes === ref))
        .filter((c): c is ImageAnalysisComponent => Boolean(c))
        .map((c) => getBoxCenter(c.bbox));
    }

    if (finalPoints.length < 2 && validConnectedRefs.length < 2) {
      continue;
    }

    const sanitizedNet: ImageAnalysisNet = {
      ...net,
      tracePoints: finalPoints,
      connectedComponentRefs: validConnectedRefs,
      isComplete: hasObservedGeometry && Boolean(net.isComplete),
      ...(!hasObservedGeometry
        ? {
            verificationStatus: 'UNKNOWN',
            incompleteNotes: 'Copper path not observed; straight center link is unverified.',
          }
        : {}),
    };
    netByName.set(sanitizedNet.name, sanitizedNet);
  }

  for (const comp of normalizedComponents) {
    for (const pin of comp.pinSpecs || []) {
      if (pin.connectedNetId && pin.connectedNetId !== 'NET_UNASSIGNED') {
        const net = netByName.get(pin.connectedNetId);
        if (net && !net.connectedComponentRefs.includes(comp.refDes)) {
          net.connectedComponentRefs.push(comp.refDes);
        }
      } else {
        const matchingNet = Array.from(netByName.values()).find((n) =>
          n.connectedComponentRefs.includes(comp.refDes)
        );
        if (matchingNet) {
          pin.connectedNetId = matchingNet.name;
        }
      }
    }
  }

  // Merge Hotspots (AI + Local CV deduplicated)
  const mergedHotspots: ImageAnalysisHotspot[] = [];
  const candidateHotspots =
    normalizedComponents.length === 0 ? aiResult?.hotspots || [] : [...(aiResult?.hotspots || []), ...localCv.hotspots];
  for (const h of candidateHotspots) {
    const clampedBox = clampBbox(h.bbox, 12);
    const duplicate = mergedHotspots.some((existing) => computeBoxIoU(existing.bbox, clampedBox) > 0.35);
    if (!duplicate) {
      const suspect =
        (h.suspectComponentRef && existingRefs.has(h.suspectComponentRef) ? h.suspectComponentRef : undefined) ||
        normalizedComponents.find((c) => computeBoxIoU(c.bbox, clampedBox) > 0.08)?.refDes;
      mergedHotspots.push({
        ...h,
        bbox: clampedBox,
        suspectComponentRef: suspect,
      });
    }
  }

  const finalNets = Array.from(netByName.values());
  const warnings = [...(aiResult?.warnings || [])];
  if (normalizedComponents.length === 0 && warnings.length === 0) {
    warnings.push(
      'Anti-fabrication guard: Image yielded no verified components or copper traces.'
    );
  }

  return {
    documentType: aiResult?.documentType || 'pcb',
    confidenceScore:
      normalizedComponents.length === 0
        ? 0.1
        : aiHasComponents
        ? aiResult!.confidenceScore
        : 0.45,
    detectionMethod: aiHasComponents ? 'AI_ANALYZED' : 'MANUAL_ONLY',
    analysisSummary: aiHasComponents
      ? `${aiResult!.analysisSummary} (+ Local CV: ${mergedHotspots.length} hotspot(s))`
      : localCv.analysisSummary,
    components: normalizedComponents,
    terminals: aiResult?.terminals || [],
    nets: finalNets,
    hotspots: mergedHotspots,
    warnings,
    model: aiResult?.model || 'local-cv-sobel-v1',
    provider: aiHasComponents ? `${aiResult!.provider}+local-cv` : 'local-cv',
  };
}

/**
 * Crops a normalized [0..1000] region from an image URL into a high-resolution JPEG base64 slice
 * AND runs local CV on the zoomed crop before releasing canvas memory.
 */
export async function cropPcbRegionToJpegBase64(
  imageUrl: string,
  regionBox: PcbNormalizedBox
): Promise<{ imageBase64: string; mimeType: string; localCv: LocalPcbCvOutput }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load PCB image for macro crop'));
    el.src = imageUrl;
  });

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const sx = Math.max(0, Math.floor((regionBox.xmin / 1000) * natW));
  const sy = Math.max(0, Math.floor((regionBox.ymin / 1000) * natH));
  const sw = Math.max(16, Math.min(natW - sx, Math.ceil(((regionBox.xmax - regionBox.xmin) / 1000) * natW)));
  const sh = Math.max(16, Math.min(natH - sy, Math.ceil(((regionBox.ymax - regionBox.ymin) / 1000) * natH)));

  const MAX_CROP_DIM = 1024;
  const scale = Math.min(2, MAX_CROP_DIM / Math.max(sw, sh));
  const outW = Math.max(32, Math.round(sw * scale));
  const outH = Math.max(32, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for macro crop');
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const localCv = runLocalPcbCv(canvas, 240, 180);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const imageBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { imageBase64, mimeType: 'image/jpeg', localCv };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Maps macro-crop [0..1000] detections back into full-board [0..1000] coordinates and merges them
 * with existing board components, nets, and hotspots without losing technician edits.
 */
export function mergeMacroCropResults(
  existing: {
    components: ImageAnalysisComponent[];
    nets: ImageAnalysisNet[];
    hotspots: ImageAnalysisHotspot[];
  },
  cropBox: PcbNormalizedBox,
  cropResult: ImageAnalysisResult
): {
  components: ImageAnalysisComponent[];
  nets: ImageAnalysisNet[];
  hotspots: ImageAnalysisHotspot[];
  addedCount: number;
  updatedCount: number;
} {
  const cropW = Math.max(1, cropBox.xmax - cropBox.xmin);
  const cropH = Math.max(1, cropBox.ymax - cropBox.ymin);

  const mapX = (lx: number) => clampCoord(cropBox.xmin + (lx / 1000) * cropW);
  const mapY = (ly: number) => clampCoord(cropBox.ymin + (ly / 1000) * cropH);
  const mapBox = (b: PcbNormalizedBox): PcbNormalizedBox =>
    clampBbox({
      ymin: mapY(b.ymin),
      xmin: mapX(b.xmin),
      ymax: mapY(b.ymax),
      xmax: mapX(b.xmax),
    });

  const nextComponents = [...existing.components];
  const usedRefs = new Set(nextComponents.map((c) => c.refDes));
  const refRenameMap = new Map<string, string>();
  let addedCount = 0;
  let updatedCount = 0;

  for (const rawComp of cropResult.components) {
    const boardBox = mapBox(rawComp.bbox);
    const matchIdx = nextComponents.findIndex((c) => computeBoxIoU(c.bbox, boardBox) > 0.42);

    if (matchIdx >= 0) {
      const prev = nextComponents[matchIdx];
      refRenameMap.set(rawComp.refDes, prev.refDes);
      nextComponents[matchIdx] = {
        ...prev,
        marking: rawComp.marking && rawComp.marking !== 'LOCAL-CV' ? rawComp.marking : prev.marking,
        decodedValue: rawComp.decodedValue || prev.decodedValue,
        packageType: rawComp.packageType || prev.packageType,
        circuitFunction: rawComp.circuitFunction || prev.circuitFunction,
        datasheetSummary: rawComp.datasheetSummary || prev.datasheetSummary,
        operatingVoltageRange: rawComp.operatingVoltageRange || prev.operatingVoltageRange,
        maxCurrentRating: rawComp.maxCurrentRating || prev.maxCurrentRating,
        pinSpecs: rawComp.pinSpecs && rawComp.pinSpecs.length >= (prev.pinSpecs?.length || 0) ? rawComp.pinSpecs : prev.pinSpecs,
        confidenceScore: Math.max(prev.confidenceScore, rawComp.confidenceScore),
      };
      updatedCount++;
    } else {
      let refDes = rawComp.refDes || `MC${nextComponents.length + 1}`;
      let suffix = 1;
      while (usedRefs.has(refDes)) {
        refDes = `${rawComp.refDes || 'MC'}_M${suffix++}`;
      }
      usedRefs.add(refDes);
      refRenameMap.set(rawComp.refDes, refDes);
      nextComponents.push({
        ...rawComp,
        refDes,
        bbox: boardBox,
      });
      addedCount++;
    }
  }

  const nextNets = [...existing.nets];
  for (const rawNet of cropResult.nets) {
    const mappedPoints = (rawNet.tracePoints || []).map((pt) => ({ x: mapX(pt.x), y: mapY(pt.y) }));
    const mappedRefs = rawNet.connectedComponentRefs.map((r) => refRenameMap.get(r) || r);
    const existingNetIdx = nextNets.findIndex((n) => n.name === rawNet.name);
    if (existingNetIdx >= 0) {
      const prev = nextNets[existingNetIdx];
      nextNets[existingNetIdx] = {
        ...prev,
        connectedComponentRefs: Array.from(new Set([...prev.connectedComponentRefs, ...mappedRefs])),
        tracePoints: prev.tracePoints.length >= 2 ? prev.tracePoints : mappedPoints,
      };
    } else if (mappedPoints.length >= 2) {
      nextNets.push({
        ...rawNet,
        name: nextNets.some((n) => n.name === rawNet.name) ? `${rawNet.name}_MACRO` : rawNet.name,
        connectedComponentRefs: mappedRefs,
        tracePoints: mappedPoints,
      });
    }
  }

  const nextHotspots = [...existing.hotspots];
  for (const h of cropResult.hotspots || []) {
    const mappedBox = mapBox(h.bbox);
    if (!nextHotspots.some((e) => computeBoxIoU(e.bbox, mappedBox) > 0.35)) {
      nextHotspots.push({
        ...h,
        id: `${h.id}-macro-${nextHotspots.length + 1}`,
        bbox: mappedBox,
        suspectComponentRef: h.suspectComponentRef ? refRenameMap.get(h.suspectComponentRef) || h.suspectComponentRef : undefined,
      });
    }
  }

  return {
    components: nextComponents,
    nets: nextNets,
    hotspots: nextHotspots,
    addedCount,
    updatedCount,
  };
}
