import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzePcbImage } from '../services/pcbImageAnalysisService';
import {
  ImageAnalysisComponent,
  ImageAnalysisHotspot,
  ImageAnalysisNet,
  ImageAnalysisPinSpec,
  ImageAnalysisResult,
  PcbNormalizedBox,
} from '../server/services/imageAnalysisTypes';
import {
  clampBbox,
  clampCoord,
  cropPcbRegionToJpegBase64,
  fusePcbVisionResults,
  getBoxCenter,
  LocalPcbCvOutput,
  mergeMacroCropResults,
  runLocalPcbCv,
} from '../utils/pcbLocalVision';
import {
  deletePcbScan,
  LOCAL_WORKSTATION_UID,
  SavedPcbScan,
  savePcbScan,
  subscribePcbScans,
} from '../services/benchStorageService';
import { formatCloudSyncError } from '../utils/cloudSyncErrorUtils';
import { PowerSupplyState, InjectedFault } from '../types/ecu';
import { RotaryEncoderDial, RackCornerScrews } from './HardwareControls';
import {
  resolvePcbNetToMnaNode,
  computePcbThermalMap,
  measureDualProbePcb,
  auditPcbDiagnostics,
  computeComponentPinCoords,
  computeContinuousTracePath,
  reconcilePcbNets,
  updatePcbComponentPin,
  removePcbComponentCleanly,
  decodePcbBoardJson,
  serializePcbBoardJson,
  type TracePoint,
  type PcbBoardPreset,
  type ComponentThermalProfile,
  type ProbeNodeTarget,
} from '../simulation/pcb/PcbDiagnosticEngine';
import {
  SAMPLE_PCB_BOARDS as SAMPLE_BOARDS,
  OEM_PCB_BOARDS,
} from '../data/samplePcbBoards';
import {
  Cpu,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle,
  Crop,
  Move,
  Flame,
  Globe,
  Hand,
  Waypoints,
  Zap,
  Thermometer,
  Crosshair,
  Layers,
  Maximize2,
  Route,
  X,
  FileText,
  Disc,
  Eye,
  EyeOff,
  Activity,
  Cable,
  Camera,
} from 'lucide-react';
import { PcbToolbar } from './pcb/PcbToolbar';
import { PcbSavedScansBar } from './pcb/PcbSavedScansBar';
import { PcbInspectorSidebar } from './pcb/PcbInspectorSidebar';
import type {
  ClickedDatasheetNodeState,
  DetailedPcbComponent,
  ExtendedImageAnalysisNet,
  HoveredNodeTooltipState,
  InspectorSubTab,
  InteractionDrag,
  InteractionMode,
  OpticalFilterMode,
  PartTemplateId,
  PcbPinSpec,
  SampleBoard,
  SchematicPcbScannerProps,
} from './pcb/pcbScannerTypes';

// ============================================================================
// EXTENDED TYPES & INTERFACES
// ============================================================================

