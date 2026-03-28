import type { Env } from '../types';
import type { PipelineCompletionRequest, PipelineCompletionResponse } from './types';
import { askGeminiWithRetry } from '../gemini';
import { buildCompletionSystemPrompt, buildCompletionUserPrompt, styleRulesFor } from './prompts';
import { fillTemplate, formatHistory } from '../lib/text-utils';

const PIPELINE_MODEL = 'gemini-2.5-flash';

export async function handlePipelineCompletion(
  req: PipelineCompletionRequest,
  env: Env,
): Promise<PipelineCompletionResponse> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const lang = req.candidate.language ?? 'en';
  const interviewerName = req.job.interviewer_name ?? 'Vladimir';
  const rules = styleRulesFor(interviewerName, req.style_rules);

  const conversationStr = formatHistory(req.conversation_history);

  const systemPrompt = buildCompletionSystemPrompt({
    interviewerName,
    lang,
    rules,
  });

  const userPrompt = req.prompt_overrides?.pipeline_completion
    ? fillTemplate(req.prompt_overrides.pipeline_completion, {
        conversationHistory: conversationStr.slice(-2000),
        candidateSummary: req.summary,
      })
    : buildCompletionUserPrompt({
        conversationHistory: conversationStr,
        candidateSummary: req.summary,
      });

  const message = await askGeminiWithRetry(env.GEMINI_API_KEYS, systemPrompt, userPrompt, {
    model: PIPELINE_MODEL,
    maxOutputTokens: 400,
    jsonMode: false,
  });

  console.log(`[pipeline/completion] ${requestId} message_length=${message.length}`);

  return {
    request_id: requestId,
    message,
  };
}
