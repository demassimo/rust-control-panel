const DEFAULT_AI_API_URL = (process.env.AI_API_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
const AI_MODEL_NAME = (process.env.AI_MODEL_NAME || '').trim();

function getApiUrl() {
  return DEFAULT_AI_API_URL || 'http://127.0.0.1:11434';
}

export function isAiEnabled() {
  return Boolean(AI_MODEL_NAME);
}

export function getAiConfig() {
  return {
    enabled: isAiEnabled(),
    model: AI_MODEL_NAME || null,
    endpoint: getApiUrl()
  };
}

async function requestCompletion(prompt, { temperature = 0.2 } = {}) {
  if (!isAiEnabled()) {
    const error = new Error('ai_disabled');
    error.code = 'ai_disabled';
    throw error;
  }
  const body = {
    model: AI_MODEL_NAME,
    prompt,
    stream: false,
    options: {
      temperature
    }
  };
  const response = await fetch(`${getApiUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = new Error('ai_request_failed');
    error.code = 'ai_request_failed';
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const text = typeof data?.response === 'string'
    ? data.response
    : (Array.isArray(data?.output) ? data.output.join('\n') : '');
  if (!text) {
    const error = new Error('ai_empty_response');
    error.code = 'ai_empty_response';
    throw error;
  }
  return text.trim();
}

function formatTicketConversation(dialog = [], { maxEntries = 12 } = {}) {
  const entries = Array.isArray(dialog) ? dialog.slice(-maxEntries) : [];
  if (!entries.length) return 'No conversation history.';
  return entries
    .map((entry) => {
      const role = entry?.role === 'agent' ? 'Staff' : entry?.role === 'system' ? 'System' : 'Player';
      const author = entry?.authorTag || entry?.author_id || entry?.authorId || 'Unknown user';
      const content = (entry?.content || '').replace(/\s+/g, ' ').trim();
      const time = entry?.postedAt || entry?.posted_at || '';
      const timeLabel = time ? ` [${time}]` : '';
      return `${role} (${author})${timeLabel}: ${content}`;
    })
    .join('\n');
}

export async function generateTicketSummary({ ticket, dialog } = {}) {
  const subject = ticket?.subject || 'No subject';
  const details = (ticket?.details || '').trim();
  const status = ticket?.status || 'open';
  const openedBy = ticket?.createdByTag || ticket?.createdBy || 'Unknown requester';
  const metaLines = [
    `Subject: ${subject}`,
    `Status: ${status}`,
    `Opened by: ${openedBy}`,
    ticket?.ticketNumber != null ? `Ticket #: ${ticket.ticketNumber}` : null
  ].filter(Boolean);
  if (details) {
    metaLines.push(`Original request: ${details}`);
  }
  const conversation = formatTicketConversation(dialog, { maxEntries: 14 });
  const prompt = [
    'You are an assistant that summarizes support tickets for a Rust server staff team.',
    'Write 3-4 concise bullet points covering the player issue, steps taken, and next actions.',
    'Avoid inventing details. Reference actual conversation facts only.',
    '',
    '# Ticket metadata',
    metaLines.join('\n'),
    '',
    '# Conversation history',
    conversation,
    '',
    'Summary (use bullet points):'
  ].join('\n');
  return requestCompletion(prompt, { temperature: 0.25 });
}

export async function generateTicketReply({ ticket, dialog } = {}) {
  const subject = ticket?.subject || 'support ticket';
  const requester = ticket?.createdByTag || ticket?.createdBy || 'player';
  const conversation = formatTicketConversation(dialog, { maxEntries: 14 });
  const prompt = [
    'You draft short, friendly replies for Rust server support tickets.',
    'Tone should be professional, helpful, and aligned with community guidelines.',
    'If more info is required, ask concise follow-up questions.',
    'Do NOT mention you are an AI.',
    '',
    `Ticket subject: ${subject}`,
    `Requester: ${requester}`,
    '',
    '# Recent conversation',
    conversation,
    '',
    'Draft a brief reply (2-4 sentences):'
  ].join('\n');
  return requestCompletion(prompt, { temperature: 0.4 });
}

function compactNumber(value, fallback = 'unknown') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toString();
}

