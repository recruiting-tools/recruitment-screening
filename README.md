# recruitment-screening

Stateless Cloudflare Worker that evaluates candidate resumes, generates voice-interview questions, and runs pipeline conversation logic for automated candidate screening. Powered by Gemini 2.5 Flash.

## What it does

- **Resume evaluation** — screens resumes against job descriptions, returns candidate-facing results + recruiter-facing scores (0–100)
- **Question generation** — creates interview questions with follow-ups, ready for voice interviews. Supports simple mode (just count) and advanced mode (per-question control: generate / refine / keep as-is)
- **Pipeline conversation** — goal-based candidate screening pipeline with 5 stateless endpoints: init, analyse, write-message, completion, validate. Sequential goal execution with markdown-based state tracking
- **Compliance check** — optionally validates generated questions against [interview-engine](https://github.com/recruiting-tools/interview-engine) API
- **Self-documenting** — `GET /` serves a live API reference with examples and a question-writing guide

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | API docs page (HTML) |
| `GET` | `/health` | Health check |
| `GET` | `/api/mcp/manifest` | MCP tool registry (8 tools, 2 playbooks) |
| `POST` | `/match` | Lightweight candidate-job matching for ranking |
| `POST` | `/evaluate` | Resume screening + evaluation |
| `POST` | `/generate-questions` | Interview question generation |
| `POST` | `/pipeline/init` | Initialize pipeline goals + summary from resume |
| `POST` | `/pipeline/analyse` | Update goals/summary after candidate reply |
| `POST` | `/pipeline/write-message` | Generate next message to candidate |
| `POST` | `/pipeline/completion` | Generate final wrap-up message |
| `POST` | `/pipeline/validate-message` | Quality check before sending |

All POST endpoints require `Authorization: Bearer <token>`.

## Quick start

```bash
# Install
npm install --include=dev

# Set local secrets
echo 'GEMINI_API_KEYS=your-key-here' > .dev.vars
echo 'AUTH_TOKEN=test-token-local' >> .dev.vars

# Run
npx wrangler dev

# Open docs
open http://localhost:8787/
```

## Generate questions — simple mode

```bash
curl -X POST http://localhost:8787/generate-questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "job_title": "Senior Data Engineer",
    "job_description": "Build data pipelines. Spark, Airflow, Python required.",
    "count": 5,
    "follow_ups_per_question": 2,
    "language": "en"
  }'
```

Response:
```json
{
  "questions": [
    {
      "id": "q1",
      "topic": "Background",
      "question": "Tell me about your experience building data pipelines. What tools have you used most?",
      "follow_ups": [
        "Walk me through a specific pipeline — Airflow, Spark, dbt? How many data sources?",
        "What volumes were you processing? How did you handle failures?"
      ]
    }
  ]
}
```

## Generate questions — advanced mode

Per-question control: generate from scratch, refine a draft, or keep as-is.

```bash
curl -X POST http://localhost:8787/generate-questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "job_title": "UX Engineer",
    "job_description": "TypeScript, React, design systems",
    "output_format": "interview-engine",
    "persistence_level": 2,
    "questions": [
      { "topic": "intro", "draft": "Tell me about yourself", "follow_ups": 1 },
      { "topic": "TypeScript", "follow_ups": 2 },
      { "question": "What are your salary expectations?", "follow_ups": 0 }
    ],
    "compliance_check": {
      "api_url": "https://i.recruiter-assistant.com",
      "api_token": "Bearer your-token",
      "dry_run": true
    }
  }'
```

| `questions[]` field | Behavior |
|---------------------|----------|
| `question` | Used **as-is**, only follow-ups generated |
| `draft` | **Refined** for clarity + follow-ups generated |
| `topic` only | **Generated from scratch** |
| `follow_ups: 0\|1\|2` | Override per question |

## Evaluate resume

```bash
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
```

Returns screening (candidate-facing), evaluation with score 0–100 (recruiter-facing), and optional interview questions.

## Pipeline — goal-based candidate screening

The pipeline endpoints power automated candidate conversations. Each call is stateless — the caller manages state between calls.

**Flow**: `init` → loop(`analyse` → `write-message`) → `completion`

```bash
# 1. Initialize — parse resume, set up goals
curl -X POST http://localhost:8787/pipeline/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "candidate": { "name": "John Miller", "language": "en" },
    "resume_text": "John Miller, 15 years corporate finance, CPA certified...",
    "job": { "title": "Finance Director", "description": "...", "must_haves": ["CPA"] },
    "pipeline_template": "## Goal 1: Intro [pending]\n- [pending] Tell: Hi!..."
  }'

# 2. After candidate replies — update goals + summary
curl -X POST http://localhost:8787/pipeline/analyse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "candidate": { "name": "John Miller", "language": "en" },
    "summary": "## Candidate Summary...",
    "goals": "## Goal 1: Intro [completed]...",
    "candidate_reply": "Yes, I have my CPA since 2012.",
    "conversation_history": [...]
  }'

# 3. Generate next message
curl -X POST http://localhost:8787/pipeline/write-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "candidate": { "name": "John Miller", "language": "en" },
    "next_item": "Years of financial leadership experience?",
    "conversation_history": [...],
    "job": { "title": "Finance Director", "interviewer_name": "Vladimir" },
    "context": { "is_follow_up": false }
  }'

# 4. Validate before sending (optional)
curl -X POST http://localhost:8787/pipeline/validate-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token-local" \
  -d '{
    "recent_messages": [...],
    "proposed_message": "Great to hear about your CPA...",
    "candidate": { "name": "John Miller", "language": "en" }
  }'

# 5. When all_done=true — final wrap-up
curl -X POST http://localhost:8787/pipeline/completion ...
```

**Goal structure**: Goals are sequential (`[pending]` → `[active]` → `[completed]`). Items within goals are also sequential (`[pending]` → `[active]` → `[done]`). ACTION items (`Tell:`, `Mention:`, `Share:`) are auto-marked done after the bot sends them. The `pipeline_template` defines the ground truth structure — LLM cannot invent or remove goals/items.

## Tests

```bash
npm test                  # all tests (deterministic + LLM)
npm run test:llm          # LLM tests only (calls production API)
```

41 tests: goal-utils (14), text-utils (10), validate deterministic (7), Russian pipeline LLM (5), English pipeline LLM (3).

## Deploy

```bash
wrangler secret put GEMINI_API_KEYS    # comma-separated keys (round-robin rotation)
wrangler secret put AUTH_TOKEN          # bearer token for callers
wrangler deploy
```

## Tech stack

- **Runtime**: Cloudflare Worker
- **LLM**: Gemini 2.5 Flash (pipeline) + Gemini 2.0 Flash (evaluate, questions) via REST API
- **Language**: TypeScript
- **Key rotation**: Round-robin for evaluate/questions, retry-with-rotation for pipeline (429/5xx handling)
