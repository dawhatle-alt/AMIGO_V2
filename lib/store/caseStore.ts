'use client';

import { create } from 'zustand';
import type { ActivityEntry, CaseDocument } from '@/lib/types/case';
import { createEmptyCase, type NewCaseInput } from '@/lib/case/emptyCase';
import { downloadCaseFile, parseCaseFile } from '@/lib/case/serialize';
import { clearActiveCase, loadActiveCase, saveActiveCase } from '@/lib/store/persist';
import type { ParseResult } from '@/lib/parser';

/**
 * Case state (PRD FR-1/FR-2). Every mutation goes through `mutate`, which
 * stamps `updated_at`, appends the activity-log entry, and autosaves to
 * localStorage — so the audit trail can never drift from the state.
 */

interface CaseState {
  doc: CaseDocument | null;
  /** True once the localStorage restore attempt has run (avoids SSR flicker). */
  hydrated: boolean;
  lastSavedAt: string | null;

  hydrate: () => void;
  newCase: (input: NewCaseInput) => void;
  openCaseFromText: (text: string, fileName: string) => void;
  saveCaseToFile: () => void;
  closeCase: () => void;

  /** Replace facts/gaps/archives with a fresh parse result (M1 intake). */
  applyParseResult: (result: ParseResult) => void;

  /** Accept an INFERRED fact as extracted (FR-10). */
  confirmFact: (key: string) => void;
  /** Override an INFERRED fact; both values stay in the audit trail (FR-10). */
  correctFact: (key: string, correctedValue: string) => void;
  /** Undo a confirmation so the value returns to the queue. */
  clearConfirmation: (key: string) => void;


  /** Apply a change and record it in the audit trail. */
  mutate: (action: string, detail: string, fn: (draft: CaseDocument) => void) => void;
  log: (action: string, detail: string) => void;
}

function clone(doc: CaseDocument): CaseDocument {
  return JSON.parse(JSON.stringify(doc)) as CaseDocument;
}

/** Compact rendering of a fact value for the audit trail. */
function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export const useCaseStore = create<CaseState>((set, get) => ({
  doc: null,
  hydrated: false,
  lastSavedAt: null,

  hydrate: () => {
    if (get().hydrated) return;
    // `hydrated` gates the whole shell, so it must flip even if the restore
    // fails — otherwise a bad autosave slot leaves the app on "Loading..."
    // with nothing to act on.
    let restored: CaseDocument | null = null;
    try {
      restored = loadActiveCase();
    } catch {
      restored = null;
    } finally {
      set({ doc: restored, hydrated: true });
    }
  },

  newCase: (input) => {
    const doc = createEmptyCase(input);
    saveActiveCase(doc);
    set({ doc, hydrated: true, lastSavedAt: doc.case.updated_at });
  },

  openCaseFromText: (text, fileName) => {
    // Throws CaseFileError on a bad file — the caller surfaces it.
    const doc = parseCaseFile(text);
    const now = new Date().toISOString();
    const entry: ActivityEntry = {
      ts: now,
      actor: 'TSA',
      action: 'case.opened',
      detail: fileName,
    };
    doc.activity_log = [...doc.activity_log, entry];
    doc.case.updated_at = now;
    saveActiveCase(doc);
    set({ doc, hydrated: true, lastSavedAt: now });
  },

  saveCaseToFile: () => {
    const doc = get().doc;
    if (!doc) return;
    downloadCaseFile(doc);
    get().log('case.exported', 'case.json downloaded');
  },

  closeCase: () => {
    clearActiveCase();
    set({ doc: null, lastSavedAt: null });
  },

  applyParseResult: (result) => {
    const summary = result.summary;
    get().mutate(
      'intake.parsed',
      `${result.meta.archives.map((a) => `${a.file} (${a.product})`).join(', ')} - ` +
        `${summary.facts_total} facts, ${summary.gaps_total} gaps` +
        (result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : ''),
      (draft) => {
        draft.archives = result.meta.archives;
        draft.facts = result.facts;
        draft.gaps = result.gaps;
        // A re-parse invalidates prior confirmations, answers and generated output.
        draft.confirmations = {};
        draft.answers = {};
        draft.plan = { generated_at: '', items: [] };
        draft.runbook = { steps: [], outage_started_at: null, window_minutes: null };
      },
    );
  },

  confirmFact: (key) => {
    const fact = get().doc?.facts[key];
    if (!fact) return;
    get().mutate(
      'fact.confirmed',
      `${key} = ${describe(fact.value)} (confidence ${fact.confidence}, source ${fact.source})`,
      (draft) => {
        draft.confirmations[key] = {
          status: 'confirmed',
          corrected_value: null,
          ts: new Date().toISOString(),
        };
      },
    );
  },

  correctFact: (key, correctedValue) => {
    const fact = get().doc?.facts[key];
    if (!fact) return;
    // FR-10: the extracted value is never overwritten - `facts` keeps what the
    // archive said, `confirmations` records what the TSA says it actually is,
    // and the log line carries both.
    get().mutate(
      'fact.corrected',
      `${key}: extracted ${describe(fact.value)} -> corrected to ${describe(correctedValue)}`,
      (draft) => {
        draft.confirmations[key] = {
          status: 'corrected',
          corrected_value: correctedValue,
          ts: new Date().toISOString(),
        };
      },
    );
  },

  clearConfirmation: (key) => {
    if (!get().doc?.confirmations[key]) return;
    get().mutate('fact.confirmation_cleared', key, (draft) => {
      delete draft.confirmations[key];
    });
  },

  mutate: (action, detail, fn) => {
    const current = get().doc;
    if (!current) return;
    const draft = clone(current);
    fn(draft);
    const now = new Date().toISOString();
    draft.case.updated_at = now;
    draft.activity_log = [...draft.activity_log, { ts: now, actor: 'TSA', action, detail }];
    saveActiveCase(draft);
    set({ doc: draft, lastSavedAt: now });
  },

  log: (action, detail) => {
    get().mutate(action, detail, () => {});
  },
}));
