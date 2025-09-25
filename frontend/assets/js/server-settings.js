(() => {
  const settingsRoot = document.getElementById('discord-settings');
  if (!settingsRoot) return;

  const serverIdFromDataset = document.body?.dataset?.serverId || null;

  const badgeEl = document.getElementById('discord-bot-status');
  const playersEl = document.getElementById('discord-current-players');
  const maxPlayersEl = document.getElementById('discord-max-players');
  const joiningEl = document.getElementById('discord-joining');
  const lastCheckEl = document.getElementById('discord-last-check');
  const form = document.getElementById('discord-form');
  const tokenInput = document.getElementById('discord-bot-token');
  const guildInput = document.getElementById('discord-guild-id');
  const channelInput = document.getElementById('discord-channel-id');
  const removeBtn = document.getElementById('discord-remove');
  const noticeEl = document.getElementById('discord-notice');

  // Preserve existing non-status classes on the badge, while letting us toggle status styles.
  const badgeBaseClasses = badgeEl
    ? Array.from(badgeEl.classList).filter((cls) => !['online', 'offline', 'degraded', 'success'].includes(cls))
    : ['status-pill'];

  function sanitizeBase(value) {
    return value ? String(value).trim().replace(/\/+$/, '') : '';
  }

  function detectInitialApiBase() {
    if (typeof window !== 'undefined' && window.API_BASE) {
      return sanitizeBase(window.API_BASE);
    }
    const meta = document.querySelector('meta[name="panel-api-base"]')?.content;
    if (meta) return sanitizeBase(meta);
    return '';
  }

  const state = {
    integration: null,
    pollTimer: null,
    serverId: null,
    apiBase: detectInitialApiBase(),
    refreshToken: 0,
    dirty: {
      token: false,
      guild: false,
      channel: false
    }
  };

  function setDirty(field, value = true) {
    if (!state.dirty || !(field in state.dirty)) return;
    state.dirty[field] = !!value;
  }

  function resetDirty() {
    if (!state.dirty) return;
    for (const key of Object.keys(state.dirty)) {
      state.dirty[key] = false;
    }
  }

  function buildError(message, code) {
    const err = new Error(message || code || 'api_error');
    if (code) err.code = code;
    return err;
  }

  function setNotice(message, variant = 'info') {
    if (!noticeEl) return;
    if (!message) {
      clearNotice();
      return;
    }
    noticeEl.textContent = message || '';
    noticeEl.classList.remove('hidden', 'error', 'success');
    if (variant === 'error') noticeEl.classList.add('error');
    else if (variant === 'success') noticeEl.classList.add('success');
  }

  function clearNotice() {
    if (!noticeEl) return;
    noticeEl.textContent = '';
    noticeEl.classList.add('hidden');
    noticeEl.classList.remove('error', 'success');
  }

  function disableForm(disabled) {
    if (!form) return;
    const shouldDisable = !!disabled || !state.serverId;
    form.querySelectorAll('input, button').forEach((el) => {
      if (el === removeBtn) return;
      el.disabled = shouldDisable;
    });
    if (removeBtn) removeBtn.disabled = shouldDisable || !state.integration;
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
    if (guildInput && (force || !state.dirty.guild)) {
      guildInput.value = integration?.guildId || '';
      setDirty('guild', false);
    }
    if (channelInput && (force || !state.dirty.channel)) {
      channelInput.value = integration?.channelId || '';
      setDirty('channel', false);
    }
    if (tokenInput) {
      if (force || !state.dirty.token) {
        tokenInput.value = '';
        setDirty('token', false);
      }
      tokenInput.placeholder = integration?.hasToken
        ? 'Token stored — enter to replace'
        : 'Paste bot token';
    }
    if (removeBtn) removeBtn.disabled = !state.serverId || !integration;
    if (force) resetDirty();
  }

  function describeError(code) {
    switch (code) {
      case 'missing_fields':
        return 'Provide both the guild and channel IDs.';
      case 'missing_bot_token':
        return 'Add the Discord bot token before saving.';
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
        return 'Select a server to manage the Discord bot.';
      default:
        return 'An unexpected error occurred while updating Discord integration.';
    }
  }

  function ensureApiBase() {
    if (!state.apiBase) state.apiBase = detectInitialApiBase();
    return state.apiBase;
  }

  async function apiRequest(method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    if (!token) throw buildError('unauthorized', 'unauthorized');
    if (!state.serverId) throw buildError('missing_server', 'missing_server');

    const base = ensureApiBase();
    if (!base) throw buildError('network_error', 'network_error');

    const endpoint = `${base}/api/servers/${encodeURIComponent(state.serverId)}/discord`;
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

  function handleError(err, { silent = false } = {}) {
    const code = err?.code || err?.message || 'api_error';
    if (code === 'unauthorized' || code === 'missing_server') {
      disableForm(true);
      if (!silent) setNotice(describeError(code), 'error');
      return;
    }
    if (code === 'network_error' || code === 'not_found' || code === 'not_supported' || code === 'db_error' || code === 'missing_fields' || code === 'missing_bot_token') {
      if (!silent) setNotice(describeError(code), 'error');
      if (code === 'not_found' || code === 'not_supported') disableForm(true);
      return;
    }
    if (!silent) setNotice(describeError(code), 'error');
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
      handleError(buildError('missing_server', 'missing_server'), { silent });
      return;
    }

    const activeServer = state.serverId;
    const token = ++state.refreshToken;

    const hasUnsavedChanges = Object.values(state.dirty || {}).some(Boolean);
    const shouldDisableForm = !silent || !hasUnsavedChanges;

    if (!silent) setNotice('Loading Discord integration…');
    if (shouldDisableForm) disableForm(true);

    try {
      const data = await apiRequest('GET');
      if (state.serverId !== activeServer || state.refreshToken !== token) return;
      applyIntegration(data.integration || null);
      updateStatusView(data.status || {});
      if (shouldDisableForm) disableForm(false);
      clearNotice();
    } catch (err) {
      if (state.serverId !== activeServer || state.refreshToken !== token) return;
      if (shouldDisableForm) disableForm(false);
      handleError(err, { silent });
    }
  }

  async function saveIntegration(event) {
    event?.preventDefault();
    if (!form) return;
    if (!state.serverId) {
      setNotice(describeError('missing_server'), 'error');
      return;
    }

    const payload = {
      botToken: tokenInput?.value?.trim() || '',
      guildId: guildInput?.value?.trim() || '',
      channelId: channelInput?.value?.trim() || ''
    };

    disableForm(true);
    setNotice('Saving Discord integration…');

    try {
      const data = await apiRequest('POST', payload);
      applyIntegration(data.integration || null, { force: true });
      updateStatusView(data.status || {});
      if (tokenInput) tokenInput.value = '';
      disableForm(false);
      setNotice('Discord integration saved.', 'success');
    } catch (err) {
      disableForm(false);
      handleError(err);
    }
  }

  async function removeIntegration() {
    if (!state.serverId) {
      setNotice(describeError('missing_server'), 'error');
      return;
    }
    if (!state.integration) {
      setNotice('No Discord integration is configured for this server.', 'error');
      return;
    }

    disableForm(true);
    setNotice('Removing Discord integration…');

    try {
      const data = await apiRequest('DELETE');
      applyIntegration(null, { force: true });
      updateStatusView(data.status || {});
      disableForm(false);
      setNotice('Discord integration removed.', 'success');
    } catch (err) {
      disableForm(false);
      handleError(err);
    }
  }

  function resetView() {
    applyIntegration(null, { force: true });
    updateStatusView({ presence: 'dnd', presenceLabel: 'Do Not Disturb' });
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
      disableForm(true);
      resetView();
      setNotice(describeError('missing_server'));
      return;
    }

    resetView();
    disableForm(true);
    setNotice('Loading Discord integration…');
    refresh().finally(() => {
      if (state.serverId === normalized) schedulePolling();
    });
  }

  if (form) form.addEventListener('submit', saveIntegration);
  if (removeBtn) removeBtn.addEventListener('click', removeIntegration);

  tokenInput?.addEventListener('input', () => setDirty('token', true));
  guildInput?.addEventListener('input', () => setDirty('guild', true));
  channelInput?.addEventListener('input', () => setDirty('channel', true));

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
      state.apiBase = sanitizeBase(base);
      if (state.serverId) refresh({ silent: true });
    }
  });

  // Initial selection priority: dataset -> preselected global -> missing_server
  if (serverIdFromDataset) {
    selectServer(serverIdFromDataset);
  } else if (typeof window !== 'undefined' && typeof window.__workspaceSelectedServer !== 'undefined') {
    selectServer(window.__workspaceSelectedServer);
  } else {
    disableForm(true);
    resetView();
    setNotice(describeError('missing_server'));
  }
})();
