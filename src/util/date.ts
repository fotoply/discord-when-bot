export function isValidISODate(s?: string): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = s.split('-').map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

export function buildDateRange(first: string, last: string): string[] | null {
  if (!isValidISODate(first) || !isValidISODate(last)) return null;
  const start = new Date(first + 'T00:00:00Z');
  const end = new Date(last + 'T00:00:00Z');
  if (start.getTime() > end.getTime()) return null;
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function formatDateLabel(iso: string): string {
  // Render like 'Fri Aug 29'
  const d = new Date(iso + 'T00:00:00Z');
  const weekday = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = String(d.getUTCDate()).padStart(2, '0');
  // Remove any commas and join
  return `${weekday} ${month} ${day}`;
}

export function buildFutureDates(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // Normalize to UTC midnight
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < days; i++) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}
