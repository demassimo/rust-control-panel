(() => {
  const settingsRoot = document.getElementById('discord-settings');
  const serverId = document.body?.dataset?.serverId;
  if (!settingsRoot || !serverId) return;

  const API_BASE = typeof window !== 'undefined' && window.API_BASE
    ? String(window.API_BASE).replace(/\/+$/g, '')
    : '';
  const endpoint = `${API_BASE}/api/servers/${encodeURIComponent(serverId)}/discord`;

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

  const state = {
    integration: null,
    pollTimer: null
  };

  function buildError(message, code) {
    const err = new Error(message || code || 'api_error');
    if (code) err.code = code;
    return err;
  }

  function setNotice(message, variant = 'info') {
    if (!noticeEl) return;
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
    const elements = form.querySelectorAll('input, button');
    elements.forEach((el) => { el.disabled = !!disabled; });
    if (removeBtn) removeBtn.disabled = !!disabled || !state.integration;
  }

  function updateBadge(presenceLabel, presence) {
    if (!badgeEl) return;
    const status = presence === 'online' ? 'online' : 'offline';
    badgeEl.textContent = presenceLabel || (status === 'online' ? 'Online' : 'Do Not Disturb');
    badgeEl.classList.remove('success', 'offline');
    if (status === 'online') badgeEl.classList.add('success');
    else badgeEl.classList.add('offline');
  }

  function updateStatusView(status = {}) {
    const players = Number(status?.players?.current);
    const maxPlayers = Number(status?.players?.max);
    const joining = Number(status?.joining);
    if (playersEl) playersEl.textContent = Number.isFinite(players) && players >= 0 ? String(players) : '0';
    if (maxPlayersEl) {
      if (Number.isFinite(maxPlayers) && maxPlayers >= 0) maxPlayersEl.textContent = String(maxPlayers);
      else maxPlayersEl.textContent = '—';
    }
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

  function applyIntegration(integration) {
    state.integration = integration;
    if (guildInput) guildInput.value = integration?.guildId || '';
    if (channelInput) channelInput.value = integration?.channelId || '';
    if (tokenInput) {
      tokenInput.value = '';
      tokenInput.placeholder = integration?.hasToken
        ? 'Token stored — enter to replace'
        : 'Paste bot token';
    }
    if (removeBtn) removeBtn.disabled = !integration;
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
      default:
        return 'An unexpected error occurred while updating Discord integration.';
    }
  }

  async function apiRequest(method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw buildError('unauthorized', 'unauthorized');
    }
    const headers = { 'Authorization': 'Bearer ' + token };
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
      try { payload = await response.json(); }
      catch { payload = null; }
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
    if (code === 'unauthorized') {
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

  async function refresh(options = {}) {
    const { silent = false } = options;
    try {
      if (!silent) setNotice('Loading Discord integration…');
      const data = await apiRequest('GET');
      applyIntegration(data.integration || null);
      updateStatusView(data.status || {});
      disableForm(false);
      clearNotice();
    } catch (err) {
      handleError(err, { silent });
    }
  }

  async function saveIntegration(event) {
    event?.preventDefault();
    if (!form) return;
    const payload = {
      botToken: tokenInput?.value?.trim() || '',
      guildId: guildInput?.value?.trim() || '',
      channelId: channelInput?.value?.trim() || ''
    };
    disableForm(true);
    setNotice('Saving Discord integration…');
    try {
      const data = await apiRequest('POST', payload);
      applyIntegration(data.integration || null);
      updateStatusView(data.status || {});
      if (tokenInput) tokenInput.value = '';
      setNotice('Discord integration saved.', 'success');
      disableForm(false);
    } catch (err) {
      disableForm(false);
      handleError(err);
    }
  }

  async function removeIntegration() {
    if (!state.integration) {
      setNotice('No Discord integration is configured for this server.', 'error');
      return;
    }
    disableForm(true);
    setNotice('Removing Discord integration…');
    try {
      const data = await apiRequest('DELETE');
      applyIntegration(null);
      updateStatusView(data.status || {});
      setNotice('Discord integration removed.', 'success');
      disableForm(false);
    } catch (err) {
      disableForm(false);
      handleError(err);
    }
  }

  function schedulePolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      refresh({ silent: true });
    }, 15000);
  }

  if (form) form.addEventListener('submit', saveIntegration);
  if (removeBtn) removeBtn.addEventListener('click', removeIntegration);
  window.addEventListener('beforeunload', () => {
    if (state.pollTimer) clearInterval(state.pollTimer);
  });

  refresh().finally(() => {
    schedulePolling();
  });
})();
