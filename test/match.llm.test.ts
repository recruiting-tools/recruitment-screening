import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.SCREENING_API_URL || 'https://recruitment-screening.dev-a96.workers.dev';
const TOKEN = process.env.SCREENING_API_TOKEN || 'test-token-local';

async function callMatch(body: Record<string, unknown>, retries = 2): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    if ('error' in json && attempt < retries) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    return json;
  }
  throw new Error('unreachable');
}

describe('POST /match — candidate ranking', () => {
  it('scores a strong candidate highly', async () => {
    const result = await callMatch({
      resume_text: 'John Miller — 15 years corporate finance. CFO at TechCorp (2019-2024). CPA certified. MBA Wharton. SAP, Oracle. Led teams of 20.',
      job_description: 'Finance Director. Oversees budgeting, forecasting, compliance. Manages team of 12. CPA required, SAP preferred.',
      job_title: 'Finance Director',
      must_haves: ['CPA certification'],
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(['strong_yes', 'yes']).toContain(result.verdict);
    expect(result.summary).toBeTruthy();
    expect(result.matched_skills).toBeTruthy();
    expect(result.request_id).toMatch(/^req_/);
  });

  it('scores a weak candidate low with must-have cap', async () => {
    const result = await callMatch({
      resume_text: 'Anna Smith — 2 years junior accounting. Excel, QuickBooks. No certifications.',
      job_description: 'Finance Director. CPA required, 10+ years experience, SAP.',
      must_haves: ['CPA certification', '10+ years financial leadership'],
    });

    // Missing must-haves should cap at 49
    expect(result.score).toBeLessThanOrEqual(49);
    expect(['no', 'strong_no']).toContain(result.verdict);
    const missing = result.missing_skills as string[];
    expect(missing.length).toBeGreaterThan(0);
  });

  it('returns 400 for missing resume_text', async () => {
    const res = await fetch(`${BASE_URL}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ job_description: 'Finance Director' }),
    });
    expect(res.status).toBe(400);
  });
});
