export function renderDocs(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recruitment Screening API</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; --orange: #d29922; --red: #f85149; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 2rem; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.4rem; margin: 2rem 0 0.75rem; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  p, li { color: var(--text); margin-bottom: 0.5rem; }
  .subtitle { color: var(--muted); font-size: 1.1rem; margin-bottom: 2rem; }
  .endpoint { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
  .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.85rem; margin-right: 0.5rem; }
  .post { background: var(--green); color: #000; }
  .get { background: var(--accent); color: #000; }
  .path { font-family: monospace; font-size: 1rem; }
  pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; font-size: 0.85rem; line-height: 1.5; }
  code { font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace; }
  .inline-code { background: var(--card); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  th { color: var(--muted); font-weight: 600; }
  .tip { background: #1a2332; border-left: 3px solid var(--accent); padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 6px 6px 0; }
  .tip-bad { border-left-color: var(--red); background: #2a1519; }
  .tip-good { border-left-color: var(--green); background: #152a19; }
  ul { padding-left: 1.5rem; }
  .section { margin-bottom: 3rem; }
</style>
</head>
<body>

<h1>Recruitment Screening API</h1>
<p class="subtitle">Resume evaluation + interview question generation. Powered by Gemini.</p>

<!-- ────────────────────────────────────────── -->
<h2>Endpoints</h2>

<div class="endpoint">
  <span class="method get">GET</span> <span class="path">/</span> — This page
</div>
<div class="endpoint">
  <span class="method get">GET</span> <span class="path">/health</span> — Health check
</div>
<div class="endpoint">
  <span class="method post">POST</span> <span class="path">/evaluate</span> — Evaluate resume against job (screening + scoring)
</div>
<div class="endpoint">
  <span class="method post">POST</span> <span class="path">/generate-questions</span> — Generate interview questions
</div>

<p>All POST endpoints require <code class="inline-code">Authorization: Bearer &lt;token&gt;</code></p>

<!-- ────────────────────────────────────────── -->
<div class="section">
<h2>POST /generate-questions</h2>

<p>Generates interview questions for a voice interview. Two modes: <strong>simple</strong> (just tell how many) and <strong>advanced</strong> (control each question individually).</p>

<h3>Simple mode — "generate 6 questions for this job"</h3>
<pre><code>{
  "job_title": "Senior Data Engineer",
  "job_description": "We need someone who can build data pipelines...",
  "resume_text": "Ivan Petrov, 5 years at Yandex...",  // optional — personalizes questions
  "count": 6,
  "follow_ups_per_question": 2,
  "language": "en",
  "persistence_level": 1,
  "rules": [
    "Start with a warm-up question about background",
    "Include at least one question about system design"
  ]
}</code></pre>

<h3>Advanced mode — per-question control</h3>
<pre><code>{
  "job_title": "Senior Data Engineer",
  "job_description": "...",
  "language": "ru",
  "persistence_level": 2,
  "questions": [
    { "topic": "intro", "draft": "Расскажите о себе", "follow_ups": 1 },
    { "topic": "data pipelines", "follow_ups": 2 },
    { "topic": "system design", "draft": "Как бы вы спроектировали пайплайн?", "follow_ups": 2 },
    { "question": "Какие у вас зарплатные ожидания?", "follow_ups": 0 },
    { "follow_ups": 2 }
  ]
}</code></pre>

<table>
<tr><th>questions[] field</th><th>Behavior</th></tr>
<tr><td><code class="inline-code">question</code></td><td>Used <strong>as-is</strong>. Only follow-ups are generated.</td></tr>
<tr><td><code class="inline-code">draft</code></td><td><strong>Refined</strong> — improved for clarity, made voice-ready, follow-ups generated.</td></tr>
<tr><td><code class="inline-code">topic</code> only</td><td><strong>Generated from scratch</strong> based on topic + job context.</td></tr>
<tr><td>(empty object)</td><td>Generated from scratch, topic inferred from context.</td></tr>
<tr><td><code class="inline-code">follow_ups</code></td><td>0, 1, or 2. Overrides <code class="inline-code">follow_ups_per_question</code> for this question.</td></tr>
</table>

<h3>Parameters</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Default</th><th>Description</th></tr>
<tr><td><code class="inline-code">job_title</code></td><td>string</td><td>required</td><td>Position title</td></tr>
<tr><td><code class="inline-code">job_description</code></td><td>string</td><td>—</td><td>Full job description</td></tr>
<tr><td><code class="inline-code">resume_text</code></td><td>string</td><td>—</td><td>Candidate resume (enables personalization)</td></tr>
<tr><td><code class="inline-code">count</code></td><td>number</td><td>6</td><td>Number of questions (simple mode)</td></tr>
<tr><td><code class="inline-code">follow_ups_per_question</code></td><td>0 | 1 | 2</td><td>2</td><td>Default follow-ups per question</td></tr>
<tr><td><code class="inline-code">questions</code></td><td>array</td><td>—</td><td>Advanced mode specs (overrides count)</td></tr>
<tr><td><code class="inline-code">language</code></td><td>en | ru | it</td><td>en</td><td>Output language</td></tr>
<tr><td><code class="inline-code">persistence_level</code></td><td>0–3</td><td>1</td><td>Follow-up depth: 0=soft, 1=standard, 2=thorough, 3=rigorous</td></tr>
<tr><td><code class="inline-code">rules</code></td><td>string[]</td><td>—</td><td>Additional constraints ("start with warm-up", etc.)</td></tr>
<tr><td><code class="inline-code">custom_prompt</code></td><td>string</td><td>—</td><td>Override system prompt entirely</td></tr>
<tr><td><code class="inline-code">output_format</code></td><td>generic | interview-engine</td><td>generic</td><td>Output shape</td></tr>
<tr><td><code class="inline-code">compliance_check</code></td><td>object</td><td>—</td><td>Validate output against interview-engine API</td></tr>
</table>

<h3>Response (generic format)</h3>
<pre><code>{
  "questions": [
    {
      "id": "q1",
      "topic": "Background",
      "question": "Tell me about your experience with data engineering. What types of pipelines have you built?",
      "follow_ups": [
        "Walk me through a specific pipeline — what tools did you use: Airflow, Spark, dbt?",
        "What data volumes were you handling? How did you monitor failures?"
      ]
    }
  ]
}</code></pre>

<h3>Response (interview-engine format)</h3>
<pre><code>{
  "questions": [
    {
      "id": "q1",
      "topic": "Background",
      "question": "Tell me about your experience with data engineering...",
      "followUpIfVague": [
        "Walk me through a specific pipeline...",
        "What data volumes were you handling?..."
      ]
    }
  ]
}</code></pre>

<h3>Compliance check</h3>
<p>Add <code class="inline-code">compliance_check</code> to validate the output against interview-engine:</p>
<pre><code>{
  "compliance_check": {
    "api_url": "https://i.recruiter-assistant.com",
    "api_token": "Bearer your-token",
    "dry_run": true
  }
}</code></pre>
<p>When <code class="inline-code">dry_run: true</code>, the service POSTs a test session to interview-engine and reports back:</p>
<pre><code>// Success
"compliance": { "status": "ok", "interview_url": "https://..." }

// Failure
"compliance": { "status": "failed", "error": "interview-engine 422: ..." }</code></pre>
<p>Questions are always returned regardless of compliance result.</p>
</div>

<!-- ────────────────────────────────────────── -->
<div class="section">
<h2>POST /evaluate</h2>
<p>Evaluates a candidate's resume against a job description. Returns screening results (candidate-facing) and evaluation scores (recruiter-facing), with optional interview questions.</p>
<pre><code>{
  "resume_text": "Ivan Petrov, 5 years React at Yandex...",
  "job_description": "Senior UX Engineer, TypeScript required...",
  "job_title": "UX Engineer",
  "must_haves": ["TypeScript", "3+ years frontend"],
  "language": "en",
  "generate_interview_questions": true
}</code></pre>

<h3>Response</h3>
<pre><code>{
  "screening": {
    "matched": ["5 years React at Yandex", "Fluent English"],
    "questions": ["The role requires TypeScript — do you have experience?"],
    "summary_for_email": "your TypeScript experience and relocation timeline"
  },
  "evaluation": {
    "score": 72,
    "verdict": "yes",
    "summary": "Strong frontend skills, TypeScript unclear...",
    "matches": {
      "skills": { "matched": ["React", "CSS"], "missing": ["TypeScript"], "score": 0.7 },
      "experience": { "relevant_years": 5, "required_years": 3, "score": 0.9 },
      "education": { "level": "Bachelor CS", "score": 0.8 },
      "languages": { "English": "Fluent" },
      "location": { "candidate": "Moscow", "required": "Milan", "match": "no" }
    },
    "red_flags": [],
    "recommendation": "Proceed to interview, clarify TypeScript"
  },
  "additional_interview_questions": [
    { "topic": "TypeScript", "question": "Can you describe...", "reason": "..." }
  ]
}</code></pre>
</div>

<!-- ────────────────────────────────────────── -->
<div class="section">
<h2>How to write great interview questions</h2>

<h3>Questions</h3>
<ul>
  <li>Write <strong>open-ended</strong> questions that invite storytelling: "Tell me about..." beats "Do you know..."</li>
  <li><strong>One concept per question.</strong> Don't combine "Tell me about X and also Y" — the AI covers the first and skips the rest.</li>
  <li>Be <strong>specific</strong>: "What databases have you worked with at scale?" beats "Tell me about your tech stack"</li>
  <li><strong>5–8 questions</strong> is optimal for a 10–15 minute voice interview.</li>
</ul>

<h3>Follow-ups</h3>
<ul>
  <li><strong>Target the gap</strong> — if the question asks about experience, the follow-up demands a concrete example.</li>
  <li><strong>Offer options</strong>: "Was it batch or streaming? Airflow, Prefect, Step Functions?"</li>
  <li><strong>Ask for specifics</strong>: numbers, tools, outcomes.</li>
  <li>Come from a <strong>different angle</strong>, don't just rephrase the question.</li>
</ul>

<div class="tip tip-bad">
  <strong>Bad follow-up:</strong> "Could you tell me more about that?"
</div>
<div class="tip tip-good">
  <strong>Good follow-up:</strong> "Walk me through a specific pipeline. What tools — pandas, Spark, dbt? How many sources and what volume?"
</div>

<h3>Personal questions (hobbies, goals, salary)</h3>
<ul>
  <li>Follow-ups should ask for <strong>stories and details</strong>, not metrics.</li>
  <li>Salary questions usually need <strong>no follow-up</strong>.</li>
  <li>Use soft persistence regardless of global setting.</li>
</ul>

<h3>Persistence levels</h3>
<table>
<tr><th>Level</th><th>Name</th><th>Behavior</th></tr>
<tr><td>0</td><td>Soft</td><td>Accept any substantive answer, move on quickly</td></tr>
<tr><td>1</td><td>Standard</td><td>Require specifics, not just "yes I have experience"</td></tr>
<tr><td>2</td><td>Thorough</td><td>Require concrete examples with tools, projects, or metrics</td></tr>
<tr><td>3</td><td>Rigorous</td><td>Demand real-world cases with outcomes and personal role</td></tr>
</table>

<h3>Question order</h3>
<ul>
  <li>Start easy/warm (background) → harder (technical, design) → conversational (goals, questions for us)</li>
  <li>The first question sets the tone — make it comfortable.</li>
  <li>Group related topics together for natural flow.</li>
</ul>
</div>

<!-- ────────────────────────────────────────── -->
<div class="section">
<h2>curl examples</h2>

<h3>Generate questions (simple)</h3>
<pre><code>curl -X POST https://recruitment-screening.YOUR.workers.dev/generate-questions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "job_title": "Senior Data Engineer",
    "job_description": "Build and maintain data pipelines. Spark, Airflow, Python required.",
    "count": 5,
    "follow_ups_per_question": 2,
    "language": "en"
  }'</code></pre>

<h3>Generate questions (advanced + compliance check)</h3>
<pre><code>curl -X POST https://recruitment-screening.YOUR.workers.dev/generate-questions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "job_title": "UX Engineer",
    "job_description": "TypeScript, React, design systems...",
    "resume_text": "5 years React, no TypeScript mentioned...",
    "output_format": "interview-engine",
    "questions": [
      { "topic": "intro", "draft": "Tell me about yourself", "follow_ups": 1 },
      { "topic": "TypeScript", "follow_ups": 2 },
      { "question": "What are your salary expectations?", "follow_ups": 0 }
    ],
    "compliance_check": {
      "api_url": "https://i.recruiter-assistant.com",
      "api_token": "Bearer ie-token",
      "dry_run": true
    }
  }'</code></pre>

<h3>Evaluate resume</h3>
<pre><code>curl -X POST https://recruitment-screening.YOUR.workers.dev/evaluate \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "resume_text": "Ivan Petrov, 5 years React at Yandex",
    "job_description": "Senior UX Engineer, TypeScript required",
    "job_title": "UX Engineer",
    "language": "en",
    "generate_interview_questions": true
  }'</code></pre>
</div>

<p style="color: var(--muted); margin-top: 3rem; font-size: 0.85rem;">recruitment-screening v1.1 — Cloudflare Worker + Gemini 2.0 Flash</p>

</body>
</html>`;
}
