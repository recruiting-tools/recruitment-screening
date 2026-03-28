/** Replace common LLM-generated name placeholders with the actual candidate name. */
export function stripNamePlaceholders(text: string, candidateName: string): string {
  const firstName = candidateName.split(' ')[0];
  return text
    .replace(/\[Имя Кандидата\]/gi, firstName)
    .replace(/\[Имя кандидата\]/gi, firstName)
    .replace(/\[имя кандидата\]/gi, firstName)
    .replace(/\[Имя\]/gi, firstName)
    .replace(/\[имя\]/gi, firstName)
    .replace(/\[Name\]/gi, firstName)
    .replace(/\[Candidate Name\]/gi, firstName)
    .replace(/\[candidate name\]/gi, firstName)
    .replace(/\[First Name\]/gi, firstName)
    .replace(/\[first name\]/gi, firstName);
}

/** Ensure a value is a markdown string — convert from object/array if LLM returned structured data instead of text. */
export function ensureMarkdownString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val == null) return '';
  if (typeof val === 'object' && !Array.isArray(val)) {
    const lines: string[] = [];
    for (const [key, items] of Object.entries(val as Record<string, unknown>)) {
      if (typeof items === 'string') {
        lines.push(`## ${key} ${items}`);
      } else if (typeof items === 'object' && items !== null) {
        lines.push(`## ${key}`);
        for (const [item, status] of Object.entries(items as Record<string, unknown>)) {
          lines.push(`- [${status}] ${item}`);
        }
      }
    }
    if (lines.length > 0) return lines.join('\n');
  }
  return JSON.stringify(val);
}

/** Parse JSON returned by LLM — strips markdown fences, logs on failure. */
export function parseJsonFromLLM<T>(raw: string, context: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as T;
  } catch (err) {
    console.error(`[llm] JSON parse failed in ${context}:`, err, '\nRaw:', raw.slice(0, 300));
    throw new Error(`LLM returned invalid JSON in ${context}: ${String(err)}`);
  }
}

/** Replace {variable} placeholders in a template with actual values. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

/** Format conversation history array as a string for LLM context. */
export function formatHistory(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map(m => `${m.role === 'assistant' ? 'Recruiter' : 'Candidate'}: ${m.content}`)
    .join('\n\n');
}
