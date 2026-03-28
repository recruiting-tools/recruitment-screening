# recruitment-screening

Stateless Cloudflare Worker that evaluates candidate resumes and generates voice-interview questions with follow-ups. Powered by Gemini 2.0 Flash.

## What it does

- **Resume evaluation** — screens resumes against job descriptions, returns candidate-facing results + recruiter-facing scores (0–100)
- **Question generation** — creates interview questions with follow-ups, ready for voice interviews. Supports simple mode (just count) and advanced mode (per-question control: generate / refine / keep as-is)
- **Compliance check** — optionally validates generated questions against [interview-engine](https://github.com/recruiting-tools/interview-engine) API
- **Self-documenting** — `GET /` serves a live API reference with examples and a question-writing guide

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | API docs page (HTML) |
| `GET` | `/health` | Health check |
| `POST` | `/evaluate` | Resume screening + evaluation |
| `POST` | `/generate-questions` | Interview question generation |

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

## Deploy

```bash
wrangler secret put GEMINI_API_KEYS    # comma-separated keys (round-robin rotation)
wrangler secret put AUTH_TOKEN          # bearer token for callers
wrangler deploy
```

## Tech stack

- **Runtime**: Cloudflare Worker
- **LLM**: Google Gemini 2.0 Flash via REST API
- **Language**: TypeScript
- **Key rotation**: Round-robin across comma-separated `GEMINI_API_KEYS`
