import type { Env } from '../types';
import type { PipelineInitRequest, PipelineInitResponse } from './types';
import { askGeminiWithRetry } from '../gemini';
import { buildInitSystemPrompt, buildInitUserPrompt } from './prompts';
import { ensureMarkdownString, parseJsonFromLLM, fillTemplate } from '../lib/text-utils';

const PIPELINE_MODEL = 'gemini-2.5-flash';

export async function handlePipelineInit(
  req: PipelineInitRequest,
  env: Env,
): Promise<PipelineInitResponse> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const lang = req.candidate.language ?? 'en';

  const mustHavesList = (req.job.must_haves ?? []).map((mh, i) => `${i + 1}. ${mh}`).join('\n');

  const templateInstruction = req.pipeline_template
    ? `Use the following pipeline template as the goal structure. Pre-fill Goal 1 items from the resume where possible (mark as [done] with evidence). The FIRST unanswered item should be [active]. Do NOT change goal names, descriptions, or ordering — only update item statuses.

Pipeline template:
${req.pipeline_template}`
    : `Generate a single goal "Screening" with 4-8 questions covering: must-haves not confirmed by resume, salary, availability, motivation, any job-specific concerns.`;

  const systemPrompt = buildInitSystemPrompt(lang);

  const userPrompt = req.prompt_overrides?.pipeline_init
    ? fillTemplate(req.prompt_overrides.pipeline_init, {
        candidateName: req.candidate.name,
        jobTitle: req.job.title,
        mustHavesList,
        jobDescription: (req.job.description ?? '').slice(0, 3000),
        resumeText: req.resume_text.slice(0, 3000),
        templateInstruction,
      })
    : buildInitUserPrompt({
        candidateName: req.candidate.name,
        jobTitle: req.job.title,
        mustHavesList,
        jobDescription: req.job.description ?? '',
        resumeText: req.resume_text,
        templateInstruction,
      });

  const raw = await askGeminiWithRetry(env.GEMINI_API_KEYS, systemPrompt, userPrompt, {
    model: PIPELINE_MODEL,
    maxOutputTokens: 4000,
    jsonMode: true,
  });

  const result = parseJsonFromLLM<{ summary: string; goals: string }>(raw, 'pipelineInit');
  result.goals = ensureMarkdownString(result.goals);
  result.summary = ensureMarkdownString(result.summary);

  // Extract first [active] item
  const activeMatch = result.goals.match(/^-\s+\[active\]\s+(.+)$/m);
  const firstItem = activeMatch ? activeMatch[1].replace(/\s*—\s+.*$/, '').trim() : '';

  console.log(`[pipeline/init] ${requestId} candidate="${req.candidate.name}" goals_length=${result.goals.length}`);

  return {
    request_id: requestId,
    summary: result.summary,
    goals: result.goals,
    first_item: firstItem,
  };
}
