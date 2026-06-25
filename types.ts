
export interface IFCProperty {
  name: string;
  value: string | number | boolean | null;
  setName?: string; // For Property Sets
}

export interface IFCElementData {
  expressID: number;
  type: string;
  globalId?: string;
  name?: string;
  properties: IFCProperty[];
  mats?: string[];
  modelID?: number; // Track which model this belongs to
}

export interface LoadedModelRecord {
    modelID: number;
    fileName: string;
    mesh: any;
}

export interface ViewerConfig {
  backgroundColor: number;
  gridColor: number;
}

export enum AppMode {
  VIEW = 'VIEW',
  ANALYZE = 'ANALYZE'
}

export interface LogMessage {
  id: string;
  type: 'info' | 'error' | 'success';
  text: string;
  timestamp: Date;
}

export enum CameraView {
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
  FRONT = 'FRONT',
  BACK = 'BACK',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  ISO_NE = 'ISO_NE',
  ISO_NW = 'ISO_NW',
  ISO_SE = 'ISO_SE',
  ISO_SW = 'ISO_SW',
  ISO_TOP = 'ISO_TOP',
  ISO_BOTTOM = 'ISO_BOTTOM'
}

export interface IFCSpatialStructure {
  expressID: number;
  type: string;
  name?: string; // Add name to structure
  children: IFCSpatialStructure[];
}

// --- Tools & State ---

export enum ViewerTool {
  SELECT = 'SELECT',
  MEASURE = 'MEASURE',
  SECTION = 'SECTION',
  NONE = 'NONE'
}

// Removed ELEVATION
export type MeasurementMode = 'DISTANCE' | 'ANGLE' | 'COORDINATE';

export interface MeasurementResult {
    id: string;
    type: MeasurementMode;
    value: string;
    label: string; // Detailed formatted string
    timestamp: number;
}

// --- Advanced Reporting ---

export type AggregationType = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface ReportColumn {
    id: string;
    name: string;      // Display Name (e.g. "Total Volume")
    fieldMatch: string; // Property name keyword (e.g. "NetVolume", "Area")
    aggregation: AggregationType;
    precision: number;
}

export interface ReportConfig {
    groupByField: string; // "type" or property name
    columns: ReportColumn[];
}

export interface ReportRow {
    groupValue: string;
    count: number;
    [key: string]: string | number; // Dynamic columns
}

