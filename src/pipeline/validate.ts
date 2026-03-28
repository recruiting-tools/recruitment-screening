import type { Env } from '../types';
import type { PipelineValidateRequest, PipelineValidateResponse, ValidationIssue } from './types';
import { askGeminiWithRetry } from '../gemini';
import { buildValidateSystemPrompt, buildValidateUserPrompt } from './prompts';
import { parseJsonFromLLM, formatHistory } from '../lib/text-utils';

const PIPELINE_MODEL = 'gemini-2.5-flash';

/** Run deterministic checks that don't need LLM. */
function runDeterministicChecks(req: PipelineValidateRequest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const msg = req.proposed_message;
  const name = req.candidate.name;

  // Check for placeholder names
  const placeholders = /\[(Имя|Name|Candidate Name|First Name|имя кандидата|Имя Кандидата)\]/i;
  if (placeholders.test(msg)) {
    issues.push({
      severity: 'high',
      type: 'wrong_name',
      description: `Message contains placeholder bracket instead of candidate name "${name}"`,
    });
  }

  // Check message length
  const wordCount = msg.split(/\s+/).length;
  if (wordCount > 500) {
    issues.push({
      severity: 'medium',
      type: 'too_long',
      description: `Message is ${wordCount} words — recommended max is 500`,
    });
  }

  // Check for generic greetings
  const genericGreetings = /(?:^|[\s,;.!?])(Dear candidate|Dear Sir|Dear Madam|Уважаемый кандидат|Уважаемый соискатель)(?:$|[\s,;.!?])/i;
  if (genericGreetings.test(msg)) {
    issues.push({
      severity: 'high',
      type: 'generic_greeting',
      description: `Uses generic greeting instead of candidate name "${name}"`,
    });
  }

  return issues;
}

export async function handlePipelineValidate(
  req: PipelineValidateRequest,
  env: Env,
): Promise<PipelineValidateResponse> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;

  // Run deterministic checks first
  const deterministicIssues = runDeterministicChecks(req);

  // Run LLM-based checks for semantic issues (repeated questions, contradictions, tone)
  const recentStr = formatHistory(req.recent_messages);
  const systemPrompt = buildValidateSystemPrompt();
  const userPrompt = buildValidateUserPrompt({
    recentMessages: recentStr,
    proposedMessage: req.proposed_message,
    candidateName: req.candidate.name,
    candidateLanguage: req.candidate.language ?? 'en',
  });

  let llmIssues: ValidationIssue[] = [];
  try {
    const raw = await askGeminiWithRetry(env.GEMINI_API_KEYS, systemPrompt, userPrompt, {
      model: PIPELINE_MODEL,
      maxOutputTokens: 1000,
      jsonMode: true,
    });
    const parsed = parseJsonFromLLM<{ ok: boolean; issues: ValidationIssue[] }>(raw, 'validate');
    llmIssues = parsed.issues ?? [];
  } catch (err) {
    console.error(`[pipeline/validate] ${requestId} LLM check failed:`, err);
    // Continue with deterministic results only
  }

  // Merge and deduplicate issues by type
  const seenTypes = new Set(deterministicIssues.map(i => i.type));
  const allIssues = [
    ...deterministicIssues,
    ...llmIssues.filter(i => !seenTypes.has(i.type)),
  ];

  console.log(`[pipeline/validate] ${requestId} issues=${allIssues.length} (deterministic=${deterministicIssues.length} llm=${llmIssues.length})`);

  return {
    request_id: requestId,
    ok: allIssues.length === 0,
    issues: allIssues,
  };
}
