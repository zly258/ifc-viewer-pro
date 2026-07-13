
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
  modelID?: number; // Track which model this belongs to
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
  WALK = 'WALK',
  ANNOTATION = 'ANNOTATION',
  NONE = 'NONE'
}

// Removed ELEVATION
export type MeasurementMode = 'DISTANCE' | 'ANGLE' | 'COORDINATE' | 'AREA' | 'VOLUME';

export interface AnnotationData {
    id: string;
    position: { x: number; y: number; z: number };
    text: string;
    cameraTarget: { x: number; y: number; z: number };
    timestamp: number;
}

export interface MeasurementResult {
    id: string;
    type: MeasurementMode;
    value: string;
    label: string; // Detailed formatted string
    timestamp: number;
    deltas?: { x: number; y: number; z: number };
    modelID?: number; // Track which model this measurement belongs to
}

export interface ReportColumn {
    id: string;
    name: string;      // Display Name (e.g. "Total Volume")
    fieldMatch: string; // Property name keyword (e.g. "NetVolume", "Area")
}

export interface ReportConfig {
    columns: ReportColumn[];
}

export interface ReportRow {
    expressID: number;
    [key: string]: any;
}
