function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatRelativeTime(value) {
  const date = parseDate(value);
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const units = [
    { label: 'day', ms: 24 * 60 * 60 * 1000 },
    { label: 'hour', ms: 60 * 60 * 1000 },
    { label: 'minute', ms: 60 * 1000 },
    { label: 'second', ms: 1000 }
  ];
  for (const unit of units) {
    if (abs >= unit.ms) {
      const valueNum = Math.round(abs / unit.ms);
      const plural = valueNum === 1 ? unit.label : `${unit.label}s`;
      const suffix = diffMs >= 0 ? 'ago' : 'from now';
      return `${valueNum} ${plural} ${suffix}`;
    }
  }
  return 'just now';
}

function truncate(text, max = 140) {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + '…';
}

function describeLatencyMs(value) {
  if (!Number.isFinite(value)) return null;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export function summarizeTicketActivity(ticket = {}, dialog = []) {
  const subject = ticket.subject || 'Ticket';
  const status = (ticket.status || 'open').toLowerCase();
  const messageCount = Array.isArray(dialog) ? dialog.length : 0;
  const staffMessages = Array.isArray(dialog)
    ? dialog.filter((entry) => (entry?.role || '').toLowerCase() === 'agent').length
    : 0;
  const requesterMessages = Math.max(0, messageCount - staffMessages);
  const lastEntry = messageCount > 0 ? dialog[messageCount - 1] : null;
  const opener = ticket.createdByTag || ticket.createdBy || 'requester';
  const lastUpdate = lastEntry?.postedAt || ticket.updatedAt || ticket.closedAt || ticket.createdAt || null;
  const requesterMessages = Math.max(0, messageCount - staffMessages);
  const firstReply = Array.isArray(dialog)
    ? dialog.find((entry) => (entry?.role || '').toLowerCase() === 'agent')
    : null;
  const firstResponseLatencyMs = ticket.createdAt && firstReply?.postedAt
    ? Math.max(0, Date.parse(firstReply.postedAt) - Date.parse(ticket.createdAt))
    : null;
  const lines = [];

  lines.push(`${subject}: ${status.toUpperCase()} — ${messageCount || '0'} message${messageCount === 1 ? '' : 's'} recorded.`);
  lines.push(`Opened by ${opener}${ticket.createdAt ? ` (${formatRelativeTime(ticket.createdAt) || ticket.createdAt})` : ''}.`);
  lines.push(`Traffic: ${staffMessages} staff reply${staffMessages === 1 ? '' : 'ies'}, ${requesterMessages} requester message${requesterMessages === 1 ? '' : 's'}.`);
  if (firstResponseLatencyMs != null && Number.isFinite(firstResponseLatencyMs)) {
    const formatted = describeLatencyMs(firstResponseLatencyMs);
    lines.push(`Initial response landed ${formatted} after the ticket opened.`);
  }
  if (lastEntry) {
    const author = lastEntry.authorTag || lastEntry.author_id || lastEntry.authorId || 'staff';
    const snippet = truncate(lastEntry.content || '');
    const when = formatRelativeTime(lastUpdate) || 'recently';
    const label = snippet ? `${author}: ${snippet}` : `Last update by ${author}`;
    lines.push(`Latest activity ${when}: ${label}`);
  } else if (ticket.details) {
    lines.push(`Original request: ${truncate(ticket.details, 160)}`);
  }
  if (ticket.closedAt) {
    const closedWhen = formatRelativeTime(ticket.closedAt) || ticket.closedAt;
    lines.push(`Closed ${closedWhen}${ticket.closedByTag ? ` by ${ticket.closedByTag}` : ''}.`);
  }
  return lines.filter(Boolean).join('\n');
}
