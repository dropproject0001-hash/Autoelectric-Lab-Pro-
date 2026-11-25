/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  ImageAnalysisComponent,
  ImageAnalysisHotspot,
  ImageAnalysisPinSpec,
  PcbNormalizedBox,
} from '../../server/services/imageAnalysisTypes';
import { InjectedFault, PowerSupplyState } from '../../types/ecu';
import {
  ComponentThermalProfile,
  ExtendedImageAnalysisNet,
  MnaNodeResolution,
  PcbBoardPreset,
  TracePoint,
} from '../../simulation/pcb/PcbDiagnosticEngine';

export type PcbPinSpec = ImageAnalysisPinSpec;
export type DetailedPcbComponent = ImageAnalysisComponent;
export type { TracePoint, ExtendedImageAnalysisNet, ComponentThermalProfile };

export interface SchematicPcbScannerProps {
  onOpenGroundedSearch?: (query?: string, dtc?: string, ecu?: string) => void;
  onOpenOfflineBot?: (prompt?: string) => void;
  onOpenCloudModal?: () => void;
  onCrossProbePin?: (pinId: string, label?: string, navigateToBench?: boolean) => void;
  nodeVoltages?: Record<string, number>;
  supplyCurrentDrawAmps?: number;
  powerSupply?: PowerSupplyState;
  faults?: InjectedFault[];
}

export type SampleBoard = PcbBoardPreset;
export type InteractionMode = 'EDIT' | 'PAN' | 'PROBE' | 'MACRO_CROP' | 'TRACE_EDIT' | 'TRACE_PATH';
export type OpticalFilterMode = 'NORMAL' | 'CONTRAST' | 'UV_SILK' | 'XRAY';
export type InspectorSubTab = 'PART' | 'NETS' | 'PROBE' | 'AUDIT' | 'THERMAL';
export type PartTemplateId =
  | 'TEST_POINT'
  | 'MOSFET_DRIVER'
  | 'VOLTAGE_REGULATOR'
  | 'RESISTOR'
  | 'CAPACITOR'
  | 'DIODE';

export interface HoveredNodeTooltipState {
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
}

export interface ClickedDatasheetNodeState {
  compRefDes: string;
  pinNumber?: number;
  pinName?: string;
  netId?: string;
  xNorm: number;
  yNorm: number;
}

export type ResolveMnaFn = (netName: string | undefined, fallbackNominal: number) => MnaNodeResolution;

export type InteractionDrag =
  | {
      type: 'MOVE';
      refDes: string;
      startClientX: number;
      startClientY: number;
      origBox: PcbNormalizedBox;
      boardRect: DOMRect;
    }
  | {
      type: 'RESIZE';
      refDes: string;
      startClientX: number;
      startClientY: number;
      origBox: PcbNormalizedBox;
      boardRect: DOMRect;
    }
  | {
      type: 'CROP';
      startXNorm: number;
      startYNorm: number;
      boardRect: DOMRect;
    }
  | {
      type: 'PAN_VIEWPORT';
      startClientX: number;
      startClientY: number;
      startScrollLeft: number;
      startScrollTop: number;
    }
  | {
      type: 'MOVE_TRACE_NODE';
      netName: string;
      pointIndex: number;
      branchIndex?: number;
      boardRect: DOMRect;
    };
