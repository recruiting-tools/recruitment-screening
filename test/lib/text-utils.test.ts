import { describe, it, expect } from 'vitest';
import {
  stripNamePlaceholders,
  ensureMarkdownString,
  parseJsonFromLLM,
  formatHistory,
} from '../../src/lib/text-utils';

describe('stripNamePlaceholders', () => {
  it('replaces Russian placeholders with first name', () => {
    const text = 'Здравствуйте, [Имя Кандидата]! Как дела, [Имя]?';
    expect(stripNamePlaceholders(text, 'Константин Ишумбаев'))
      .toBe('Здравствуйте, Константин! Как дела, Константин?');
  });

  it('replaces English placeholders', () => {
    const text = 'Dear [Candidate Name], we reviewed [First Name]\'s application.';
    expect(stripNamePlaceholders(text, 'Marco Rossi'))
      .toBe("Dear Marco, we reviewed Marco's application.");
  });

  it('is case-insensitive for brackets', () => {
    const text = '[name] and [NAME] and [Name]';
    const result = stripNamePlaceholders(text, 'Anna Falkova');
    expect(result).toBe('Anna and Anna and Anna');
  });

  it('leaves text unchanged when no placeholders', () => {
    const text = 'Привет, Константин! Всё хорошо.';
    expect(stripNamePlaceholders(text, 'Константин Ишумбаев')).toBe(text);
  });
});

describe('ensureMarkdownString', () => {
  it('returns string as-is', () => {
    const md = '## Goal 1\n- [done] Item';
    expect(ensureMarkdownString(md)).toBe(md);
  });

  it('converts null/undefined to empty string', () => {
    expect(ensureMarkdownString(null)).toBe('');
    expect(ensureMarkdownString(undefined)).toBe('');
  });

  it('converts object to markdown', () => {
    const obj = {
      'Goal 1: Screening': { 'Confirm experience': 'done', 'Ask salary': 'pending' },
    };
    const result = ensureMarkdownString(obj);
    expect(result).toContain('## Goal 1: Screening');
    expect(result).toContain('- [done] Confirm experience');
    expect(result).toContain('- [pending] Ask salary');
  });

  it('JSON-stringifies arrays', () => {
    const arr = ['item1', 'item2'];
    const result = ensureMarkdownString(arr);
    expect(result).toBe(JSON.stringify(arr));
  });
});

describe('parseJsonFromLLM', () => {
  it('parses valid JSON', () => {
    const result = parseJsonFromLLM<{ a: number }>('{"a": 42}', 'test');
    expect(result).toEqual({ a: 42 });
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"summary": "test"}\n```';
    const result = parseJsonFromLLM<{ summary: string }>(raw, 'test');
    expect(result).toEqual({ summary: 'test' });
  });

  it('throws on invalid JSON with context', () => {
    expect(() => parseJsonFromLLM('not json', 'myContext'))
      .toThrow('LLM returned invalid JSON in myContext');
  });
});

describe('formatHistory', () => {
  it('formats messages with role labels', () => {
    const messages = [
      { role: 'assistant', content: 'Hello Marco!' },
      { role: 'user', content: 'Hi, thanks for reaching out.' },
    ];
    const result = formatHistory(messages);
    expect(result).toContain('Recruiter: Hello Marco!');
    expect(result).toContain('Candidate: Hi, thanks');
  });
});
