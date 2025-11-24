(() => {
  const whenTemplatesReady = async () => {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    if (window.loadTemplatesPromise) {
      try {
        await window.loadTemplatesPromise;
      } catch (err) {
        console.error('Template load failed', err);
      }
    }
  };

  const start = () => {
    const settingsRoot = document.getElementById('discord-settings');
  if (!settingsRoot) return;

  const serverIdFromDataset = document.body?.dataset?.serverId || null;

  const badgeEl = document.getElementById('discord-bot-status');
  const playersEl = document.getElementById('discord-current-players');
  const maxPlayersEl = document.getElementById('discord-max-players');
  const joiningEl = document.getElementById('discord-joining');
  const lastCheckEl = document.getElementById('discord-last-check');
  const presenceTemplateEl = document.getElementById('discord-presence-template');
  const statusForm = document.getElementById('discord-status-form');
  const statusNoticeEl = document.getElementById('discord-status-notice');
  const statusTemplateInput = document.getElementById('discord-presence-template-input');
  const connectionStatusEl = document.getElementById('discord-connection-status');
  const connectionGuildInput = document.getElementById('discord-connection-guild-input');
  const connectionChannelInput = document.getElementById('discord-connection-channel-input');
  const connectionTokenInput = document.getElementById('discord-connection-token-input');
  const connectionSaveButton = document.getElementById('discord-connection-save');
  const presenceSelectEls = {
    online: document.getElementById('discord-presence-online'),
    offline: document.getElementById('discord-presence-offline'),
    stale: document.getElementById('discord-presence-stale'),
    waiting: document.getElementById('discord-presence-waiting')
  };
  const presenceStatusEls = {
    online: document.getElementById('discord-presence-status-online'),
    offline: document.getElementById('discord-presence-status-offline'),
    stale: document.getElementById('discord-presence-status-stale'),
    waiting: document.getElementById('discord-presence-status-waiting')
  };
  const enabledFieldsList = document.getElementById('discord-enabled-fields');
  const enabledFieldsEmpty = document.getElementById('discord-enabled-fields-empty');
  const statusFieldCheckboxes = Array.from(settingsRoot.querySelectorAll('[data-status-field]'));

  const FIELD_LABELS = {
    joining: 'Joining players',
    queued: 'Queue length',
    sleepers: 'Sleeping players',
    fps: 'Server FPS',
    lastUpdate: 'Last update timestamp'
  };

  const FIELD_ORDER = ['joining', 'queued', 'sleepers', 'fps', 'lastUpdate'];

  const PRESENCE_NAMES = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    invisible: 'Invisible'
  };

  // Preserve existing non-status classes on the badge, while letting us toggle status styles.
  const badgeBaseClasses = badgeEl
    ? Array.from(badgeEl.classList).filter((cls) => !['online', 'offline', 'degraded', 'success'].includes(cls))
    : ['status-pill'];

  function normalizeApiBase(value) {
    const raw = (value || '').trim();
    if (!raw) return '';
    const trimmed = raw.replace(/\/+$/, '');
    if (!trimmed) return raw ? '/api' : '';
    if (/\/api$/i.test(trimmed)) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (!url.pathname || url.pathname === '/' || url.pathname === '') {
          url.pathname = '/api';
          return url.href.replace(/\/$/, '');
        }
        return trimmed;
      } catch {
        return trimmed;
      }
    }
    if (trimmed.startsWith('/')) return trimmed;
    return trimmed + '/api';
  }

  function detectInitialApiBase() {
    if (typeof window !== 'undefined' && window.API_BASE) {
      const normalizedWindowBase = normalizeApiBase(window.API_BASE);
      if (normalizedWindowBase) return normalizedWindowBase;
    }

    const meta = document.querySelector('meta[name="panel-api-base"]')?.content;
    if (meta) {
      if (typeof window !== 'undefined' && window.location) {
        const locationBase = window.location.href || window.location.origin;
        if (locationBase) {
          try {
            const metaUrl = new URL(meta, locationBase);
            const normalizedMeta = normalizeApiBase(metaUrl.href);
            if (normalizedMeta) return normalizedMeta;
          } catch {
            // fall through to raw meta value
          }
        }
        const normalizedMeta = normalizeApiBase(meta);
        if (normalizedMeta) return normalizedMeta;
      } else {
        const normalizedMeta = normalizeApiBase(meta);
        if (normalizedMeta) return normalizedMeta;
      }
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      const normalizedOrigin = normalizeApiBase(window.location.origin);
      if (normalizedOrigin) return normalizedOrigin;
    }

    return normalizeApiBase('http://localhost');
  }

  const DEFAULT_STATUS_CONFIG = {
    presenceTemplate: '{statusEmoji} {playerCount} on {serverName}',
    presenceStatuses: { online: 'online', offline: 'dnd', stale: 'idle', waiting: 'idle' },
    fields: { joining: true, queued: true, sleepers: true, fps: true, lastUpdate: true }
  };

  const state = {
    integration: null,
    config: DEFAULT_STATUS_CONFIG,
    pollTimer: null,
    serverId: null,
    apiBase: detectInitialApiBase(),
    refreshToken: 0,
    statusDirty: false
  };

  function buildError(message, code) {
    const err = new Error(message || code || 'api_error');
    if (code) err.code = code;
    return err;
  }

  function describePresence(value) {
    if (value == null) return '—';
    const key = String(value).toLowerCase();
    return PRESENCE_NAMES[key] || String(value);
  }

  function setConnectionStatus(message, variant = 'info') {
    if (!connectionStatusEl) return;
    if (!message) {
      connectionStatusEl.textContent = '';
      connectionStatusEl.classList.add('hidden');
      connectionStatusEl.classList.remove('error', 'success');
      return;
    }
    connectionStatusEl.textContent = message;
    connectionStatusEl.classList.remove('hidden', 'error', 'success');
    if (variant === 'error') connectionStatusEl.classList.add('error');
    else if (variant === 'success') connectionStatusEl.classList.add('success');
  }

  function updateEnabledFields(fields) {
    if (!enabledFieldsList) return;
    while (enabledFieldsList.firstChild) {
      enabledFieldsList.removeChild(enabledFieldsList.firstChild);
    }
    const enabled = [];
    if (fields && typeof fields === 'object') {
      for (const key of FIELD_ORDER) {
        if (fields[key]) {
          enabled.push(FIELD_LABELS[key] || key);
        }
      }
    }
    if (enabled.length) {
      enabledFieldsList.classList.remove('hidden');
      for (const label of enabled) {
        const item = document.createElement('li');
        item.textContent = label;
        enabledFieldsList.appendChild(item);
      }
    } else {
      enabledFieldsList.classList.add('hidden');
    }
    if (enabledFieldsEmpty) {
      enabledFieldsEmpty.classList.toggle('hidden', enabled.length > 0);
    }
  }

  function normalizeStatusConfig(config) {
    const source = config && typeof config === 'object' ? config : {};
    const base = DEFAULT_STATUS_CONFIG;
    const statuses = source && typeof source.presenceStatuses === 'object' ? source.presenceStatuses : {};
    const fields = source && typeof source.fields === 'object' ? source.fields : {};
    const template = typeof source.presenceTemplate === 'string' && source.presenceTemplate.trim().length
      ? source.presenceTemplate.trim()
      : base.presenceTemplate;
    return {
      presenceTemplate: template,
      presenceStatuses: {
        online: statuses.online || base.presenceStatuses.online,
        offline: statuses.offline || base.presenceStatuses.offline,
        stale: statuses.stale || base.presenceStatuses.stale,
        waiting: statuses.waiting || base.presenceStatuses.waiting
      },
      fields: {
        joining: typeof fields.joining === 'boolean' ? fields.joining : base.fields.joining,
        queued: typeof fields.queued === 'boolean' ? fields.queued : base.fields.queued,
        sleepers: typeof fields.sleepers === 'boolean' ? fields.sleepers : base.fields.sleepers,
        fps: typeof fields.fps === 'boolean' ? fields.fps : base.fields.fps,
        lastUpdate: typeof fields.lastUpdate === 'boolean' ? fields.lastUpdate : base.fields.lastUpdate
      }
    };
  }

  function setStatusNotice(message, variant = 'info') {
    if (!statusNoticeEl) return;
    if (!message) {
      clearStatusNotice();
      return;
    }
    statusNoticeEl.textContent = message;
    statusNoticeEl.classList.remove('hidden', 'error', 'success');
    if (variant === 'error') statusNoticeEl.classList.add('error');
    else if (variant === 'success') statusNoticeEl.classList.add('success');
    else statusNoticeEl.classList.remove('error', 'success');
  }

  function clearStatusNotice() {
    if (!statusNoticeEl) return;
    statusNoticeEl.textContent = '';
    statusNoticeEl.classList.add('hidden');
    statusNoticeEl.classList.remove('error', 'success');
  }

  function disableStatusForm(disabled) {
    if (!statusForm) return;
    const shouldDisable = !!disabled || !state.serverId;
    statusForm.querySelectorAll('textarea, input, select, button').forEach((el) => {
      el.disabled = shouldDisable;
    });
  }

  function disableConnectionForm(disabled) {
    const shouldDisable = !!disabled || !state.serverId;
    [connectionGuildInput, connectionChannelInput, connectionTokenInput, connectionSaveButton].forEach((el) => {
      if (el) el.disabled = shouldDisable;
    });
  }

  function applyStatusConfig(config, { force = false } = {}) {
    const normalized = normalizeStatusConfig(config);
    state.config = normalized;
    const shouldApply = force || !state.statusDirty;

    if (shouldApply) {
      if (statusTemplateInput) {
        statusTemplateInput.value = normalized.presenceTemplate;
      }
      for (const [key, select] of Object.entries(presenceSelectEls)) {
        if (!select) continue;
        const desired = normalized.presenceStatuses[key] || DEFAULT_STATUS_CONFIG.presenceStatuses[key];
        const hasOption = Array.from(select.options || []).some((opt) => opt.value === desired);
        select.value = hasOption ? desired : DEFAULT_STATUS_CONFIG.presenceStatuses[key];
      }
      statusFieldCheckboxes.forEach((checkbox) => {
        if (!checkbox) return;
        const fieldKey = checkbox.dataset?.statusField;
        if (!fieldKey) return;
        checkbox.checked = Boolean(normalized.fields[fieldKey]);
      });
      state.statusDirty = false;
    }
  }

  function resetStatusForm() {
    applyStatusConfig(DEFAULT_STATUS_CONFIG, { force: true });
    clearStatusNotice();
  }

  function markStatusDirty() {
    state.statusDirty = true;
    clearStatusNotice();
  }

  function gatherStatusPayload() {
    const template = statusTemplateInput?.value?.trim() || '';
    const presenceStatuses = {};
    for (const [key, select] of Object.entries(presenceSelectEls)) {
      if (!select) continue;
      const value = select.value || DEFAULT_STATUS_CONFIG.presenceStatuses[key];
      presenceStatuses[key] = value;
    }
    const fields = {};
    statusFieldCheckboxes.forEach((checkbox) => {
      if (!checkbox) return;
      const fieldKey = checkbox.dataset?.statusField;
      if (!fieldKey) return;
      fields[fieldKey] = checkbox.checked;
    });
    return { presenceTemplate: template, presenceStatuses, fields };
  }

  function gatherConnectionPayload() {
    const normalizeSnowflake = (value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text ? text : null;
    };

    const payload = {};
    const guildId = normalizeSnowflake(connectionGuildInput?.value);
    const channelId = normalizeSnowflake(connectionChannelInput?.value);
    const botToken = typeof connectionTokenInput?.value === 'string' ? connectionTokenInput.value.trim() : '';

    if (guildId) payload.guildId = guildId;
    if (channelId) payload.channelId = channelId;
    if (botToken) payload.botToken = botToken;

    return payload;
  }

  function updateConfigSummary(config) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (presenceTemplateEl) {
      const template = typeof cfg?.presenceTemplate === 'string' && cfg.presenceTemplate.trim().length
        ? cfg.presenceTemplate.trim()
        : '—';
      presenceTemplateEl.textContent = template;
    }
    const statuses = cfg?.presenceStatuses || {};
    if (presenceStatusEls.online) presenceStatusEls.online.textContent = describePresence(statuses.online);
    if (presenceStatusEls.offline) presenceStatusEls.offline.textContent = describePresence(statuses.offline);
    if (presenceStatusEls.stale) presenceStatusEls.stale.textContent = describePresence(statuses.stale);
    if (presenceStatusEls.waiting) presenceStatusEls.waiting.textContent = describePresence(statuses.waiting);

    updateEnabledFields(cfg?.fields || null);
  }

  function updateConnectionSummary(integration) {
    const guildText = integration?.guildId || '';
    const channelText = integration?.channelId || '';
    const hasToken = Boolean(integration?.hasToken);

    if (connectionGuildInput && document.activeElement !== connectionGuildInput) {
      connectionGuildInput.value = guildText;
    }
    if (connectionChannelInput && document.activeElement !== connectionChannelInput) {
      connectionChannelInput.value = channelText;
    }
    if (connectionTokenInput && !connectionTokenInput.value) {
      connectionTokenInput.placeholder = hasToken
        ? 'Leave blank to keep the saved token'
        : 'Paste the Discord bot token';
    }

    if (connectionStatusEl) {
      connectionStatusEl.textContent = integration
        ? 'Update the guild, status channel, or bot token for this workspace.'
        : "Add this workspace's Server Bot token and guild ID to enable status updates.";
      connectionStatusEl.classList.remove('hidden', 'error', 'success');
      if (integration) connectionStatusEl.classList.add('success');
      else connectionStatusEl.classList.add('error');
    }

    setConnectionStatus(
      integration
        ? 'Update the guild, status channel, or bot token for this workspace.'
        : "Add this workspace's Server Bot token and guild ID to enable status updates.",
      integration ? 'success' : 'error'
    );
  }

  function updateBadge(presenceLabel, presence) {
    if (!badgeEl) return;
    const isOnline = String(presence || '').toLowerCase() === 'online';
    const classes = [...badgeBaseClasses, isOnline ? 'online' : 'offline'];
    if (!classes.includes('status-pill')) classes.unshift('status-pill');
    badgeEl.className = classes.join(' ');
    badgeEl.textContent = presenceLabel || (isOnline ? 'Online' : 'Do Not Disturb');
  }

  function updateStatusView(status = {}) {
    const players = Number(status?.players?.current);
    const maxPlayers = Number(status?.players?.max);
    const joining = Number(status?.joining);

    if (playersEl) playersEl.textContent = Number.isFinite(players) && players >= 0 ? String(players) : '0';
    if (maxPlayersEl) maxPlayersEl.textContent = Number.isFinite(maxPlayers) && maxPlayers >= 0 ? String(maxPlayers) : '—';
    if (joiningEl) joiningEl.textContent = Number.isFinite(joining) && joining >= 0 ? String(joining) : '0';

    updateBadge(status?.presenceLabel, status?.presence);

    if (lastCheckEl) {
      const value = status?.lastCheck ? new Date(status.lastCheck) : null;
      if (value && !Number.isNaN(value.getTime())) {
        lastCheckEl.textContent = `Last check: ${value.toLocaleString()}`;
      } else {
        lastCheckEl.textContent = 'Last check: —';
      }
    }
  }

  function applyIntegration(integration, options = {}) {
    const { force = false } = options;
    state.integration = integration;
    updateConnectionSummary(integration);
    updateConfigSummary(integration?.config || null);
    applyStatusConfig(integration?.config || DEFAULT_STATUS_CONFIG, { force });
  }

  function describeError(code) {
    switch (code) {
      case 'missing_fields':
        return "Add this workspace's Server Bot token and guild ID before editing status.";
      case 'missing_bot_token':
      case 'missing_token':
        return "Add this workspace's Server Bot token and guild ID before editing status.";
      case 'unauthorized':
        return 'Sign in to configure Discord integration.';
      case 'not_found':
        return 'This server could not be found.';
      case 'not_supported':
        return 'Discord integration is not enabled on this server.';
      case 'network_error':
        return 'Unable to reach the server. Check your connection.';
      case 'db_error':
        return 'The server could not save the Discord settings.';
      case 'missing_server':
        return 'Select a server to manage its Server Bot.';
      default:
        return 'An unexpected error occurred while updating Discord status settings.';
    }
  }

  function ensureApiBase() {
    if (!state.apiBase) state.apiBase = detectInitialApiBase();
    if (!state.apiBase) state.apiBase = '/api';
    return state.apiBase;
  }

  async function apiRequest(method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    if (!token) throw buildError('unauthorized', 'unauthorized');
    if (!state.serverId) throw buildError('missing_server', 'missing_server');

    const base = ensureApiBase();
    if (!base) throw buildError('network_error', 'network_error');

    const endpoint = `${base}/servers/${encodeURIComponent(state.serverId)}/discord`;
    const headers = { Authorization: 'Bearer ' + token };
    const options = { method, headers };

    if (body !== null && body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(endpoint, options);
    } catch {
      throw buildError('network_error', 'network_error');
    }

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = null; }
    }

    if (response.status === 401) {
      throw buildError('unauthorized', 'unauthorized');
    }
    if (!response.ok) {
      const code = payload?.error || 'api_error';
      const err = buildError(code, code);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }
    return payload || {};
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function schedulePolling() {
    stopPolling();
    if (!state.serverId) return;
    state.pollTimer = setInterval(() => {
      refresh({ silent: true });
    }, 15000);
  }

  async function refresh(options = {}) {
    const { silent = false } = options;

    if (!state.serverId) {
      disableStatusForm(true);
      disableConnectionForm(true);
      resetView();
      if (!silent) setStatusNotice(describeError('missing_server'), 'error');
      return;
    }

    const activeServer = state.serverId;
    const token = ++state.refreshToken;

    const shouldShowLoading = !silent && !state.statusDirty;

    if (shouldShowLoading) setStatusNotice('Loading Discord status…');
    disableStatusForm(true);
    disableConnectionForm(true);

    try {
      const data = await apiRequest('GET');
      if (state.serverId !== activeServer || state.refreshToken !== token) return;
      applyIntegration(data.integration || null);
      updateStatusView(data.status || {});
      disableStatusForm(false);
      disableConnectionForm(false);
      if (shouldShowLoading) clearStatusNotice();
    } catch (err) {
      if (state.serverId !== activeServer || state.refreshToken !== token) return;
      disableStatusForm(false);
      disableConnectionForm(false);
      const code = err?.code || err?.message || 'api_error';
      if (code === 'unauthorized') {
        setStatusNotice(describeError(code), 'error');
        disableStatusForm(true);
        disableConnectionForm(true);
        stopPolling();
        return;
      }
      if (code === 'missing_server') {
        setStatusNotice(describeError(code), 'error');
        disableStatusForm(true);
        disableConnectionForm(true);
        return;
      }
      if (!silent) setStatusNotice(describeError(code), 'error');
    }
  }

  async function saveStatusConfig(event) {
    event?.preventDefault();
    if (!state.serverId) {
      setStatusNotice(describeError('missing_server'), 'error');
      return;
    }
    disableStatusForm(true);
    setStatusNotice('Saving status settings…');
    try {
      const payload = { config: gatherStatusPayload(), ...gatherConnectionPayload() };
      const data = await apiRequest('POST', payload);
      applyIntegration(data.integration || null, { force: true });
      updateStatusView(data.status || {});
      disableStatusForm(false);
      setStatusNotice('Status settings saved.', 'success');
    } catch (err) {
      disableStatusForm(false);
      const code = err?.code || err?.message || 'api_error';
      setStatusNotice(describeError(code), 'error');
    }
  }

  async function saveConnection(event) {
    event?.preventDefault();
    if (!state.serverId) {
      setConnectionStatus(describeError('missing_server'), 'error');
      return;
    }

    const payload = gatherConnectionPayload();
    const guildId = payload.guildId || state.integration?.guildId || '';
    const channelId = payload.channelId || state.integration?.channelId || '';
    const hasToken = Boolean(payload.botToken || state.integration?.hasToken);

    if (!guildId || !channelId) {
      setConnectionStatus('Enter a guild ID and status channel ID to start the Server Bot.', 'error');
      return;
    }
    if (!hasToken) {
      setConnectionStatus('Paste the bot token so the Server Bot can connect.', 'error');
      return;
    }

    disableConnectionForm(true);
    setConnectionStatus('Saving Server Bot connection…');

    try {
      const data = await apiRequest('POST', payload);
      applyIntegration(data.integration || null, { force: true });
      updateStatusView(data.status || {});
      setConnectionStatus('Server Bot connection saved. The bot will start shortly.', 'success');
      disableConnectionForm(false);
    } catch (err) {
      disableConnectionForm(false);
      const code = err?.code || err?.message || 'api_error';
      setConnectionStatus(describeError(code), 'error');
    }
  }

  function resetView() {
    applyIntegration(null, { force: true });
    updateStatusView({ presence: 'dnd', presenceLabel: 'Do Not Disturb' });
    resetStatusForm();
  }

  function selectServer(id) {
    const normalized = id == null ? null : String(id);
    if (normalized === state.serverId) {
      if (normalized) refresh({ silent: true });
      return;
    }
    state.serverId = normalized;
    state.integration = null;
    stopPolling();

    if (!normalized) {
      disableStatusForm(true);
      resetView();
      setStatusNotice(describeError('missing_server'), 'error');
      return;
    }

    resetView();
    disableStatusForm(true);
    refresh().finally(() => {
      if (state.serverId === normalized) schedulePolling();
    });
  }

  statusForm?.addEventListener('submit', saveStatusConfig);
  connectionSaveButton?.addEventListener('click', saveConnection);

  statusTemplateInput?.addEventListener('input', markStatusDirty);
  Object.values(presenceSelectEls).forEach((select) => {
    select?.addEventListener('change', markStatusDirty);
  });
  statusFieldCheckboxes.forEach((checkbox) => {
    checkbox?.addEventListener('change', markStatusDirty);
  });

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });

  // Workspace integration: react to server selection / status pushes / API base changes.
  window.addEventListener('workspace:server-selected', (event) => {
    const id = event?.detail?.serverId;
    if (typeof id === 'number' || typeof id === 'string') {
      selectServer(id);
    }
  });

  window.addEventListener('workspace:server-cleared', () => {
    selectServer(null);
  });

  window.addEventListener('workspace:server-status', (event) => {
    const detail = event?.detail;
    if (!detail) return;
    if (state.serverId == null || String(detail.serverId) !== state.serverId) return;
    updateStatusView(detail.status || {});
  });

  window.addEventListener('workspace:api-base', (event) => {
    const base = event?.detail?.base;
    if (typeof base === 'string' && base) {
      const normalized = normalizeApiBase(base);
      if (normalized) state.apiBase = normalized;
      if (state.serverId) refresh({ silent: true });
    }
  });

  // Initial selection priority: dataset -> preselected global -> missing_server
  if (serverIdFromDataset) {
    selectServer(serverIdFromDataset);
  } else if (typeof window !== 'undefined' && typeof window.__workspaceSelectedServer !== 'undefined') {
    selectServer(window.__workspaceSelectedServer);
  } else {
    disableStatusForm(true);
    disableConnectionForm(true);
    resetView();
    setStatusNotice(describeError('missing_server'), 'error');
  }
  };

  whenTemplatesReady().then(start).catch((err) => console.error('Server settings init failed', err));
})();
