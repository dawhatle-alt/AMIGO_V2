import type { CaseDocument, Gap, GapState } from '@/lib/types/case';

/**
 * Gap walkthrough logic (PRD §5.4, FR-12..FR-14).
 *
 * The gap list itself comes from the parser (lib/parser/gaps.ts) and lives on
 * the case document; this module only reads it. Nothing here is rendered
 * content — labels are data, components decide how they look.
 */

/** How each kind of gap gets answered, in the words the TSA sees. */
export const KIND_LABELS: Record<GapState, { label: string; hint: string }> = {
  'run-command': {
    label: 'Run a command',
    hint: 'Run it on the host named in the command and paste the FULL output as the answer.',
  },
  console: {
    label: 'Check in CCM',
    hint: 'Open the console path shown and record exactly what it displays.',
  },
  interview: {
    label: 'Decide with the customer',
    hint: 'Record the agreed answer — it becomes part of the plan.',
  },
};

/**
 * Decision gaps whose answers feed plan / runbook parameters directly
 * (FR-13). The value is what the answer drives, shown on the card so the TSA
 * knows why precision matters.
 */
export const DECISION_GAPS: Readonly<Record<string, string>> = {
  target_version: 'Upgrade path and applicable rules',
  upgrade_date: 'AMIGO review lead time (2 weeks)',
  downtime_window: 'Runbook clock budget',
  fallback_plan: 'Runbook rollback panel',
  change_freeze: 'Pre-upgrade freeze step',
  test_plan: 'Runbook verification phase',
};

/** The gap whose answer sets `runbook.window_minutes`. */
export const DOWNTIME_GAP_ID = 'downtime_window';

export function isAnswered(doc: CaseDocument, gapId: string): boolean {
  const a = doc.answers[gapId];
  return a !== undefined && a.value.trim() !== '';
}

export interface GapProgress {
  total: number;
  answered: number;
  open: number;
  /** 0–100, rounded. */
  pct: number;
  complete: boolean;
}

export function gapProgress(doc: CaseDocument): GapProgress {
  const total = doc.gaps.length;
  const answered = doc.gaps.filter((g) => isAnswered(doc, g.id)).length;
  return {
    total,
    answered,
    open: total - answered,
    pct: total === 0 ? 0 : Math.round((answered / total) * 100),
    complete: total > 0 && answered === total,
  };
}

export function openGaps(doc: CaseDocument): Gap[] {
  return doc.gaps.filter((g) => !isAnswered(doc, g.id));
}

const MAX_WINDOW_MINUTES = 7 * 24 * 60;

/**
 * Read a duration, in minutes, out of a free-text downtime-window answer.
 *
 * Recognises explicit durations ("4 hours", "4h30m", "240 min", "1 day") and
 * clock ranges ("22:00–06:00", "10pm to 2am", overnight ranges wrap).
 * An explicit duration wins over a range when both appear. Anything else is
 * null — the runbook clock budget is left unset rather than guessed.
 */
export function windowMinutesFromAnswer(value: string): number | null {
  const text = value.toLowerCase().replace(/[–—]/g, '-');

  let minutes = 0;
  let sawDuration = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:days|day|d)(?![a-z])/g)) {
    minutes += Number(m[1]) * 24 * 60;
    sawDuration = true;
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)(?![a-z])/g)) {
    minutes += Number(m[1]) * 60;
    sawDuration = true;
  }
  for (const m of text.matchAll(/(\d+)\s*(?:minutes|minute|mins|min|m)(?![a-z])/g)) {
    minutes += Number(m[1]);
    sawDuration = true;
  }
  if (sawDuration) return clampWindow(Math.round(minutes));

  const range24 = /(\d{1,2})[:.](\d{2})\s*(?:-|to|until|till)\s*(\d{1,2})[:.](\d{2})/.exec(text);
  if (range24?.[1] && range24[2] && range24[3] && range24[4]) {
    return clampWindow(
      spanMinutes(
        Number(range24[1]) * 60 + Number(range24[2]),
        Number(range24[3]) * 60 + Number(range24[4]),
      ),
    );
  }

  const range12 =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/.exec(
      text,
    );
  if (range12?.[1] && range12[3] && range12[4] && range12[6]) {
    return clampWindow(
      spanMinutes(
        to24(Number(range12[1]), range12[3]) * 60 + Number(range12[2] ?? 0),
        to24(Number(range12[4]), range12[6]) * 60 + Number(range12[5] ?? 0),
      ),
    );
  }

  return null;
}

function to24(hour: number, meridiem: string): number {
  const h = hour % 12;
  return meridiem === 'pm' ? h + 12 : h;
}

/** Minutes from `start` to `end` on a 24h clock, wrapping past midnight. */
function spanMinutes(start: number, end: number): number {
  const diff = end - start;
  return diff > 0 ? diff : diff + 24 * 60;
}

function clampWindow(minutes: number): number | null {
  return minutes > 0 && minutes <= MAX_WINDOW_MINUTES ? minutes : null;
}

/** "4 h 30 min" — for the header strip and the card hint. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * FR-14: what "Ask advisor about this gap" puts in the agent input. Carries the
 * question, the exact command or console path, and the why — enough for the
 * agent to answer without the TSA re-typing context.
 */
export function askAgentPrompt(gap: Gap): string {
  const lines = [`Help me with this gap: ${gap.question}`];
  if (gap.command) lines.push(`Command I was given:\n${gap.command}`);
  if (gap.console) lines.push(`Console path: ${gap.console}`);
  lines.push(`Why it matters: ${gap.why}`);
  return lines.join('\n\n');
}
