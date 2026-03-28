import type { Env } from '../types';
import type { PipelineAnalyseRequest, PipelineAnalyseResponse } from './types';
import { askGeminiWithRetry } from '../gemini';
import { buildAnalyseSystemPrompt, buildAnalyseUserPrompt } from './prompts';
import { ensureMarkdownString, parseJsonFromLLM, fillTemplate, formatHistory } from '../lib/text-utils';
import { enforceGoalStructure } from '../lib/goal-utils';

const PIPELINE_MODEL = 'gemini-2.5-flash';

/** Deterministic patterns for detecting side requests the LLM may miss. */
const SIDE_REQUEST_PATTERNS = [
  /(?:перейти|перейдём|давайте|можем|хочу)\s.*(?:мессенджер|whatsapp|telegram|ватсап|телеграм)/,
  /(?:можно|давайте|хочу)\s.*(?:созвониться|позвонить|звонок)/,
  /(?:напишите|пишите)\s.*(?:в\s+(?:telegram|whatsapp|tg|вотсап|ватсап|телеграм))/,
];

export async function handlePipelineAnalyse(
  req: PipelineAnalyseRequest,
  env: Env,
): Promise<PipelineAnalyseResponse> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const lang = req.candidate.language ?? 'en';

  const templateSection = req.pipeline_template
    ? `\n\nORIGINAL PIPELINE TEMPLATE (ground truth — the goals and items MUST match this exactly):\n${req.pipeline_template}`
    : '';

  const conversationStr = formatHistory(req.conversation_history);
  const systemPrompt = buildAnalyseSystemPrompt(lang);

  const userPrompt = req.prompt_overrides?.pipeline_analyse
    ? fillTemplate(req.prompt_overrides.pipeline_analyse, {
        currentSummary: req.summary,
        currentGoals: req.goals,
        templateSection,
        conversationHistory: conversationStr,
        candidateReply: req.candidate_reply,
      })
    : buildAnalyseUserPrompt({
        currentSummary: req.summary,
        currentGoals: req.goals,
        templateSection,
        conversationHistory: conversationStr,
        candidateReply: req.candidate_reply,
      });

  const raw = await askGeminiWithRetry(env.GEMINI_API_KEYS, systemPrompt, userPrompt, {
    model: PIPELINE_MODEL,
    maxOutputTokens: 2000,
    jsonMode: true,
  });

  const result = parseJsonFromLLM<PipelineAnalyseResponse>(raw, 'pipelineAnalyse');
  result.request_id = requestId;
  result.goals = ensureMarkdownString(result.goals);
  result.summary = ensureMarkdownString(result.summary);
  if (typeof result.next_item !== 'string') result.next_item = String(result.next_item ?? '');

  // Deterministic fallback: detect common candidate requests the LLM may miss
  if (!result.candidate_question) {
    const replyLower = req.candidate_reply.toLowerCase();
    for (const pat of SIDE_REQUEST_PATTERNS) {
      if (pat.test(replyLower)) {
        result.candidate_question = req.candidate_reply.trim();
        console.log(`[pipeline/analyse] ${requestId} Fallback candidate_question detected via regex`);
        break;
      }
    }
  }

  // Structural enforcement: strip invented items, restore missing goals
  if (req.pipeline_template) {
    result.goals = enforceGoalStructure(result.goals, req.pipeline_template, req.goals);
  }

  // Detect reopened goals
  if (req.goals) {
    const prevHeaders = [...req.goals.matchAll(/^##\s+Goal\s+(\d+):.*\[(completed|active|pending)\]/gm)];
    const newHeaders = [...result.goals.matchAll(/^##\s+Goal\s+(\d+):.*\[(completed|active|pending)\]/gm)];
    for (const nh of newHeaders) {
      const ph = prevHeaders.find(p => p[1] === nh[1]);
      if (ph && ph[2] === 'completed' && nh[2] === 'active') {
        result.goal_just_completed = '__reopened__';
        console.log(`[pipeline/analyse] ${requestId} Goal ${nh[1]} reopened`);
        break;
      }
    }
  }

  // Bundle consecutive ACTION items
  const ACTION_PREFIX_RE = /^(Tell|Mention|Share|Propose|Send|Give|Explain|Describe)\b/i;
  const goalLines = result.goals.split('\n');
  for (let i = 0; i < goalLines.length; i++) {
    const activeMatch = goalLines[i].match(/^-\s+\[active\]\s+(.+)$/);
    if (activeMatch && ACTION_PREFIX_RE.test(activeMatch[1].trim())) {
      for (let j = i + 1; j < goalLines.length && !goalLines[j].match(/^##/); j++) {
        const pendingMatch = goalLines[j].match(/^(-\s+)\[pending\]\s+(.+)$/);
        if (pendingMatch && ACTION_PREFIX_RE.test(pendingMatch[2].trim())) {
          goalLines[j] = `${pendingMatch[1]}[active] ${pendingMatch[2]}`;
        } else {
          break;
        }
      }
      break;
    }
  }
  result.goals = goalLines.join('\n');

  // Derive next_item from enforced goals (don't trust LLM's next_item)
  const activeMatches = [...result.goals.matchAll(/^-\s+\[active\]\s+(.+)$/gm)];
  if (activeMatches.length > 0) {
    result.next_item = activeMatches
      .map(m => m[1].replace(/\s*—\s+.*$/, '').trim())
      .join('\n');
  }

  // Derive all_done from goals
  const goalHeaders = result.goals.match(/^##\s+Goal\s+\d+:.*$/gm) ?? [];
  result.all_done = goalHeaders.length > 0 && goalHeaders.every(h => h.includes('[completed]'));

  console.log(`[pipeline/analyse] ${requestId} all_done=${result.all_done} next_item="${result.next_item.slice(0, 50)}"`);

  return result;
}
