import type {
  Env, EvaluateRequest, EvaluateResponse, Screening, Evaluation, InterviewQuestion,
  GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion, InterviewEngineQuestion,
  ComplianceResult,
} from './types';
import { askGemini, parseJSON, pickKey } from './gemini';
import { buildScreeningPrompt, buildEvaluationPrompt, buildQuestionsPrompt, buildGenerateQuestionsPrompt } from './prompts';
import { renderDocs } from './docs';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Docs
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(renderDocs(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return json({ status: 'ok' });
    }

    // Evaluate endpoint
    if (url.pathname === '/evaluate' && request.method === 'POST') {
      return handleEvaluate(request, env);
    }

    // Generate questions endpoint
    if (url.pathname === '/generate-questions' && request.method === 'POST') {
      return handleGenerateQuestions(request, env);
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

// ── Main handler ─────────────────────────────────────────────────────────────

async function handleEvaluate(request: Request, env: Env): Promise<Response> {
  // Auth
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.AUTH_TOKEN}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Parse body
  let req: EvaluateRequest;
  try {
    req = await request.json() as EvaluateRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!req.resume_text?.trim()) return json({ error: 'resume_text is required' }, 400);
  if (!req.job_description?.trim()) return json({ error: 'job_description is required' }, 400);
  if (!req.job_title?.trim()) return json({ error: 'job_title is required' }, 400);

  try {
    // Run screening and evaluation in parallel
    const screeningPrompt = buildScreeningPrompt(req);
    const evaluationPrompt = buildEvaluationPrompt(req);

    const [screeningRaw, evaluationRaw] = await Promise.all([
      askGemini(pickKey(env.GEMINI_API_KEYS), screeningPrompt.system, screeningPrompt.user),
      askGemini(pickKey(env.GEMINI_API_KEYS), evaluationPrompt.system, evaluationPrompt.user),
    ]);

    const screening = parseJSON<Screening>(screeningRaw, 'screening');
    const evaluation = parseJSON<Evaluation>(evaluationRaw, 'evaluation');

    // Generate interview questions if requested (uses screening gaps)
    let additional_interview_questions: InterviewQuestion[] = [];
    if (req.generate_interview_questions && screening.questions.length > 0) {
      const questionsPrompt = buildQuestionsPrompt(req, screening.questions);
      const questionsRaw = await askGemini(pickKey(env.GEMINI_API_KEYS), questionsPrompt.system, questionsPrompt.user);
      additional_interview_questions = parseJSON<InterviewQuestion[]>(questionsRaw, 'questions');
    }

    const response: EvaluateResponse = { screening, evaluation, additional_interview_questions };
    return json(response);
  } catch (err) {
    console.error('[evaluate] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ error: message }, 500);
  }
}

// ── Generate Questions handler ───────────────────────────────────────────────

async function handleGenerateQuestions(request: Request, env: Env): Promise<Response> {
  // Auth
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.AUTH_TOKEN}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let req: GenerateQuestionsRequest;
  try {
    req = await request.json() as GenerateQuestionsRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!req.job_title?.trim()) return json({ error: 'job_title is required' }, 400);
  if (!req.job_description?.trim() && !req.questions?.length) {
    return json({ error: 'job_description or questions[] is required' }, 400);
  }

  try {
    const prompt = buildGenerateQuestionsPrompt(req);
    const raw = await askGemini(pickKey(env.GEMINI_API_KEYS), prompt.system, prompt.user);
    const generated = parseJSON<GeneratedQuestion[]>(raw, 'generate-questions');

    // Format output
    const outputFormat = req.output_format ?? 'generic';
    const questions = outputFormat === 'interview-engine'
      ? generated.map(toInterviewEngineFormat)
      : generated;

    const response: GenerateQuestionsResponse = { questions };

    // Compliance check
    if (req.compliance_check) {
      response.compliance = await runComplianceCheck(
        generated,
        req.compliance_check,
        req.job_title,
      );
    }

    return json(response);
  } catch (err) {
    console.error('[generate-questions] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ error: message }, 500);
  }
}

function toInterviewEngineFormat(q: GeneratedQuestion): InterviewEngineQuestion {
  return {
    id: q.id,
    topic: q.topic,
    question: q.question,
    followUpIfVague: q.follow_ups,
  };
}

async function runComplianceCheck(
  questions: GeneratedQuestion[],
  config: GenerateQuestionsRequest['compliance_check'] & {},
  jobTitle: string,
): Promise<ComplianceResult> {
  const ieQuestions = questions.map(toInterviewEngineFormat);

  if (!config.dry_run) {
    // Schema-only validation: check required fields
    for (const q of ieQuestions) {
      if (!q.id || !q.question) {
        return { status: 'failed', error: `Question missing required field: id="${q.id}", question="${q.question?.slice(0, 50)}"` };
      }
    }
    return { status: 'ok' };
  }

  // Dry-run: POST to interview-engine /sessions
  try {
    const sessionPayload = {
      applicationId: `compliance_check_${Date.now()}`,
      interviewer: {
        questions: ieQuestions,
        name: 'Compliance Check',
        language: 'en',
      },
      candidate: {
        name: 'Test Candidate',
        email: 'compliance@test.local',
      },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.api_token) {
      headers['Authorization'] = config.api_token.startsWith('Bearer ')
        ? config.api_token
        : `Bearer ${config.api_token}`;
    }

    const res = await fetch(`${config.api_url.replace(/\/$/, '')}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sessionPayload),
    });

    if (res.ok) {
      const data = await res.json() as { session_id?: string; interview_url?: string };
      return {
        status: 'ok',
        session_url: data.session_id ? `${config.api_url}/sessions/${data.session_id}/status` : undefined,
        interview_url: data.interview_url,
      };
    }

    const errorBody = await res.text();
    return { status: 'failed', error: `interview-engine ${res.status}: ${errorBody.slice(0, 300)}` };
  } catch (err) {
    return { status: 'failed', error: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