export type {
  PcbPinSpec,
  DetailedPcbComponent,
  TracePoint,
  ExtendedImageAnalysisNet,
  ComponentThermalProfile,
  SchematicPcbScannerProps,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SchematicPcbScanner: React.FC<SchematicPcbScannerProps> = ({
  onOpenGroundedSearch,
  onOpenOfflineBot,
  onOpenCloudModal,
  onCrossProbePin,
  nodeVoltages,
  supplyCurrentDrawAmps,
  powerSupply,
  faults,
}) => {

  // Board & Analysis State
  const [selectedBoard, setSelectedBoard] = useState<SampleBoard>(SAMPLE_BOARDS[0]);
  const [boardTitle, setBoardTitle] = useState<string>(SAMPLE_BOARDS[0].name);
  const [boardType, setBoardType] = useState<string>(SAMPLE_BOARDS[0].type);
  const [analysisSummary, setAnalysisSummary] = useState<string>(SAMPLE_BOARDS[0].summary);
  const [analysisModel, setAnalysisModel] = useState<string>('preset-reference');

  const [components, setComponents] = useState<DetailedPcbComponent[]>(SAMPLE_BOARDS[0].components);
  const [nets, setNets] = useState<ExtendedImageAnalysisNet[]>(SAMPLE_BOARDS[0].nets);
  const [hotspots, setHotspots] = useState<ImageAnalysisHotspot[]>(SAMPLE_BOARDS[0].hotspots);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(
    'AI & LOCAL CV ENGINE ONLINE · Drag boxes to adjust, hover pins to trace nets, or upload any ECU PCB photo'
  );
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(
    SAMPLE_BOARDS[0].imageSrc || null
  );
  const [boardAspect, setBoardAspect] = useState<number>(4 / 3); // width / height
  const [showPhotoTexture, setShowPhotoTexture] = useState<boolean>(true);

  // Selection & Highlighting State
  const [selectedCompRef, setSelectedCompRef] = useState<string | null>('U1');
  const [activeNetId, setActiveNetId] = useState<string | null>('NET_5V_REGULATED');
  const [hoveredPinNetId, setHoveredPinNetId] = useState<string | null>(null);
  const effectiveNetId = hoveredPinNetId || activeNetId;
  const [selectedPinNumber, setSelectedPinNumber] = useState<number | null>(5);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [tracePathPair, setTracePathPair] = useState<[string | null, string | null]>([null, null]);

  // Hovered Node Exact MNA Voltage Tooltip State
  const [hoveredNodeTooltip, setHoveredNodeTooltip] = useState<{
    nodeLabel: string;
    compRefDes?: string;
    pinNumber?: number;
    pinName?: string;
    netId: string;
    mnaSourceNode: string;
    detectedVoltage: number;
    nominalVoltage: number;
    category?: string;
    notes?: string;
    xNorm: number;
    yNorm: number;
  } | null>(null);

  // Filtering & UI Navigation State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'VERIFIED' | 'UNVERIFIED'>('ALL');
  const [mobileTab, setMobileTab] = useState<'CANVAS' | 'DRAWER'>('CANVAS');
  const [inspectorSubTab, setInspectorSubTab] = useState<'PART' | 'NETS' | 'PROBE' | 'AUDIT' | 'THERMAL'>('PART');

  // Interactive Modes, Optical Filters & Layer Visibility
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('EDIT');
  const [opticalFilter, setOpticalFilter] = useState<OpticalFilterMode>('NORMAL');
  const [showAddPartMenu, setShowAddPartMenu] = useState(false);
  const [probeA, setProbeA] = useState<ProbeNodeTarget | null>(null);
  const [probeB, setProbeB] = useState<ProbeNodeTarget | null>(null);
  const [nextProbeSlot, setNextProbeSlot] = useState<'A' | 'B'>('A');
  const [cropMarquee, setCropMarquee] = useState<PcbNormalizedBox | null>(null);
  const [showComponents, setShowComponents] = useState(true);
  const [showNets, setShowNets] = useState(true);
  const [showPinMarkers, setShowPinMarkers] = useState(true);
  const [showVoltageLabels, setShowVoltageLabels] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showThermalHeatmap, setShowThermalHeatmap] = useState(false);
  const [showDatasheetInfo, setShowDatasheetInfo] = useState(false);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [clickedDatasheetNode, setClickedDatasheetNode] = useState<{
    compRefDes: string;
    pinNumber?: number;
    pinName?: string;
    netId?: string;
    xNorm: number;
    yNorm: number;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [ambientTempC, setAmbientTempC] = useState<number>(25);

  // Cloud Saved PCB Scans state
  const [savedScans, setSavedScans] = useState<SavedPcbScan[]>([]);
  const [showSavedScansPanel, setShowSavedScansPanel] = useState(false);
  const [isSavingScan, setIsSavingScan] = useState(false);

  // Quick Net Creation state
  const [newNetName, setNewNetName] = useState('');

  // Refs for DOM & Stale-Closure-Free Pointer Interaction
  const viewportScrollRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<InteractionDrag | null>(null);
  const cropMarqueeRef = useRef<PcbNormalizedBox | null>(null);
  const lastLocalCvRef = useRef<LocalPcbCvOutput | null>(null);

  // Latest state refs so global pointer listeners don't need to rebind on every 60fps drag frame
  const componentsRef = useRef<DetailedPcbComponent[]>(components);
  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  const isMountedRef = useRef(true);
  const uploadGenerationRef = useRef(0);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      uploadGenerationRef.current += 1;
    };
  }, []);

  const executeMacroCropScanRef = useRef<(box: PcbNormalizedBox) => Promise<void>>(async () => {});

  // Subscribe to local saved PCB scans in IndexedDB
  useEffect(() => {
    const unsub = subscribePcbScans(
      LOCAL_WORKSTATION_UID,
      (scans) => setSavedScans(scans),
      (err) => {
        const msg = formatCloudSyncError(err, { isPinOnlyLocalMode: true });
        if (msg) {
          setStatusMessage(`Local PCB Storage Warning: ${msg}`);
        }
      }
    );
    return () => unsub();
  }, []);

  // Revoke ObjectURL on change/unmount
  useEffect(() => {
    return () => {
      if (uploadedImageUrl && uploadedImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
    };
  }, [uploadedImageUrl]);

  // ============================================================================
  // LIVE MNA NODE VOLTAGE, ELECTRO-THERMAL, DUAL-PROBE & AUDIT ENGINE
  // ============================================================================

  const resolveMnaNodeDetails = useCallback(
    (netName: string | undefined, fallbackNominal: number) =>
      resolvePcbNetToMnaNode(netName, fallbackNominal, nodeVoltages, powerSupply),
    [nodeVoltages, powerSupply]
  );

  const resolveLiveNetVoltage = useCallback(
    (netName: string | undefined, fallbackNominal: number): number =>
      resolvePcbNetToMnaNode(netName, fallbackNominal, nodeVoltages, powerSupply).voltage,
    [nodeVoltages, powerSupply]
  );

  const componentThermalMap = useMemo<Record<string, ComponentThermalProfile>>(
    () =>
      computePcbThermalMap({
        components,
        powerSupply,
        supplyCurrentDrawAmps,
        nodeVoltages,
        faults,
        ambientTempC,
      }),
    [components, powerSupply, supplyCurrentDrawAmps, nodeVoltages, faults, ambientTempC]
  );

  const dualProbeMeasurement = useMemo(() => {
    if (!probeA || !probeB) return null;
    return measureDualProbePcb({
      probeA,
      probeB,
      components,
      nets,
      nodeVoltages,
      powerSupply,
      faults,
    });
  }, [probeA, probeB, components, nets, nodeVoltages, powerSupply, faults]);

  const boardAuditFindings = useMemo(
    () =>
      auditPcbDiagnostics({
        components,
        nets,
        hotspots,
        thermalMap: componentThermalMap,
        nodeVoltages,
        powerSupply,
        faults,
      }),
    [components, nets, hotspots, componentThermalMap, nodeVoltages, powerSupply, faults]
  );

  const peakBoardTempC = useMemo(() => {
    const temps = Object.values(componentThermalMap).map((t) => t.tempC);
    return temps.length > 0 ? Math.max(...temps) : ambientTempC;
  }, [componentThermalMap, ambientTempC]);

  const criticalAuditCount = useMemo(
    () => boardAuditFindings.filter((f) => f.severity === 'CRITICAL').length,
    [boardAuditFindings]
  );

  const handlePlaceProbe = useCallback(
    (target: ProbeNodeTarget) => {
      if (nextProbeSlot === 'A') {
        setProbeA(target);
        setNextProbeSlot('B');
        setInspectorSubTab('PROBE');
        setStatusMessage(
          `PROBE A (RED) anchored on ${target.label} [${target.netId}] — click a second node for Probe B (BLACK).`
        );
      } else {
        setProbeB(target);
        setNextProbeSlot('A');
        setInspectorSubTab('PROBE');
        setStatusMessage(
          `DUAL PROBE ACTIVE: A (${probeA?.label || 'Node A'}) ↔ B (${target.label})`
        );
      }
    },
    [nextProbeSlot, probeA]
  );

  // ============================================================================
  // IMAGE PROCESSING, HYBRID VISION & MACRO CROP PIPELINE
  // ============================================================================

  const prepareOptimizedPcbImage = async (
    file: File
  ): Promise<{
    previewUrl: string;
    imageBase64: string;
    mimeType: string;
    aspect: number;
    localCv: LocalPcbCvOutput;
  }> => {
    const MAX_DIM = 1600;
    const rawUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to decode uploaded PCB image'));
        el.src = rawUrl;
      });

      const natW = img.naturalWidth || 1200;
      const natH = img.naturalHeight || 800;
      if (natW * natH > 60_000_000 || natW < 1 || natH < 1) {
        throw new Error('Image dimensions exceed the supported 60-megapixel safety limit');
      }
      const scale = Math.min(1, MAX_DIM / Math.max(natW, natH));
      const targetW = Math.max(1, Math.round(natW * scale));
      const targetH = Math.max(1, Math.round(natH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const localCv = runLocalPcbCv(canvas);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Image compression failed'))),
          'image/jpeg',
          0.86
        );
      });

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Failed to encode PCB image blob'));
        reader.onerror = () => reject(reader.error || new Error('Failed to read PCB image blob'));
        reader.readAsDataURL(blob);
      });
      const imageBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

      canvas.width = 0;
      canvas.height = 0;

      return {
        previewUrl: URL.createObjectURL(blob),
        imageBase64,
        mimeType: 'image/jpeg',
        aspect: targetW / targetH,
        localCv,
      };
    } finally {
      URL.revokeObjectURL(rawUrl);
    }
  };

  // Load Sample or OEM Board Preset
  const loadSample = (board: SampleBoard) => {
    setSelectedBoard(board);
    setBoardTitle(board.name);
    setBoardType(board.type);
    setAnalysisSummary(board.summary);
    setAnalysisModel(board.imageSrc ? 'oem-board-reference' : 'preset-reference');
    setComponents(board.components);
    setNets(board.nets);
    setHotspots(board.hotspots);
    setUploadedImageUrl(board.imageSrc || null);
    setMobileTab('CANVAS');
    setBoardAspect(1.5);
    setInteractionMode('EDIT');
    setCropMarquee(null);
    setProbeA(null);
    setProbeB(null);
    setNextProbeSlot('A');
    setSelectedCompRef(board.components[0]?.refDes || null);
    setActiveNetId(board.nets[0]?.name || null);
    setSelectedPinNumber(board.components[0]?.pinSpecs?.[0]?.pinNumber || 1);
    setSelectedHotspotId(board.hotspots[0]?.id || null);
    setTracePathPair([null, null]);
    setClickedDatasheetNode(null);
    setStatusMessage(
      board.imageSrc
        ? `Loaded OEM ECU PCB Photography: ${board.name} (${board.components.length} mapped stages)`
        : `Loaded Reference Stage Preset: ${board.name}`
    );
  };

  const handleFitBoardToViewport = useCallback(() => {
    const vp = viewportScrollRef.current;
    if (!vp) {
      setZoomLevel(1.0);
      return;
    }
    const availW = Math.max(240, vp.clientWidth - 20);
    const availH = Math.max(200, vp.clientHeight - 20);
    const baseH = 740 / Math.max(0.5, Math.min(2.2, boardAspect));
    const fitZoom = Math.min(availW / 740, availH / baseH);
    setZoomLevel(Math.min(2.4, Math.max(0.38, Number(fitZoom.toFixed(2)))));
  }, [boardAspect]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      handleFitBoardToViewport();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handleFitBoardToViewport, mobileTab]);

  // Automatic Upload & Hybrid Vision Mapping
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
      setStatusMessage('ERROR: File size exceeds 12 MB upload limit.');
      return;
    }

    setIsAnalyzing(true);
    setInteractionMode('EDIT');
    setCropMarquee(null);
    setTracePathPair([null, null]);
    setClickedDatasheetNode(null);
    setStatusMessage('PHASE 1/2: Running Local Sobel/Pad CV & optimizing photo...');

    const generation = ++uploadGenerationRef.current;

    try {
      const { previewUrl, imageBase64, mimeType, aspect, localCv } = await prepareOptimizedPcbImage(file);
      if (!isMountedRef.current || uploadGenerationRef.current !== generation) {
        if (previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
        return;
      }
      lastLocalCvRef.current = localCv;
      setUploadedImageUrl(previewUrl);
      setMobileTab('CANVAS');
      setBoardAspect(aspect);
      setBoardTitle(file.name.replace(/\.[^.]+$/, ''));
      setBoardType('Uploaded Automotive ECU PCB');

      if (localCv.components.length > 0 || localCv.hotspots.length > 0) {
        const draft = fusePcbVisionResults(null, localCv);
        setComponents(draft.components);
        setNets(draft.nets);
        setHotspots(draft.hotspots || []);
        setSelectedCompRef(draft.components[0]?.refDes || null);
        setActiveNetId(draft.nets[0]?.name || null);
      }

      setStatusMessage('PHASE 2/2: Mapping ICs, pinouts & copper traces with Gemini Vision...');

      let aiResult: ImageAnalysisResult | null = null;
      let aiFallbackReason: string | null = null;
      try {
        aiResult = await analyzePcbImage({
          imageBase64,
          mimeType,
          documentName: file.name,
          documentType: 'pcb',
        });
        if (aiResult.detectionMethod === 'MANUAL_ONLY') {
          aiFallbackReason = 'Manual/Offline AI mode';
        }
      } catch (aiErr) {
        aiFallbackReason = aiErr instanceof Error ? aiErr.message : 'AI vision unavailable';
        console.warn('AI analysis fallback to Local CV:', aiErr);
      }

      if (!isMountedRef.current || uploadGenerationRef.current !== generation) {
        return;
      }

      const fused = fusePcbVisionResults(
        aiResult && aiResult.detectionMethod === 'AI_ANALYZED' ? aiResult : null,
        localCv
      );

      setComponents(fused.components);
      setNets(fused.nets);
      setHotspots(fused.hotspots || []);
      setAnalysisSummary(fused.analysisSummary);
      setAnalysisModel(fused.model);
      setSelectedCompRef(fused.components[0]?.refDes || null);
      setActiveNetId(fused.nets[0]?.name || null);
      setSelectedHotspotId(fused.hotspots?.[0]?.id || null);

      const guardNote =
        fused.warnings && fused.warnings.length > 0 ? ` · ${fused.warnings[0]}` : '';
      if (fused.detectionMethod === 'AI_ANALYZED') {
        setStatusMessage(
          `AUTO-MAP COMPLETE (${fused.model}): ${fused.components.length} parts, ${fused.nets.length} nets, ${fused.hotspots?.length || 0} hotspots${guardNote}`
        );
      } else {
        setStatusMessage(
          `LOCAL CV MAPPED (${aiFallbackReason || 'Offline Fallback'}): ${fused.components.length} clusters, ${fused.nets.length} trace links, ${fused.hotspots?.length || 0} hotspots${guardNote}`
        );
      }
    } catch (err) {
      if (!isMountedRef.current || uploadGenerationRef.current !== generation) return;
      console.error('PCB upload pipeline error:', err);
      setStatusMessage('ERROR: Could not decode PCB image. Try a standard PNG/JPG photo.');
    } finally {
      if (isMountedRef.current && uploadGenerationRef.current === generation) {
        setIsAnalyzing(false);
      }
    }
  };

  // Re-run deterministic Local CV hotspot & cluster scan on current uploaded image
  const handleRerunLocalCv = async () => {
    if (!uploadedImageUrl) return;
    setIsAnalyzing(true);
    setStatusMessage('Running local Sobel/thermal hotspot CV scan...');
    try {
      const { localCv } = await cropPcbRegionToJpegBase64(uploadedImageUrl, {
        ymin: 0,
        xmin: 0,
        ymax: 1000,
        xmax: 1000,
      });
      lastLocalCvRef.current = localCv;
      const fused = fusePcbVisionResults(
        {
          documentType: 'pcb',
          confidenceScore: 0.85,
          detectionMethod: 'AI_ANALYZED',
          analysisSummary,
          components,
          terminals: [],
          nets,
          hotspots,
          warnings: [],
          model: analysisModel,
          provider: 'hybrid',
        },
        localCv
      );
      setComponents(fused.components);
      setNets(fused.nets);
      setHotspots(fused.hotspots || []);
      setStatusMessage(
        `LOCAL CV REFRESHED: ${fused.hotspots?.length || 0} hotspot(s) & ${fused.components.length} components mapped.`
      );
    } catch (err) {
      console.warn('Local CV refresh failed:', err);
      setStatusMessage('Local CV refresh failed on current board.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Execute Macro Crop Re-Scan on selected normalized [0..1000] rectangle
  const executeMacroCropScan = useCallback(
    async (cropBox: PcbNormalizedBox) => {
      if (!uploadedImageUrl) return;
      setIsAnalyzing(true);
      setStatusMessage(
        `MACRO CROP SCAN: Zooming region [${cropBox.xmin},${cropBox.ymin}]–[${cropBox.xmax},${cropBox.ymax}]...`
      );
      try {
        const { imageBase64, mimeType, localCv } = await cropPcbRegionToJpegBase64(
          uploadedImageUrl,
          cropBox
        );

        let aiCrop: ImageAnalysisResult | null = null;
        let aiCropFallbackReason: string | null = null;
        try {
          aiCrop = await analyzePcbImage({
            imageBase64,
            mimeType,
            documentName: `${boardTitle}_macro_crop.jpg`,
            documentType: 'pcb_macro_crop',
            regionBox: cropBox,
          });
        } catch (err) {
          aiCropFallbackReason = err instanceof Error ? err.message : 'AI vision fallback';
          console.warn('Macro crop AI fallback to local CV:', err);
        }

        const fusedCrop = fusePcbVisionResults(
          aiCrop && aiCrop.detectionMethod === 'AI_ANALYZED' ? aiCrop : null,
          localCv
        );

        const merged = mergeMacroCropResults(
          { components, nets, hotspots },
          cropBox,
          fusedCrop
        );

        setComponents(merged.components);
        setNets(merged.nets);
        setHotspots(merged.hotspots);
        setInteractionMode('EDIT');
        setCropMarquee(null);
        setStatusMessage(
          aiCropFallbackReason
            ? `MACRO CROP MERGED (Local CV · ${aiCropFallbackReason}): +${merged.addedCount} new parts, ${merged.updatedCount} refined`
            : `MACRO CROP MERGED: +${merged.addedCount} new parts, ${merged.updatedCount} refined markings`
        );
      } catch (err) {
        console.warn('Macro crop error:', err);
        setStatusMessage('Macro crop scan failed. Try drawing a slightly larger box.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [uploadedImageUrl, boardTitle, components, nets, hotspots]
  );

  useEffect(() => {
    executeMacroCropScanRef.current = executeMacroCropScan;
  }, [executeMacroCropScan]);

  // ============================================================================
  // UNIFIED POINTER INTERACTION (MOVE, RESIZE, PAN, CROP, TRACE NODE EDIT)
  // ============================================================================

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === 'MOVE') {
        const dxNorm = ((e.clientX - drag.startClientX) / Math.max(1, drag.boardRect.width)) * 1000;
        const dyNorm = ((e.clientY - drag.startClientY) / Math.max(1, drag.boardRect.height)) * 1000;
        const w = drag.origBox.xmax - drag.origBox.xmin;
        const h = drag.origBox.ymax - drag.origBox.ymin;
        const xmin = clampCoord(drag.origBox.xmin + dxNorm, 0, 1000 - w);
        const ymin = clampCoord(drag.origBox.ymin + dyNorm, 0, 1000 - h);
        const nextBox: PcbNormalizedBox = {
          ymin,
          xmin,
          ymax: ymin + h,
          xmax: xmin + w,
        };
        setComponents((prev) =>
          prev.map((c) => (c.refDes === drag.refDes ? { ...c, bbox: nextBox } : c))
        );
      } else if (drag.type === 'RESIZE') {
        const dxNorm = ((e.clientX - drag.startClientX) / Math.max(1, drag.boardRect.width)) * 1000;
        const dyNorm = ((e.clientY - drag.startClientY) / Math.max(1, drag.boardRect.height)) * 1000;
        const xmax = clampCoord(drag.origBox.xmax + dxNorm, drag.origBox.xmin + 20, 1000);
        const ymax = clampCoord(drag.origBox.ymax + dyNorm, drag.origBox.ymin + 20, 1000);
        const nextBox: PcbNormalizedBox = {
          ymin: drag.origBox.ymin,
          xmin: drag.origBox.xmin,
          ymax,
          xmax,
        };
        setComponents((prev) =>
          prev.map((c) => (c.refDes === drag.refDes ? { ...c, bbox: nextBox } : c))
        );
      } else if (drag.type === 'CROP') {
        const currX = clampCoord(((e.clientX - drag.boardRect.left) / Math.max(1, drag.boardRect.width)) * 1000);
        const currY = clampCoord(((e.clientY - drag.boardRect.top) / Math.max(1, drag.boardRect.height)) * 1000);
        const nextBox: PcbNormalizedBox = {
          xmin: Math.min(drag.startXNorm, currX),
          ymin: Math.min(drag.startYNorm, currY),
          xmax: Math.max(drag.startXNorm, currX),
          ymax: Math.max(drag.startYNorm, currY),
        };
        cropMarqueeRef.current = nextBox;
        setCropMarquee(nextBox);
      } else if (drag.type === 'PAN_VIEWPORT') {
        if (viewportScrollRef.current) {
          const dx = e.clientX - drag.startClientX;
          const dy = e.clientY - drag.startClientY;
          viewportScrollRef.current.scrollLeft = drag.startScrollLeft - dx;
          viewportScrollRef.current.scrollTop = drag.startScrollTop - dy;
        }
      } else if (drag.type === 'MOVE_TRACE_NODE') {
        const currX = Math.round(
          clampCoord(((e.clientX - drag.boardRect.left) / Math.max(1, drag.boardRect.width)) * 1000)
        );
        const currY = Math.round(
          clampCoord(((e.clientY - drag.boardRect.top) / Math.max(1, drag.boardRect.height)) * 1000)
        );
        setNets((prevNets) =>
          prevNets.map((net) => {
            if (net.name !== drag.netName) return net;
            if (typeof drag.branchIndex === 'number' && net.traceBranches) {
              const nextBranches = net.traceBranches.map((branch, bIdx) =>
                bIdx === drag.branchIndex
                  ? branch.map((pt, pIdx) => (pIdx === drag.pointIndex ? { x: currX, y: currY } : pt))
                  : branch
              );
              return {
                ...net,
                traceBranches: nextBranches,
                tracePoints: nextBranches.flat(),
              };
            }
            const nextPts = net.tracePoints.map((pt, idx) =>
              idx === drag.pointIndex ? { x: currX, y: currY } : pt
            );
            return { ...net, tracePoints: nextPts };
          })
        );
      }
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      if (drag.type === 'MOVE') {
        const movedComp = componentsRef.current.find((c) => c.refDes === drag.refDes);
        if (movedComp) {
          const oldCenter = getBoxCenter(drag.origBox);
          const newCenter = getBoxCenter(movedComp.bbox);
          const deltaX = newCenter.x - oldCenter.x;
          const deltaY = newCenter.y - oldCenter.y;
          if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
            setNets((prevNets) =>
              prevNets.map((net) => {
                if (!net.connectedComponentRefs.includes(drag.refDes)) return net;
                let movedAny = false;
                const moveNearPoint = (pt: TracePoint): TracePoint => {
                  const dist = Math.hypot(pt.x - oldCenter.x, pt.y - oldCenter.y);
                  if (dist < 125) {
                    movedAny = true;
                    return {
                      x: clampCoord(pt.x + deltaX),
                      y: clampCoord(pt.y + deltaY),
                    };
                  }
                  return pt;
                };
                const updatedPts = net.tracePoints.map(moveNearPoint);
                const updatedBranches = net.traceBranches
                  ? net.traceBranches.map((branch) => branch.map(moveNearPoint))
                  : undefined;
                return movedAny
                  ? { ...net, tracePoints: updatedPts, traceBranches: updatedBranches }
                  : net;
              })
            );
          }
        }
      } else if (drag.type === 'CROP') {
        const box = cropMarqueeRef.current;
        cropMarqueeRef.current = null;
        if (box && box.xmax - box.xmin >= 25 && box.ymax - box.ymin >= 25) {
          void executeMacroCropScanRef.current(box);
        } else {
          setCropMarquee(null);
          setStatusMessage('Macro crop box too small — drag a larger area around the IC or trace.');
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  // ============================================================================
  // COMPONENT, PIN & NET EDITING ACTIONS
  // ============================================================================

  const handleAddCustomComponent = (
    template:
      | 'TEST_POINT'
      | 'MOSFET_DRIVER'
      | 'VOLTAGE_REGULATOR'
      | 'RESISTOR'
      | 'CAPACITOR'
      | 'DIODE'
  ) => {
    const nextIndex = components.length + 1;
    const prefixMap: Record<typeof template, string> = {
      TEST_POINT: 'TP',
      MOSFET_DRIVER: 'Q',
      VOLTAGE_REGULATOR: 'U',
      RESISTOR: 'R',
      CAPACITOR: 'C',
      DIODE: 'D',
    };
    let refDes = `${prefixMap[template]}${nextIndex}`;
    let bump = nextIndex;
    while (components.some((c) => c.refDes === refDes)) {
      bump++;
      refDes = `${prefixMap[template]}${bump}`;
    }

    const defaultNet = activeNetId || 'NET_5V_REGULATED';
    const specPresets: Record<
      typeof template,
      {
        marking: string;
        decodedValue: string;
        packageType: string;
        circuitFunction: string;
        vRange: string;
        pins: PcbPinSpec[];
      }
    > = {
      TEST_POINT: {
        marking: refDes,
        decodedValue: 'Technician Probe Pad',
        packageType: 'SMD Test Pad (1.5mm)',
        circuitFunction: 'Manual Technician Oscilloscope / Multimeter Test Point',
        vRange: '0V – 42V DC',
        pins: [
          {
            pinNumber: 1,
            pinName: 'PAD',
            category: 'signal_in',
            nominalVoltage: 5.0,
            connectedNetId: defaultNet,
            notes: 'Direct probe test point pad',
          },
        ],
      },
      MOSFET_DRIVER: {
        marking: 'BTS141',
        decodedValue: '60V / 25A Low-Side Smart MOSFET',
        packageType: 'TO-252-3 (DPAK)',
        circuitFunction: 'Low-Side Actuator / Solenoid Sink Switch',
        vRange: '60V VDS Max',
        pins: [
          { pinNumber: 1, pinName: 'GATE', category: 'signal_in', nominalVoltage: 5.0, connectedNetId: 'NET_5V_REGULATED', notes: '5V MCU gate drive' },
          { pinNumber: 2, pinName: 'DRAIN', category: 'driver_out', nominalVoltage: 12.25, connectedNetId: 'NET_INJ_1_LOW', notes: 'Actuator low-side drain' },
          { pinNumber: 3, pinName: 'SOURCE', category: 'ground', nominalVoltage: 0.0, connectedNetId: 'NET_CHASSIS_GND', notes: 'Ground return' },
        ],
      },
      VOLTAGE_REGULATOR: {
        marking: 'TLE4275G',
        decodedValue: '5.0V ±2% Automotive LDO',
        packageType: 'TO-263-5',
        circuitFunction: 'ECU +5V Regulated Logic Supply',
        vRange: '5.5V – 42V DC',
        pins: [
          { pinNumber: 1, pinName: 'VIN', category: 'power', nominalVoltage: 12.25, connectedNetId: 'NET_KL30_VBAT', notes: 'Protected VBat input' },
          { pinNumber: 2, pinName: 'GND', category: 'ground', nominalVoltage: 0.0, connectedNetId: 'NET_CHASSIS_GND', notes: 'Ground tab' },
          { pinNumber: 3, pinName: 'VOUT', category: 'power', nominalVoltage: 5.0, connectedNetId: 'NET_5V_REGULATED', notes: '+5V output rail' },
        ],
      },
      RESISTOR: {
        marking: '100R',
        decodedValue: '100 Ω ±1% AEC-Q200',
        packageType: '0805 SMD',
        circuitFunction: 'Series Damping / Termination Resistor',
        vRange: '0.25W / 150V Max',
        pins: [
          { pinNumber: 1, pinName: 'TERM 1', category: 'signal_in', nominalVoltage: 5.0, connectedNetId: defaultNet, notes: 'Resistor terminal 1' },
          { pinNumber: 2, pinName: 'TERM 2', category: 'ground', nominalVoltage: 0.0, connectedNetId: 'NET_CHASSIS_GND', notes: 'Resistor terminal 2' },
        ],
      },
      CAPACITOR: {
        marking: '100nF 50V',
        decodedValue: '100 nF / 50V X7R MLCC',
        packageType: '0805 SMD',
        circuitFunction: 'Bypass & Decoupling Capacitor',
        vRange: '50V DC X7R',
        pins: [
          { pinNumber: 1, pinName: 'POS (+)', category: 'power', nominalVoltage: 5.0, connectedNetId: defaultNet, notes: 'Positive decoupling rail' },
          { pinNumber: 2, pinName: 'GND (-)', category: 'ground', nominalVoltage: 0.0, connectedNetId: 'NET_CHASSIS_GND', notes: 'Ground plane return' },
        ],
      },
      DIODE: {
        marking: 'B540C',
        decodedValue: '40V / 5A Schottky Barrier Diode',
        packageType: 'SMC (DO-214AB)',
        circuitFunction: 'Reverse Polarity / Flyback Protection Diode',
        vRange: '40V VRRM',
        pins: [
          { pinNumber: 1, pinName: 'ANODE (A)', category: 'power', nominalVoltage: 12.6, connectedNetId: defaultNet, notes: 'Anode terminal' },
          { pinNumber: 2, pinName: 'CATHODE (K)', category: 'power', nominalVoltage: 12.25, connectedNetId: 'NET_KL30_VBAT', notes: 'Cathode terminal' },
        ],
      },
    };

    const chosen = specPresets[template];
    const newComp: DetailedPcbComponent = {
      refDes,
      category: template,
      marking: chosen.marking,
      decodedValue: chosen.decodedValue,
      packageType: chosen.packageType,
      bbox: { ymin: 220, xmin: 420, ymax: 320, xmax: 530 },
      confidenceScore: 1.0,
      verificationStatus: 'UNVERIFIED',
      circuitFunction: chosen.circuitFunction,
      terminalIds: chosen.pins.map((p) => `${refDes}-${p.pinNumber}`),
      notes: 'Added manually during bench PCB inspection — verify pinout against OEM board.',
      operatingVoltageRange: chosen.vRange,
      source: 'MANUAL',
      pinSpecs: chosen.pins,
    };
    const reconciled = reconcilePcbNets({
      components: [...components, newComp],
      nets,
    });
    setComponents(reconciled.components);
    setNets(reconciled.nets);
    setSelectedCompRef(refDes);
    setSelectedPinNumber(1);
    setInspectorSubTab('PART');
    setShowAddPartMenu(false);
    setStatusMessage(`Added ${refDes} (${chosen.marking}) — drag box on PCB canvas to position over component.`);
  };

  const handleAddManualComponent = () => handleAddCustomComponent('TEST_POINT');

  const handleAddPinToComponent = (refDes: string) => {
    const nextComponents = components.map((c) => {
      if (c.refDes !== refDes) return c;
      const currentPins = c.pinSpecs || [];
      const nextPinNumber =
        currentPins.reduce((max, p) => Math.max(max, p.pinNumber), 0) + 1;
      const newPin: PcbPinSpec = {
        pinNumber: nextPinNumber,
        pinName: `PIN_${nextPinNumber}`,
        category: 'signal_in',
        nominalVoltage: 5.0,
        connectedNetId: activeNetId || 'NET_UNASSIGNED',
        notes: 'User-defined IC/connector pin',
      };
      return {
        ...c,
        verificationStatus: 'UNVERIFIED' as const,
        pinSpecs: [...currentPins, newPin],
        terminalIds: [...c.terminalIds, `${refDes}-${nextPinNumber}`],
      };
    });
    const reconciled = reconcilePcbNets({ components: nextComponents, nets });
    setComponents(reconciled.components);
    setNets(reconciled.nets);
    setStatusMessage(`Added new pin to ${refDes}`);
  };

  const handleDeleteComponent = (refDes: string) => {
    const cleaned = removePcbComponentCleanly({
      components,
      nets,
      hotspots,
      refDes,
    });
    setComponents(cleaned.components);
    setNets(cleaned.nets);
    setHotspots(cleaned.hotspots);
    if (selectedCompRef === refDes) setSelectedCompRef(null);
  };

  const updateSelectedComponentField = (
    refDes: string,
    updates: Partial<DetailedPcbComponent>
  ) => {
    setComponents((prev) =>
      prev.map((c) => (c.refDes === refDes ? { ...c, ...updates } : c))
    );
  };

  const handleUpdatePinNet = (
    compRefDes: string,
    pinNumber: number,
    nextNetId: string,
    nextPinName?: string,
    nextVoltage?: number
  ) => {
    const updated = updatePcbComponentPin({
      components,
      nets,
      refDes: compRefDes,
      pinNumber,
      patch: {
        connectedNetId: nextNetId,
        ...(nextPinName !== undefined ? { pinName: nextPinName } : {}),
        ...(nextVoltage !== undefined && Number.isFinite(nextVoltage)
          ? { nominalVoltage: nextVoltage }
          : {}),
      },
    });
    setComponents(updated.components);
    setNets(updated.nets);
    const updatedComp = updated.components.find((c) => c.refDes === compRefDes);
    const updatedPin = updatedComp?.pinSpecs?.find((p) => p.pinNumber === pinNumber);
    if (updatedPin && updatedPin.connectedNetId !== 'NET_UNASSIGNED') {
      setActiveNetId(updatedPin.connectedNetId);
    }
  };

  const handleCreateAndLinkNet = () => {
    if (!selectedCompRef) return;
    const targetName =
      newNetName.trim().toUpperCase().replace(/\s+/g, '_') || `NET_TRACE_${nets.length + 1}`;
    const comp = components.find((c) => c.refDes === selectedCompRef);
    const targetPin = selectedPinNumber || comp?.pinSpecs?.[0]?.pinNumber || 1;
    handleUpdatePinNet(selectedCompRef, targetPin, targetName);
    setNewNetName('');
    setStatusMessage(`Linked ${selectedCompRef} Pin #${targetPin} to net [${targetName}]`);
  };

  /**
   * Generates clean L-shaped (orthogonal Manhattan) copper trace segments between connected components.
   */
  const handleAutoRouteNet = (netName: string) => {
    setNets((prev) =>
      prev.map((n) => {
        if (n.name !== netName) return n;
        const centers = n.connectedComponentRefs
          .map((ref) => components.find((c) => c.refDes === ref))
          .filter((c): c is DetailedPcbComponent => Boolean(c))
          .map((c) => getBoxCenter(c.bbox));

        if (centers.length < 2) return n;

        const branches: TracePoint[][] = [];
        for (let i = 0; i < centers.length - 1; i++) {
          const a = centers[i];
          const b = centers[i + 1];
          const midX = Math.round((a.x + b.x) / 2);
          branches.push([
            { x: a.x, y: a.y },
            { x: midX, y: a.y },
            { x: midX, y: b.y },
            { x: b.x, y: b.y },
          ]);
        }

        return {
          ...n,
          traceBranches: branches,
          tracePoints: branches.flat(),
          isComplete: true,
        };
      })
    );
    setStatusMessage(`Auto-routed orthogonal Manhattan copper trace for [${netName}]`);
  };

  const handleAddWaypointToActiveNet = () => {
    if (!effectiveNetId) return;
    setNets((prev) =>
      prev.map((n) => {
        if (n.name !== effectiveNetId) return n;
        const lastPt = n.tracePoints[n.tracePoints.length - 1] || { x: 500, y: 500 };
        const nextPt = {
          x: clampCoord(lastPt.x + 45),
          y: clampCoord(lastPt.y + 35),
        };
        if (n.traceBranches && n.traceBranches.length > 0) {
          const nextBranches = n.traceBranches.map((b, idx) =>
            idx === n.traceBranches!.length - 1 ? [...b, nextPt] : b
          );
          return { ...n, traceBranches: nextBranches, tracePoints: nextBranches.flat() };
        }
        return { ...n, tracePoints: [...n.tracePoints, nextPt] };
      })
    );
    setInteractionMode('TRACE_EDIT');
    setStatusMessage(`Added trace waypoint to [${effectiveNetId}] — drag white vertices on canvas.`);
  };

  const handleDeleteLastVertexFromActiveNet = () => {
    if (!effectiveNetId) return;
    setNets((prev) =>
      prev.map((n) => {
        if (n.name !== effectiveNetId) return n;
        if (n.traceBranches && n.traceBranches.length > 0) {
          const lastIdx = n.traceBranches.length - 1;
          const nextBranches = n.traceBranches.map((b, idx) =>
            idx === lastIdx && b.length > 2 ? b.slice(0, -1) : b
          );
          return { ...n, traceBranches: nextBranches, tracePoints: nextBranches.flat() };
        }
        if (n.tracePoints.length > 2) {
          return { ...n, tracePoints: n.tracePoints.slice(0, -1) };
        }
        return n;
      })
    );
    setStatusMessage(`Removed trailing vertex from [${effectiveNetId}].`);
  };

  const handleAddManualHotspot = (severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'WARNING') => {
    const targetComp = components.find((c) => c.refDes === selectedCompRef);
    const bbox = targetComp
      ? clampBbox({
          ymin: targetComp.bbox.ymin - 15,
          xmin: targetComp.bbox.xmin - 15,
          ymax: targetComp.bbox.ymax + 15,
          xmax: targetComp.bbox.xmax + 15,
        })
      : { ymin: 420, xmin: 420, ymax: 560, xmax: 560 };

    const newHotspot: ImageAnalysisHotspot = {
      id: `manual-hotspot-${Date.now()}`,
      label: targetComp
        ? `${targetComp.refDes} Physical Inspection Flag`
        : 'Manual Solder / Thermal Inspection Zone',
      severity,
      bbox,
      suspectComponentRef: targetComp?.refDes,
      notes: targetComp
        ? `Technician flagged ${targetComp.refDes} (${targetComp.marking}) for solder crack, heat discoloration, or pad continuity check.`
        : 'Technician flagged region for microscopic solder joint and trace continuity inspection.',
      source: 'LOCAL_CV',
    };
    setHotspots((prev) => [newHotspot, ...prev]);
    setSelectedHotspotId(newHotspot.id);
    setShowHotspots(true);
    setInspectorSubTab('AUDIT');
    setStatusMessage(`Flagged new ${severity} inspection hotspot${targetComp ? ` on ${targetComp.refDes}` : ''}.`);
  };

  const handleDeleteHotspot = (id: string) => {
    setHotspots((prev) => prev.filter((h) => h.id !== id));
    if (selectedHotspotId === id) setSelectedHotspotId(null);
  };

  const verifyComponent = (refDes: string) => {
    setComponents((prev) =>
      prev.map((c) =>
        c.refDes === refDes
          ? {
              ...c,
              verificationStatus: c.verificationStatus === 'VERIFIED' ? 'UNVERIFIED' : 'VERIFIED',
              notes:
                c.verificationStatus === 'VERIFIED'
                  ? 'Reverted to unverified status'
                  : 'Verified by Senior Auto-Electrician against OEM schematics.',
            }
          : c
      )
    );
  };

  // ============================================================================
  // CLOUD SYNC & JSON EXPORT
  // ============================================================================

  const handleSavePcbToCloud = async () => {
    setIsSavingScan(true);
    try {
      await savePcbScan(LOCAL_WORKSTATION_UID, {
        title: boardTitle || 'Mapped ECU PCB Scan',
        boardType: boardType || 'Automotive ECU PCB',
        analysisSummary,
        model: analysisModel,
        components,
        nets,
        hotspots,
      });
      setStatusMessage(
        `SAVED LOCALLY: "${boardTitle}" (${components.length} parts, ${nets.length} nets, ${hotspots.length} hotspots)`
      );
    } catch (err) {
      console.error('Failed to save PCB scan locally:', err);
      setStatusMessage('Local PCB save failed — check browser storage quota.');
    } finally {
      setIsSavingScan(false);
    }
  };

  const handleLoadSavedScan = (scan: SavedPcbScan) => {
    setBoardTitle(scan.title);
    setBoardType(scan.boardType);
    setAnalysisSummary(scan.analysisSummary);
    setAnalysisModel(scan.model);
    setComponents(scan.components || []);
    setNets((scan.nets as ExtendedImageAnalysisNet[]) || []);
    setHotspots(scan.hotspots || []);
    setUploadedImageUrl(null);
    setBoardAspect(1.5);
    setSelectedCompRef(scan.components?.[0]?.refDes || null);
    setActiveNetId(scan.nets?.[0]?.name || null);
    setTracePathPair([null, null]);
    setClickedDatasheetNode(null);
    setShowSavedScansPanel(false);
    setStatusMessage(`Loaded Local PCB Map: ${scan.title} (${scan.components?.length || 0} components)`);
  };

  const handleDeleteSavedScan = async (scanId: string) => {
    try {
      await deletePcbScan(LOCAL_WORKSTATION_UID, scanId);
    } catch (err) {
      console.warn('Delete local PCB scan failed:', err);
    }
  };

  const exportProjectJson = () => {
    const jsonString = serializePcbBoardJson({
      id: selectedBoard.id,
      boardName: boardTitle,
      boardType,
      analysisSummary,
      model: analysisModel,
      aspect: boardAspect,
      imageDataUrl: uploadedImageUrl,
      components,
      nets,
      hotspots,
      thermalSnapshot: componentThermalMap,
    });
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoelectric-pcb-${boardTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setStatusMessage('ERROR: PCB JSON file exceeds 30 MB safety limit.');
      return;
    }
    try {
      const text = await file.text();
      const decoded = decodePcbBoardJson(text);
      setBoardTitle(decoded.boardName);
      setBoardType(decoded.boardType);
      setAnalysisSummary(decoded.analysisSummary);
      setAnalysisModel(decoded.model);
      setBoardAspect(decoded.aspect);
      setComponents(decoded.components);
      setNets(decoded.nets);
      setHotspots(decoded.hotspots);
      if (decoded.imageDataUrl) {
        setUploadedImageUrl(decoded.imageDataUrl);
      }
      setSelectedCompRef(decoded.components[0]?.refDes || null);
      setActiveNetId(decoded.nets[0]?.name || null);
      setSelectedPinNumber(decoded.components[0]?.pinSpecs?.[0]?.pinNumber || 1);
      setTracePathPair([null, null]);
      setClickedDatasheetNode(null);
      setStatusMessage(
        `Imported Schema v1 PCB JSON: "${decoded.boardName}" (${decoded.components.length} components, ${decoded.nets.length} nets)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid PCB JSON format';
      setStatusMessage(`PCB JSON Import Rejected: ${msg}`);
    }
  };

  // ============================================================================
  // MEMOIZED SELECTORS & HELPERS
  // ============================================================================

  const filteredComponents = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return components.filter((c) => {
      const matchesSearch =
        c.refDes.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.marking.toLowerCase().includes(q) ||
        c.decodedValue.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filterMode === 'VERIFIED') return c.verificationStatus === 'VERIFIED';
      if (filterMode === 'UNVERIFIED') return c.verificationStatus !== 'VERIFIED';
      return true;
    });
  }, [components, searchTerm, filterMode]);

  const selectedComponent = useMemo(
    () => components.find((c) => c.refDes === selectedCompRef),
    [components, selectedCompRef]
  );

  const activeNetObject = useMemo(
    () => nets.find((n) => n.name === effectiveNetId),
    [nets, effectiveNetId]
  );

  const getNetColor = (netName: string): string => {
    const upper = netName.toUpperCase();
    if (upper.includes('5V') || upper.includes('REG')) return '#f59e0b';
    if (upper.includes('VBAT') || upper.includes('KL30')) return '#ef4444';
    if (upper.includes('GND')) return '#22c55e';
    if (upper.includes('HIGH') || upper.includes('CANH')) return '#fb923c';
    if (upper.includes('LOW') || upper.includes('CANL')) return '#a855f7';
    if (upper.includes('SPLIT') || upper.includes('VREF')) return '#94a3b8';
    return '#eab308';
  };

  const openDatasheetCardForNode = useCallback(
    (
      compRefDes: string,
      xNorm: number,
      yNorm: number,
      pinNumber?: number,
      pinName?: string,
      netId?: string
    ) => {
      if (!showDatasheetInfo) return;
      setClickedDatasheetNode({
        compRefDes,
        pinNumber,
        pinName,
        netId,
        xNorm,
        yNorm,
      });
    },
    [showDatasheetInfo]
  );

  const handleSelectTracePathComponent = useCallback(
    (refDes: string) => {
      setTracePathPair((prev) => {
        const [first, second] = prev;
        if (!first || (first && second)) {
          setStatusMessage(
            `TRACE PATH [A = ${refDes}]: Click a second component [B], then hover any node to trace continuous path.`
          );
          return [refDes, null];
        }
        if (first === refDes) {
          setStatusMessage(
            `TRACE PATH [A = ${refDes}]: Pick a different second component [B] to complete the trace pair.`
          );
          return prev;
        }
        setStatusMessage(
          `TRACE PATH READY [${first} ↔ ${refDes}]: Hover over any pin or trace node to highlight continuous line.`
        );
        return [first, refDes];
      });
    },
    []
  );

  // Computes continuous orthogonal trace path between two clicked components via PcbDiagnosticEngine
  const highlightedContinuousPath = useMemo(
    () =>
      computeContinuousTracePath({
        tracePathPair,
        hoveredNode: hoveredNodeTooltip,
        components,
        nets,
      }),
    [tracePathPair, hoveredNodeTooltip, components, nets]
  );

  // Aspect-locked board dimensions so 0..1000 coordinates match photo pixels 1:1
  const boardWidthPx = Math.round(740 * zoomLevel);
  const boardHeightPx = Math.round((740 / Math.max(0.5, Math.min(2.2, boardAspect))) * zoomLevel);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="relative flex-1 flex flex-col hud-panel rounded-[3px] overflow-hidden text-slate-100 font-body select-none">
      <RackCornerScrews />
      <PcbToolbar
        sampleBoards={SAMPLE_BOARDS}
        oemBoards={OEM_PCB_BOARDS}
        selectedBoard={selectedBoard}
        boardTitle={boardTitle}
        boardType={boardType}
        componentsCount={components.length}
        netsCount={nets.length}
        uploadedImageUrl={uploadedImageUrl}
        powerSupply={powerSupply}
        peakBoardTempC={peakBoardTempC}
        criticalAuditCount={criticalAuditCount}
        auditCount={boardAuditFindings.length}
        isAnalyzing={isAnalyzing}
        statusMessage={statusMessage}
        showAddPartMenu={showAddPartMenu}
        isSavingScan={isSavingScan}
        showSavedScansPanel={showSavedScansPanel}
        savedScansCount={savedScans.length}
        onLoadSample={loadSample}
        onSelectThermalTab={() => {
          setShowThermalHeatmap(true);
          setInspectorSubTab('THERMAL');
        }}
        onSelectAuditTab={() => setInspectorSubTab('AUDIT')}
        onToggleAddPartMenu={() => setShowAddPartMenu((prev) => !prev)}
        onRerunLocalCv={handleRerunLocalCv}
        onSavePcbToCloud={handleSavePcbToCloud}
        onToggleSavedScansPanel={() => setShowSavedScansPanel((prev) => !prev)}
        onUploadFile={handleUpload}
        onImportJsonFile={handleImportJsonFile}
        onExportJson={exportProjectJson}
        onAddCustomComponent={handleAddCustomComponent}
      />

      {showSavedScansPanel && (
        <PcbSavedScansBar
          savedScans={savedScans}
          isSignedIn={true}
          onOpenCloudModal={onOpenCloudModal}
          onLoadScan={handleLoadSavedScan}
          onDeleteScan={handleDeleteSavedScan}
        />
      )}

      {/* Mobile Segmented Control Switcher */}
      <div className="flex md:hidden items-center bg-[#060B14]/90 p-1 border-b border-[#203653] text-[11px] font-mono shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setMobileTab('CANVAS')}
          className={`flex-1 py-1.5 rounded-lg text-center font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mobileTab === 'CANVAS'
              ? 'diag-tab-active'
              : 'diag-tab-idle text-[#91A4BD] hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>PCB Board</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('DRAWER')}
          className={`flex-1 py-1.5 rounded-lg text-center font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mobileTab === 'DRAWER'
              ? 'diag-tab-active'
              : 'diag-tab-idle text-[#91A4BD] hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Inspector ({components.length})</span>
        </button>
      </div>

      {/* Main Dual Workspace: Interactive PCB Canvas Left + Component Inspector Right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Left: Interactive Canvas Panel */}
        <div
          className={`flex-1 relative bg-[#060B14]/85 flex-col overflow-hidden min-w-0 ${
            mobileTab === 'CANVAS' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Single-Row Canvas Interaction Toolbar + Layers Popover Trigger + Zoom */}
          <div className="bg-[#0E192A]/90 border-b border-[#203653] px-2 sm:px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 font-mono">
            <div
              className="flex flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none min-w-0"
              role="toolbar"
              aria-label="PCB interaction modes"
            >
              <button
                type="button"
                onClick={() => setInteractionMode('EDIT')}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'EDIT'
                    ? 'diag-tab-active'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Select, Drag & Resize Component Boxes (V)"
              >
                <Move className="w-3.5 h-3.5 shrink-0" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => setInteractionMode('PAN')}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'PAN'
                    ? 'diag-tab-active'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Click and drag anywhere to pan across zoomed PCB (H)"
              >
                <Hand className="w-3.5 h-3.5 shrink-0" />
                <span>Pan</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInteractionMode((m) => {
                    const next = m === 'PROBE' ? 'EDIT' : 'PROBE';
                    if (next === 'PROBE') {
                      setInspectorSubTab('PROBE');
                      setStatusMessage(
                        'DUAL PROBE MODE: Click any pin pad, component, or trace node to place Red Probe A & Black Probe B.'
                      );
                    }
                    return next;
                  });
                }}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'PROBE'
                    ? 'diag-tab-active'
                    : probeA || probeB
                    ? 'hw-btn-green'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Place Dual Probes (A/B) for Live MNA Differential Voltage, Continuity & Diode Drop Testing (P)"
              >
                <Crosshair className="w-3.5 h-3.5 shrink-0" />
                <span>Probe</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setInteractionMode((m) => (m === 'TRACE_EDIT' ? 'EDIT' : 'TRACE_EDIT'))
                }
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'TRACE_EDIT'
                    ? 'diag-tab-active'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Drag individual copper trace vertices to align with physical PCB tracks"
              >
                <Waypoints className="w-3.5 h-3.5 shrink-0" />
                <span>Traces</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInteractionMode((m) => {
                    const next = m === 'TRACE_PATH' ? 'EDIT' : 'TRACE_PATH';
                    if (next === 'TRACE_PATH') {
                      setStatusMessage(
                        tracePathPair[0] && tracePathPair[1]
                          ? `TRACE PATH ACTIVE [${tracePathPair[0]} ↔ ${tracePathPair[1]}]: Hover any node to trace path, or click 2 new components.`
                          : 'TRACE PATH MODE: Click two components on the PCB, then hover over any node to trace a continuous line.'
                      );
                    }
                    return next;
                  });
                }}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'TRACE_PATH'
                    ? 'diag-tab-active'
                    : tracePathPair[0] && tracePathPair[1]
                    ? 'hw-btn-amber'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Click 2 components, then hover any node to highlight a continuous trace path between them"
              >
                <Route className="w-3.5 h-3.5 shrink-0" />
                <span>Path</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!uploadedImageUrl) {
                    setStatusMessage('Upload a PCB photo first to use zoomed Macro Crop re-scan.');
                    return;
                  }
                  setInteractionMode((m) => (m === 'MACRO_CROP' ? 'EDIT' : 'MACRO_CROP'));
                  setCropMarquee(null);
                }}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  interactionMode === 'MACRO_CROP'
                    ? 'hw-btn-amber'
                    : 'hw-btn text-[#EAF3FF]/90 hover:text-white'
                }`}
                title="Drag a zoom box over any SMD cluster to re-scan IC markings"
              >
                <Crop className="w-3.5 h-3.5 shrink-0" />
                <span>Crop</span>
              </button>
            </div>

            {/* Right: Layers & Filter Toggle + Compact Zoom Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowLayersPanel((prev) => !prev)}
                aria-expanded={showLayersPanel}
                className={`h-7 px-2 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
                  showLayersPanel ? 'diag-tab-active' : 'hw-btn text-[#19C8F5] hover:text-white'
                }`}
                title="Toggle PCB visual layers and optical filter"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline">Layers</span>
              </button>

              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(0.38, +(prev - 0.15).toFixed(2)))}
                className="hw-btn h-7 w-7 rounded-md inline-flex items-center justify-center text-[#EAF3FF] hover:text-white transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="hidden sm:inline-block text-[10.5px] px-1 text-[#19C8F5] font-mono font-bold tabular-nums min-w-[38px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(2.4, +(prev + 0.15).toFixed(2)))}
                className="hw-btn h-7 w-7 rounded-md inline-flex items-center justify-center text-[#EAF3FF] hover:text-white transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitBoardToViewport}
                className="hw-btn h-7 px-2 rounded-md text-[#EAF3FF] hover:text-white text-[10.5px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                title="Fit PCB to Viewport"
              >
                <Maximize2 className="w-3 h-3 text-[#FFB020]" />
                <span className="hidden sm:inline">Fit</span>
              </button>
            </div>
          </div>

          {/* Collapsible Layers & Optical Filter Drawer Tray (Hidden by Default to Maximize PCB Board View) */}
          {showLayersPanel && (
            <div className="bg-[#0A1220]/96 border-b border-[#203653] px-3 py-2 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[11px] font-mono text-[#EAF3FF]/90 shrink-0">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showPhotoTexture}
                  onChange={(e) => setShowPhotoTexture(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Photo</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showComponents}
                  onChange={(e) => setShowComponents(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Parts</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showNets}
                  onChange={(e) => setShowNets(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Traces</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showPinMarkers}
                  onChange={(e) => setShowPinMarkers(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Pins</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showVoltageLabels}
                  onChange={(e) => setShowVoltageLabels(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Voltages</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showHotspots}
                  onChange={(e) => setShowHotspots(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Hotspots ({hotspots.length})</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showThermalHeatmap}
                  onChange={(e) => setShowThermalHeatmap(e.target.checked)}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Thermal</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white">
                <input
                  type="checkbox"
                  checked={showDatasheetInfo}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setShowDatasheetInfo(next);
                    if (!next) {
                      setClickedDatasheetNode(null);
                    } else {
                      setStatusMessage(
                        'DATASHEET INFO ENABLED: Click any component node or pin pad to view component specifications.'
                      );
                    }
                  }}
                  className="accent-[#19C8F5] rounded"
                />
                <span>Datasheet</span>
              </label>

              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#91A4BD]">Filter</span>
                  <select
                    aria-label="Optical filter"
                    value={opticalFilter}
                    onChange={(e) => setOpticalFilter(e.target.value as OpticalFilterMode)}
                    className="bg-[#050A12] text-[#EAF3FF] border border-[#203653] rounded-md px-2 py-0.5 text-[11px] focus:outline-none focus:border-[#19C8F5]"
                  >
                    <option value="NORMAL">Natural</option>
                    <option value="CONTRAST">Contrast</option>
                    <option value="UV_SILK">UV Silkscreen</option>
                    <option value="XRAY">X-Ray</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setZoomLevel(1.0)}
                  className="hw-btn h-6 px-2 rounded-md text-[10px] inline-flex items-center gap-1 cursor-pointer"
                  title="Reset 100% Zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>100%</span>
                </button>
              </div>
            </div>
          )}

          {/* Contextual Docked Bars for Dual Probe & Trace Path */}
          {(interactionMode === 'PROBE' || probeA || probeB) && (
            <div className="bg-[#0f131a] border-b border-emerald-500/50 px-3.5 py-1.5 text-[10.5px] font-mono text-slate-200 flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>DUAL PROBE:</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-bold ${
                  probeA
                    ? 'bg-rose-950/80 border-rose-500/70 text-rose-200'
                    : 'bg-[#0c0e12] border-[#2b313c] text-slate-400'
                }`}
              >
                A(+): {probeA ? probeA.label : 'Click node 1'}
              </span>
              <span className="text-emerald-400 font-bold">↔</span>
              <span
                className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-bold ${
                  probeB
                    ? 'bg-[#1a202c] border-[#4b5566] text-slate-100'
                    : 'bg-[#0c0e12] border-[#2b313c] text-slate-400'
                }`}
              >
                B(−): {probeB ? probeB.label : 'Click node 2'}
              </span>
              {dualProbeMeasurement && (
                <span className="px-2 py-0.5 rounded-[3px] bg-[#0c0e12] border border-amber-500/60 text-amber-300 font-bold tabular-nums">
                  ΔV {dualProbeMeasurement.differentialVoltage >= 0 ? '+' : ''}
                  {dualProbeMeasurement.differentialVoltage.toFixed(3)}V ·{' '}
                  {dualProbeMeasurement.continuityLabel}
                </span>
              )}
              {(probeA || probeB) && (
                <button
                  type="button"
                  onClick={() => {
                    setProbeA(null);
                    setProbeB(null);
                    setNextProbeSlot('A');
                    setStatusMessage('Cleared Dual Probes A & B.');
                  }}
                  className="hw-btn ml-auto px-2 py-0.5 rounded-[3px] text-slate-300 hover:text-rose-200 flex items-center gap-1 text-[10px] cursor-pointer"
                  title="Clear Probe A and Probe B"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          )}

          {(interactionMode === 'TRACE_PATH' || tracePathPair[0] !== null) && (
            <div className="bg-[#0f131a] border-b border-amber-500/50 px-3.5 py-1.5 text-[10.5px] font-mono text-slate-200 flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-amber-300 font-bold">
                <Route className="w-3.5 h-3.5 text-amber-400" />
                <span>CONNECTIVITY:</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-bold ${
                  tracePathPair[0]
                    ? 'bg-amber-950/80 border-amber-500/70 text-amber-200'
                    : 'bg-[#0c0e12] border-[#2b313c] text-slate-400'
                }`}
              >
                A: {tracePathPair[0] || 'Click Comp 1'}
              </span>
              <span className="text-amber-400 font-bold">↔</span>
              <span
                className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-bold ${
                  tracePathPair[1]
                    ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300'
                    : 'bg-[#0c0e12] border-[#2b313c] text-slate-400'
                }`}
              >
                B: {tracePathPair[1] || 'Click Comp 2'}
              </span>
              <span className="text-[10px] font-sans text-slate-400">
                {highlightedContinuousPath
                  ? `Tracing via ${highlightedContinuousPath.hoveredNodeLabel} (${
                      highlightedContinuousPath.isNetVerified
                        ? highlightedContinuousPath.traversedNets.join(' → ')
                        : 'Direct Node Route'
                    })`
                  : tracePathPair[0] && tracePathPair[1]
                  ? 'Hover over any pin or trace node to highlight continuous line'
                  : 'Click 2 components on the board (or Shift+Click in Edit mode)'}
              </span>
              {(tracePathPair[0] || tracePathPair[1]) && (
                <button
                  type="button"
                  onClick={() => {
                    setTracePathPair([null, null]);
                    setStatusMessage('Cleared Trace Path component pair.');
                  }}
                  className="hw-btn ml-auto px-2 py-0.5 rounded-[3px] text-slate-300 hover:text-rose-200 flex items-center gap-1 text-[10px] cursor-pointer"
                  title="Clear selected trace path components"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          )}

          {/* Aspect-Locked 0..1000 Normalized PCB Viewport */}
          <div
            ref={viewportScrollRef}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.12 : -0.12;
                setZoomLevel((prev) => Math.min(2.4, Math.max(0.38, +(prev + delta).toFixed(2))));
              }
            }}
            className="flex-1 overflow-auto p-2 sm:p-4 flex items-start justify-start hud-blueprint-grid"
          >
            <div
              ref={boardRef}
              onPointerDown={(e) => {
                if (!boardRef.current) return;
                if (interactionMode === 'PAN' && viewportScrollRef.current) {
                  dragRef.current = {
                    type: 'PAN_VIEWPORT',
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startScrollLeft: viewportScrollRef.current.scrollLeft,
                    startScrollTop: viewportScrollRef.current.scrollTop,
                  };
                  return;
                }
                if (interactionMode === 'MACRO_CROP') {
                  const rect = boardRef.current.getBoundingClientRect();
                  const startXNorm = clampCoord(((e.clientX - rect.left) / Math.max(1, rect.width)) * 1000);
                  const startYNorm = clampCoord(((e.clientY - rect.top) / Math.max(1, rect.height)) * 1000);
                  dragRef.current = {
                    type: 'CROP',
                    startXNorm,
                    startYNorm,
                    boardRect: rect,
                  };
                  setCropMarquee({
                    xmin: startXNorm,
                    ymin: startYNorm,
                    xmax: startXNorm,
                    ymax: startYNorm,
                  });
                  return;
                }
                if (interactionMode === 'EDIT') {
                  setClickedDatasheetNode(null);
                }
              }}
              style={{ width: `${boardWidthPx}px`, height: `${boardHeightPx}px` }}
              className={`relative shrink-0 m-auto bg-[#0c1a16] border-[2px] border-[#283f37] rounded-[6px] shadow-[0_15px_55px_rgba(0,0,0,0.75)] overflow-hidden select-none ${
                interactionMode === 'MACRO_CROP' || interactionMode === 'PROBE'
                  ? 'cursor-crosshair'
                  : interactionMode === 'PAN'
                  ? 'cursor-grab active:cursor-grabbing'
                  : ''
              }`}
            >
              {/* Scan Photo / High-Detail PCB Macro Texture (1:1 coordinate fidelity) or High-Detail FR4 Board Vector */}
              {uploadedImageUrl && showPhotoTexture ? (
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded PCB Scan Document"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                      const nextAspect = el.naturalWidth / el.naturalHeight;
                      setBoardAspect(nextAspect);
                      const vp = viewportScrollRef.current;
                      if (vp) {
                        const availW = Math.max(320, vp.clientWidth - 48);
                        const availH = Math.max(240, vp.clientHeight - 160);
                        const baseH = 740 / Math.max(0.5, Math.min(2.2, nextAspect));
                        const fitZoom = Math.min(1.0, availW / 740, availH / baseH);
                        setZoomLevel(Math.min(2.4, Math.max(0.55, Number(fitZoom.toFixed(2)))));
                      }
                    }
                  }}
                  className={`absolute inset-0 w-full h-full object-fill pointer-events-none transition-all duration-200 ${
                    opticalFilter === 'CONTRAST'
                      ? 'opacity-95 contrast-150 brightness-110 saturate-125'
                      : opticalFilter === 'UV_SILK'
                      ? 'opacity-95 invert hue-rotate-180 contrast-125 brightness-105'
                      : opticalFilter === 'XRAY'
                      ? 'opacity-25 grayscale contrast-150'
                      : 'opacity-90'
                  }`}
                />
              ) : (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity ${
                    opticalFilter === 'XRAY'
                      ? 'opacity-30 grayscale'
                      : opticalFilter === 'UV_SILK'
                      ? 'invert hue-rotate-180 contrast-125'
                      : opticalFilter === 'CONTRAST'
                      ? 'contrast-150 brightness-110'
                      : 'opacity-100'
                  }`}
                >
                  <defs>
                    <pattern id="pcbGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#113027" strokeWidth="1" />
                      <circle cx="20" cy="20" r="1.2" fill="#184236" />
                    </pattern>
                    <radialGradient id="groundPourGlow" cx="50%" cy="50%" r="55%">
                      <stop offset="0%" stopColor="#12382e" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#071512" stopOpacity="0.95" />
                    </radialGradient>
                  </defs>

                  <rect width="1000" height="1000" fill="url(#groundPourGlow)" />
                  <rect width="1000" height="1000" fill="url(#pcbGrid)" />

                  {/* Board Perimeter Silkscreen & Keepout Border */}
                  <rect
                    x="42"
                    y="55"
                    width="916"
                    height="890"
                    rx="18"
                    fill="none"
                    stroke="#286b59"
                    strokeWidth="3"
                    strokeDasharray="12,6"
                  />

                  {/* Corner Chassis Mounting Holes with Ground Via Rings */}
                  {[
                    { cx: 80, cy: 95 },
                    { cx: 920, cy: 95 },
                    { cx: 80, cy: 905 },
                    { cx: 920, cy: 905 },
                  ].map((hole, idx) => (
                    <g key={idx}>
                      <circle cx={hole.cx} cy={hole.cy} r="22" fill="#0d2620" stroke="#c29d38" strokeWidth="5" />
                      <circle cx={hole.cx} cy={hole.cy} r="11" fill="#040b09" />
                    </g>
                  ))}

                  {/* Thermal Via Stitching Array under U1 / U2 Center Zone */}
                  {[380, 420, 460, 500, 540].map((vx) =>
                    [420, 470, 520, 570, 620].map((vy) => (
                      <circle
                        key={`${vx}-${vy}`}
                        cx={vx}
                        cy={vy}
                        r="4"
                        fill="#061410"
                        stroke="#2d7a64"
                        strokeWidth="1.5"
                        opacity="0.65"
                      />
                    ))
                  )}

                  {/* OEM Silkscreen Legend Header */}
                  <text x="125" y="102" fill="#52b79a" fontSize="21" fontFamily="monospace" fontWeight="bold">
                    AUTOELECTRIC LAB PRO // {boardTitle.toUpperCase()}
                  </text>
                  <text x="125" y="130" fill="#37856f" fontSize="13.5" fontFamily="monospace">
                    {selectedBoard.oemReference} · {selectedBoard.pcbSpecs.layers}-LAYER {selectedBoard.pcbSpecs.copperWeightOz}oz CU · AEC-Q100
                  </text>
                </svg>
              )}

              {/* IR Thermal Camera Radial Heat Plumes (underneath components when heatmap enabled) */}
              {showThermalHeatmap && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full z-10 pointer-events-none"
                >
                  <defs>
                    {components.map((comp) => {
                      const therm = componentThermalMap[comp.refDes];
                      const temp = therm?.tempC ?? 25;
                      const stopColor =
                        temp >= 110
                          ? '#f43f5e'
                          : temp >= 80
                          ? '#f59e0b'
                          : temp >= 50
                          ? '#fb923c'
                          : '#3b82f6';
                      return (
                        <radialGradient key={`grad-${comp.refDes}`} id={`therm-grad-${comp.refDes}`} cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor={stopColor} stopOpacity="0.65" />
                          <stop offset="55%" stopColor={stopColor} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={stopColor} stopOpacity="0" />
                        </radialGradient>
                      );
                    })}
                  </defs>
                  {components.map((comp) => {
                    const center = getBoxCenter(comp.bbox);
                    const rx = Math.max(85, (comp.bbox.xmax - comp.bbox.xmin) * 0.95);
                    const ry = Math.max(85, (comp.bbox.ymax - comp.bbox.ymin) * 0.95);
                    return (
                      <ellipse
                        key={`plume-${comp.refDes}`}
                        cx={center.x}
                        cy={center.y}
                        rx={rx}
                        ry={ry}
                        fill={`url(#therm-grad-${comp.refDes})`}
                      />
                    );
                  })}
                </svg>
              )}

              {/* Neon Copper Traces SVG Overlay (0..1000 normalized viewBox) */}
              {showNets && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full z-15 pointer-events-none"
                >
                  {nets.map((net) => {
                    const branches: TracePoint[][] =
                      net.traceBranches && net.traceBranches.length > 0
                        ? net.traceBranches
                        : net.tracePoints && net.tracePoints.length >= 2
                        ? [net.tracePoints]
                        : [];

                    if (branches.length === 0) return null;

                    const isNetActive = effectiveNetId === net.name;
                    const neonColor = getNetColor(net.name);

                    return (
                      <g
                        key={net.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveNetId(net.name);
                          setInspectorSubTab('NETS');
                          const vLive = resolveLiveNetVoltage(net.name, net.nominalVoltage ?? 0);
                          setStatusMessage(
                            `NET [${net.name}] (${vLive.toFixed(2)}V DC) -> Nodes: ${net.connectedComponentRefs.join(', ') || 'Trace Node'}`
                          );
                        }}
                        className="cursor-pointer pointer-events-auto"
                      >
                        {branches.map((branch, bIdx) => {
                          if (branch.length < 2) return null;
                          const pointsStr = branch.map((p) => `${p.x},${p.y}`).join(' ');
                          return (
                            <React.Fragment key={`${net.name}-b-${bIdx}`}>
                              {/* Wide invisible hit target for easy clicking */}
                              <polyline
                                points={pointsStr}
                                fill="none"
                                stroke="transparent"
                                strokeWidth="26"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {/* Outer illuminated copper trace */}
                              <polyline
                                points={pointsStr}
                                fill="none"
                                stroke={isNetActive ? '#f59e0b' : neonColor}
                                strokeWidth={isNetActive ? '12' : '5.5'}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={isNetActive ? '0.95' : '0.6'}
                                style={{
                                  filter: isNetActive
                                    ? 'drop-shadow(0 0 8px #f59e0b)'
                                    : `drop-shadow(0 0 4px ${neonColor})`,
                                }}
                              />
                              {/* Inner high-contrast core conductor */}
                              <polyline
                                points={pointsStr}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth={isNetActive ? '3.5' : '1.5'}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray={isNetActive ? '10,6' : undefined}
                                opacity={isNetActive ? '1' : '0.8'}
                              />
                            </React.Fragment>
                          );
                        })}

                        {/* Interactive Solder Pads / Trace Vertices */}
                        {showPinMarkers &&
                          branches.map((branch, bIdx) =>
                            branch.map((p, pIdx) => {
                              const mnaInfo = resolveMnaNodeDetails(
                                net.name,
                                net.nominalVoltage ?? 0
                              );
                              return (
                                <circle
                                  key={`${net.name}-pt-${bIdx}-${pIdx}`}
                                  cx={p.x}
                                  cy={p.y}
                                  r={interactionMode === 'TRACE_EDIT' ? '11' : isNetActive ? '8.5' : '5.5'}
                                  fill={
                                    interactionMode === 'TRACE_EDIT'
                                      ? '#fde047'
                                      : isNetActive
                                      ? '#f59e0b'
                                      : neonColor
                                  }
                                  stroke="#0f172a"
                                  strokeWidth="2.5"
                                  onMouseEnter={() => {
                                    setHoveredPinNetId(net.name);
                                    setHoveredNodeTooltip({
                                      nodeLabel: `Trace Junction Node #${pIdx + 1}`,
                                      netId: net.name,
                                      mnaSourceNode: mnaInfo.mnaNodeId,
                                      detectedVoltage: mnaInfo.voltage,
                                      nominalVoltage: net.nominalVoltage ?? mnaInfo.voltage,
                                      category: net.signalType,
                                      notes: `Connected components: ${net.connectedComponentRefs.join(', ') || 'None'}`,
                                      xNorm: p.x,
                                      yNorm: p.y,
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredPinNetId(null);
                                    setHoveredNodeTooltip(null);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (interactionMode === 'PROBE') {
                                      handlePlaceProbe({
                                        label: `${net.name} Node #${pIdx + 1}`,
                                        netId: net.name,
                                        nominalVoltage: net.nominalVoltage ?? 0,
                                        xNorm: p.x,
                                        yNorm: p.y,
                                      });
                                      return;
                                    }
                                    setActiveNetId(net.name);
                                    const primaryCompRef = net.connectedComponentRefs?.[0];
                                    if (primaryCompRef) {
                                      const linkedComp = components.find((c) => c.refDes === primaryCompRef);
                                      const linkedPin = linkedComp?.pinSpecs?.find(
                                        (ps) => ps.connectedNetId === net.name
                                      );
                                      openDatasheetCardForNode(
                                        primaryCompRef,
                                        p.x,
                                        p.y,
                                        linkedPin?.pinNumber,
                                        linkedPin?.pinName,
                                        net.name
                                      );
                                    }
                                  }}
                                  onPointerDown={(e) => {
                                    if (interactionMode !== 'TRACE_EDIT' || !boardRef.current) return;
                                    e.stopPropagation();
                                    setActiveNetId(net.name);
                                    dragRef.current = {
                                      type: 'MOVE_TRACE_NODE',
                                      netName: net.name,
                                      branchIndex: net.traceBranches ? bIdx : undefined,
                                      pointIndex: pIdx,
                                      boardRect: boardRef.current.getBoundingClientRect(),
                                    };
                                  }}
                                  className={
                                    interactionMode === 'TRACE_EDIT'
                                      ? 'cursor-move hover:scale-125 transition-transform'
                                      : 'cursor-pointer'
                                  }
                                >
                                  <title>{`${net.name} Node #${pIdx + 1}: ${mnaInfo.voltage.toFixed(3)} V DC (MNA: ${mnaInfo.mnaNodeId})`}</title>
                                </circle>
                              );
                            })
                          )}
                      </g>
                    );
                  })}

                  {/* Physical Component Edge Pin Solder Pads & Automatic MNA Voltage Callouts */}
                  {showPinMarkers &&
                    components.map((comp) => {
                      const pins = comp.pinSpecs || [];
                      return pins.map((pin, idx) => {
                        const pt = computeComponentPinCoords(comp, idx, pins.length);
                        const isPinNetActive = effectiveNetId === pin.connectedNetId;
                        const mnaDetails = resolveMnaNodeDetails(
                          pin.connectedNetId,
                          pin.nominalVoltage
                        );
                        const isLeftEdge = pt.x <= comp.bbox.xmin + 10;
                        const labelX = isLeftEdge ? pt.x - 44 : pt.x + 10;
                        const labelY = pt.y - 8;

                        return (
                          <g
                            key={`pad-${comp.refDes}-${pin.pinNumber}`}
                            className="pointer-events-auto cursor-pointer"
                            onMouseEnter={() => {
                              if (pin.connectedNetId && pin.connectedNetId !== 'NET_UNASSIGNED') {
                                setHoveredPinNetId(pin.connectedNetId);
                              }
                              setHoveredNodeTooltip({
                                nodeLabel: `${comp.refDes} · Pin #${pin.pinNumber} (${pin.pinName})`,
                                compRefDes: comp.refDes,
                                pinNumber: pin.pinNumber,
                                pinName: pin.pinName,
                                netId: pin.connectedNetId,
                                mnaSourceNode: mnaDetails.mnaNodeId,
                                detectedVoltage: mnaDetails.voltage,
                                nominalVoltage: pin.nominalVoltage,
                                category: pin.category,
                                notes: pin.notes,
                                xNorm: pt.x,
                                yNorm: pt.y,
                              });
                            }}
                            onMouseLeave={() => {
                              setHoveredPinNetId(null);
                              setHoveredNodeTooltip(null);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (interactionMode === 'PROBE') {
                                handlePlaceProbe({
                                  label: `${comp.refDes} #${pin.pinNumber} (${pin.pinName})`,
                                  compRefDes: comp.refDes,
                                  pinNumber: pin.pinNumber,
                                  pinName: pin.pinName,
                                  netId: pin.connectedNetId,
                                  nominalVoltage: pin.nominalVoltage,
                                  xNorm: pt.x,
                                  yNorm: pt.y,
                                });
                                return;
                              }
                              if (interactionMode === 'TRACE_PATH' || e.shiftKey) {
                                handleSelectTracePathComponent(comp.refDes);
                                return;
                              }
                              setSelectedCompRef(comp.refDes);
                              setSelectedPinNumber(pin.pinNumber);
                              setActiveNetId(pin.connectedNetId);
                              setInspectorSubTab('PART');
                              openDatasheetCardForNode(
                                comp.refDes,
                                pt.x,
                                pt.y,
                                pin.pinNumber,
                                pin.pinName,
                                pin.connectedNetId
                              );
                            }}
                          >
                            <title>{`${comp.refDes} Pin #${pin.pinNumber} (${pin.pinName}) — Detected MNA Voltage: ${mnaDetails.voltage.toFixed(3)} V DC (Nominal: ${pin.nominalVoltage.toFixed(2)} V) | Net: ${pin.connectedNetId}`}</title>
                            <rect
                              x={pt.x - 7}
                              y={pt.y - 5}
                              width="14"
                              height="10"
                              rx="1.5"
                              fill={isPinNetActive ? '#f59e0b' : '#e2e8f0'}
                              stroke="#0f172a"
                              strokeWidth="1.8"
                            />
                            {showVoltageLabels && (
                              <g>
                                <rect
                                  x={labelX}
                                  y={labelY}
                                  width="36"
                                  height="15"
                                  rx="2"
                                  fill={isPinNetActive ? '#1c1507' : '#0b0e13'}
                                  fillOpacity="0.94"
                                  stroke={
                                    isPinNetActive
                                      ? '#f59e0b'
                                      : pin.category === 'ground'
                                      ? '#22c55e'
                                      : '#f59e0b'
                                  }
                                  strokeWidth="1.2"
                                />
                                <text
                                  x={labelX + 18}
                                  y={labelY + 10.5}
                                  textAnchor="middle"
                                  fill={
                                    isPinNetActive
                                      ? '#fcd34d'
                                      : pin.category === 'ground'
                                      ? '#4ade80'
                                      : '#fcd34d'
                                  }
                                  fontSize="9.5"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                >
                                  {mnaDetails.voltage.toFixed(2)}V
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      });
                    })}
                </svg>
              )}

              {/* Fault Hotspots Layer (Burn / Oxidation / Thermal Zones) */}
              {showHotspots &&
                hotspots.map((hotspot) => {
                  const isSelectedHotspot = selectedHotspotId === hotspot.id;
                  const topPct = (hotspot.bbox.ymin / 1000) * 100;
                  const leftPct = (hotspot.bbox.xmin / 1000) * 100;
                  const widthPct = ((hotspot.bbox.xmax - hotspot.bbox.xmin) / 1000) * 100;
                  const heightPct = ((hotspot.bbox.ymax - hotspot.bbox.ymin) / 1000) * 100;

                  const tone =
                    hotspot.severity === 'CRITICAL'
                      ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                      : hotspot.severity === 'WARNING'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-[#94a3b8] bg-[#1e2430]/40 text-slate-200';

                  return (
                    <div
                      key={hotspot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHotspotId(hotspot.id);
                        setInspectorSubTab('AUDIT');
                        if (hotspot.suspectComponentRef) {
                          setSelectedCompRef(hotspot.suspectComponentRef);
                        }
                        setStatusMessage(`HOTSPOT [${hotspot.severity}]: ${hotspot.label}`);
                      }}
                      style={{
                        top: `${topPct}%`,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                      className={`absolute z-20 border-2 border-dashed rounded-md cursor-pointer transition ${tone} ${
                        isSelectedHotspot ? 'ring-2 ring-white shadow-lg z-25' : ''
                      }`}
                      title={`${hotspot.severity}: ${hotspot.label}`}
                    >
                      <span className="absolute -top-4 left-0 text-[8.5px] font-bold px-1 rounded bg-slate-950/90 border border-current whitespace-nowrap flex items-center gap-0.5">
                        <Flame className="w-2.5 h-2.5" />
                        {hotspot.severity}
                      </span>
                    </div>
                  );
                })}

              {/* Interactive Draggable & Resizable Component Bounding Boxes (0..1000 %) */}
              {showComponents &&
                components.map((comp) => {
                  const isSelected = selectedCompRef === comp.refDes;
                  const isTraceSourceA = tracePathPair[0] === comp.refDes;
                  const isTraceTargetB = tracePathPair[1] === comp.refDes;
                  const isVerified = comp.verificationStatus === 'VERIFIED';
                  const activeNetObj = nets.find((n) => n.name === effectiveNetId);
                  const isCompInActiveNet = effectiveNetId
                    ? comp.pinSpecs?.some((p) => p.connectedNetId === effectiveNetId) ||
                      activeNetObj?.connectedComponentRefs.includes(comp.refDes)
                    : false;

                  const thermal = componentThermalMap[comp.refDes] || {
                    tempC: ambientTempC,
                    powerDissipationMw: 0,
                    thermalResistanceJa: 50,
                    status: 'NOMINAL',
                    dominantHeatSource: 'Ambient',
                  };
                  const tempC = Math.round(thermal.tempC);

                  const topPct = (comp.bbox.ymin / 1000) * 100;
                  const leftPct = (comp.bbox.xmin / 1000) * 100;
                  const widthPct = ((comp.bbox.xmax - comp.bbox.xmin) / 1000) * 100;
                  const heightPct = ((comp.bbox.ymax - comp.bbox.ymin) / 1000) * 100;

                  const positionY = comp.bbox.ymin < 230 ? 'top-full mt-2' : 'bottom-full mb-2';
                  const positionX = comp.bbox.xmin > 560 ? 'right-0' : 'left-0';

                  return (
                    <div
                      key={comp.refDes}
                      tabIndex={0}
                      onMouseEnter={() => {
                        const firstNet = comp.pinSpecs?.[0]?.connectedNetId;
                        if (firstNet && firstNet !== 'NET_UNASSIGNED') {
                          setHoveredPinNetId(firstNet);
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredPinNetId(null);
                      }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).dataset.noDrag === 'true') return;
                        if (interactionMode === 'PROBE') {
                          e.stopPropagation();
                          const firstPin = comp.pinSpecs?.[0];
                          const pt = firstPin
                            ? computeComponentPinCoords(comp, 0, comp.pinSpecs?.length || 1)
                            : getBoxCenter(comp.bbox);
                          handlePlaceProbe({
                            label: firstPin
                              ? `${comp.refDes} #${firstPin.pinNumber} (${firstPin.pinName})`
                              : comp.refDes,
                            compRefDes: comp.refDes,
                            pinNumber: firstPin?.pinNumber,
                            pinName: firstPin?.pinName,
                            netId: firstPin?.connectedNetId || 'NET_UNASSIGNED',
                            nominalVoltage: firstPin?.nominalVoltage ?? 0,
                            xNorm: pt.x,
                            yNorm: pt.y,
                          });
                          return;
                        }
                        if (interactionMode === 'TRACE_PATH' || (interactionMode === 'EDIT' && e.shiftKey)) {
                          e.stopPropagation();
                          setSelectedCompRef(comp.refDes);
                          handleSelectTracePathComponent(comp.refDes);
                          return;
                        }
                        if (interactionMode !== 'EDIT' || !boardRef.current) return;
                        e.stopPropagation();
                        setSelectedCompRef(comp.refDes);
                        setInspectorSubTab('PART');
                        const firstPin = comp.pinSpecs?.[0];
                        if (
                          firstPin?.connectedNetId &&
                          firstPin.connectedNetId !== 'NET_UNASSIGNED'
                        ) {
                          setActiveNetId(firstPin.connectedNetId);
                          setSelectedPinNumber(firstPin.pinNumber);
                        }
                        const boxCenter = getBoxCenter(comp.bbox);
                        openDatasheetCardForNode(
                          comp.refDes,
                          boxCenter.x,
                          boxCenter.y,
                          firstPin?.pinNumber,
                          firstPin?.pinName,
                          firstPin?.connectedNetId
                        );
                        dragRef.current = {
                          type: 'MOVE',
                          refDes: comp.refDes,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origBox: { ...comp.bbox },
                          boardRect: boardRef.current.getBoundingClientRect(),
                        };
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (interactionMode === 'TRACE_PATH') {
                            handleSelectTracePathComponent(comp.refDes);
                          } else {
                            setSelectedCompRef(comp.refDes);
                          }
                        }
                      }}
                      style={{
                        top: `${topPct}%`,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                      className={`group/comp absolute ${
                        interactionMode === 'TRACE_PATH'
                          ? 'cursor-crosshair'
                          : 'cursor-grab active:cursor-grabbing'
                      } border-2 transition-shadow flex flex-col justify-between p-1.5 rounded-[3px] focus:outline-none ${
                        showThermalHeatmap
                          ? tempC >= 110
                            ? 'border-rose-500 bg-rose-950/85 text-rose-200 animate-pulse z-25'
                            : tempC >= 80
                            ? 'border-amber-400 bg-amber-950/80 text-amber-200 z-25'
                            : tempC >= 48
                            ? 'border-orange-400 bg-orange-950/55 text-orange-200 z-25'
                            : 'border-sky-500/80 bg-sky-950/45 text-sky-200 z-25'
                          : isTraceSourceA
                          ? 'border-amber-400 bg-amber-950/80 ring-2 ring-amber-400/70 z-30'
                          : isTraceTargetB
                          ? 'border-[#4ade80] bg-[#10261a]/90 ring-2 ring-[#4ade80]/70 z-30'
                          : isSelected
                          ? 'border-amber-400 bg-[#1c160c]/90 shadow-[0_0_0_2px_rgba(245,158,11,0.3),0_8px_24px_rgba(0,0,0,0.6)] z-30'
                          : isCompInActiveNet
                          ? 'border-[#3b82f6] bg-[#111c33]/88 ring-1 ring-[#3b82f6]/60 z-25'
                          : isVerified
                          ? 'border-emerald-500/80 bg-[#0d1c15]/80 hover:border-emerald-400 z-20'
                          : 'border-amber-500/75 bg-[#1b150c]/80 hover:border-amber-400 z-20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold leading-none gap-1">
                        <span
                          className={
                            showThermalHeatmap
                              ? tempC >= 110
                                ? 'text-rose-300 font-extrabold'
                                : tempC >= 80
                                ? 'text-amber-300 font-extrabold'
                                : 'text-sky-300 font-extrabold'
                              : isTraceSourceA
                              ? 'text-amber-300 font-extrabold'
                              : isTraceTargetB
                              ? 'text-[#4ade80] font-extrabold'
                              : isSelected
                              ? 'text-amber-300 font-extrabold'
                              : isCompInActiveNet
                              ? 'text-blue-300 font-extrabold'
                              : isVerified
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }
                        >
                          {comp.refDes}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {isTraceSourceA && (
                            <span className="text-[7px] bg-amber-500 text-slate-950 px-1 rounded-[1px] font-extrabold">
                              TRACE A
                            </span>
                          )}
                          {isTraceTargetB && (
                            <span className="text-[7px] bg-[#22c55e] text-slate-950 px-1 rounded-[1px] font-extrabold">
                              TRACE B
                            </span>
                          )}
                          {showThermalHeatmap && (
                            <span
                              className={`text-[8.5px] px-1 rounded-[1px] font-bold border ${
                                tempC >= 110
                                  ? 'bg-rose-950 text-rose-200 border-rose-500'
                                  : tempC >= 80
                                  ? 'bg-amber-950 text-amber-200 border-amber-500'
                                  : tempC >= 48
                                  ? 'bg-orange-950 text-orange-200 border-orange-500'
                                  : 'bg-sky-950 text-sky-200 border-sky-500'
                              }`}
                            >
                              {tempC}°C · {thermal.powerDissipationMw}mW
                            </span>
                          )}
                          {!showThermalHeatmap && !isTraceSourceA && !isTraceTargetB && isCompInActiveNet && (
                            <span className="text-[7px] bg-amber-400 text-black px-1 rounded-[1px] font-extrabold">
                              NET
                            </span>
                          )}
                          {isVerified ? (
                            <CheckCircle className="w-3 h-3 text-[#4ade80]" />
                          ) : (
                            <span
                              className={`text-[7.5px] px-1 rounded-[1px] border ${
                                comp.verificationStatus === 'UNKNOWN'
                                  ? 'text-slate-200 bg-[#0c0e12]/95 border-amber-500/70'
                                  : 'text-amber-300 bg-amber-950/90 border-amber-700'
                              }`}
                            >
                              {comp.verificationStatus === 'UNKNOWN'
                                ? 'UNKNOWN'
                                : comp.source === 'LOCAL_CV'
                                ? 'CV'
                                : 'AI'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[9px] font-mono truncate text-slate-100 font-semibold leading-tight">
                        {comp.marking || comp.category}
                      </div>

                      {/* Component Pin Interactive Badges (shown on selected component or when zoomed >= 85% to avoid board crowding) */}
                      {showPinMarkers && comp.pinSpecs && comp.pinSpecs.length > 0 && (isSelected || zoomLevel >= 0.85) && (
                        <div className="flex items-center gap-0.5 flex-wrap pt-0.5 border-t border-slate-800/80">
                          {comp.pinSpecs.slice(0, 8).map((pin, idx) => {
                            const isPinSelected =
                              selectedPinNumber === pin.pinNumber && selectedCompRef === comp.refDes;
                            const isPinNetActive = effectiveNetId === pin.connectedNetId;
                            const mnaDetails = resolveMnaNodeDetails(
                              pin.connectedNetId,
                              pin.nominalVoltage
                            );
                            const liveV = mnaDetails.voltage;
                            const pinCoords = computeComponentPinCoords(
                              comp,
                              idx,
                              comp.pinSpecs?.length || 1
                            );
                            return (
                              <button
                                key={pin.pinNumber}
                                data-no-drag="true"
                                onMouseEnter={() => {
                                  if (pin.connectedNetId && pin.connectedNetId !== 'NET_UNASSIGNED') {
                                    setHoveredPinNetId(pin.connectedNetId);
                                  }
                                  setHoveredNodeTooltip({
                                    nodeLabel: `${comp.refDes} · Pin #${pin.pinNumber} (${pin.pinName})`,
                                    compRefDes: comp.refDes,
                                    pinNumber: pin.pinNumber,
                                    pinName: pin.pinName,
                                    netId: pin.connectedNetId,
                                    mnaSourceNode: mnaDetails.mnaNodeId,
                                    detectedVoltage: liveV,
                                    nominalVoltage: pin.nominalVoltage,
                                    category: pin.category,
                                    notes: pin.notes,
                                    xNorm: pinCoords.x,
                                    yNorm: pinCoords.y,
                                  });
                                }}
                                onMouseLeave={() => {
                                  setHoveredPinNetId(null);
                                  setHoveredNodeTooltip(null);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (interactionMode === 'PROBE') {
                                    handlePlaceProbe({
                                      label: `${comp.refDes} #${pin.pinNumber} (${pin.pinName})`,
                                      compRefDes: comp.refDes,
                                      pinNumber: pin.pinNumber,
                                      pinName: pin.pinName,
                                      netId: pin.connectedNetId,
                                      nominalVoltage: pin.nominalVoltage,
                                      xNorm: pinCoords.x,
                                      yNorm: pinCoords.y,
                                    });
                                    return;
                                  }
                                  if (interactionMode === 'TRACE_PATH' || e.shiftKey) {
                                    handleSelectTracePathComponent(comp.refDes);
                                    return;
                                  }
                                  setSelectedCompRef(comp.refDes);
                                  setSelectedPinNumber(pin.pinNumber);
                                  setActiveNetId(pin.connectedNetId);
                                  setInspectorSubTab('PART');
                                  openDatasheetCardForNode(
                                    comp.refDes,
                                    pinCoords.x,
                                    pinCoords.y,
                                    pin.pinNumber,
                                    pin.pinName,
                                    pin.connectedNetId
                                  );
                                  const connectedNet = nets.find((n) => n.name === pin.connectedNetId);
                                  const nodes = connectedNet
                                    ? connectedNet.connectedComponentRefs.join(', ')
                                    : comp.refDes;
                                  setStatusMessage(
                                    `PIN #${pin.pinNumber} (${pin.pinName}) · ${liveV.toFixed(3)}V DC · Net [${pin.connectedNetId}] -> ${nodes}`
                                  );
                                }}
                                title={`${comp.refDes} Pin #${pin.pinNumber} (${pin.pinName}) — Detected MNA Voltage: ${liveV.toFixed(3)} V DC (Nominal: ${pin.nominalVoltage.toFixed(2)} V) | Net: ${pin.connectedNetId}`}
                                className={`px-1 rounded-[1px] text-[7px] font-mono font-bold transition flex items-center gap-0.5 ${
                                  isPinSelected
                                    ? 'bg-amber-400 text-black ring-1 ring-white font-extrabold'
                                    : isPinNetActive
                                    ? 'bg-amber-950 text-amber-200 border border-amber-400'
                                    : 'bg-[#0c0e12]/90 text-slate-300 hover:bg-[#1c222d] border border-[#2b313c]'
                                }`}
                              >
                                <span>#{pin.pinNumber}</span>
                                {showVoltageLabels && (
                                  <span
                                    className={
                                      isPinSelected
                                        ? 'text-slate-950 font-extrabold'
                                        : pin.category === 'ground'
                                        ? 'text-[#4ade80]'
                                        : 'text-amber-300'
                                    }
                                  >
                                    {liveV.toFixed(2)}V
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Corner Resize Handle */}
                      {interactionMode === 'EDIT' && (
                        <div
                          data-no-drag="true"
                          onPointerDown={(e) => {
                            if (!boardRef.current) return;
                            e.stopPropagation();
                            setSelectedCompRef(comp.refDes);
                            dragRef.current = {
                              type: 'RESIZE',
                              refDes: comp.refDes,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              origBox: { ...comp.bbox },
                              boardRect: boardRef.current.getBoundingClientRect(),
                            };
                          }}
                          title="Drag to resize bounding box"
                          className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-400 border border-[#0c0e12] rounded-[1px] cursor-nwse-resize opacity-85 hover:opacity-100"
                        />
                      )}

                      {/* Hover Contextual Spec & Live Electro-Thermal Tooltip */}
                      {!hoveredNodeTooltip && (
                        <div
                          className={`opacity-0 group-hover/comp:opacity-100 pointer-events-none absolute ${positionY} ${positionX} w-68 bg-[#12161d]/98 border border-[#444e5e] text-slate-100 p-2.5 rounded-[2px] shadow-2xl z-40 transition-opacity duration-150 font-mono`}
                        >
                          <div className="flex items-center justify-between border-b border-[#2b313c] pb-1.5 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <strong className="text-amber-300 text-xs">{comp.refDes}</strong>
                              <span className="text-[10px] text-slate-400 font-sans truncate max-w-[120px]">
                                {comp.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span className="text-[9px] px-1.5 rounded-[2px] font-bold bg-[#0c0e12] border border-[#2b313c] text-amber-300 tabular-nums">
                              {thermal.tempC.toFixed(1)}°C ({thermal.powerDissipationMw}mW)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                            <div>
                              <span className="text-slate-500 text-[8.5px] block font-sans">Package</span>
                              <span className="font-semibold text-slate-100 truncate block">
                                {comp.packageType || 'SMD'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[8.5px] block font-sans">Rating</span>
                              <span className="font-semibold text-[#4ade80] truncate block">
                                {comp.operatingVoltageRange || 'UNKNOWN'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[8.5px] block font-sans">Marking</span>
                              <span className="font-semibold text-amber-300 truncate block">
                                {comp.marking || comp.decodedValue || 'UNREADABLE'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[8.5px] block font-sans">Thermal RθJA</span>
                              <span className="font-semibold text-[#4ade80] truncate block">
                                {thermal.thermalResistanceJa} °C/W
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 pt-1 border-t border-[#2b313c] text-[9px] text-slate-400 font-sans truncate">
                            {thermal.dominantHeatSource}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Continuous Highlighted Trace Path Between Two Clicked Components on Node Hover */}
              {highlightedContinuousPath && highlightedContinuousPath.points.length >= 2 && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full z-35 pointer-events-none"
                >
                  <defs>
                    <linearGradient id="tracePathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="50%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                  </defs>

                  {/* Outer halo */}
                  <polyline
                    points={highlightedContinuousPath.pointsStr}
                    fill="none"
                    stroke={highlightedContinuousPath.isNetVerified ? '#22c55e' : '#f59e0b'}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.35"
                  />

                  {/* Crisp continuous core conductor */}
                  <polyline
                    points={highlightedContinuousPath.pointsStr}
                    fill="none"
                    stroke="url(#tracePathGradient)"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Animated electron signal flow dashes */}
                  <polyline
                    points={highlightedContinuousPath.pointsStr}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="10,8"
                    className="animate-electron-flow"
                  />

                  {/* Component A Anchor Marker */}
                  <circle
                    cx={highlightedContinuousPath.anchorA.x}
                    cy={highlightedContinuousPath.anchorA.y}
                    r="13"
                    fill="#f59e0b"
                    fillOpacity="0.28"
                    stroke="#fcd34d"
                    strokeWidth="3"
                  />
                  <circle
                    cx={highlightedContinuousPath.anchorA.x}
                    cy={highlightedContinuousPath.anchorA.y}
                    r="5"
                    fill="#ffffff"
                  />

                  {/* Hovered Node Junction Ring */}
                  <circle
                    cx={highlightedContinuousPath.hoverPt.x}
                    cy={highlightedContinuousPath.hoverPt.y}
                    r="15"
                    fill="none"
                    stroke="#fde047"
                    strokeWidth="2.8"
                    strokeDasharray="4,3"
                  />
                  <circle
                    cx={highlightedContinuousPath.hoverPt.x}
                    cy={highlightedContinuousPath.hoverPt.y}
                    r="5.5"
                    fill="#fde047"
                  />

                  {/* Component B Anchor Marker */}
                  <circle
                    cx={highlightedContinuousPath.anchorB.x}
                    cy={highlightedContinuousPath.anchorB.y}
                    r="13"
                    fill="#22c55e"
                    fillOpacity="0.28"
                    stroke="#4ade80"
                    strokeWidth="3"
                  />
                  <circle
                    cx={highlightedContinuousPath.anchorB.x}
                    cy={highlightedContinuousPath.anchorB.y}
                    r="5"
                    fill="#ffffff"
                  />
                </svg>
              )}

              {/* Dual-Probe SVG Reticles & Differential Measurement Span */}
              {(probeA || probeB) && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full z-40 pointer-events-none"
                >
                  {probeA && probeB && (
                    <g>
                      <line
                        x1={probeA.xNorm}
                        y1={probeA.yNorm}
                        x2={probeB.xNorm}
                        y2={probeB.yNorm}
                        stroke="#4ade80"
                        strokeWidth="3.5"
                        strokeDasharray="10,6"
                      />
                      {dualProbeMeasurement && (
                        <g>
                          <rect
                            x={(probeA.xNorm + probeB.xNorm) / 2 - 78}
                            y={(probeA.yNorm + probeB.yNorm) / 2 - 14}
                            width="156"
                            height="28"
                            rx="2"
                            fill="#0c0e12"
                            fillOpacity="0.95"
                            stroke="#22c55e"
                            strokeWidth="2"
                          />
                          <text
                            x={(probeA.xNorm + probeB.xNorm) / 2}
                            y={(probeA.yNorm + probeB.yNorm) / 2 + 4}
                            textAnchor="middle"
                            fill="#fcd34d"
                            fontSize="11.5"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {`ΔV ${dualProbeMeasurement.differentialVoltage >= 0 ? '+' : ''}${dualProbeMeasurement.differentialVoltage.toFixed(2)}V · ${
                              dualProbeMeasurement.estimatedOhms !== null
                                ? `${dualProbeMeasurement.estimatedOhms}Ω`
                                : dualProbeMeasurement.diodeDropVolts !== null
                                ? `${dualProbeMeasurement.diodeDropVolts.toFixed(2)}Vf`
                                : 'OL'
                            }`}
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {probeA && (
                    <g>
                      <circle cx={probeA.xNorm} cy={probeA.yNorm} r="18" fill="#ef4444" fillOpacity="0.22" stroke="#ef4444" strokeWidth="3" />
                      <circle cx={probeA.xNorm} cy={probeA.yNorm} r="5.5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                      <rect x={probeA.xNorm - 14} y={probeA.yNorm - 34} width="28" height="16" rx="2" fill="#ef4444" />
                      <text x={probeA.xNorm} y={probeA.yNorm - 22.5} textAnchor="middle" fill="#ffffff" fontSize="10.5" fontFamily="monospace" fontWeight="bold">
                        A+
                      </text>
                    </g>
                  )}

                  {probeB && (
                    <g>
                      <circle cx={probeB.xNorm} cy={probeB.yNorm} r="18" fill="#94a3b8" fillOpacity="0.22" stroke="#94a3b8" strokeWidth="3" />
                      <circle cx={probeB.xNorm} cy={probeB.yNorm} r="5.5" fill="#94a3b8" stroke="#ffffff" strokeWidth="2" />
                      <rect x={probeB.xNorm - 14} y={probeB.yNorm - 34} width="28" height="16" rx="2" fill="#334155" />
                      <text x={probeB.xNorm} y={probeB.yNorm - 22.5} textAnchor="middle" fill="#ffffff" fontSize="10.5" fontFamily="monospace" fontWeight="bold">
                        B-
                      </text>
                    </g>
                  )}
                </svg>
              )}

              {/* Floating Precision MNA Node Voltage Tooltip on Pin / Node Hover */}
              {hoveredNodeTooltip && (
                <div
                  style={{
                    top: `${Math.min(76, Math.max(8, (hoveredNodeTooltip.yNorm / 1000) * 100 - 14))}%`,
                    left: `${Math.min(64, Math.max(4, (hoveredNodeTooltip.xNorm / 1000) * 100 + 3))}%`,
                  }}
                  className="pointer-events-none absolute z-50 w-[min(18rem,calc(100vw-2rem))] sm:w-72 bg-[#12161d]/98 border-2 border-amber-500/80 text-slate-100 p-2.5 sm:p-3 rounded-[3px] shadow-2xl font-mono text-[10px]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#2b313c] pb-1.5 mb-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-bold text-amber-300 truncate">
                        {hoveredNodeTooltip.nodeLabel}
                      </span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-[2px] bg-[#10261a] border border-[#22c55e]/50 text-[#4ade80] uppercase shrink-0">
                      MNA PROBE
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] mb-2">
                    <div>
                      <span className="text-[8.5px] text-slate-400 block font-sans">
                        Detected MNA Voltage
                      </span>
                      <span className="text-sm font-extrabold text-amber-300 tabular-nums">
                        {hoveredNodeTooltip.detectedVoltage.toFixed(3)} V DC
                      </span>
                    </div>
                    <div>
                      <span className="text-[8.5px] text-slate-400 block font-sans">
                        Nominal Spec / ΔV
                      </span>
                      <span className="text-xs font-bold text-slate-200 tabular-nums block">
                        {hoveredNodeTooltip.nominalVoltage.toFixed(2)} V (
                        {hoveredNodeTooltip.detectedVoltage - hoveredNodeTooltip.nominalVoltage >= 0
                          ? '+'
                          : ''}
                        {(
                          hoveredNodeTooltip.detectedVoltage - hoveredNodeTooltip.nominalVoltage
                        ).toFixed(2)}
                        V)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-[9.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">PCB Net ID:</span>
                      <span className="font-bold text-amber-300">{hoveredNodeTooltip.netId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">MNA Solver Node:</span>
                      <span className="font-semibold text-[#4ade80] truncate max-w-[165px]">
                        {hoveredNodeTooltip.mnaSourceNode}
                      </span>
                    </div>
                  </div>

                  {highlightedContinuousPath && (
                    <div className="mt-1.5 pt-1.5 border-t border-amber-500/40 text-[9px] font-mono text-amber-200 flex items-center justify-between gap-2">
                      <span className="font-bold truncate">
                        PATH: {highlightedContinuousPath.compA} ↔ {highlightedContinuousPath.compB}
                      </span>
                      <span className="px-1 py-0.5 rounded-[2px] bg-[#10261a] border border-[#22c55e]/50 text-[#4ade80] text-[8px] shrink-0">
                        {highlightedContinuousPath.isNetVerified ? 'NET VERIFIED' : 'NODE ROUTE'}
                      </span>
                    </div>
                  )}

                  {hoveredNodeTooltip.notes && (
                    <div className="mt-1.5 pt-1.5 border-t border-[#2b313c] text-[9px] text-slate-300 font-sans leading-snug">
                      {hoveredNodeTooltip.notes}
                    </div>
                  )}
                </div>
              )}

              {/* Floating Component Datasheet Specification Card */}
              {showDatasheetInfo &&
                clickedDatasheetNode &&
                (() => {
                  const comp = components.find((c) => c.refDes === clickedDatasheetNode.compRefDes);
                  if (!comp) return null;

                  const clickedPin =
                    clickedDatasheetNode.pinNumber !== undefined
                      ? comp.pinSpecs?.find((p) => p.pinNumber === clickedDatasheetNode.pinNumber)
                      : undefined;
                  const clickedNet = clickedDatasheetNode.netId
                    ? nets.find((n) => n.name === clickedDatasheetNode.netId)
                    : undefined;
                  const thermal = componentThermalMap[comp.refDes];

                  const resistanceSpec = comp.category.toUpperCase().includes('RESISTOR')
                    ? comp.decodedValue
                    : comp.maxCurrentRating && /Ω|ohm|esr/i.test(comp.maxCurrentRating)
                    ? comp.maxCurrentRating
                    : clickedNet?.impedanceOhms !== undefined
                    ? `${comp.decodedValue} (Trace ${clickedNet.impedanceOhms}Ω)`
                    : comp.decodedValue || 'UNREADABLE';

                  const maxVoltageSpec =
                    comp.operatingVoltageRange && comp.operatingVoltageRange !== 'UNKNOWN'
                      ? comp.operatingVoltageRange
                      : clickedPin && clickedPin.nominalVoltage > 0
                      ? `${clickedPin.nominalVoltage.toFixed(1)}V Nominal Pin Rail`
                      : 'UNKNOWN — Verify Datasheet';

                  const currentOrThermalSpec =
                    comp.maxCurrentRating &&
                    comp.maxCurrentRating !== 'UNKNOWN' &&
                    !/Ω|ohm|esr/i.test(comp.maxCurrentRating)
                      ? comp.maxCurrentRating
                      : thermal && comp.verificationStatus !== 'UNKNOWN'
                      ? `${thermal.thermalResistanceJa} °C/W · ${thermal.tempC.toFixed(1)}°C`
                      : comp.maxCurrentRating || 'UNKNOWN';

                  const mnaPinInfo = clickedPin
                    ? resolveMnaNodeDetails(clickedPin.connectedNetId, clickedPin.nominalVoltage)
                    : null;

                  return (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        top: `${Math.min(64, Math.max(8, (clickedDatasheetNode.yNorm / 1000) * 100 + 2))}%`,
                        left: `${Math.min(58, Math.max(4, (clickedDatasheetNode.xNorm / 1000) * 100 + 2))}%`,
                      }}
                      className="pointer-events-auto absolute z-45 w-[min(19rem,calc(100vw-2rem))] sm:w-76 bg-[#12161d]/98 border-2 border-[#444e5e] text-slate-100 p-2.5 sm:p-3 rounded-[3px] shadow-2xl font-mono text-[10px]"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-[#2b313c] pb-1.5 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-extrabold text-amber-300 text-xs">{comp.refDes}</span>
                            <span className="text-slate-200 font-bold truncate">
                              {comp.marking || comp.category}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-sans block truncate mt-0.5">
                            {comp.packageType || 'SMD'} · {comp.category.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <button
                          onClick={() => setClickedDatasheetNode(null)}
                          className="p-0.5 rounded-[2px] hover:bg-[#1c222d] text-slate-400 hover:text-white transition shrink-0"
                          title="Close Datasheet Info Card"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] mb-2">
                        <div className="col-span-2">
                          <span className="text-[8.5px] text-slate-400 block font-sans">
                            Max / Operating Voltage
                          </span>
                          <span className="text-[10px] font-bold text-amber-300 leading-tight block">
                            {maxVoltageSpec}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8.5px] text-slate-400 block font-sans">
                            Resistance / Value
                          </span>
                          <span className="text-[10px] font-bold text-slate-100 leading-tight block truncate" title={resistanceSpec}>
                            {resistanceSpec}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8.5px] text-slate-400 block font-sans">
                            Current / Thermal
                          </span>
                          <span className="text-[10px] font-bold text-[#4ade80] leading-tight block truncate" title={currentOrThermalSpec}>
                            {currentOrThermalSpec}
                          </span>
                        </div>
                      </div>

                      {clickedPin && mnaPinInfo && (
                        <div className="mb-2 px-2 py-1 rounded-[2px] bg-[#171b22] border border-[#3c4554] flex items-center justify-between gap-2 text-[9px]">
                          <span className="text-slate-200 truncate">
                            Pin #{clickedPin.pinNumber} ({clickedPin.pinName})
                          </span>
                          <span className="font-bold text-amber-300 tabular-nums shrink-0">
                            {mnaPinInfo.voltage.toFixed(2)}V · {clickedPin.connectedNetId}
                          </span>
                        </div>
                      )}

                      <p className="text-[9.5px] text-slate-300 font-sans leading-snug line-clamp-3">
                        {comp.datasheetSummary || comp.circuitFunction || comp.notes || 'Standard automotive ECU component.'}
                      </p>

                      <div className="mt-2 pt-1.5 border-t border-[#2b313c] flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {onOpenGroundedSearch && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenGroundedSearch(
                                  `${comp.marking || comp.decodedValue} ${comp.category} datasheet specifications`,
                                  '',
                                  comp.marking || comp.refDes
                                )
                              }
                              className="hw-btn-amber px-2 py-0.5 rounded-[2px] text-[9px] font-semibold flex items-center gap-1"
                            >
                              <Globe className="w-2.5 h-2.5" />
                              <span>Full Datasheet</span>
                            </button>
                          )}
                          {onCrossProbePin && mnaPinInfo?.simPinId && (
                            <button
                              type="button"
                              onClick={() =>
                                onCrossProbePin(
                                  mnaPinInfo.simPinId!,
                                  `${comp.refDes}${clickedPin ? ` #${clickedPin.pinNumber} (${clickedPin.pinName})` : ''}`,
                                  true
                                )
                              }
                              className="hw-btn-green px-2 py-0.5 rounded-[2px] text-[9px] font-semibold flex items-center gap-1"
                              title={`Jump to Harness DMM on ${mnaPinInfo.simPinId}`}
                            >
                              <Cable className="w-2.5 h-2.5 text-[#4ade80]" />
                              <span>Probe {clickedPin ? `#${clickedPin.pinNumber}` : ''} on DMM</span>
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCompRef(comp.refDes);
                            setInspectorSubTab('PART');
                          }}
                          className="text-[9px] text-amber-300 hover:text-amber-200 font-semibold"
                        >
                          Open Part Inspector →
                        </button>
                      </div>
                    </div>
                  );
                })()}

              {/* Thermal Heatmap Legend & Ambient Temperature Control Bar */}
              {showThermalHeatmap && (
                <div className="absolute bottom-3 left-3 z-30 bg-[#141820]/95 border border-[#444e5e] rounded-[3px] p-2.5 text-[10px] font-mono text-slate-100 shadow-2xl flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
                    <span>ELECTRO-THERMAL IR (TJ = TA + PD·RθJA)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> {ambientTempC}°C (Idle)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 55°C
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 85°C
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> 115°C+
                    </span>
                  </div>
                  <div className="pl-2 border-l border-[#2a313d]">
                    <RotaryEncoderDial
                      label="TA AMBIENT"
                      ariaLabel="Adjust Ambient Engine Bay Temperature"
                      value={ambientTempC}
                      min={20}
                      max={85}
                      step={1}
                      unit="°C"
                      accent="amber"
                      size="sm"
                      inlineFlankButtons={{
                        dec: { label: '-5°', delta: -5 },
                        inc: { label: '+5°', delta: 5 },
                      }}
                      onChange={(nextVal) => setAmbientTempC(nextVal)}
                    />
                  </div>
                </div>
              )}

              {/* Macro Crop Drag Selection Marquee */}
              {cropMarquee && (
                <div
                  style={{
                    top: `${(cropMarquee.ymin / 1000) * 100}%`,
                    left: `${(cropMarquee.xmin / 1000) * 100}%`,
                    width: `${((cropMarquee.xmax - cropMarquee.xmin) / 1000) * 100}%`,
                    height: `${((cropMarquee.ymax - cropMarquee.ymin) / 1000) * 100}%`,
                  }}
                  className="absolute z-40 border-2 border-dashed border-amber-400 bg-amber-400/15 pointer-events-none"
                >
                  <span className="absolute -top-5 left-0 bg-amber-500 text-slate-950 text-[9px] font-bold px-1.5 rounded">
                    MACRO CROP SCAN AREA
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>

        <PcbInspectorSidebar
          mobileTab={mobileTab}
          onSetMobileTab={setMobileTab}
          boardTitle={boardTitle}
          uploadedImageUrl={uploadedImageUrl}
          inspectorSubTab={inspectorSubTab}
          onSetInspectorSubTab={setInspectorSubTab}
          selectedComponent={selectedComponent}
          selectedCompRef={selectedCompRef}
          selectedPinNumber={selectedPinNumber}
          onSelectCompRef={setSelectedCompRef}
          onSelectPinNumber={setSelectedPinNumber}
          components={components}
          filteredComponents={filteredComponents}
          nets={nets}
          effectiveNetId={effectiveNetId}
          onSetActiveNetId={setActiveNetId}
          hotspots={hotspots}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspotId={setSelectedHotspotId}
          onSetShowHotspots={setShowHotspots}
          componentThermalMap={componentThermalMap}
          peakBoardTempC={peakBoardTempC}
          showThermalHeatmap={showThermalHeatmap}
          onSetShowThermalHeatmap={setShowThermalHeatmap}
          boardAuditFindings={boardAuditFindings}
          criticalAuditCount={criticalAuditCount}
          interactionMode={interactionMode}
          onSetInteractionMode={setInteractionMode}
          probeA={probeA}
          probeB={probeB}
          nextProbeSlot={nextProbeSlot}
          dualProbeMeasurement={dualProbeMeasurement}
          onPlaceProbe={handlePlaceProbe}
          onSwapProbes={() => {
            if (!probeA || !probeB) return;
            setProbeA(probeB);
            setProbeB(probeA);
            setStatusMessage('Swapped Probe A (+) ↔ Probe B (−) polarity.');
          }}
          onClearProbes={() => {
            setProbeA(null);
            setProbeB(null);
            setNextProbeSlot('A');
            setStatusMessage('Cleared Dual Probes A & B.');
          }}
          searchTerm={searchTerm}
          onChangeSearchTerm={setSearchTerm}
          filterMode={filterMode}
          onChangeFilterMode={setFilterMode}
          newNetName={newNetName}
          onChangeNewNetName={setNewNetName}
          resolveMnaNodeDetails={resolveMnaNodeDetails}
          getNetColor={getNetColor}
          onDeleteComponent={handleDeleteComponent}
          onUpdateComponentField={updateSelectedComponentField}
          onAddPinToComponent={handleAddPinToComponent}
          onUpdatePinNet={handleUpdatePinNet}
          onCreateAndLinkNet={handleCreateAndLinkNet}
          onVerifyComponent={verifyComponent}
          onAddWaypointToActiveNet={handleAddWaypointToActiveNet}
          onDeleteLastVertexFromActiveNet={handleDeleteLastVertexFromActiveNet}
          onAutoRouteNet={handleAutoRouteNet}
          onAddManualHotspot={handleAddManualHotspot}
          onDeleteHotspot={handleDeleteHotspot}
          onSetStatusMessage={setStatusMessage}
          onOpenGroundedSearch={onOpenGroundedSearch}
          onOpenOfflineBot={onOpenOfflineBot}
          onCrossProbePin={onCrossProbePin}
        />
      </div>

      {/* Unified Compact Bottom Telemetry & Status Strip */}
      <footer
        className="bg-[#060B14]/95 border-t border-[#203653] px-2.5 sm:px-3.5 py-1 flex items-center justify-between gap-2 text-[10px] font-mono text-[#91A4BD] shrink-0"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#20D889] shadow-[0_0_6px_#20D889] shrink-0" />
          {activeNetObject ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getNetColor(activeNetObject.name) }}
              />
              <span className="font-bold text-[#FFB020] truncate">{activeNetObject.name}</span>
              <span className="text-[#20D889] font-bold tabular-nums shrink-0">
                {resolveLiveNetVoltage(
                  activeNetObject.name,
                  activeNetObject.nominalVoltage ?? 0
                ).toFixed(2)}
                V
              </span>
              <span className="hidden sm:inline text-[#91A4BD] truncate">
                ({activeNetObject.connectedComponentRefs.join(', ')})
              </span>
              <button
                type="button"
                onClick={() => setActiveNetId(null)}
                aria-label="Clear active net highlight"
                className="text-[#91A4BD] hover:text-white p-0.5 cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="truncate text-[#EAF3FF]/85">
              {hoveredNodeTooltip
                ? `${hoveredNodeTooltip.nodeLabel} (${hoveredNodeTooltip.detectedVoltage.toFixed(2)}V)`
                : statusMessage}
            </span>
          )}
        </div>
        <div className="hidden lg:flex items-center gap-2.5 shrink-0 text-[10px] text-[#91A4BD]">
          <span>F fit · V edit · H pan · P probe</span>
          <span className="text-[#203653]">|</span>
          <span>
            Engine: <strong className="text-[#19C8F5]">{analysisModel}</strong>
          </span>
        </div>
      </footer>
    </div>
  );
};
