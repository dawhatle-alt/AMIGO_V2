'use client';

import { create } from 'zustand';
import type { ActivityEntry, CaseDocument } from '@/lib/types/case';
import { createEmptyCase, type NewCaseInput } from '@/lib/case/emptyCase';
import { downloadCaseFile, parseCaseFile } from '@/lib/case/serialize';
import { clearActiveCase, loadActiveCase, saveActiveCase } from '@/lib/store/persist';

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

  /** Apply a change and record it in the audit trail. */
  mutate: (action: string, detail: string, fn: (draft: CaseDocument) => void) => void;
  log: (action: string, detail: string) => void;
}

function clone(doc: CaseDocument): CaseDocument {
  return JSON.parse(JSON.stringify(doc)) as CaseDocument;
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
