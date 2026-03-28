import type { EvaluateRequest, GenerateQuestionsRequest, QuestionSpec } from './types';

const CURRENCY_NOTE = `IMPORTANT — Salary & Currency: Candidates may state salary in different currencies (KZT, USD, EUR, etc.).
Always convert to the job's currency before comparing. Approximate rates: 1 RUB ≈ 5-6 KZT, 1 USD ≈ 90-100 RUB, 1 EUR ≈ 100-110 RUB.
Example: 600,000 KZT ≈ 100,000-120,000 RUB — do NOT treat foreign-currency amounts as face value in the job's currency.`;

function langInstruction(lang: string): string {
  if (lang === 'ru') return 'Write all output in Russian.';
  if (lang === 'it') return 'Write all output in Italian.';
  return 'Write all output in English.';
}

// ── Screening prompt (candidate-facing) ──────────────────────────────────────

export function buildScreeningPrompt(req: EvaluateRequest): { system: string; user: string } {
  const lang = req.language ?? 'en';

  if (req.custom_screening_prompt) {
    return {
      system: `${req.custom_screening_prompt}\n\n${langInstruction(lang)}\n\nJob title: ${req.job_title}`,
      user: `Job Description:\n${req.job_description}\n\nCandidate Resume:\n${req.resume_text}\n\nReturn JSON with fields: "matched" (array of strings), "questions" (array of strings), "summary_for_email" (string).`,
    };
  }

  return {
    system: `You are a recruiting assistant performing an automated CV-vs-job-description check. A candidate just uploaded their resume for the "${req.job_title}" position. Compare their resume against the job requirements and produce an honest, specific analysis.

Your output will be shown DIRECTLY to the candidate on a results page. Be professional, specific, and reference concrete details from their CV.

${CURRENCY_NOTE}

${langInstruction(lang)}`,

    user: `Job Description:
${req.job_description}

Candidate Resume:
${req.resume_text}

Analyze the resume against the job description and return JSON:
{
  "matched": ["specific match 1", "specific match 2", ...],
  "questions": ["specific question 1", ...],
  "summary_for_email": "brief summary"
}

Rules:
- "matched": 3-6 specific qualifications from the resume that align with the job. Reference ACTUAL experience, skills, or facts from the CV. E.g. "5 years of React experience at CompanyX" not just "frontend experience".
- "questions": 2-4 specific areas where the CV doesn't clearly cover a job requirement, OR where we need more detail. Each question should explain WHAT the job needs and WHAT is unclear from the CV. Frame as genuine clarification requests. E.g. "The role requires TypeScript experience, but your CV mentions JavaScript — do you also have TypeScript experience?" not just "TypeScript skills".
- "summary_for_email": One sentence summarizing the key points we'd like the candidate to clarify or discuss. E.g. "your TypeScript experience and availability for the hybrid schedule in Milan"`,
  };
}

// ── Evaluation prompt (recruiter-facing) ─────────────────────────────────────

