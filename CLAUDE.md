# recruitment-screening

Stateless Cloudflare Worker that evaluates candidate resumes against job descriptions using Gemini LLM. Returns screening results (for candidate), evaluation scores (for recruiter), and generates voice-interview questions with follow-ups.

## Architecture

```
GET /          → Self-documenting API page (HTML)
GET /health    → {"status": "ok"}

POST /evaluate → Resume screening + evaluation
  Auth → Parallel [Screening, Evaluation] → Optional questions → JSON

POST /generate-questions → Interview question generation
  Auth → Gemini (with best-practice prompt) → Optional compliance check → JSON
```

**No database. No state. Pure functions.**

## Tech Stack

- **Runtime**: Cloudflare Worker
- **LLM**: Google Gemini 2.0 Flash (`gemini-2.0-flash`) via REST API
- **Language**: TypeScript
- **Key rotation**: Round-robin across comma-separated `GEMINI_API_KEYS`

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker entry: routing, auth, handlers (evaluate, generate-questions), compliance check |
| `src/types.ts` | All TypeScript interfaces (Env, requests, responses, question specs) |
| `src/prompts.ts` | Prompt builders: screening, evaluation, legacy questions, **generate-questions** (with best-practice guide) |
| `src/gemini.ts` | Gemini API client with round-robin key rotation (`pickKey`) |
| `src/docs.ts` | Self-documenting HTML page served at `GET /` |
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

candidate-routing has its own `evaluateResume()` and `screenResumeForApply()` in `src/lib/resume-eval.ts` (using OpenAI). These can be gradually migrated to call this service instead.

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

## Next Steps

- [ ] Deploy to Cloudflare (`wrangler deploy`)
- [ ] Set production secrets (`GEMINI_API_KEYS`, `AUTH_TOKEN`)
- [ ] Integrate in apply-via-resume `handleConfirm()`
- [ ] Test end-to-end with real gate: `https://apply-via-resume.dev-a96.workers.dev/njm5b5/1-ux-engineer`
- [ ] Consider: retry with next key on 429 (currently fails on first 429)
