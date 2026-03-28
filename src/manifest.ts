/**
 * MCP Tool Registry manifest — exposes recruitment-screening endpoints
 * to recruiter-mcp for dynamic tool registration.
 *
 * See: recruiter-mcp/docs/tool-registry-spec.md
 */

export function buildManifest() {
  return {
    service: 'recruitment-screening',
    version: '1.1.0',
    auth: {
      type: 'bearer',
      env_var: 'SCREENING_API_TOKEN',
    },
    base_url_env: 'SCREENING_API_URL',
    tools: [
      {
        name: 'scr_match',
        description: 'Score a candidate resume against a job description. Returns score (0-100), verdict, matched/missing skills, and red flags. Use for ranking candidates or quick fit assessment. Fast and lightweight — no candidate-facing output.',
        category: 'evaluation',
        parameters: {
          resume_text: {
            type: 'string',
            description: 'Plain text resume content',
            required: true,
          },
          job_description: {
            type: 'string',
            description: 'Job description text',
            required: true,
          },
          job_title: {
            type: 'string',
            description: 'Job title (e.g. "Senior Data Engineer")',
            required: false,
          },
          must_haves: {
            type: 'array',
            description: 'Deal-breaker requirements — missing any caps score at 49',
            required: false,
            items: { type: 'string' },
          },
        },
        endpoint: {
          method: 'POST',
          path: '/match',
          body_params: ['resume_text', 'job_description', 'job_title', 'must_haves'],
        },
      },
      {
        name: 'scr_evaluate',
        description: 'Full resume evaluation: candidate-facing screening (matched qualifications, clarification questions) + recruiter-facing evaluation (score 0-100, detailed skill/experience/education matching, red flags). Use when you need both candidate and recruiter perspectives. Heavier than scr_match.',
        category: 'evaluation',
        parameters: {
          resume_text: {
            type: 'string',
            description: 'Plain text resume content',
            required: true,
          },
          job_description: {
            type: 'string',
            description: 'Job description text',
            required: true,
          },
          job_title: {
            type: 'string',
            description: 'Job title',
            required: true,
          },
          must_haves: {
            type: 'array',
            description: 'Deal-breaker requirements',
            required: false,
            items: { type: 'string' },
          },
          language: {
            type: 'string',
            description: 'Output language for screening (candidate-facing part)',
            required: false,
            enum: ['en', 'ru', 'it'],
            default: 'en',
          },
          generate_interview_questions: {
            type: 'boolean',
            description: 'Also generate interview questions from screening gaps (default false)',
            required: false,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/evaluate',
          body_params: ['resume_text', 'job_description', 'job_title', 'must_haves', 'language', 'generate_interview_questions'],
        },
      },
      {
        name: 'scr_generate_questions',
        description: 'Generate interview questions with follow-ups for voice interviews. Two modes: simple (count + job context) or advanced (per-question control: generate/refine/keep-as-is). Use when preparing an interview script.',
        category: 'questions',
        parameters: {
          job_title: {
            type: 'string',
            description: 'Job title (required in simple mode, optional when questions[] provided)',
            required: false,
          },
          job_description: {
            type: 'string',
            description: 'Job description text',
            required: false,
          },
          resume_text: {
            type: 'string',
            description: 'Candidate resume — personalizes questions if provided',
            required: false,
          },
          count: {
            type: 'number',
            description: 'Number of questions to generate (simple mode, default 6)',
            required: false,
          },
          follow_ups_per_question: {
            type: 'number',
            description: 'Follow-ups per question: 0, 1, or 2 (default 2)',
            required: false,
          },
          questions: {
            type: 'array',
            description: 'Advanced mode: per-question specs. Each: {topic?, draft?, question?, follow_ups?}. "question" = keep as-is, "draft" = refine, "topic" only = generate from scratch.',
            required: false,
          },
          language: {
            type: 'string',
            description: 'Output language',
            required: false,
            enum: ['en', 'ru', 'it'],
          },
          persistence_level: {
            type: 'number',
            description: 'Follow-up rigour: 0=soft, 1=standard, 2=thorough, 3=rigorous (default 1)',
            required: false,
          },
          output_format: {
            type: 'string',
            description: 'Output shape',
            required: false,
            enum: ['generic', 'interview-engine'],
          },
        },
        endpoint: {
          method: 'POST',
          path: '/generate-questions',
          body_params: ['job_title', 'job_description', 'resume_text', 'count', 'follow_ups_per_question', 'questions', 'language', 'persistence_level', 'output_format'],
        },
      },
      {
        name: 'scr_pipeline_init',
        description: 'Initialize a screening pipeline for a new candidate. Analyzes resume against job description, generates sequential goals and candidate summary. Returns goals (markdown), summary, and first active item. Use at the start of an automated candidate conversation.',
        category: 'pipeline',
        parameters: {
          candidate: {
            type: 'object',
            description: '{ name: string, language?: "en"|"ru"|"it" }',
            required: true,
          },
          resume_text: {
            type: 'string',
            description: 'Plain text resume',
            required: true,
          },
          job: {
            type: 'object',
            description: '{ title: string, description?: string, must_haves?: string[] }',
            required: true,
          },
          pipeline_template: {
            type: 'string',
            description: 'Markdown template defining goal structure. If omitted, auto-generates from job.',
            required: false,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/pipeline/init',
        },
      },
      {
        name: 'scr_pipeline_analyse',
        description: 'Update pipeline goals and candidate summary after a candidate reply. Detects goal transitions, candidate side-questions, and handles ACTION vs QUESTION items. Returns updated goals, summary, next_item, and flags (all_done, goal_just_completed, candidate_question).',
        category: 'pipeline',
        parameters: {
          candidate: {
            type: 'object',
            description: '{ name: string, language?: string }',
            required: true,
          },
          summary: {
            type: 'string',
            description: 'Current candidate summary (markdown)',
            required: true,
          },
          goals: {
            type: 'string',
            description: 'Current goals state (markdown)',
            required: true,
          },
          candidate_reply: {
            type: 'string',
            description: 'Latest candidate message',
            required: true,
          },
          conversation_history: {
            type: 'array',
            description: 'Array of {role: "assistant"|"user", content: string}',
            required: false,
          },
          pipeline_template: {
            type: 'string',
            description: 'Original template — enforces structure integrity',
            required: false,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/pipeline/analyse',
        },
      },
      {
        name: 'scr_pipeline_write_message',
        description: 'Generate the next message to send to a candidate in the pipeline conversation. Supports follow-ups, goal transitions, FAQ mode, and action items. Returns the message text.',
        category: 'pipeline',
        parameters: {
          candidate: {
            type: 'object',
            description: '{ name: string, language?: string }',
            required: true,
          },
          next_item: {
            type: 'string',
            description: 'Current active pipeline item to address',
            required: true,
          },
          conversation_history: {
            type: 'array',
            description: 'Array of {role, content} messages',
            required: false,
          },
          job: {
            type: 'object',
            description: '{ title: string, interviewer_name?: string }',
            required: true,
          },
          context: {
            type: 'object',
            description: '{ is_follow_up?: boolean, goal_just_completed?: string|null, candidate_question?: string|null }',
            required: false,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/pipeline/write-message',
        },
      },
      {
        name: 'scr_pipeline_completion',
        description: 'Generate a final wrap-up message when all pipeline goals are completed. Acknowledges the conversation, summarizes positive impression, and mentions next steps.',
        category: 'pipeline',
        parameters: {
          candidate: {
            type: 'object',
            description: '{ name: string, language?: string }',
            required: true,
          },
          summary: {
            type: 'string',
            description: 'Final candidate summary',
            required: true,
          },
          conversation_history: {
            type: 'array',
            description: 'Full conversation history',
            required: false,
          },
          job: {
            type: 'object',
            description: '{ title: string, interviewer_name?: string }',
            required: true,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/pipeline/completion',
        },
      },
      {
        name: 'scr_pipeline_validate',
        description: 'Quality-check a proposed message before sending to a candidate. Runs deterministic checks (placeholders, length, generic greetings) + LLM checks (repeated questions, tone contradictions, wrong language). Returns ok/issues array.',
        category: 'pipeline',
        parameters: {
          candidate: {
            type: 'object',
            description: '{ name: string, language?: string }',
            required: true,
          },
          proposed_message: {
            type: 'string',
            description: 'Message to validate',
            required: true,
          },
          recent_messages: {
            type: 'array',
            description: 'Recent conversation messages for context',
            required: false,
          },
        },
        endpoint: {
          method: 'POST',
          path: '/pipeline/validate-message',
        },
      },
    ],
    playbooks: [
      {
        name: 'rank_candidates',
        description: 'Score and rank a batch of candidates for a job',
        steps: [
          'Get job description and must-haves from job settings',
          'For each candidate: scr_match with resume_text + job_description + must_haves',
          'Sort by score descending, present as a table with verdict and summary',
        ],
        context: 'Use when user asks to rank, compare, or sort candidates for a vacancy. Get resumes from get_candidate or candidate profiles.',
      },
      {
        name: 'prepare_interview',
        description: 'Generate a complete interview script for a candidate',
        steps: [
          'scr_match — quick assessment to identify gaps',
          'scr_generate_questions — create questions targeting gaps + standard topics',
          'Review and adjust questions with user',
        ],
        context: 'Use when user asks to prepare interview questions or an interview script for a specific candidate and job.',
      },
    ],
  };
}