export function buildEvaluationPrompt(req: EvaluateRequest): { system: string; user: string } {
  const customPart = req.custom_evaluation_prompt
    ? `\n\nAdditional instructions:\n${req.custom_evaluation_prompt}`
    : '';

  const mustHavesList = req.must_haves?.length
    ? `\n\nMust-have requirements (deal-breakers):\n${req.must_haves.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';

  return {
    system: `You are an expert recruiter evaluating a candidate's resume against a job description.

Your task:
1. Analyze the resume thoroughly against the job requirements
2. Score each dimension (skills, experience, education, languages, location)
3. Identify red flags (employment gaps >1 year, inconsistencies, overqualification, frequent job changes)
4. Provide an actionable recommendation

Scoring guide:
- 85-100 (strong_yes): Exceeds requirements, ideal candidate
- 70-84 (yes): Meets all must-haves, solid fit
- 50-69 (maybe): Meets most requirements, worth a conversation
- 25-49 (no): Missing key requirements
- 0-24 (strong_no): Clearly unqualified

Be fair but rigorous. Focus on hard evidence in the resume, not assumptions.
When must-haves are specified, treat them as deal-breakers — missing a must-have caps the score at 49.

${CURRENCY_NOTE}${customPart}`,

    user: `Job Description:
${req.job_description}
${mustHavesList}

Candidate Resume:
${req.resume_text}

Evaluate this candidate. Return a JSON object with this exact structure:
{
  "score": <0-100>,
  "verdict": "<strong_yes|yes|maybe|no|strong_no>",
  "summary": "<2-3 sentence justification>",
  "matches": {
    "skills": { "matched": ["skill1", "skill2"], "missing": ["skill3"], "score": <0-1> },
    "experience": { "relevant_years": <N>, "required_years": <N>, "score": <0-1> },
    "education": { "level": "<description>", "score": <0-1> },
    "languages": { "<language>": "<level>" },
    "location": { "candidate": "<location>", "required": "<location>", "match": "<yes|partial|no>" }
  },
  "red_flags": ["<flag1>", "<flag2>"],
  "recommendation": "<what to do next>"
}`,
  };
}

// ── Match prompt (lightweight, for ranking) ─────────────────────────────────

export function buildMatchPrompt(req: { resume_text: string; job_description: string; job_title?: string; must_haves?: string[]; custom_prompt?: string | null }): { system: string; user: string } {
  const customPart = req.custom_prompt ? `\n\nAdditional instructions:\n${req.custom_prompt}` : '';

  const mustHavesList = req.must_haves?.length
    ? `\n\nMust-have requirements (deal-breakers):\n${req.must_haves.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';

  return {
    system: `You are an expert recruiter scoring a candidate's resume against a job description. Be concise and fast.

Scoring guide:
- 85-100 (strong_yes): Exceeds requirements, ideal candidate
- 70-84 (yes): Meets all must-haves, solid fit
- 50-69 (maybe): Meets most requirements, worth a conversation
- 25-49 (no): Missing key requirements
- 0-24 (strong_no): Clearly unqualified

When must-haves are specified, treat them as deal-breakers — missing a must-have caps the score at 49.

${CURRENCY_NOTE}${customPart}`,

    user: `${req.job_title ? `Job Title: ${req.job_title}\n\n` : ''}Job Description:
${req.job_description}
${mustHavesList}

Candidate Resume:
${req.resume_text}

Return JSON:
{
  "score": <0-100>,
  "verdict": "<strong_yes|yes|maybe|no|strong_no>",
  "summary": "<2-3 sentence justification>",
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "red_flags": ["flag1"]
}

Be specific: reference actual experience from the resume. Keep matched/missing to 3-6 items each.`,
  };
}

// ── Interview Questions prompt ───────────────────────────────────────────────

export function buildQuestionsPrompt(req: EvaluateRequest, screeningQuestions: string[]): { system: string; user: string } {
  const lang = req.language ?? 'en';

  return {
    system: `You are a senior recruiter preparing additional interview questions based on gaps identified during resume screening.

Generate focused, open-ended questions that help the interviewer assess areas where the candidate's CV doesn't clearly match the job requirements. Questions should be conversational and give the candidate a fair chance to demonstrate relevant experience.

Each question must be self-contained and ready for a voice interview (clear, concise, no jargon abbreviations).

${langInstruction(lang)}`,

    user: `Job Title: ${req.job_title}

Job Description:
${req.job_description}

Candidate Resume:
${req.resume_text}

Gaps identified during screening:
${screeningQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Generate 2-4 additional interview questions based on these gaps. Return JSON:
[
  {
    "topic": "<short topic name>",
    "question": "<the full interview question>",
    "reason": "<why this question matters — what gap it addresses>"
  }
]`,
  };
}

// ── Generate Questions prompt ────────────────────────────────────────────────

const PERSISTENCE_GUIDE: Record<number, string> = {
  0: 'Soft — follow-ups should be gentle and accepting. Any substantive answer is enough. Good for personal/motivational questions.',
  1: 'Standard — follow-ups should push for specifics beyond "yes I have experience". Ask for a concrete example or a tool name.',
  2: 'Thorough — follow-ups should demand concrete examples with tools, projects, or metrics. "Which tools exactly? What scale?"',
  3: 'Rigorous — follow-ups should demand real-world cases with measurable outcomes and the candidate\'s personal role. "What was YOUR contribution? What was the result?"',
};

const QUESTION_WRITING_GUIDE = `QUESTION WRITING RULES:
- Write open-ended questions that invite storytelling: "Tell me about..." beats "Do you know..."
- ONE concept per question. NEVER combine "Tell me about X and also Y" — the interviewer covers the first topic and may skip the rest.
- Be specific enough to get concrete answers: "What databases have you worked with at scale?" beats "Tell me about your tech stack"
- Questions must be self-contained and ready for a VOICE interview — clear, conversational, no jargon abbreviations.
- The first question should be a warm-up (background, intro) to set a comfortable tone.
- Order: easy/warm → harder (technical, design, problem-solving) → conversational (goals, salary, questions for us).
- Group related topics together for natural conversation flow.

FOLLOW-UP WRITING RULES:
- Target the gap — if the question asks about experience, the follow-up demands a concrete example.
- Offer options to help the candidate think: "Was it batch or streaming? Airflow, Prefect, Step Functions?"
- Ask for specifics: numbers, tools, outcomes. "How many DAGs? What was the latency?"
- Come from a DIFFERENT angle than the original question. Don't just rephrase it.
  BAD follow-up: "Could you tell me more about that?"
  GOOD follow-up: "Walk me through a specific pipeline. What tools — pandas, Spark, dbt? How many sources and what volume?"
- For personal/motivational questions (hobbies, goals, salary): ask for stories and details, NOT metrics. Use soft style regardless of persistence setting.
- Salary questions usually need NO follow-up — the answer is typically clear.
- Each follow-up should progressively go deeper: follow-up #1 asks for an example, follow-up #2 asks for numbers/outcomes within that example.`;

export function buildGenerateQuestionsPrompt(req: GenerateQuestionsRequest): { system: string; user: string } {
  const lang = req.language ?? 'en';
  const persistence = req.persistence_level ?? 1;
  const defaultFollowUps = req.follow_ups_per_question ?? 2;

  // Custom prompt override
  if (req.custom_prompt) {
    return {
      system: req.custom_prompt,
      user: buildGenerateUserPrompt(req, defaultFollowUps),
    };
  }

  const system = `You are an expert interviewer crafting questions for voice-based candidate interviews.

${QUESTION_WRITING_GUIDE}

Follow-up persistence level: ${PERSISTENCE_GUIDE[persistence] ?? PERSISTENCE_GUIDE[1]}

${langInstruction(lang)}

Return a JSON array. Each element:
{
  "id": "q1",
  "topic": "short topic name",
  "question": "the full interview question",
  "follow_ups": ["follow-up #1", "follow-up #2"] or null if 0 follow-ups requested,
  "original": "only for [REFINE] — the original draft text as given",
  "improvements": ["only for [REFINE] — list of what you changed and why, e.g. 'Compound question (3 topics) → split into single topic: professional background'"]
}
For [KEEP AS-IS] and [GENERATE] questions, omit "original" and "improvements".
For [REFINE] questions, ALWAYS include both "original" and "improvements".`;

  return { system, user: buildGenerateUserPrompt(req, defaultFollowUps) };
}

function buildGenerateUserPrompt(req: GenerateQuestionsRequest, defaultFollowUps: number): string {
  const parts: string[] = [];

  // Context
  if (req.job_title) parts.push(`Job Title: ${req.job_title}`);
  if (req.job_description) parts.push(`\nJob Description:\n${req.job_description}`);
  if (req.resume_text) parts.push(`\nCandidate Resume:\n${req.resume_text}`);

  // Rules
  if (req.rules?.length) {
    parts.push(`\nAdditional rules:\n${req.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  // Mode: advanced (per-question specs) or simple (count)
  if (req.questions?.length) {
    parts.push('\nGenerate questions according to these specs:');
    req.questions.forEach((spec, i) => {
      const n = i + 1;
      const fu = spec.follow_ups ?? defaultFollowUps;
      if (spec.question) {
        // As-is: keep exact text, generate follow-ups if needed
        parts.push(`\n${n}. [KEEP AS-IS] question: "${spec.question}"${spec.topic ? ` | topic: "${spec.topic}"` : ''} | follow-ups: ${fu}`);
      } else if (spec.draft) {
        // Refine: improve the draft
        parts.push(`\n${n}. [REFINE] draft: "${spec.draft}"${spec.topic ? ` | topic: "${spec.topic}"` : ''} | follow-ups: ${fu}`);
      } else {
        // Generate from scratch
        parts.push(`\n${n}. [GENERATE]${spec.topic ? ` topic: "${spec.topic}"` : ''} | follow-ups: ${fu}`);
      }
    });
    parts.push(`\nFor [KEEP AS-IS]: use the exact question text provided, only generate follow-ups. Do NOT include "original" or "improvements" fields.`);
    parts.push(`For [REFINE]: improve clarity, make it open-ended and voice-ready, then generate follow-ups. You MUST include "original" (the exact draft text) and "improvements" (array of strings explaining each change you made and why). Be specific: "Compound question (3 topics in one) → split to focus on professional background only", "Closed question → rewritten as open-ended storytelling prompt".`);
    parts.push(`For [GENERATE]: create a new question based on the topic (or infer a good topic from context), then generate follow-ups. Do NOT include "original" or "improvements" fields.`);
  } else {
    const count = req.count ?? 6;
    parts.push(`\nGenerate ${count} interview questions with ${defaultFollowUps} follow-up(s) each.`);
    if (req.resume_text) {
      parts.push('Personalize questions based on the candidate\'s resume — reference specific experience, gaps, or areas to explore.');
    }
  }

  parts.push('\nReturn a JSON array of question objects. Use sequential IDs: q1, q2, q3...');

  return parts.join('\n');
}
