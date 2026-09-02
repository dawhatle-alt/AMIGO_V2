'use client';

import { useState } from 'react';

/**
 * Renders an array of uniform records as a table.
 *
 * Several extractors produce record arrays — X01 patch history, X22 agents,
 * X12 disk free — and a real archive's patch history runs to 25+ rows. Joined
 * into one paragraph those are unreadable; as a table they scan.
 */

const COLLAPSE_ABOVE = 10;

export function RecordTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(false);

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const collapsible = rows.length > COLLAPSE_ABOVE;
  const visible = collapsible && !expanded ? rows.slice(0, COLLAPSE_ABOVE) : rows;

  return (
    <div className="mt-1.5">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="whitespace-nowrap border-b border-gray-200 px-2.5 py-1.5 text-left font-semibold text-gray-600"
                >
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : undefined}>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 ${cellClass(
                      row[col],
                    )}`}
                  >
                    {cellText(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-medium text-primary hover:text-primary-dark hover:underline"
        >
          {expanded ? `Show first ${COLLAPSE_ABOVE}` : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
}

/**
 * True when a value is a non-empty array of plain objects sharing a shape —
 * the case a table reads better than a sentence.
 */
export function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0,
  );
}

/**
 * CSV-derived keys arrive already upper-case (NODEID, SSL) and are left alone;
 * snake_case keys become sentence case, with `_gb` promoted to a unit.
 */
function columnLabel(key: string): string {
  if (/^[A-Z0-9_]+$/.test(key)) return key;
  const unit = /_(gb|mb|tb|kb|ms|sec|min)$/.exec(key);
  const base = unit ? key.slice(0, key.length - unit[0].length) : key;
  const words = base.split('_').filter(Boolean).join(' ');
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return unit?.[1] ? `${label} (${unit[1].toUpperCase()})` : label;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Values that mean "this needs attention" get colour; everything else stays neutral. */
function cellClass(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (text === 'UNAVAILABLE' || text === 'DISABLED' || text === 'FAILED') {
    return 'font-mono font-semibold text-risk-blocker';
  }
  return 'font-mono text-gray-700';
}
