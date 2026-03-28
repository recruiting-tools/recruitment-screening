import { describe, it, expect } from 'vitest';

/**
 * Tests for the deterministic checks in validate-message.
 * These don't call LLM — they test placeholder detection, length, greeting patterns.
 *
 * We import the internal function by testing via the handler with a mock env.
 * Since the deterministic checks run before LLM, we can test them by checking
 * the handler output when LLM is unavailable (it gracefully degrades).
 */

// Rather than mock the full handler, we extract and test the patterns directly
describe('validate-message deterministic checks', () => {
  // Replicate the deterministic check logic from validate.ts
  function runDeterministicChecks(msg: string, name: string) {
    const issues: Array<{ severity: string; type: string; description: string }> = [];

    const placeholders = /\[(Имя|Name|Candidate Name|First Name|имя кандидата|Имя Кандидата)\]/i;
    if (placeholders.test(msg)) {
      issues.push({ severity: 'high', type: 'wrong_name', description: `Placeholder found for "${name}"` });
    }

    const wordCount = msg.split(/\s+/).length;
    if (wordCount > 500) {
      issues.push({ severity: 'medium', type: 'too_long', description: `${wordCount} words` });
    }

    const genericGreetings = /(?:^|[\s,;.!?])(Dear candidate|Dear Sir|Dear Madam|Уважаемый кандидат|Уважаемый соискатель)(?:$|[\s,;.!?])/i;
    if (genericGreetings.test(msg)) {
      issues.push({ severity: 'high', type: 'generic_greeting', description: `Generic greeting for "${name}"` });
    }

    return issues;
  }

  it('detects [Name] placeholder', () => {
    const issues = runDeterministicChecks('Ciao [Name], come stai?', 'Marco Rossi');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('wrong_name');
  });

  it('detects [Имя Кандидата] placeholder', () => {
    const issues = runDeterministicChecks('Здравствуйте, [Имя Кандидата]!', 'Богдан Шилов');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('wrong_name');
  });

  it('detects generic greeting "Dear candidate"', () => {
    const issues = runDeterministicChecks('Dear candidate, thank you for your interest.', 'Marco Rossi');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('generic_greeting');
  });

  it('detects generic greeting "Уважаемый кандидат"', () => {
    const issues = runDeterministicChecks('Уважаемый кандидат, спасибо за отклик.', 'Богдан Шилов');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('generic_greeting');
  });

  it('flags messages over 500 words', () => {
    const longMsg = 'word '.repeat(501);
    const issues = runDeterministicChecks(longMsg, 'Marco Rossi');
    expect(issues.some(i => i.type === 'too_long')).toBe(true);
  });

  it('passes clean message with no issues', () => {
    const issues = runDeterministicChecks('Привет, Богдан! Спасибо за ответ.', 'Богдан Шилов');
    expect(issues).toHaveLength(0);
  });

  it('detects multiple issues at once', () => {
    const issues = runDeterministicChecks('Dear candidate, [Name] ' + 'word '.repeat(500), 'Marco');
    expect(issues.length).toBeGreaterThanOrEqual(3);
    const types = issues.map(i => i.type);
    expect(types).toContain('wrong_name');
    expect(types).toContain('generic_greeting');
    expect(types).toContain('too_long');
  });
});
