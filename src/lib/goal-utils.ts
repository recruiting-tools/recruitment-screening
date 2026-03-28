/**
 * Goal structure utilities for pipeline conversations.
 * Goals are markdown-based with sequential execution rules.
 *
 * Format:
 * ## Goal N: Name [status]
 * - [status] Item text
 *
 * Statuses: [pending] → [active] → [done] (items), [pending] → [active] → [completed] (goals)
 */

interface ParsedGoal {
  header: string;
  name: string;
  items: string[];
}

/** Parse goal structure from markdown into structured array. */
export function parseGoalStructure(md: string): ParsedGoal[] {
  const goals: ParsedGoal[] = [];
  let current: ParsedGoal | null = null;
  for (const line of md.split('\n')) {
    const goalMatch = line.match(/^##\s+Goal\s+\d+:\s+(.+?)[\s]*\[/);
    if (goalMatch) {
      current = { header: line.trim(), name: goalMatch[1].trim(), items: [] };
      goals.push(current);
    } else if (current && line.match(/^-\s+\[(done|active|pending)\]/)) {
      let itemText = line.replace(/^-\s+\[(done|active|pending)\]\s*/, '').trim();
      if (!itemText.includes('ACTION:')) {
        itemText = itemText.replace(/\s*—\s+.*$/, '').trim();
      }
      current.items.push(itemText);
    }
  }
  return goals;
}

/**
 * Enforce goal structure: ensure LLM output matches the template structure.
 * Strips invented items, restores missing goals, preserves status updates.
 * Prevents status regression (completed→active, done→pending).
 */
export function enforceGoalStructure(llmGoals: string, template: string, previousGoals?: string): string {
  const templateGoals = parseGoalStructure(template);
  if (templateGoals.length === 0) return llmGoals;

  // Parse previous goals to prevent regression
  const prevParsed = previousGoals ? parseGoalStructure(previousGoals) : [];
  const prevGoalStatuses = new Map<number, string>();
  for (let i = 0; i < prevParsed.length; i++) {
    const sm = prevParsed[i].header.match(/\[(completed|done|active|pending)\]/);
    if (sm) prevGoalStatuses.set(i, sm[1] === 'done' ? 'completed' : sm[1]);
  }

  // Parse previous item statuses per goal
  const prevItemStatuses = new Map<string, string>(); // "goalIdx:itemIdx" → status
  if (previousGoals) {
    let goalIdx = -1;
    let itemIdx = 0;
    for (const line of previousGoals.split('\n')) {
      if (line.match(/^##\s+Goal\s+\d+:/)) { goalIdx++; itemIdx = 0; }
      else if (goalIdx >= 0 && line.match(/^-\s+\[(done|active|pending)\]/)) {
        const s = line.match(/\[(done|active|pending)\]/)?.[1];
        if (s) prevItemStatuses.set(`${goalIdx}:${itemIdx}`, s);
        itemIdx++;
      }
    }
  }

  const llmParsed = parseGoalStructure(llmGoals);
  const result: string[] = [];

  // Collect raw item lines per LLM goal for matching
  const llmRawLines = new Map<number, string[]>();
  let currentGoalIdx = -1;
  for (const line of llmGoals.split('\n')) {
    if (line.match(/^##\s+Goal\s+\d+:/)) {
      currentGoalIdx++;
      llmRawLines.set(currentGoalIdx, []);
    } else if (currentGoalIdx >= 0 && line.match(/^-\s+\[(done|active|pending)\]/)) {
      llmRawLines.get(currentGoalIdx)!.push(line);
    }
  }

  const STATUS_ORDER: Record<string, number> = { pending: 0, active: 1, completed: 2 };
  const ITEM_ORDER: Record<string, number> = { pending: 0, active: 1, done: 2 };

  for (let gi = 0; gi < templateGoals.length; gi++) {
    const tGoal = templateGoals[gi];
    const lGoal = llmParsed[gi] ?? null;

    if (!lGoal) {
      // Goal missing from LLM output — restore from template
      const prevGoalStatus = gi > 0 && result.some(l => l.includes(`Goal ${gi}:`) && (l.includes('[completed]') || l.includes('[done]')))
        ? '[active]' : '[pending]';
      const hasFaq = tGoal.header.includes('[faq]');
      result.push(`## Goal ${gi + 1}: ${tGoal.name}${hasFaq ? ' [faq]' : ''} ${prevGoalStatus}`);
      const itemStatus = prevGoalStatus === '[active]' ? '[active]' : '[pending]';
      for (let ii = 0; ii < tGoal.items.length; ii++) {
        result.push(`- ${ii === 0 && prevGoalStatus === '[active]' ? '[active]' : itemStatus} ${tGoal.items[ii]}`);
      }
    } else {
      // Goal exists — use template name but LLM's status
      const statusMatch = lGoal.header.match(/\[(completed|done|active|pending)\]/);
      let goalStatus = statusMatch ? (statusMatch[1] === 'done' ? 'completed' : statusMatch[1]) : 'pending';

      // No-regression: goals can only move forward
      const prevStatus = prevGoalStatuses.get(gi);
      if (prevStatus && (STATUS_ORDER[goalStatus] ?? 0) < (STATUS_ORDER[prevStatus] ?? 0)) {
        goalStatus = prevStatus;
      }

      const hasFaq = tGoal.header.includes('[faq]');
      result.push(`## Goal ${gi + 1}: ${tGoal.name}${hasFaq ? ' [faq]' : ''} [${goalStatus}]`);

      // Match LLM items to template items
      const goalLines = llmRawLines.get(gi) ?? [];
      const matchedStatuses: string[] = [];
      const usedLineIndices = new Set<number>();

      for (const tItem of tGoal.items) {
        const tClean = tItem.replace(/\s*—\s+.*$/, '').trim();
        const tCore = tClean.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        const tKeywords = tClean.toLowerCase().split(/\s+/).filter(w => w.length > 3);

        let matchIdx = -1;
        const matchLine = goalLines.find((l, idx) => {
          if (usedLineIndices.has(idx)) return false;
          const lText = l.replace(/^-\s+\[(done|active|pending)\]\s*/, '').replace(/\s*—\s+.*$/, '').trim();
          const lLower = lText.toLowerCase();
          if (lText.startsWith(tItem.slice(0, 30)) || l.includes(tItem.slice(0, 40))) { matchIdx = idx; return true; }
          if (tCore.length >= 15 && lText.startsWith(tCore.slice(0, 25))) { matchIdx = idx; return true; }
          if (tCore.length >= 10 && lLower.startsWith(tCore.slice(0, 20).toLowerCase())) { matchIdx = idx; return true; }
          if (tKeywords.length > 0) {
            const matched = tKeywords.filter(kw => lLower.includes(kw)).length;
            if (matched / tKeywords.length >= 0.7) { matchIdx = idx; return true; }
          }
          return false;
        });
        if (matchIdx >= 0) usedLineIndices.add(matchIdx);

        if (matchLine) {
          const sm = matchLine.match(/\[(done|active|pending)\]/);
          let status = sm ? sm[1] : 'pending';
          const itemIdx2 = tGoal.items.indexOf(tItem);
          const prevItemStatus = prevItemStatuses.get(`${gi}:${itemIdx2}`);
          if (prevItemStatus && (ITEM_ORDER[status] ?? 0) < (ITEM_ORDER[prevItemStatus] ?? 0)) {
            status = prevItemStatus;
          }
          if (goalStatus === 'completed') status = 'done';
          result.push(`- [${status}] ${tItem}`);
          matchedStatuses.push(status);
        } else {
          // Fallback: positional match
          const itemIdx = tGoal.items.indexOf(tItem);
          const positionalLine = (goalLines.length === tGoal.items.length && itemIdx >= 0 && !usedLineIndices.has(itemIdx))
            ? goalLines[itemIdx] : null;
          if (positionalLine) {
            usedLineIndices.add(itemIdx);
            const pStatusMatch = positionalLine.match(/\[(done|active|pending)\]/);
            let status = pStatusMatch ? pStatusMatch[1] : 'pending';
            const prevItemSt = prevItemStatuses.get(`${gi}:${itemIdx}`);
            if (prevItemSt && (ITEM_ORDER[status] ?? 0) < (ITEM_ORDER[prevItemSt] ?? 0)) status = prevItemSt;
            if (goalStatus === 'completed') status = 'done';
            const evidence = positionalLine.match(/\s—\s+(.+)$/)?.[1] ?? '';
            const line = evidence ? `- [${status}] ${tItem} — ${evidence}` : `- [${status}] ${tItem}`;
            result.push(line);
            matchedStatuses.push(status);
          } else {
            const noMatchIdx = tGoal.items.indexOf(tItem);
            const prevSt = prevItemStatuses.get(`${gi}:${noMatchIdx}`);
            const isNewItem = !prevSt;
            const fallbackStatus = (goalStatus === 'completed' && !isNewItem) ? 'done' : (prevSt === 'done' ? 'done' : 'pending');
            result.push(`- [${fallbackStatus}] ${tItem}`);
            matchedStatuses.push(fallbackStatus);
          }
        }
      }

      // If item N is [pending] but a later item is [done/active], promote N to [done]
      for (let ii = 0; ii < matchedStatuses.length - 1; ii++) {
        if (matchedStatuses[ii] === 'pending') {
          const prevItemSt = prevItemStatuses.get(`${gi}:${ii}`);
          if (!prevItemSt) continue; // New template item — keep pending
          const hasLaterProgress = matchedStatuses.slice(ii + 1).some(s => s === 'done' || s === 'active');
          if (hasLaterProgress) {
            const lineIdx = result.length - matchedStatuses.length + ii;
            result[lineIdx] = result[lineIdx].replace('[pending]', '[done]');
          }
        }
      }
    }
    result.push(''); // blank line between goals
  }

  // Post-process: enforce sequential goal rules
  const lines = result;

  // First pass: collect goal info
  const goalInfos: Array<{ lineIdx: number; status: string; allDone: boolean; hasPending: boolean; firstPendingIdx: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const goalMatch = lines[i].match(/^##\s+Goal\s+\d+:.*\[(completed|active|pending)\]/);
    if (!goalMatch) continue;
    let allDone = true;
    let hasPending = false;
    let firstPendingIdx = -1;
    for (let j = i + 1; j < lines.length && !lines[j].match(/^##/); j++) {
      if (lines[j].match(/^-\s+\[pending\]/)) { allDone = false; hasPending = true; if (firstPendingIdx < 0) firstPendingIdx = j; }
      if (lines[j].match(/^-\s+\[active\]/)) { allDone = false; }
    }
    goalInfos.push({ lineIdx: i, status: goalMatch[1], allDone, hasPending, firstPendingIdx });
  }

  // Second pass: enforce sequential rules
  let prevCompleted = true;
  for (let gi = 0; gi < goalInfos.length; gi++) {
    const g = goalInfos[gi];

    // If goal says [completed] but has non-done items, downgrade to [active]
    if (g.status === 'completed' && !g.allDone) {
      lines[g.lineIdx] = lines[g.lineIdx].replace('[completed]', '[active]');
      g.status = 'active';
    }

    // Sequential: can't be [active] if previous goal isn't [completed]
    const prevGoalSt = prevGoalStatuses.get(gi);
    const prevAllowsActive = prevGoalSt === 'active' || prevGoalSt === 'completed';
    if (!prevCompleted && g.status === 'active' && !prevAllowsActive) {
      lines[g.lineIdx] = lines[g.lineIdx].replace('[active]', '[pending]');
      g.status = 'pending';
      for (let j = g.lineIdx + 1; j < lines.length && !lines[j].match(/^##/); j++) {
        if (lines[j].match(/^-\s+\[(active|done)\]/)) {
          lines[j] = lines[j].replace(/^-\s+\[(active|done)\]/, '- [pending]');
        }
      }
    }

    // If goal is [active] and ALL items are [done], promote to [completed]
    if (g.status === 'active' && g.allDone) {
      lines[g.lineIdx] = lines[g.lineIdx].replace('[active]', '[completed]');
      g.status = 'completed';
      if (gi + 1 < goalInfos.length && goalInfos[gi + 1].status === 'pending') {
        const nextG = goalInfos[gi + 1];
        lines[nextG.lineIdx] = lines[nextG.lineIdx].replace('[pending]', '[active]');
        nextG.status = 'active';
        for (let j = nextG.lineIdx + 1; j < lines.length && !lines[j].match(/^##/); j++) {
          if (lines[j].match(/^-\s+\[pending\]/)) {
            lines[j] = lines[j].replace('[pending]', '[active]');
            break;
          }
        }
      }
    }

    // If goal is [active], ensure at least one [active] item
    if (g.status === 'active') {
      let hasActive = false;
      let firstPendingInGoal = -1;
      for (let j = g.lineIdx + 1; j < lines.length && !lines[j].match(/^##/); j++) {
        if (lines[j].match(/^-\s+\[active\]/)) hasActive = true;
        if (firstPendingInGoal < 0 && lines[j].match(/^-\s+\[pending\]/)) firstPendingInGoal = j;
      }
      if (!hasActive && firstPendingInGoal >= 0) {
        lines[firstPendingInGoal] = lines[firstPendingInGoal].replace('[pending]', '[active]');
      }
    }

    prevCompleted = (g.status === 'completed');
  }

  return lines.join('\n').trim();
}

/** Find items that were [pending] before and are now [active] or [done]. Returns item texts. */
export function findNewlyActivatedItems(previousGoals: string, currentGoals: string): string[] {
  const prevPending = new Set<string>();
  for (const line of previousGoals.split('\n')) {
    const m = line.match(/^-\s+\[pending\]\s+(.+)/);
    if (m) prevPending.add(m[1].trim());
  }
  const activated: string[] = [];
  for (const line of currentGoals.split('\n')) {
    const m = line.match(/^-\s+\[(active|done)\]\s+(.+)/);
    if (m && prevPending.has(m[2].trim())) {
      activated.push(m[2].trim());
    }
  }
  return activated;
}

/** Find items that transitioned from non-done to [done]. Returns item texts. */
export function findNewlyDoneItems(previousGoals: string, currentGoals: string): string[] {
  const prevDone = new Set<string>();
  for (const line of previousGoals.split('\n')) {
    const m = line.match(/^-\s+\[done\]\s+(.+)/);
    if (m) prevDone.add(m[1].trim());
  }
  const newlyDone: string[] = [];
  for (const line of currentGoals.split('\n')) {
    const m = line.match(/^-\s+\[done\]\s+(.+)/);
    if (m && !prevDone.has(m[1].trim())) {
      newlyDone.push(m[1].trim());
    }
  }
  return newlyDone;
}

/**
 * After the writer generates a message for ACTION items, mark those [active] ACTION items
 * as [done]. Also handles goal completion and next-goal activation with chain-marking.
 */
export function markActiveActionsDone(goals: string): string {
  const ACTION_RE = /^(Tell|Mention|Share|Propose|Send|Give|Explain|Describe)\b/i;
  const lines = goals.split('\n');

  // Pass 1: mark [active] ACTION items as [done]
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(-\s+)\[active\]\s+(.+)$/);
    if (m && ACTION_RE.test(m[2].trim())) {
      lines[i] = `${m[1]}[done] ${m[2]}`;
      changed = true;
    }
  }
  if (!changed) return goals;

  // Pass 2: check if any goal now has all items [done]
  for (let i = 0; i < lines.length; i++) {
    const goalMatch = lines[i].match(/^(##\s+Goal\s+\d+:\s+\S.*?)\s+\[active\]/);
    if (!goalMatch) continue;

    let allDone = true;
    let firstPendingIdx = -1;
    for (let j = i + 1; j < lines.length && !lines[j].match(/^##/); j++) {
      if (lines[j].match(/^-\s+\[(active|pending)\]/)) allDone = false;
      if (firstPendingIdx < 0 && lines[j].match(/^-\s+\[pending\]/)) firstPendingIdx = j;
    }

    if (allDone) {
      lines[i] = lines[i].replace('[active]', '[completed]');
      // Activate next pending goal with chain-marking
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].match(/^##\s+Goal\s+\d+:.*\[pending\]/)) {
          lines[k] = lines[k].replace('[pending]', '[active]');
          for (let m = k + 1; m < lines.length && !lines[m].match(/^##/); m++) {
            if (lines[m].match(/^-\s+\[pending\]/)) {
              lines[m] = lines[m].replace('[pending]', '[active]');
              // Chain-mark consecutive ACTION items
              let ci = m;
              while (true) {
                const cm = lines[ci].match(/^(-\s+)\[active\]\s+(.+)$/);
                if (cm && ACTION_RE.test(cm[2].trim())) {
                  lines[ci] = `${cm[1]}[done] ${cm[2]}`;
                  let np = -1;
                  for (let nx = ci + 1; nx < lines.length && !lines[nx].match(/^##/); nx++) {
                    if (lines[nx].match(/^-\s+\[pending\]/)) { np = nx; break; }
                  }
                  if (np >= 0) { lines[np] = lines[np].replace('[pending]', '[active]'); ci = np; }
                  else break;
                } else break;
              }
              break;
            }
          }
          break;
        }
      }
    } else if (firstPendingIdx >= 0) {
      const hasActive = lines.slice(i + 1).some(l => l.match(/^-\s+\[active\]/) && !l.match(/^##/));
      if (!hasActive) {
        lines[firstPendingIdx] = lines[firstPendingIdx].replace('[pending]', '[active]');
        // Chain-mark consecutive ACTION items
        let chainIdx = firstPendingIdx;
        while (true) {
          const cm = lines[chainIdx].match(/^(-\s+)\[active\]\s+(.+)$/);
          if (cm && ACTION_RE.test(cm[2].trim())) {
            lines[chainIdx] = `${cm[1]}[done] ${cm[2]}`;
            let nextPending = -1;
            for (let np = chainIdx + 1; np < lines.length && !lines[np].match(/^##/); np++) {
              if (lines[np].match(/^-\s+\[pending\]/)) { nextPending = np; break; }
            }
            if (nextPending >= 0) { lines[nextPending] = lines[nextPending].replace('[pending]', '[active]'); chainIdx = nextPending; }
            else break;
          } else break;
        }
      }
    }
  }

  return lines.join('\n');
}
