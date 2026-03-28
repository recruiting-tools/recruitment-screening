import type { Env } from '../types';
import type { PipelineWriteMessageRequest, PipelineWriteMessageResponse } from './types';
import { askGeminiWithRetry } from '../gemini';
import { buildWriterSystemPrompt, buildWriterUserPrompt, styleRulesFor } from './prompts';
import { stripNamePlaceholders, fillTemplate, formatHistory } from '../lib/text-utils';

const PIPELINE_MODEL = 'gemini-2.5-flash';

export async function handlePipelineWriteMessage(
  req: PipelineWriteMessageRequest,
  env: Env,
): Promise<PipelineWriteMessageResponse> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const lang = req.candidate.language ?? 'en';
  const interviewerName = req.job.interviewer_name ?? 'Vladimir';
  const rules = styleRulesFor(interviewerName, req.style_rules);

  const transitionNote = req.context.goal_just_completed === '__reopened__'
    ? ''
    : req.context.goal_just_completed
    ? `IMPORTANT: The previous topic ("${req.context.goal_just_completed}") is now fully covered. Acknowledge this naturally (e.g. "Great, I think I have a clear picture of your background now") and smoothly transition to the next topic.`
    : '';

  const isAction = /^(Tell|Mention|Share|Propose|Send|Give|Explain|Describe)\b/i.test(req.next_item.trim());

  // Build FAQ context if available
  const faqContext = req.job.candidate_faq?.length
    ? req.job.candidate_faq.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')
    : null;
  const isFaqMode = !!req.context.candidate_question && !!faqContext;

  const context = isFaqMode
    ? `You are in Q&A mode — the candidate is asking you questions. You MUST answer using ONLY the FAQ knowledge base provided below. If a question is NOT covered in the FAQ, you MUST say "Great question! Let me check with the team and get back to you." and add [ESCALATE: the question] at the end. NEVER guess or fabricate answers.`
    : req.context.is_follow_up
    ? 'The candidate already replied but didn\'t clearly answer this question. Rephrase it warmly — acknowledge what they said and ask again more specifically.'
    : (req.context.goal_just_completed === '__reopened__')
    ? 'IMPORTANT: This question was missed earlier in our conversation. Apologize briefly and naturally — e.g. "Oh, one important thing I forgot to ask earlier..." or "By the way, I missed an important point..." — then ask the question warmly. Don\'t over-apologize, keep it light.'
    : isAction
    ? 'This is an ACTION item — the text after "Tell:"/"Share:"/"Send:" etc. is the EXACT content you must deliver. Use this text almost verbatim — you may only adjust the greeting/name and light formatting, but preserve ALL key information, links, numbers, and details from the original. Do NOT paraphrase, summarize, or replace with your own version. Do NOT ask a question — just share the info warmly.'
    : 'This is the next question in the conversation. Transition naturally from the previous exchange.';

  const faqBlock = faqContext && isFaqMode
    ? `\n\nFAQ Knowledge Base — ONLY source of truth for answering:\n${faqContext}\n\nRULES:\n1. Answer questions that ARE covered by the FAQ above — be specific and warm.\n2. For questions NOT covered by the FAQ, include them naturally in your response: "Great question! I'll check with the team and get back to you on that."\n3. AFTER your complete conversational response (which must always be present), add a blank line and then list ONLY the unanswered questions as: [ESCALATE: the exact question]\n4. If all questions were answered from FAQ, do NOT add any [ESCALATE] lines.\n5. Never invent or guess answers to questions not in the FAQ.`
    : '';

  const faqEnding = isFaqMode
    ? '\nAfter answering, ask if they have more questions. Keep it natural.'
    : '';

  const conversationStr = formatHistory(req.conversation_history);

  const systemPrompt = buildWriterSystemPrompt({
    interviewerName,
    candidateName: req.candidate.name,
    lang,
    rules,
  });

  const userPrompt = req.prompt_overrides?.pipeline_writer
    ? fillTemplate(req.prompt_overrides.pipeline_writer, {
        candidateName: req.candidate.name,
        candidateFirstName: req.candidate.name.split(' ')[0],
        conversationHistory: conversationStr.slice(-2000),
        nextQuestion: req.next_item,
        context,
        transitionNote,
        faqBlock,
      })
    : buildWriterUserPrompt({
        candidateName: req.candidate.name,
        candidateFirstName: req.candidate.name.split(' ')[0],
        conversationHistory: conversationStr,
        nextQuestion: req.next_item,
        context,
        transitionNote,
        faqBlock,
        faqEnding,
      });

  const raw = await askGeminiWithRetry(env.GEMINI_API_KEYS, systemPrompt, userPrompt, {
    model: PIPELINE_MODEL,
    maxOutputTokens: 3000,
    jsonMode: false,
  });

  const message = stripNamePlaceholders(raw, req.candidate.name);

  console.log(`[pipeline/write-message] ${requestId} message_length=${message.length}`);

  return {
    request_id: requestId,
    message,
    model_used: PIPELINE_MODEL,
  };
}
