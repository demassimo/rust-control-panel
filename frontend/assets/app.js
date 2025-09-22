(() => {
  const $ = (sel) => document.querySelector(sel);

  const serversEl = $('#servers');
  const consoleEl = $('#console');
  const playersEl = $('#players');
  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const userBox = $('#userBox');
  const loginError = $('#loginError');
  const registerInfo = $('#registerInfo');
  const registerForm = $('#registerForm');
  const registerError = $('#registerError');
  const registerSuccess = $('#registerSuccess');
  const btnRegister = $('#btnRegister');
  const userCard = $('#userCard');
  const userList = $('#userList');
  const userFeedback = $('#userFeedback');
  const btnSyncPlayers = $('#btnSyncPlayers');
  const btnRefreshServers = $('#btnRefreshServers');
  const btnClearConsole = $('#btnClearConsole');
  const btnAddServer = $('#btnAddServer');
  const svName = $('#svName');
  const svHost = $('#svHost');
  const svPort = $('#svPort');
  const svPass = $('#svPass');
  const svTLS = $('#svTLS');
  const btnSend = $('#btnSend');
  const cmdInput = $('#cmd');
  const apiBaseInput = $('#apiBase');
  const loginUsername = $('#username');
  const loginPassword = $('#password');
  const regUsername = $('#regUsername');
  const regPassword = $('#regPassword');
  const regConfirm = $('#regConfirm');
  const newUserName = $('#newUserName');
  const newUserPassword = $('#newUserPassword');
  const newUserRole = $('#newUserRole');
  const btnCreateUser = $('#btnCreateUser');

  const state = {
    API: '',
    TOKEN: localStorage.getItem('token') || '',
    currentUser: null,
    currentServerId: null,
    serverItems: new Map(),
    allowRegistration: false,
    statusTimer: null
  };

  let socket = null;

  const errorMessages = {
    invalid_login: 'Invalid username or password.',
    missing_fields: 'Please fill in all required fields.',
    invalid_username: 'Usernames must be 3-32 characters and can include letters, numbers, dashes, underscores or dots.',
    username_taken: 'That username is already taken.',
    weak_password: 'Passwords must be at least 8 characters long.',
    registration_disabled: 'Self-service registration is disabled.',
    db_error: 'A database error occurred. Please try again.',
    api_error: 'The server reported an error. Please try again.',
    network_error: 'Unable to reach the server. Check the API URL and your connection.',
    unauthorized: 'Your session expired. Please sign in again.',
    last_admin: 'You cannot remove the final administrator.',
    cannot_delete_self: 'You cannot remove your own account.'
  };

  function errorCode(err) {
    if (!err) return 'unknown_error';
    if (err instanceof Error) return err.message || 'unknown_error';
    return String(err);
  }

  function describeError(err) {
    const code = errorCode(err);
    return errorMessages[code] || code;
  }

  function showNotice(el, message, variant = 'error') {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'success', 'error');
    el.classList.add('notice');
    if (variant) el.classList.add(variant);
  }

  function hideNotice(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('success', 'error');
    el.textContent = '';
  }

  function setApiBase(value) {
    const trimmed = (value || '').trim().replace(/\/$/, '');
    if (!trimmed) return;
    state.API = trimmed;
    if (apiBaseInput) apiBaseInput.value = trimmed;
    localStorage.setItem('apiBase', trimmed);
    loadPublicConfig();
  }

  async function loadPublicConfig() {
    if (!state.API) return;
    try {
      const res = await fetch(state.API + '/api/public-config');
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json();
      state.allowRegistration = !!data.allowRegistration;
      updateRegisterUi();
    } catch {
      state.allowRegistration = false;
      updateRegisterUi('Unable to reach the server for registration info.');
    }
  }

  function updateRegisterUi(message) {
    const info = message || (state.allowRegistration ? 'Create your personal access below.' : 'Registration is disabled by the administrator.');
    registerInfo.textContent = info;
    if (state.allowRegistration) {
      registerForm.classList.remove('hidden');
      btnRegister?.removeAttribute('disabled');
    } else {
      registerForm.classList.add('hidden');
      btnRegister?.setAttribute('disabled', 'disabled');
    }
    hideNotice(registerError);
    hideNotice(registerSuccess);
  }

  function startStatusPolling() {
    stopStatusPolling();
    state.statusTimer = setInterval(() => {
      refreshServerStatuses().catch(() => {});
    }, 60000);
    refreshServerStatuses().catch(() => {});
  }

  function stopStatusPolling() {
    if (state.statusTimer) {
      clearInterval(state.statusTimer);
      state.statusTimer = null;
    }
  }

  function ensureSocket() {
    if (socket || !state.API) return socket;
    socket = io(state.API, { transports: ['websocket'] });
    socket.on('connect', () => {
      ui.log('Realtime link established.');
      if (state.currentServerId != null) socket.emit('join-server', state.currentServerId);
    });
    socket.on('disconnect', () => {
      ui.log('Realtime link lost.');
    });
    socket.on('status-map', (map) => applyStatusMap(map));
    socket.on('status', (status) => {
      if (status && typeof status.id !== 'undefined') updateServerStatus(status.id, status);
    });
    socket.on('console', (msg) => {
      if (msg?.Message) {
        ui.log(msg.Message.trim());
        if (/SteamID|players connected|id :/.test(msg.Message)) rebuildPlayers(msg.Message);
      }
    });
    socket.on('error', (err) => {
      const message = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      ui.log('Socket error: ' + message);
    });
    socket.on('connect_error', (err) => {
      const message = err?.message || 'connection error';
      ui.log('Socket connection error: ' + message);
    });
    return socket;
  }

  function disconnectSocket() {
    if (socket) {
      try { socket.disconnect(); } catch { /* ignore */ }
    }
    socket = null;
  }

  function highlightSelectedServer() {
    state.serverItems.forEach((entry, key) => {
      const active = Number(key) === state.currentServerId;
      entry.element.classList.toggle('active', active);
      if (entry.connectBtn) {
        entry.connectBtn.textContent = active ? 'Connected' : 'Connect';
        entry.connectBtn.disabled = active;
      }
    });
  }

  function updateServerStatus(id, status) {
    const key = String(id);
    const entry = state.serverItems.get(key);
    if (!entry) return;
    entry.status = status;
    const pill = entry.statusPill;
    const details = entry.statusDetails;
    if (!status) {
      pill.className = 'status-pill';
      pill.textContent = 'Unknown';
      pill.title = '';
      if (details) details.textContent = '';
      return;
    }
    const online = !!status.ok;
    const queued = status?.details?.queued ?? null;
    const players = status?.details?.players?.online ?? null;
    const maxPlayers = status?.details?.players?.max ?? null;
    const latency = typeof status.latency === 'number' ? status.latency : null;
    const lastCheck = status.lastCheck ? new Date(status.lastCheck).toLocaleTimeString() : null;

    let pillClass = 'status-pill';
    if (online) {
      if (queued && queued > 0) {
        pillClass += ' degraded';
        pill.textContent = 'Busy';
      } else {
        pillClass += ' online';
        pill.textContent = 'Online';
      }
    } else {
      pillClass += ' offline';
      pill.textContent = 'Offline';
    }
    pill.className = pillClass;
    pill.title = status?.details?.hostname || status?.error || '';

    if (details) {
      const parts = [];
      if (online && players != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        parts.push(`${players}${maxInfo} players`);
      }
      if (online && queued != null && queued > 0) parts.push(`${queued} queued`);
      if (latency != null) parts.push(`${latency} ms`);
      if (!online && status.error) parts.push(status.error);
      if (lastCheck) parts.push(`checked ${lastCheck}`);
      details.textContent = parts.join(' · ');
      details.title = status?.details?.raw || status?.error || '';
    }
  }

  function applyStatusMap(map) {
    if (!map || typeof map !== 'object') return;
    for (const [id, status] of Object.entries(map)) updateServerStatus(id, status);
  }

  async function fetchServerStatuses() {
    try {
      return await api('/api/servers/status');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
      } else {
        ui.log('Unable to load server status: ' + describeError(err));
      }
      return {};
    }
  }

  async function refreshServerStatuses() {
    const statuses = await fetchServerStatuses();
    applyStatusMap(statuses);
  }

  function renderServer(server, status) {
    const li = document.createElement('li');
    li.dataset.serverId = server.id;
    const heading = document.createElement('div');
    heading.className = 'server-heading';
    const titleBox = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = server.name;
    titleBox.appendChild(strong);
    const actions = document.createElement('div');
    actions.className = 'server-actions';
    const statusPill = document.createElement('span');
    statusPill.className = 'status-pill';
    statusPill.textContent = 'Checking…';
    const connectBtn = document.createElement('button');
    connectBtn.className = 'accent connect';
    connectBtn.textContent = 'Connect';
    connectBtn.onclick = () => connectServer(server.id);
    actions.appendChild(statusPill);
    actions.appendChild(connectBtn);
    heading.appendChild(titleBox);
    heading.appendChild(actions);
    const meta = document.createElement('div');
    meta.className = 'server-meta';
    const tlsLabel = server.tls ? ' · TLS' : '';
    meta.innerHTML = `<span>${server.host}:${server.port}${tlsLabel}</span><span>ID ${server.id}</span>`;
    const statusDetails = document.createElement('div');
    statusDetails.className = 'status-details';
    li.appendChild(heading);
    li.appendChild(meta);
    li.appendChild(statusDetails);
    serversEl.appendChild(li);
    state.serverItems.set(String(server.id), {
      element: li,
      statusPill,
      statusDetails,
      connectBtn,
      data: server,
      status: null
    });
    updateServerStatus(server.id, status);
  }

  async function refreshServers() {
    try {
      const list = await api('/api/servers');
      serversEl.innerHTML = '';
      state.serverItems.clear();
      const statuses = await fetchServerStatuses();
      for (const server of list) {
        const status = statuses?.[server.id] || statuses?.[String(server.id)];
        renderServer(server, status);
      }
      highlightSelectedServer();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
      } else {
        ui.log('Failed to load servers: ' + describeError(err));
      }
    }
  }

  function connectServer(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const previous = state.currentServerId;
    if (previous === numericId && socket?.connected) return;
    state.currentServerId = numericId;
    highlightSelectedServer();
    const entry = state.serverItems.get(String(numericId));
    const name = entry?.data?.name || `Server #${numericId}`;
    ui.clearConsole();
    ui.log(`Connecting to ${name}…`);
    const sock = ensureSocket();
    if (sock && sock.connected && previous != null && previous !== numericId) {
      sock.emit('leave-server', previous);
    }
    if (sock && sock.connected) {
      sock.emit('join-server', numericId);
    }
    loadPlayers().catch(() => {});
  }

  function rebuildPlayers(text) {
    playersEl.innerHTML = '';
    const lines = (text || '').split(/\r?\n/).filter(Boolean);
    for (const ln of lines) {
      const li = document.createElement('li');
      li.textContent = ln.trim();
      playersEl.appendChild(li);
    }
  }

  async function loadPlayers() {
    try {
      const list = await api('/api/players?limit=200');
      playersEl.innerHTML = '';
      for (const p of list) {
        const li = document.createElement('li');
        const left = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = p.persona || p.steamid;
        left.appendChild(name);
        const small = document.createElement('div');
        small.className = 'muted small';
        small.textContent = p.steamid;
        left.appendChild(small);
        const right = document.createElement('div');
        right.className = 'server-actions';
        if (p.country) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = p.country;
          right.appendChild(badge);
        }
        if (p.vac_banned) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'VAC';
          right.appendChild(badge);
        }
        li.appendChild(left);
        li.appendChild(right);
        playersEl.appendChild(li);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
      } else {
        ui.log('Players load failed: ' + describeError(err));
      }
    }
  }

  const ui = {
    showLogin() {
      loginPanel.classList.remove('hidden');
      appPanel.classList.add('hidden');
    },
    showApp() {
      loginPanel.classList.add('hidden');
      appPanel.classList.remove('hidden');
    },
    log(line) {
      const time = new Date().toLocaleTimeString();
      consoleEl.textContent += `[${time}] ${line}\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    },
    clearConsole() {
      consoleEl.textContent = '';
    },
    setUser(user) {
      userBox.innerHTML = '';
      if (!user) return;
      const wrap = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = user.username;
      wrap.appendChild(strong);
      if (user.role === 'admin') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Admin';
        wrap.appendChild(document.createTextNode(' '));
        wrap.appendChild(badge);
      }
      const btn = document.createElement('button');
      btn.textContent = 'Sign out';
      btn.onclick = () => logout();
      userBox.appendChild(wrap);
      userBox.appendChild(btn);
    }
  };

  function logout() {
    state.TOKEN = '';
    state.currentUser = null;
    state.currentServerId = null;
    stopStatusPolling();
    disconnectSocket();
    localStorage.removeItem('token');
    state.serverItems.clear();
    serversEl.innerHTML = '';
    playersEl.innerHTML = '';
    ui.clearConsole();
    ui.setUser(null);
    userCard.classList.add('hidden');
    hideNotice(userFeedback);
    ui.showLogin();
    loadPublicConfig();
  }

  function handleUnauthorized() {
    ui.log('Session expired. Please sign in again.');
    logout();
  }

  async function api(path, body = null, method = 'GET') {
    if (!state.TOKEN) throw new Error('unauthorized');
    const headers = { 'Authorization': 'Bearer ' + state.TOKEN };
    const opts = { method, headers };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(state.API + path, opts);
    } catch (err) {
      if (err instanceof TypeError) throw new Error('network_error');
      throw err;
    }
    let data = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) data = await res.json();
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) {
      const err = new Error(data?.error || 'api_error');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function publicJson(path, { method = 'GET', body = null } = {}) {
    const opts = { method };
    if (body !== null) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(state.API + path, opts);
    } catch (err) {
      if (err instanceof TypeError) throw new Error('network_error');
      throw err;
    }
    let data = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error || 'api_error');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function loadUsers() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    hideNotice(userFeedback);
    try {
      const list = await api('/api/users');
      userList.innerHTML = '';
      for (const user of list) {
        const li = document.createElement('li');
        const left = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = user.username;
        left.appendChild(strong);
        const meta = document.createElement('div');
        meta.className = 'muted small';
        meta.textContent = `Role: ${user.role}`;
        left.appendChild(meta);
        const right = document.createElement('div');
        right.className = 'server-actions';
        if (user.id === state.currentUser.id) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'You';
          right.appendChild(badge);
        } else {
          const roleBtn = document.createElement('button');
          roleBtn.className = 'ghost small';
          roleBtn.textContent = user.role === 'admin' ? 'Make user' : 'Promote to admin';
          roleBtn.onclick = async () => {
            try {
              await api(`/api/users/${user.id}`, { role: user.role === 'admin' ? 'user' : 'admin' }, 'PATCH');
              showNotice(userFeedback, 'Updated role for ' + user.username, 'success');
              loadUsers();
            } catch (err) {
              if (errorCode(err) === 'unauthorized') handleUnauthorized();
              else showNotice(userFeedback, describeError(err), 'error');
            }
          };
          const resetBtn = document.createElement('button');
          resetBtn.className = 'ghost small';
          resetBtn.textContent = 'Reset password';
          resetBtn.onclick = async () => {
            const newPass = prompt(`Enter a new password for ${user.username} (min 8 chars):`);
            if (!newPass) return;
            if (newPass.length < 8) {
              showNotice(userFeedback, 'Password must be at least 8 characters.', 'error');
              return;
            }
            try {
              await api(`/api/users/${user.id}/password`, { newPassword: newPass }, 'POST');
              showNotice(userFeedback, 'Password updated for ' + user.username, 'success');
            } catch (err) {
              if (errorCode(err) === 'unauthorized') handleUnauthorized();
              else showNotice(userFeedback, describeError(err), 'error');
            }
          };
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'ghost small';
          deleteBtn.textContent = 'Remove';
          deleteBtn.onclick = async () => {
            if (!confirm(`Remove ${user.username}? This cannot be undone.`)) return;
            try {
              await api(`/api/users/${user.id}`, null, 'DELETE');
              showNotice(userFeedback, 'Removed ' + user.username, 'success');
              loadUsers();
            } catch (err) {
              if (errorCode(err) === 'unauthorized') handleUnauthorized();
              else showNotice(userFeedback, describeError(err), 'error');
            }
          };
          right.appendChild(roleBtn);
          right.appendChild(resetBtn);
          right.appendChild(deleteBtn);
        }
        li.appendChild(left);
        li.appendChild(right);
        userList.appendChild(li);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userFeedback, describeError(err), 'error');
    }
  }

  function toggleUserCard() {
    if (state.currentUser?.role === 'admin') {
      userCard.classList.remove('hidden');
      loadUsers();
    } else {
      userCard.classList.add('hidden');
      userList.innerHTML = '';
    }
  }

  async function attemptSessionResume() {
    if (!state.TOKEN) {
      ui.showLogin();
      return;
    }
    try {
      const me = await api('/api/me');
      state.currentUser = me;
      ui.setUser(me);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      await loadPlayers();
      toggleUserCard();
      startStatusPolling();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        logout();
      } else {
        ui.log('Session restore failed: ' + describeError(err));
        logout();
      }
    }
  }

  async function handleLogin() {
    hideNotice(loginError);
    const base = apiBaseInput?.value;
    if (base) setApiBase(base);
    const username = loginUsername?.value.trim();
    const password = loginPassword?.value || '';
    if (!username || !password) {
      showNotice(loginError, describeError('missing_fields'), 'error');
      return;
    }
    try {
      const data = await publicJson('/api/login', { method: 'POST', body: { username, password } });
      state.TOKEN = data.token;
      localStorage.setItem('token', state.TOKEN);
      state.currentUser = { id: data.id, username: data.username, role: data.role };
      ui.setUser(state.currentUser);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      await loadPlayers();
      toggleUserCard();
      startStatusPolling();
    } catch (err) {
      showNotice(loginError, describeError(err), 'error');
    }
  }

  async function handleRegister() {
    hideNotice(registerError);
    hideNotice(registerSuccess);
    if (!state.allowRegistration) {
      showNotice(registerError, describeError('registration_disabled'), 'error');
      return;
    }
    const username = regUsername?.value.trim();
    const password = regPassword?.value || '';
    const confirm = regConfirm?.value || '';
    if (!username || !password || !confirm) {
      showNotice(registerError, describeError('missing_fields'), 'error');
      return;
    }
    if (password !== confirm) {
      showNotice(registerError, 'Passwords do not match.', 'error');
      return;
    }
    try {
      await publicJson('/api/register', { method: 'POST', body: { username, password } });
      showNotice(registerSuccess, 'Account created. You can now sign in.', 'success');
      if (loginUsername) loginUsername.value = username;
      if (loginPassword) loginPassword.value = '';
      if (regPassword) regPassword.value = '';
      if (regConfirm) regConfirm.value = '';
    } catch (err) {
      showNotice(registerError, describeError(err), 'error');
    }
  }

  async function addServer() {
    const name = svName?.value.trim();
    const host = svHost?.value.trim();
    const port = parseInt(svPort?.value || '0', 10);
    const password = svPass?.value.trim();
    const useTls = !!svTLS?.checked;
    if (!name || !host || !port || !password) {
      ui.log('Please fill in all server fields before adding.');
      return;
    }
    try {
      await api('/api/servers', { name, host, port, password, tls: useTls }, 'POST');
      ui.log('Server added: ' + name);
      if (svName) svName.value = '';
      if (svHost) svHost.value = '';
      if (svPort) svPort.value = '28017';
      if (svPass) svPass.value = '';
      if (svTLS) svTLS.checked = false;
      await refreshServers();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to add server: ' + describeError(err));
    }
  }

  async function sendCommand() {
    const cmd = cmdInput?.value.trim();
    if (!cmd) return;
    if (state.currentServerId == null) {
      ui.log('Select a server before sending commands.');
      return;
    }
    try {
      const reply = await api(`/api/rcon/${state.currentServerId}`, { cmd }, 'POST');
      ui.log('> ' + cmd);
      if (reply?.Message) ui.log(reply.Message.trim());
      cmdInput.value = '';
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Command failed: ' + describeError(err));
    }
  }

  async function syncFromSteam() {
    const raw = prompt('Enter comma-separated Steam64 IDs to sync:');
    if (!raw) return;
    const steamids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (steamids.length === 0) return;
    try {
      const res = await api('/api/steam/sync', { steamids }, 'POST');
      ui.log('Synced ' + res.updated + ' players from Steam');
      await loadPlayers();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Sync failed: ' + describeError(err));
    }
  }

  function setupQuickButtons() {
    document.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!cmdInput) return;
        cmdInput.value = btn.getAttribute('data-quick') || '';
        cmdInput.focus();
      });
    });
  }

  function bindEvents() {
    $('#btnLogin')?.addEventListener('click', handleLogin);
    btnRegister?.addEventListener('click', handleRegister);
    btnAddServer?.addEventListener('click', addServer);
    btnSend?.addEventListener('click', sendCommand);
    cmdInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommand();
      }
    });
    btnRefreshServers?.addEventListener('click', () => refreshServers());
    btnClearConsole?.addEventListener('click', () => ui.clearConsole());
    btnSyncPlayers?.addEventListener('click', syncFromSteam);
    btnCreateUser?.addEventListener('click', async () => {
      if (state.currentUser?.role !== 'admin') return;
      hideNotice(userFeedback);
      const username = newUserName?.value.trim();
      const password = newUserPassword?.value || '';
      const role = newUserRole?.value || 'user';
      if (!username || !password) {
        showNotice(userFeedback, describeError('missing_fields'), 'error');
        return;
      }
      if (password.length < 8) {
        showNotice(userFeedback, describeError('weak_password'), 'error');
        return;
      }
      try {
        await api('/api/users', { username, password, role }, 'POST');
        showNotice(userFeedback, 'Created user ' + username, 'success');
        if (newUserName) newUserName.value = '';
        if (newUserPassword) newUserPassword.value = '';
        if (newUserRole) newUserRole.value = 'user';
        loadUsers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        else showNotice(userFeedback, describeError(err), 'error');
      }
    });
    apiBaseInput?.addEventListener('change', (e) => setApiBase(e.target.value));
    apiBaseInput?.addEventListener('blur', (e) => setApiBase(e.target.value));
  }

  async function init() {
    const storedBase = localStorage.getItem('apiBase') || apiBaseInput?.value || 'http://localhost:8787';
    setApiBase(storedBase || 'http://localhost:8787');
    bindEvents();
    setupQuickButtons();
    if (state.TOKEN) {
      await attemptSessionResume();
    } else {
      ui.showLogin();
    }
  }

  init();
})();
