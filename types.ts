export enum DimensionType {
  INCREASING = 'INCREASING', // Adds to the gap (e.g., Housing Depth)
  DECREASING = 'DECREASING', // Subtracts from the gap (e.g., PCB Thickness, Standoff)
}

export interface Dimension {
  id: string;
  name: string;
  nominal: number;
  tolerancePlus: number; // Absolute value, e.g., 0.1
  toleranceMinus: number; // Absolute value, e.g., 0.1
  type: DimensionType;
  description?: string;
}

export interface StackupResult {
  nominalGap: number;
  worstCaseMin: number;
  worstCaseMax: number;
  rssMin: number; // Root Sum Squares
  rssMax: number;
  contributors: number;
  interferenceProb: number; // Simplified probability percentage
}

export interface AIAnalysisResult {
  text: string;
  isLoading: boolean;
  error: string | null;
}
