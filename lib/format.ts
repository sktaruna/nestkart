export const API_KEY = 'nk-fin-dev-key-2025';
export const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
};

/** Format a number as Indian-grouped rupees, e.g. 124000 -> "₹1,24,000" */
export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const s = String(Math.round(n));
  if (s.length <= 3) return '₹' + s;
  let result = s.slice(-3);
  let rest = s.slice(0, -3);
  while (rest.length > 0) {
    result = rest.slice(-2) + ',' + result;
    rest = rest.slice(0, -2);
  }
  return '₹' + result;
}

/** Admin page uses "Rs." prefix instead of the rupee symbol. */
export function formatRs(n: number | null | undefined): string {
  if (!n && n !== 0) return '—';
  const s = String(Math.round(n));
  if (s.length <= 3) return 'Rs.' + s;
  let result = s.slice(-3);
  let rest = s.slice(0, -3);
  while (rest.length > 0) {
    result = rest.slice(-2) + ',' + result;
    rest = rest.slice(0, -2);
  }
  return 'Rs.' + result;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtMemberSince(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
