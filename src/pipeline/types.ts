// ── Shared types ────────────────────────────────────────────────────────────

export interface PipelineCandidate {
  name: string;
  language?: string; // ISO 639-1: 'en' | 'ru' | 'it' etc.
}

export interface PipelineJob {
  title: string;
  description?: string;
  must_haves?: string[];
  interviewer_name?: string;
  candidate_faq?: Array<{ q: string; a: string }>;
}

export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
}

// ── /pipeline/init ──────────────────────────────────────────────────────────

export interface PipelineInitRequest {
  candidate: PipelineCandidate;
  resume_text: string;
  job: PipelineJob;
  pipeline_template?: string;
  style_rules?: string;
  prompt_overrides?: Record<string, string>;
}

export interface PipelineInitResponse {
  request_id: string;
  summary: string;
  goals: string;
  first_item: string;
}

// ── /pipeline/analyse ───────────────────────────────────────────────────────

export interface PipelineAnalyseRequest {
  candidate: PipelineCandidate;
  summary: string;
  goals: string;
  candidate_reply: string;
  conversation_history: ConversationMessage[];
  pipeline_template?: string;
  style_rules?: string;
  prompt_overrides?: Record<string, string>;
}

export interface PipelineAnalyseResponse {
  request_id: string;
  summary: string;
  goals: string;
  all_done: boolean;
  next_item: string;
  goal_just_completed: string | null;
  candidate_question: string | null;
}

// ── /pipeline/write-message ─────────────────────────────────────────────────

export interface PipelineWriteMessageRequest {
  candidate: PipelineCandidate;
  next_item: string;
  conversation_history: ConversationMessage[];
  job: PipelineJob;
  context: {
    is_follow_up: boolean;
    goal_just_completed: string | null;
    candidate_question: string | null;
    is_action_item?: boolean;
    action_content?: string | null;
  };
  style_rules?: string;
  prompt_overrides?: Record<string, string>;
}

export interface PipelineWriteMessageResponse {
  request_id: string;
  message: string;
  model_used: string;
}

// ── /pipeline/completion ────────────────────────────────────────────────────

export interface PipelineCompletionRequest {
  candidate: PipelineCandidate;
  summary: string;
  conversation_history: ConversationMessage[];
  job: PipelineJob;
  style_rules?: string;
  prompt_overrides?: Record<string, string>;
}

export interface PipelineCompletionResponse {
  request_id: string;
  message: string;
}

// ── /pipeline/validate-message ──────────────────────────────────────────────

export interface PipelineValidateRequest {
  recent_messages: ConversationMessage[];
  proposed_message: string;
  candidate: PipelineCandidate & { status?: string };
}

export interface ValidationIssue {
  severity: 'high' | 'medium' | 'low';
  type: string;
  description: string;
}

export interface PipelineValidateResponse {
  request_id: string;
  ok: boolean;
  issues: ValidationIssue[];
}
