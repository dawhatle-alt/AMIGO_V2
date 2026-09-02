import type { CaseDocument } from '@/lib/types/case';
import { parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';

/**
 * localStorage autosave (PRD FR-1). One slot holds the active case; a small
 * index holds recent cases for the Home screen (PRD S1). All access is
 * defensive — a full or disabled localStorage must never break the app.
 */

const ACTIVE_KEY = 'amigo.active-case';
const RECENT_KEY = 'amigo.recent-cases';
const RECENT_LIMIT = 8;

export interface RecentCase {
  id: string;
  name: string;
  case_number: string;
  target_version: string;
  updated_at: string;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stable per-case key: created_at is assigned once and never changes. */
export function caseId(doc: CaseDocument): string {
  return doc.case.created_at;
}

/** Returns false when the browser refused the write (quota, private mode, disabled storage). */
export function saveActiveCase(doc: CaseDocument): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(ACTIVE_KEY, serializeCaseFile(doc));
    touchRecent(doc);
    return true;
  } catch {
    /* quota or private mode — autosave is best-effort, the file round-trip is authoritative */
    return false;
  }
}

export function loadActiveCase(): CaseDocument | null {
  const s = storage();
  if (!s) return null;
  const text = s.getItem(ACTIVE_KEY);
  if (!text) return null;
  try {
    return parseCaseFile(text);
  } catch {
    return null;
  }
}

export function clearActiveCase(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRecentCases(): RecentCase[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(RECENT_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? (list as RecentCase[]) : [];
  } catch {
    return [];
  }
}

function touchRecent(doc: CaseDocument): void {
  const s = storage();
  if (!s) return;
  const id = caseId(doc);
  const entry: RecentCase = {
    id,
    name: doc.case.name,
    case_number: doc.case.case_number,
    target_version: doc.case.target_version,
    updated_at: doc.case.updated_at,
  };
  const next = [entry, ...loadRecentCases().filter((r) => r.id !== id)].slice(0, RECENT_LIMIT);
  try {
    s.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
