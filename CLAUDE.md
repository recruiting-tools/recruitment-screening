# recruitment-screening

Stateless Cloudflare Worker that evaluates candidate resumes against job descriptions using Gemini LLM. Returns screening results (for candidate), evaluation scores (for recruiter), generates voice-interview questions with follow-ups, and runs pipeline conversation logic (init, analyse, write-message, completion, validate).

## Architecture

```
GET /          → Self-documenting API page (HTML)
GET /health    → {"status": "ok"}

POST /evaluate → Resume screening + evaluation
  Auth → Parallel [Screening, Evaluation] → Optional questions → JSON

POST /generate-questions → Interview question generation
  Auth → Gemini (with best-practice prompt) → Optional compliance check → JSON

POST /pipeline/init           → Initialize pipeline goals + summary from resume
POST /pipeline/analyse        → Update goals/summary after candidate reply
POST /pipeline/write-message  → Generate next message to candidate
POST /pipeline/completion     → Generate final wrap-up message
POST /pipeline/validate-message → Quality check before sending
  All pipeline: Auth → Gemini 2.5 Flash (with retry) → JSON
```

**No database. No state. Pure functions.**

## Tech Stack

- **Runtime**: Cloudflare Worker
- **LLM**: Gemini 2.0 Flash (evaluate, questions) + Gemini 2.5 Flash (pipeline) via REST API
- **Language**: TypeScript
- **Key rotation**: Round-robin for evaluate/questions, retry-with-rotation for pipeline

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker entry: routing, auth, handlers (evaluate, generate-questions, pipeline/*) |
| `src/types.ts` | TypeScript interfaces (Env, evaluate/questions requests & responses) |
| `src/prompts.ts` | Prompt builders: screening, evaluation, legacy questions, generate-questions |
| `src/gemini.ts` | Gemini API client: `askGemini` (single key), `askGeminiWithRetry` (rotation + 429 retry) |
| `src/docs.ts` | Self-documenting HTML page served at `GET /` |
| `src/pipeline/types.ts` | Pipeline request/response interfaces for all 5 endpoints |
| `src/pipeline/prompts.ts` | Pipeline prompt builders + style rules (from candidate-routing prompt-catalog) |
| `src/pipeline/init.ts` | `POST /pipeline/init` — resume → goals + summary |
| `src/pipeline/analyse.ts` | `POST /pipeline/analyse` — candidate reply → updated goals/summary |
| `src/pipeline/write-message.ts` | `POST /pipeline/write-message` — generate next message |
| `src/pipeline/completion.ts` | `POST /pipeline/completion` — final wrap-up message |
| `src/pipeline/validate.ts` | `POST /pipeline/validate-message` — quality checks (deterministic + LLM) |
| `src/lib/goal-utils.ts` | Goal structure utilities: `enforceGoalStructure`, `markActiveActionsDone`, etc. |
| `src/lib/text-utils.ts` | Text helpers: `stripNamePlaceholders`, `ensureMarkdownString`, `parseJsonFromLLM` |
| `wrangler.jsonc` | Cloudflare Worker config |
| `.dev.vars` | Local secrets for `wrangler dev` (gitignored) |

## API

### `POST /evaluate`

**Auth**: `Authorization: Bearer <AUTH_TOKEN>`

**Request**:
```json
{
  "resume_text": "string (required)",
  "job_description": "string (required)",
  "job_title": "string (required)",
  "must_haves": ["string"],
  "language": "en | ru | it",
  "custom_screening_prompt": "string | null",
  "custom_evaluation_prompt": "string | null",
  "generate_interview_questions": true
}
```

**Response**:
```json
{
  "screening": {
    "matched": ["5 years React at Yandex", "Fluent English"],
    "questions": ["The role requires TypeScript — do you have experience?"],
    "summary_for_email": "your TypeScript experience and relocation timeline"
  },
  "evaluation": {
    "score": 72,
    "verdict": "yes",
    "summary": "...",
    "matches": {
      "skills": { "matched": [], "missing": [], "score": 0.7 },
      "experience": { "relevant_years": 5, "required_years": 3, "score": 0.9 },
      "education": { "level": "Bachelor CS", "score": 0.8 },
      "languages": { "English": "Fluent" },
      "location": { "candidate": "Moscow", "required": "Milan", "match": "no" }
    },
    "red_flags": [],
    "recommendation": "Proceed to interview"
  },
  "additional_interview_questions": [
    { "topic": "TypeScript", "question": "...", "reason": "..." }
  ]
}
```

**Errors**: 400 (validation), 401 (auth), 500 (LLM error)

### `POST /generate-questions`

**Auth**: `Authorization: Bearer <AUTH_TOKEN>`

Generates interview questions with follow-ups for voice interviews. Two modes:

**Simple mode** — generate N questions:
```json
{
  "job_title": "Senior Data Engineer",
  "job_description": "Build data pipelines, Spark, Airflow, Python...",
  "resume_text": "optional — personalizes questions",
  "count": 6,
  "follow_ups_per_question": 2,
  "language": "en",
  "persistence_level": 1
}
```

**Advanced mode** — per-question control:
```json
{
  "job_title": "Senior Data Engineer",
  "job_description": "...",
  "questions": [
    { "topic": "intro", "draft": "Tell me about yourself", "follow_ups": 1 },
    { "topic": "data pipelines", "follow_ups": 2 },
    { "question": "Salary expectations?", "follow_ups": 0 }
  ]
}
```

Question spec logic:
- `question` → used **as-is**, only follow-ups generated
- `draft` → **refined** for clarity + follow-ups
- `topic` only → **generated from scratch**
- `follow_ups: 0|1|2` → overrides default per question

**Output formats**: `output_format: "generic"` (default) or `"interview-engine"` (camelCase, `followUpIfVague`)

**Compliance check**: optional, validates output against interview-engine API:
```json
{
  "compliance_check": {
    "api_url": "https://i.recruiter-assistant.com",
    "api_token": "Bearer ...",
    "dry_run": true
  }
}
```

**Response**:
```json
{
  "questions": [
    {
      "id": "q1",
      "topic": "Background",
      "question": "Tell me about your data engineering experience...",
      "follow_ups": ["Walk me through a specific pipeline...", "What volumes?"]
    }
  ],
  "compliance": { "status": "ok", "interview_url": "..." }
}
```

### Pipeline Endpoints

All pipeline endpoints require `Authorization: Bearer <AUTH_TOKEN>`. All use Gemini 2.5 Flash with key rotation + retry on 429/5xx. Every response includes a `request_id`.

#### `POST /pipeline/init`

Initialize pipeline for a new candidate. Analyzes resume against job description, generates goals and summary.

```json
// Request
{ "candidate": { "name": "Marco Rossi", "language": "it" },
  "resume_text": "...", "job": { "title": "...", "description": "...", "must_haves": [...] },
  "pipeline_template": "## Goal 1: Screening\n- [pending] Confirm..." }

// Response
{ "request_id": "req_abc123", "summary": "## Candidate Summary...",
  "goals": "## Goal 1: Screening [active]\n- [active] Confirm...", "first_item": "Confirm..." }
```

#### `POST /pipeline/analyse`

Update goals and summary after a candidate reply. Enforces goal structure against template, detects side questions.

```json
// Request
{ "candidate": {...}, "summary": "current", "goals": "current",
  "candidate_reply": "Sì, ho 10 anni...", "conversation_history": [...],
  "pipeline_template": "..." }

// Response
{ "request_id": "...", "summary": "updated", "goals": "updated",
  "all_done": false, "next_item": "Ask about...", "goal_just_completed": null,
  "candidate_question": null }
```

#### `POST /pipeline/write-message`

Generate next message to candidate. Supports follow-ups, goal transitions, FAQ mode, action items.

```json
// Request
{ "candidate": {...}, "next_item": "Ask about hybrid work",
  "conversation_history": [...], "job": { "title": "...", "interviewer_name": "Vladimir" },
  "context": { "is_follow_up": false, "goal_just_completed": null, "candidate_question": null } }

// Response
{ "request_id": "...", "message": "Grazie Marco!...", "model_used": "gemini-2.5-flash" }
```

#### `POST /pipeline/completion`

Final wrap-up message when all goals are completed.

```json
// Request
{ "candidate": {...}, "summary": "final summary",
  "conversation_history": [...], "job": { "title": "...", "interviewer_name": "Vladimir" } }

// Response
{ "request_id": "...", "message": "Marco, grazie mille..." }
```

#### `POST /pipeline/validate-message`

Quality check before sending. Runs deterministic checks (placeholders, length, generic greetings) + LLM checks (repeated questions, tone, contradictions).

```json
// Request
{ "recent_messages": [...], "proposed_message": "Grazie Marco!...",
  "candidate": { "name": "Marco Rossi", "language": "it" } }

// Response — ok
{ "request_id": "...", "ok": true, "issues": [] }

// Response — issues found
{ "request_id": "...", "ok": false, "issues": [
  { "severity": "high", "type": "repeated_question", "description": "Already asked..." }
] }
```

### `GET /`

Self-documenting API page with endpoints, examples, request/response formats, and a guide on writing interview questions. Served as HTML.

### `GET /health`

Returns `{"status": "ok"}`. No auth required.

## Secrets

Set via `wrangler secret put` for production, or `.dev.vars` for local:

| Secret | Description |
|--------|-------------|
| `GEMINI_API_KEYS` | Comma-separated Gemini API keys. Round-robin rotation. First key should have billing enabled |
| `AUTH_TOKEN` | Bearer token that callers must provide |

## Local Development

```bash
# Start dev server
npx wrangler dev

# Docs page (open in browser)
open http://localhost:8787/

# Test health
curl http://localhost:8787/health

# Test evaluate
curl -X POST http://localhost:8787/evaluate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "resume_text": "Ivan Petrov, 5 years React at Yandex",
    "job_description": "Senior UX Engineer, TypeScript required",
    "job_title": "UX Engineer",
    "language": "en",
    "generate_interview_questions": true
  }'

# Test generate-questions (simple)
curl -X POST http://localhost:8787/generate-questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "job_title": "Senior Data Engineer",
    "job_description": "Build data pipelines, Spark, Airflow, Python required",
    "count": 5,
    "follow_ups_per_question": 2,
    "language": "en"
  }'

# Test generate-questions (advanced, interview-engine format)
curl -X POST http://localhost:8787/generate-questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "job_title": "UX Engineer",
    "job_description": "TypeScript, React, design systems",
    "output_format": "interview-engine",
    "questions": [
      { "topic": "intro", "draft": "Tell me about yourself", "follow_ups": 1 },
      { "topic": "TypeScript", "follow_ups": 2 },
      { "question": "Salary expectations?", "follow_ups": 0 }
    ]
  }'
```

## Deploy

```bash
wrangler secret put GEMINI_API_KEYS    # paste comma-separated keys
wrangler secret put AUTH_TOKEN          # paste bearer token
wrangler deploy
```

## Integration with apply-via-resume

This service is called by **apply-via-resume** in `handleConfirm()`. The call is non-blocking — if this API fails, the apply flow continues without evaluation.

In apply-via-resume, set these secrets:
- `RESUME_EVAL_API_URL` → URL of this deployed worker
- `RESUME_EVAL_API_TOKEN` → same value as `AUTH_TOKEN` here

Integration code pattern (already in apply-via-resume TZ):
```typescript
if (env.RESUME_EVAL_API_URL) {
  const res = await fetch(`${env.RESUME_EVAL_API_URL}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESUME_EVAL_API_TOKEN}`,
    },
    body: JSON.stringify({
      resume_text: resumeText,
      job_description: gate.description ?? '',
      job_title: gate.title,
      language: gate.language,
      generate_interview_questions: gate.mode === 'interview',
    }),
  });
  // Save screening_json + evaluation_json to DB
  // Merge additional_interview_questions into interview_config_json
}
```

## Integration with candidate-routing

### Pipeline (shadow mode — Phase 1)

candidate-routing continues using its own `llm.ts` as primary. Parallel calls to this API for comparison:
- `SCREENING_API_URL` → this worker's URL
- `SCREENING_API_TOKEN` → same as `AUTH_TOKEN`
- Shadow client: `src/lib/screening-client.ts` in candidate-routing
- Logs diff metrics (length, latency) but sends old result to candidate

### Resume evaluation

candidate-routing has its own `evaluateResume()` and `screenResumeForApply()` in `src/lib/resume-eval.ts` (using OpenAI). These can be gradually migrated to call this service's `/evaluate` endpoint.

## Prompt Design

- **Screening** (`buildScreeningPrompt`): Candidate-facing. Returns matched qualifications (3-6) and clarification questions (2-4). Shown directly to candidate on results page.
- **Evaluation** (`buildEvaluationPrompt`): Recruiter-facing. Returns score 0-100, verdict, detailed skill/experience/education matching, red flags. Must-haves are deal-breakers (cap score at 49).
- **Legacy Questions** (`buildQuestionsPrompt`): Used by `/evaluate` — generates 2-4 basic questions from screening gaps.
- **Generate Questions** (`buildGenerateQuestionsPrompt`): Full question generation with embedded best-practice guide:
  - Open-ended storytelling questions ("Tell me about..." not "Do you know...")
  - One concept per question (no compound questions)
  - Follow-ups from a different angle (not rephrasing), with specifics/options/numbers
  - Persistence-level-aware follow-up style (soft → rigorous)
  - Personal questions get soft follow-ups (stories, not metrics)
  - Proper ordering: warm-up → technical → conversational

All prompts support currency conversion (KZT/USD/EUR/RUB) and multi-language output (en/ru/it).

### Pipeline Prompts (in `src/pipeline/prompts.ts`)

Migrated from candidate-routing's `prompt-catalog.ts`:
- **Init** (`buildInitSystemPrompt/UserPrompt`): Generates goals + summary from resume. Supports pipeline templates.
- **Analyse** (`buildAnalyseSystemPrompt/UserPrompt`): Updates goals/summary after candidate reply. Prompt injection protection. QUESTION vs ACTION item distinction.
- **Writer** (`buildWriterSystemPrompt/UserPrompt`): Composes next message. Supports FAQ mode, goal transitions, action items, follow-ups.
- **Completion** (`buildCompletionSystemPrompt/UserPrompt`): Final wrap-up (80-120 words).
- **Validate** (`buildValidateSystemPrompt/UserPrompt`): Quality checks for proposed messages.
- **Style rules** (`styleRulesFor`): Anti-placeholder, anti-"yes but no", formal register rules.

### Goal Structure (`src/lib/goal-utils.ts`)

Markdown-based goal tracking with sequential execution:
- `enforceGoalStructure()` — validates LLM output against template, prevents regression, restores missing goals
- `markActiveActionsDone()` — post-writer processing: marks ACTION items done, handles goal completion chain
- `findNewlyActivatedItems()` / `findNewlyDoneItems()` — diff helpers for state transitions

## Next Steps

- [ ] Deploy to Cloudflare (`wrangler deploy`)
- [ ] Set production secrets (`GEMINI_API_KEYS`, `AUTH_TOKEN`)
- [ ] Integrate in apply-via-resume `handleConfirm()`
- [ ] Shadow mode client in candidate-routing (`src/lib/screening-client.ts`)
- [ ] Connect shadow mode to `pipelineWriteMessage` in candidate-routing
- [ ] Add vitest + unit tests for goal-utils and text-utils
- [ ] Add integration tests with real production dialogs (5+ fixtures)
- [ ] Phase 2: switch candidate-routing to use this API as primary (not shadow)
- [ ] Phase 3: externalize prompts to `hiring-pipeline-config` repo
