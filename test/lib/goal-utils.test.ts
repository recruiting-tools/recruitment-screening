import { describe, it, expect } from 'vitest';
import {
  enforceGoalStructure,
  markActiveActionsDone,
  findNewlyActivatedItems,
  findNewlyDoneItems,
  parseGoalStructure,
} from '../../src/lib/goal-utils';

// ── Realistic pipeline template (based on zakupki-china job) ────────────────

const TEMPLATE = `## Goal 1: Intro [pending]
- [pending] Tell: привет! Меня зовут Владимир
- [pending] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [pending]
- [pending] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

// ── enforceGoalStructure ────────────────────────────────────────────────────

describe('enforceGoalStructure', () => {
  it('strips items invented by LLM that are not in template', () => {
    const llmGoals = `## Goal 1: Intro [active]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов
- [done] Tell: это будет короткий разговор

## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?
- [pending] Какой у вас опыт работы?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    const result = enforceGoalStructure(llmGoals, TEMPLATE);
    // Invented items should be stripped
    expect(result).not.toContain('это будет короткий разговор');
    expect(result).not.toContain('Какой у вас опыт работы');
    // Template items should be preserved
    expect(result).toContain('Tell: привет! Меня зовут Владимир');
    expect(result).toContain('Зарплатные ожидания');
  });

  it('prevents status regression (done → pending)', () => {
    const previousGoals = `## Goal 1: Intro [completed]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [active]
- [done] Владеете ли вы китайским языком?
- [active] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    // LLM tries to regress "Владеете ли вы китайским языком?" back to [active]
    const llmGoals = `## Goal 1: Intro [completed]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    const result = enforceGoalStructure(llmGoals, TEMPLATE, previousGoals);
    // Chinese language question was [done] before, should stay [done]
    expect(result).toMatch(/\[done\] Владеете ли вы китайским языком/);
    // WeChat should stay [active] (not regressed)
    expect(result).toMatch(/\[active\] Есть ли у вас свой аккаунт WeChat/);
  });

  it('prevents goal regression (completed → active)', () => {
    const previousGoals = `## Goal 1: Intro [completed]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    // LLM tries to regress Goal 1 from [completed] back to [active]
    const llmGoals = `## Goal 1: Intro [active]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    const result = enforceGoalStructure(llmGoals, TEMPLATE, previousGoals);
    expect(result).toMatch(/Goal 1: Intro \[completed\]/);
  });

  it('restores missing goals from template', () => {
    // LLM output completely dropped Goal 3
    const llmGoals = `## Goal 1: Intro [completed]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?`;

    const result = enforceGoalStructure(llmGoals, TEMPLATE);
    // Goal 3 should be restored
    expect(result).toContain('Goal 3: Commitment');
    // Note: parseGoalStructure strips text after " — ", so template item
    // "Tell: компания — бренд детской одежды" becomes "Tell: компания"
    expect(result).toContain('Tell: компания');
    expect(result).toContain('Интересно ли вам такое направление');
  });

  it('promotes goal to [completed] when all items [done]', () => {
    const llmGoals = `## Goal 1: Intro [active]
- [done] Tell: привет! Меня зовут Владимир
- [done] Tell: сначала я задам несколько вопросов

## Goal 2: Screening [pending]
- [pending] Владеете ли вы китайским языком?
- [pending] Есть ли у вас свой аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    const result = enforceGoalStructure(llmGoals, TEMPLATE);
    // Goal 1 should be promoted to [completed] since all items are [done]
    expect(result).toMatch(/Goal 1: Intro \[completed\]/);
    // Goal 2 should be activated
    expect(result).toMatch(/Goal 2: Screening \[active\]/);
    // First item of Goal 2 should be [active]
    expect(result).toMatch(/\[active\] Владеете ли вы китайским/);
  });

  it('preserves [faq] marker from template', () => {
    const templateWithFaq = `## Goal 1: Q&A [faq] [pending]
- [pending] Tell: если есть вопросы — спрашивайте
- [pending] Ответить на вопросы из FAQ`;

    const llmGoals = `## Goal 1: Q&A [active]
- [done] Tell: если есть вопросы — спрашивайте
- [active] Ответить на вопросы из FAQ`;

    const result = enforceGoalStructure(llmGoals, templateWithFaq);
    expect(result).toContain('[faq]');
  });
});

// ── markActiveActionsDone ───────────────────────────────────────────────────

describe('markActiveActionsDone', () => {
  it('marks active ACTION items as done', () => {
    const goals = `## Goal 1: Intro [active]
- [active] Tell: привет! Меня зовут Владимир
- [active] Tell: сначала я задам несколько вопросов
- [pending] Владеете ли вы китайским языком?`;

    const result = markActiveActionsDone(goals);
    expect(result).toMatch(/\[done\] Tell: привет/);
    expect(result).toMatch(/\[done\] Tell: сначала/);
    // Non-action item should be promoted to [active]
    expect(result).toMatch(/\[active\] Владеете ли вы/);
  });

  it('does NOT mark non-action items as done', () => {
    const goals = `## Goal 2: Screening [active]
- [active] Владеете ли вы китайским языком?
- [pending] Есть ли у вас аккаунт WeChat?`;

    const result = markActiveActionsDone(goals);
    // Should be unchanged — "Владеете" is not an ACTION verb
    expect(result).toMatch(/\[active\] Владеете ли вы/);
    expect(result).toMatch(/\[pending\] Есть ли у вас/);
  });

  it('completes goal and activates next when all items done', () => {
    const goals = `## Goal 1: Intro [active]
- [done] Tell: привет
- [active] Tell: сначала я задам вопросы

## Goal 2: Screening [pending]
- [pending] Владеете ли вы китайским языком?
- [pending] Есть ли у вас аккаунт WeChat?`;

    const result = markActiveActionsDone(goals);
    expect(result).toMatch(/Goal 1: Intro \[completed\]/);
    expect(result).toMatch(/Goal 2: Screening \[active\]/);
    expect(result).toMatch(/\[active\] Владеете ли вы/);
  });

  it('chain-marks consecutive ACTION items in new goal', () => {
    const goals = `## Goal 1: Intro [active]
- [done] Tell: привет
- [active] Tell: сначала я задам вопросы

## Goal 3: Commitment [pending]
- [pending] Tell: компания — бренд детской одежды
- [pending] Tell: производство на фабриках в Китае
- [pending] Интересно ли вам такое направление?`;

    const result = markActiveActionsDone(goals);
    // Goal 1 completes, Goal 3 activates
    // Both Tell items should be chain-marked [done]
    expect(result).toMatch(/\[done\] Tell: компания/);
    expect(result).toMatch(/\[done\] Tell: производство/);
    // "Интересно ли" is not an action, should become [active]
    expect(result).toMatch(/\[active\] Интересно ли вам/);
  });
});

// ── findNewlyActivatedItems / findNewlyDoneItems ────────────────────────────

describe('findNewlyActivatedItems', () => {
  it('detects items that moved from pending to active', () => {
    const prev = `## Goal 2: Screening [active]
- [done] Владеете ли вы китайским языком?
- [active] Есть ли у вас аккаунт WeChat?
- [pending] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?`;

    const curr = `## Goal 2: Screening [active]
- [done] Владеете ли вы китайским языком?
- [done] Есть ли у вас аккаунт WeChat?
- [active] Есть ли опыт работы с 1688.com?
- [pending] Зарплатные ожидания?`;

    const activated = findNewlyActivatedItems(prev, curr);
    expect(activated).toHaveLength(1);
    expect(activated[0]).toContain('1688.com');
  });
});

describe('findNewlyDoneItems', () => {
  it('detects items that became done', () => {
    const prev = `- [active] Есть ли у вас аккаунт WeChat?
- [pending] Зарплатные ожидания?`;

    const curr = `- [done] Есть ли у вас аккаунт WeChat?
- [active] Зарплатные ожидания?`;

    const done = findNewlyDoneItems(prev, curr);
    expect(done).toHaveLength(1);
    expect(done[0]).toContain('WeChat');
  });
});

// ── parseGoalStructure ──────────────────────────────────────────────────────

describe('parseGoalStructure', () => {
  it('parses goals and items from markdown', () => {
    const goals = parseGoalStructure(TEMPLATE);
    expect(goals).toHaveLength(3);
    expect(goals[0].name).toBe('Intro');
    expect(goals[0].items).toHaveLength(2);
    expect(goals[1].name).toBe('Screening');
    expect(goals[1].items).toHaveLength(4);
    expect(goals[2].name).toBe('Commitment');
    expect(goals[2].items).toHaveLength(3);
  });

  it('strips evidence from item text', () => {
    const md = `## Goal 1: Test [active]
- [done] Confirm experience — 10 years at Barilla
- [active] Ask about salary`;

    const goals = parseGoalStructure(md);
    expect(goals[0].items[0]).toBe('Confirm experience');
    expect(goals[0].items[1]).toBe('Ask about salary');
  });
});
