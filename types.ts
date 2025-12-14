export enum TestStage {
  DASHBOARD = 'DASHBOARD',
  PATIENT_DETAIL = 'PATIENT_DETAIL',
  REGISTRATION = 'REGISTRATION',
  PRE_TEST_CHECK = 'PRE_TEST_CHECK', // New: Environment check
  NAMING = 'NAMING',
  INCIDENTAL_MEMORY = 'INCIDENTAL_MEMORY',
  IMMEDIATE_MEMORY = 'IMMEDIATE_MEMORY',
  LEARNING = 'LEARNING',
  VERBAL_FLUENCY = 'VERBAL_FLUENCY',
  CLOCK_DRAWING = 'CLOCK_DRAWING',
  DELAYED_MEMORY = 'DELAYED_MEMORY',
  RECOGNITION = 'RECOGNITION',
  POST_TEST_CHECK = 'POST_TEST_CHECK', // New: Distraction check
  RESULTS = 'RESULTS',
}

export enum EducationLevel {
  ILLITERATE = 'ILLITERATE',
  LOW = 'LOW', // 1-7 years
  HIGH = 'HIGH', // >= 8 years
}

export interface EnvironmentContext {
  deviceType: string;
  userAgent: string;
  screenSize: string;
  startTime: string;
  isQuietEnvironment: boolean; // Self-reported
  hadInterruptions: boolean; // Self-reported post-test
}

export interface BBRCScores {
  naming: number;
  incidentalMemory: number;
  immediateMemory: number;
  learning: number;
  verbalFluency: number;
  clockDrawing: number;
  delayedMemory: number;
  recognition: number;
  date: string;
  environment?: EnvironmentContext; // Optional for backward compatibility
}

export type SpokenClassification = 'target' | 'distractor' | 'intrusion' | 'repeat';

export interface SpokenToken {
  raw: string;
  normalized: string;
  mappedId?: string;
  classification: SpokenClassification;
  timestamp: number;
  confidence?: number;
}

export interface StageCapture {
  tokens: SpokenToken[];
  intrusions: SpokenToken[];
  repeats: SpokenToken[];
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  education: EducationLevel;
  history: BBRCScores[];
}

export interface TestState {
  stage: TestStage;
  currentPatientId: string | null;
  tempPatientData: Partial<Patient>;
  scores: BBRCScores;
  verbalFluencyList: string[];
  currentStageFoundWords: string[];
  currentStageResponses: StageCapture;
  clockImageBase64: string | null;
  timeStartedDelayed: number | null;
  // UI State
  fontSizeMultiplier: number; // 1 = normal, 1.25 = large, 1.5 = extra large
  highContrast: boolean;
}

export const INITIAL_SCORES: BBRCScores = {
  naming: 0,
  incidentalMemory: 0,
  immediateMemory: 0,
  learning: 0,
  verbalFluency: 0,
  clockDrawing: 0,
  delayedMemory: 0,
  recognition: 0,
  date: new Date().toISOString(),
};

export const INITIAL_STATE: TestState = {
  stage: TestStage.DASHBOARD,
  currentPatientId: null,
  tempPatientData: { name: '', age: 0, education: EducationLevel.LOW },
  scores: INITIAL_SCORES,
  verbalFluencyList: [],
  currentStageFoundWords: [],
  currentStageResponses: { tokens: [], intrusions: [], repeats: [] },
  clockImageBase64: null,
  timeStartedDelayed: null,
  fontSizeMultiplier: 1.1, // Default slightly larger for better readability
  highContrast: false,
};