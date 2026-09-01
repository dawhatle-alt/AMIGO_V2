/**
 * Small text helpers whose semantics must match the Python reference parser
 * (reference/amigo_prefill.py) exactly — the golden test diffs against its
 * output field-for-field.
 */

/** Python `str.splitlines()`: a single trailing terminator produces no empty tail. */
export function splitLines(text: string): string[] {
  const body = text.replace(/(\r\n|\n|\r)$/, '');
  if (body === '') return [];
  return body.split(/\r\n|\n|\r/);
}

/** Python `str.split()` with no argument: split on whitespace runs, drop empties. */
export function splitWhitespace(text: string): string[] {
  return text.trim().split(/\s+/).filter((p) => p !== '');
}

/**
 * Python `str(dict)` / `repr` for a flat string-keyed mapping.
 *
 * Exists only to reproduce the `raw` field of the reference parser byte-for-byte
 * (X01 `server.version`, X06 `server.ha`). Values in those two call sites are
 * always strings or null; other types are handled defensively.
 */
export function pyRepr(obj: Record<string, unknown>): string {
  const parts = Object.entries(obj).map(([k, v]) => `${pyReprValue(k)}: ${pyReprValue(v)}`);
  return `{${parts.join(', ')}}`;
}

function pyReprValue(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(v)) return `[${v.map(pyReprValue).join(', ')}]`;
  return pyRepr(v as Record<string, unknown>);
}

/**
 * CSV reader equivalent to Python's `csv.DictReader` for the default dialect:
 * comma delimiter, double-quote quoting with `""` escapes, embedded newlines
 * allowed inside quotes. Wholly blank lines are skipped, as DictReader does.
 * Fields absent from a short row are `null` (Python's `None`).
 */
export function dictReader(text: string): Record<string, string | null>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  const out: Record<string, string | null>[] = [];
  for (const row of rows.slice(1)) {
    if (row.length === 0) continue;
    const rec: Record<string, string | null> = {};
    header.forEach((key, i) => {
      rec[key] = i < row.length ? (row[i] ?? null) : null;
    });
    out.push(rec);
  }
  return out;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = true;
  };
  const endRow = () => {
    if (started || row.length > 0) {
      endField();
      // A line holding a single empty field is a blank line — DictReader skips it.
      rows.push(row.length === 1 && row[0] === '' ? [] : row);
    }
    row = [];
    field = '';
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      started = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else if (c === '\n') {
      endRow();
    } else {
      field += c;
      started = true;
    }
  }
  if (started || row.length > 0) endRow();
  return rows;
}
