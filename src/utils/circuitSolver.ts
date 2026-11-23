export {
  DEFAULT_ECU_PINS,
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_WIRES,
  UNIVERSAL_SIMULATION_PROFILE,
  solveCircuit,
  evaluateBulkPinContinuity,
} from '../simulation/ecu/BenchCircuitSolver';
export type {
  CircuitSolution,
  SolveCircuitOptions,
  UniversalSimulationProfileSpec,
  PinContinuityStatus,
  BulkPinContinuityResult,
  BulkContinuityReport,
} from '../simulation/ecu/BenchCircuitSolver';
export { analyzePinBinaryState } from '../simulation/signals/BinaryStateDecoder';
export type {
  AnalyzePinBinaryStateParams,
  BinaryDetectedProtocol,
  BinaryLogicSample,
  BinaryPinMetrics,
  BinaryPinMonitorResult,
  BinaryPolarity,
  CanBusHealth,
  CanFramePatternSummary,
  SignalAnomalyCode,
  SignalAnomalyNotification,
  SignalAnomalySeverity,
} from '../simulation/signals/BinaryStateDecoder';
