import { describe, it, expect } from 'vitest';

/**
 * LLM tests for English-language pipeline.
 * Verifies that init/analyse/write-message produce English output
 * and handle goal transitions correctly for an English vacancy.
 *
 * Run with: npm run test:llm
 */

const BASE_URL = process.env.SCREENING_API_URL || 'https://recruitment-screening.dev-a96.workers.dev';
const TOKEN = process.env.SCREENING_API_TOKEN || 'test-token-local';

async function callPipeline(endpoint: string, body: Record<string, unknown>, retries = 2): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}/pipeline/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    // Retry on transient LLM JSON parsing errors
    if ('error' in json && attempt < retries) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    return json;
  }
  throw new Error('unreachable');
}

// ── Fixture: Finance Director (English) ───────────────────────────────

const TEMPLATE = `## Goal 1: Intro [pending]
- [pending] Tell: Hi! I'm Vladimir, helping with initial screening

## Goal 2: Screening [pending]
- [pending] Do you have CPA/ACCA certification?
- [pending] Years of financial leadership experience?
- [pending] Salary expectations? (range: $150-180k)`;

const JOB = {
  title: 'Finance Director',
  description: 'Finance Director for a mid-size tech company. Oversees budgeting, forecasting, compliance, and financial reporting. Manages a team of 12. CPA/ACCA required, SAP experience preferred.',
};

const RESUME = `John Miller — 15 years in corporate finance. CFO at TechCorp (2019-2024), Finance Manager at GlobalInc (2014-2019). CPA certified. MBA from Wharton. Led teams of 8-20 people. SAP, Oracle, NetSuite. Managed $50M annual budget. Led two M&A transactions.`;

describe('English pipeline — init', () => {
  it('generates English summary and goals from resume', async () => {
    const result = await callPipeline('init', {
      candidate: { name: 'John Miller', language: 'en' },
      resume_text: RESUME,
      job: JOB,
      pipeline_template: TEMPLATE,
    });

    // Verify API returned successfully
    if ('error' in result) {
      throw new Error(`API error: ${JSON.stringify(result)}`);
    }

    const summary = result.summary as string;
    const goals = result.goals as string;

    // Summary should be in English (no Cyrillic)
    expect(summary).not.toMatch(/[а-яА-ЯёЁ]/);
    // Should mention CPA from resume
    expect(summary).toMatch(/CPA/i);

    // Goals should have proper structure
    expect(goals).toMatch(/Goal 1:.*\[(completed|active)\]/i);
    expect(goals).toMatch(/Goal 2:/i);
    // CPA should be mentioned somewhere in goals
    expect(goals).toMatch(/CPA/i);
  });
});

describe('English pipeline — analyse', () => {
  const ACTIVE_GOALS = `## Goal 1: Intro [completed]
- [done] Tell: Hi! I'm Vladimir, helping with initial screening

## Goal 2: Screening [active]
- [active] Do you have CPA/ACCA certification?
- [pending] Years of financial leadership experience?
- [pending] Salary expectations? (range: $150-180k)`;

  const SUMMARY = `## Candidate: John Miller
### Must-haves
- CPA/ACCA: ❓ not confirmed
- Financial leadership: ❓ not confirmed
- Team management 10+: ❓ not confirmed
### Key Info
- Salary: unknown`;

  it('marks CPA done when candidate confirms', async () => {
    const result = await callPipeline('analyse', {
      candidate: { name: 'John Miller', language: 'en' },
      summary: SUMMARY,
      goals: ACTIVE_GOALS,
      candidate_reply: 'Yes, I have my CPA. Got certified in 2012.',
      conversation_history: [
        { role: 'assistant', content: 'Do you have CPA/ACCA or equivalent certification?' },
        { role: 'user', content: 'Yes, I have my CPA. Got certified in 2012.' },
      ],
      pipeline_template: TEMPLATE,
    });

    const goals = result.goals as string;
    const summary = result.summary as string;

    // CPA item should be done
    expect(goals).toMatch(/\[done\].*CPA/i);
    // Next item should become active
    expect(goals).toMatch(/\[active\].*experience/i);
    // Summary should be in English
    expect(summary).not.toMatch(/[а-яА-ЯёЁ]/);
    // Summary should reference CPA confirmation
    expect(summary).toMatch(/CPA/i);
  });
});

describe('English pipeline — write-message', () => {
  it('generates English message for next question', async () => {
    const result = await callPipeline('write-message', {
      candidate: { name: 'John Miller', language: 'en' },
      next_item: 'How many years of experience in financial leadership roles?',
      conversation_history: [
        { role: 'assistant', content: 'Hi John! My name is Vladimir. Do you have CPA/ACCA or equivalent certification?' },
        { role: 'user', content: 'Yes, I have my CPA since 2012.' },
      ],
      job: { ...JOB, interviewer_name: 'Vladimir' },
      context: {
        is_follow_up: false,
        goal_just_completed: null,
        candidate_question: null,
      },
    });

    const message = result.message as string;

    // Message should be in English (no Cyrillic)
    expect(message).not.toMatch(/[а-яА-ЯёЁ]/);
    // Should reference the candidate by name
    expect(message).toMatch(/John/i);
    // Should ask about experience/leadership/years
    expect(message).toMatch(/experience|leadership|years|role/i);
  });
});
