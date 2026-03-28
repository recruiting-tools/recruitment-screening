// ── Environment ──────────────────────────────────────────────────────────────

export interface Env {
  GEMINI_API_KEYS: string; // comma-separated keys for rotation
  AUTH_TOKEN: string;
}

// ── Request ──────────────────────────────────────────────────────────────────

export interface EvaluateRequest {
  resume_text: string;
  job_description: string;
  job_title: string;
  must_haves?: string[];
  language?: 'en' | 'ru' | 'it';
  custom_screening_prompt?: string | null;
  custom_evaluation_prompt?: string | null;
  generate_interview_questions?: boolean;
}

// ── Screening (candidate-facing) ─────────────────────────────────────────────

export interface Screening {
  matched: string[];
  questions: string[];
  summary_for_email: string;
}

// ── Evaluation (recruiter-facing) ────────────────────────────────────────────

export interface Evaluation {
  score: number;
  verdict: 'strong_yes' | 'yes' | 'maybe' | 'no' | 'strong_no';
  summary: string;
  matches: {
    skills: { matched: string[]; missing: string[]; score: number };
    experience: { relevant_years: number; required_years: number; score: number };
    education: { level: string; score: number };
    languages: Record<string, string>;
    location: { candidate: string; required: string; match: string };
  };
  red_flags: string[];
  recommendation: string;
}

// ── Interview Questions (legacy, used by /evaluate) ─────────────────────────

export interface InterviewQuestion {
  topic: string;
  question: string;
  reason: string;
}

// ── Combined Response ────────────────────────────────────────────────────────

export interface EvaluateResponse {
  screening: Screening;
  evaluation: Evaluation;
  additional_interview_questions: InterviewQuestion[];
}

// ── Generate Questions ──────────────────────────────────────────────────────

export type Language = 'en' | 'ru' | 'it';

/** Per-question spec in advanced mode */
export interface QuestionSpec {
  /** Topic hint (e.g. "system design", "intro") */
  topic?: string;
  /** Draft question to improve/refine */
  draft?: string;
  /** Exact question text — used as-is, only follow-ups generated if needed */
  question?: string;
  /** How many follow-ups to generate: 0, 1, or 2. Defaults to parent follow_ups_per_question */
  follow_ups?: number;
}

export interface ComplianceCheckConfig {
  /** interview-engine API base URL */
  api_url: string;
  /** Bearer token for interview-engine */
  api_token?: string;
  /** If true, POST a test session to verify format is accepted */
  dry_run?: boolean;
}

export interface GenerateQuestionsRequest {
  // ── Context (job_title optional when questions[] provided) ──
  job_title?: string;
  job_description?: string;
  resume_text?: string;

  // ── Simple mode ──
  /** Number of questions to generate (default: 6) */
  count?: number;
  /** Default follow-ups per question: 0, 1, or 2 (default: 2) */
  follow_ups_per_question?: number;

  // ── Advanced mode (overrides count) ──
  questions?: QuestionSpec[];

  // ── Settings ──
  language?: Language;
  /** 0=soft, 1=standard, 2=thorough, 3=rigorous (default: 1) */
  persistence_level?: number;
  /** Additional generation rules/constraints */
  rules?: string[];
  /** Override system prompt entirely */
  custom_prompt?: string;

  // ── Output ──
  /** Output shape: generic (our format) or interview-engine (their camelCase format) */
  output_format?: 'generic' | 'interview-engine';

  // ── Compliance ──
  compliance_check?: ComplianceCheckConfig;
}

// ── Output types ────────────────────────────────────────────────────────────

export interface GeneratedQuestion {
  id: string;
  topic: string;
  question: string;
  follow_ups: string[] | null;
  /** Original draft text (only present for [REFINE] questions) */
  original?: string;
  /** What was improved and why (only present for [REFINE] questions) */
  improvements?: string[];
}

/** interview-engine compatible format */
export interface InterviewEngineQuestion {
  id: string;
  topic: string;
  question: string;
  followUpIfVague: string[] | null;
  /** Original draft text (only present for [REFINE] questions) */
  original?: string;
  /** What was improved and why (only present for [REFINE] questions) */
  improvements?: string[];
}

export interface ComplianceResult {
  status: 'ok' | 'failed';
  session_url?: string;
  interview_url?: string;
  error?: string;
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[] | InterviewEngineQuestion[];
  compliance?: ComplianceResult;
}