export async function generateServerInsight({ server, status } = {}) {
  const serverName = server?.name || `Server ${server?.id ?? 'unknown'}`;
  const stats = [
    `Players: ${compactNumber(status?.details?.players?.online ?? status?.players?.current, '0')} / ${compactNumber(status?.details?.players?.max ?? status?.players?.max, '?')}`,
    `Queue: ${compactNumber(status?.details?.queued ?? status?.joining ?? 0, '0')}`,
    `Joining: ${compactNumber(status?.details?.joining ?? 0, '0')}`,
    `Sleepers: ${compactNumber(status?.details?.sleepers ?? 0, '0')}`,
    status?.details?.fps ? `Server FPS: ${status.details.fps}` : null,
    status?.latency ? `Latency: ${status.latency} ms` : null,
    status?.lastCheck ? `Last update: ${status.lastCheck}` : null
  ].filter(Boolean);
  const prompt = [
    'You analyze Rust server telemetry and highlight issues for operators.',
    'Provide a short paragraph with key observations plus an action list with 2 suggestions.',
    '',
    `Server: ${serverName}`,
    server?.host ? `Host: ${server.host}:${server.port || ''}` : null,
    '',
    'Latest metrics:',
    stats.join('\n'),
    '',
    'Insight:'
  ].filter(Boolean).join('\n');
  return requestCompletion(prompt, { temperature: 0.35 });
}

export async function generateDashboardInsight({ servers = [] } = {}) {
  if (!servers.length) {
    return 'No servers are linked yet. Connect a Rust server to generate insights.';
  }
  const lines = servers.slice(0, 8).map((entry) => {
    const status = entry.status?.ok ? 'online' : (entry.status?.stale ? 'stale' : 'offline');
    const players = compactNumber(entry.status?.players?.current ?? entry.status?.details?.players?.online ?? 0, '0');
    const queue = compactNumber(entry.status?.joining ?? entry.status?.details?.queued ?? 0, '0');
    return `${entry.name || `Server ${entry.id}`}: ${status}, players ${players}, queue ${queue}`;
  });
  const prompt = [
    'Summarize overall Rust server operations for the control panel dashboard.',
    'Mention population trends, outages, or queues if any, and flag urgent issues.',
    '',
    'Servers:',
    lines.join('\n'),
    '',
    'Summary:'
  ].join('\n');
  return requestCompletion(prompt, { temperature: 0.3 });
}

export async function generatePlayerInsight({ player, context } = {}) {
  const name = player?.name || player?.username || 'Unknown player';
  const steamId = player?.steamid || player?.steamId || 'N/A';
  const stats = [
    `SteamID: ${steamId}`,
    player?.last_seen ? `Last seen: ${player.last_seen}` : null,
    player?.first_seen ? `First seen: ${player.first_seen}` : null,
    player?.playtime_seconds ? `Playtime (hrs): ${(player.playtime_seconds / 3600).toFixed(1)}` : null,
    player?.kills != null ? `Kills: ${player.kills}` : null,
    player?.deaths != null ? `Deaths: ${player.deaths}` : null,
    player?.violations != null ? `Violation count: ${player.violations}` : null,
    player?.notes ? `Notes: ${player.notes}` : null,
    player?.country ? `Country: ${player.country}` : null
  ].filter(Boolean);
  const prompt = [
    'You assist Rust server moderators by summarizing player history.',
    'Highlight red flags (cheating reports, high violation counts) and positive signals (long playtime, clean record).',
    'Keep it under 4 sentences.',
    '',
    `Player: ${name}`,
    stats.join('\n'),
    '',
    'Summary:'
  ].join('\n');
  return requestCompletion(prompt, { temperature: 0.35 });
}
