/** Client-side CSV export. Used together with the API's own CSV endpoints. */

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (!rows.length) return '';
  const keys = columns?.length ? columns.map((c) => c.key) : Object.keys(rows[0] ?? {});
  const header = columns?.length ? columns.map((c) => c.label) : keys;
  const lines = [header.map(escapeCell).join(',')];
  for (const r of rows) lines.push(keys.map((k) => escapeCell(r[k])).join(','));
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): void {
  // The BOM makes Excel open UTF-8 rupee symbols and diacritics correctly.
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
