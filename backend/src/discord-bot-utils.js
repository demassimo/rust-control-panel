export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sanitizeId(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function formatCount(value, fallback = '—') {
  const num = safeNumber(value);
  if (num == null) return fallback;
  return String(num);
}

export function formatDiscordTimestamp(value, style = 'R') {
  const parsed = parseDate(value);
  if (!parsed) return 'unknown';
  const seconds = Math.floor(parsed.getTime() / 1000);
  return `<t:${seconds}:${style}>`;
}

export function sanitizeTicketText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 500);
}

export function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

