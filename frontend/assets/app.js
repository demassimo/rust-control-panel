(() => {
  const $ = (sel) => document.querySelector(sel);

  const serversEl = $('#servers');
  const consoleEl = $('#console');
  const moduleColumn = $('#moduleColumn');
  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const userBox = $('#userBox');
  const mainNav = $('#mainNav');
  const navDashboard = $('#navDashboard');
  const navSettings = $('#navSettings');
  const dashboardPanel = $('#dashboardPanel');
  const workspacePanel = $('#workspacePanel');
  const settingsPanel = $('#settingsPanel');
  const loginError = $('#loginError');
  const registerInfo = $('#registerInfo');
  const registerForm = $('#registerForm');
  const registerError = $('#registerError');
  const registerSuccess = $('#registerSuccess');
  const btnRegister = $('#btnRegister');
  const userCard = $('#userCard');
  const userList = $('#userList');
  const userFeedback = $('#userFeedback');
  const btnRefreshServers = $('#btnRefreshServers');
  const btnClearConsole = $('#btnClearConsole');
  const btnAddServer = $('#btnAddServer');
  const addServerPrompt = $('#addServerPrompt');
  const svName = $('#svName');
  const svHost = $('#svHost');
  const svPort = $('#svPort');
  const svPass = $('#svPass');
  const svTLS = $('#svTLS');
  const btnSend = $('#btnSend');
  const cmdInput = $('#cmd');
  const loginUsername = $('#username');
  const loginPassword = $('#password');
  const btnLogin = $('#btnLogin');
  const regUsername = $('#regUsername');
  const regPassword = $('#regPassword');
  const regConfirm = $('#regConfirm');
  const newUserName = $('#newUserName');
  const newUserPassword = $('#newUserPassword');
  const newUserRole = $('#newUserRole');
  const btnCreateUser = $('#btnCreateUser');
  const quickCommandsEl = $('#quickCommands');
  const rustMapsKeyInput = $('#rustMapsKey');
  const btnSaveSettings = $('#btnSaveSettings');
  const settingsStatus = $('#settingsStatus');
  const serversEmpty = $('#serversEmpty');
  const addServerCard = $('#addServerCard');
  const welcomeName = $('#welcomeName');
  const profileMenuTrigger = $('#profileMenuTrigger');
  const brandAccount = $('.brand-account');
  const workspaceName = $('#workspaceServerName');
  const workspaceMeta = $('#workspaceServerMeta');
  const workspaceStatus = $('#workspaceStatus');
  const workspacePlayers = $('#workspacePlayers');
  const workspaceQueue = $('#workspaceQueue');
  const btnBackToDashboard = $('#btnBackToDashboard');
  const profileUsername = $('#profileUsername');
  const profileRole = $('#profileRole');

  const state = {
    API: '',
    TOKEN: localStorage.getItem('token') || '',
    currentUser: null,
    currentServerId: null,
    serverItems: new Map(),
    allowRegistration: false,
    statusTimer: null,
    settings: {},
    activePanel: 'dashboard'
  };

  let socket = null;
  let addServerPinned = false;

  function setProfileMenuOpen(open) {
    if (!userBox) return;
    const active = !!open;
    userBox.classList.toggle('hidden', !active);
    userBox.setAttribute('aria-hidden', active ? 'false' : 'true');
    profileMenuTrigger?.setAttribute('aria-expanded', active ? 'true' : 'false');
    brandAccount?.classList.toggle('menu-open', active);
    if (active) {
      requestAnimationFrame(() => {
        const focusTarget = userBox.querySelector('button');
        focusTarget?.focus();
      });
    }
  }

  function toggleProfileMenu(force) {
    if (!userBox) return;
    const shouldOpen = typeof force === 'boolean' ? force : userBox.classList.contains('hidden');
    setProfileMenuOpen(shouldOpen);
  }

  function closeProfileMenu() {
    setProfileMenuOpen(false);
  }

  function setAddServerPromptState(open) {
    if (!addServerPrompt) return;
    const active = !!open;
    addServerPrompt.setAttribute('aria-expanded', active ? 'true' : 'false');
    addServerPrompt.classList.toggle('open', active);
  }

  const moduleBus = (() => {
    const listeners = new Map();
    return {
      on(event, handler) {
        if (!event || typeof handler !== 'function') return () => {};
        if (!listeners.has(event)) listeners.set(event, new Set());
        const set = listeners.get(event);
        set.add(handler);
        return () => set.delete(handler);
      },
      emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        for (const fn of [...set]) {
          try { fn(payload); }
          catch (err) { console.error('Module handler error for', event, err); }
        }
      }
    };
  })();

  const quickCommands = new Map();

  function setQuickInput(value) {
    if (!cmdInput) return;
    cmdInput.value = value || '';
    cmdInput.focus();
  }

  function renderQuickCommands() {
    if (!quickCommandsEl) return;
    quickCommandsEl.innerHTML = '';
    const items = [...quickCommands.values()].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 100;
      const orderB = typeof b.order === 'number' ? b.order : 100;
      if (orderA !== orderB) return orderA - orderB;
      return (a.label || '').localeCompare(b.label || '');
    });
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = item.className || 'ghost';
      btn.textContent = item.label || item.command || item.id;
      if (item.description) btn.title = item.description;
      btn.addEventListener('click', () => {
        if (typeof item.onClick === 'function') {
          item.onClick({
            setInput: setQuickInput,
            run: runRconCommand,
            command: item.command,
            send: runRconCommand
          });
        } else if (item.command) {
          setQuickInput(item.command);
        }
      });
      quickCommandsEl.appendChild(btn);
    }
  }

  function registerQuickCommand(definition) {
    if (!definition) return () => {};
    const id = definition.id || definition.command || `cmd-${quickCommands.size + 1}`;
    const normalized = {
      id,
      label: definition.label || definition.command || id,
      command: definition.command || '',
      description: definition.description || '',
      order: typeof definition.order === 'number' ? definition.order : 100,
      className: definition.className || 'ghost',
      onClick: typeof definition.onClick === 'function' ? definition.onClick : null
    };
    quickCommands.set(id, normalized);
    renderQuickCommands();
    return () => {
      quickCommands.delete(id);
      renderQuickCommands();
    };
  }

  registerQuickCommand({ id: 'cmd-status', label: 'status', command: 'status', order: 10 });
  registerQuickCommand({ id: 'cmd-serverinfo', label: 'serverinfo', command: 'serverinfo', order: 20 });
  registerQuickCommand({ id: 'cmd-say', label: 'say', command: 'say "Hello from panel"', order: 30 });
  registerQuickCommand({ id: 'cmd-playerlist', label: 'playerlist', command: 'playerlist', order: 40 });

  function switchPanel(panel = 'dashboard') {
    state.activePanel = panel;
    if (panel === 'settings') {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.remove('hidden');
      navSettings?.classList.add('active');
      navDashboard?.classList.remove('active');
    } else {
      dashboardPanel?.classList.remove('hidden');
      if (panel !== 'dashboard') workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      navDashboard?.classList.add('active');
      navSettings?.classList.remove('active');
    }
    if (panel !== 'settings') hideNotice(settingsStatus);
  }

  function createModuleCard({ id, title, icon } = {}) {
    if (!moduleColumn) throw new Error('Module mount element missing');
    const card = document.createElement('div');
    card.className = 'card module-card';
    if (id) card.dataset.moduleId = id;
    const header = document.createElement('div');
    header.className = 'card-header';
    const heading = document.createElement('h3');
    heading.textContent = title || id || 'Module';
    if (icon) heading.prepend(icon + ' ');
    const actions = document.createElement('div');
    actions.className = 'module-header-actions';
    header.appendChild(heading);
    header.appendChild(actions);
    const body = document.createElement('div');
    body.className = 'module-body';
    card.appendChild(header);
    card.appendChild(body);
    moduleColumn.appendChild(card);
    return {
      card,
      header,
      body,
      actions,
      setTitle(value) { heading.textContent = value || ''; },
      remove() { card.remove(); }
    };
  }

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
    cannot_delete_self: 'You cannot remove your own account.',
    rustmaps_api_key_missing: 'Add your RustMaps API key in Settings to enable the live map.',
    rustmaps_unauthorized: 'RustMaps rejected the configured API key. Double-check it in Settings.',
    rustmaps_not_found: 'RustMaps has not published a generated map for this seed yet.',
    rustmaps_error: 'RustMaps responded with an unexpected error.',
    rustmaps_image_error: 'RustMaps returned an invalid map image.',
    live_map_failed: 'Unable to load the live map right now.',
    playerlist_failed: 'The server did not return a live player list.',
    missing_command: 'Provide a command before sending.',
    no_server_selected: 'Select a server before sending commands.',
    invalid_payload: 'The request payload was not accepted.',
    missing_image: 'Choose an image before uploading.',
    invalid_image: 'The selected image could not be processed.',
    image_too_large: 'The image is too large. Please upload a file under 20 MB.',
    map_upload_failed: 'Uploading the map image failed. Please try again.'
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
    localStorage.setItem('apiBase', trimmed);
    loadPublicConfig();
  }

  function detectDefaultApiBase() {
    const stored = localStorage.getItem('apiBase');
    if (stored) return stored;
    const meta = document.querySelector('meta[name="panel-api-base"]')?.content?.trim();
    if (meta) return meta;
    try {
      const { protocol, hostname } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:8787`;
      }
      return window.location.origin;
    } catch {
      return 'http://localhost:8787';
    }
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

  function createServerStat(icon, label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'server-stat';
    const iconEl = document.createElement('span');
    iconEl.className = 'stat-icon';
    iconEl.textContent = icon;
    const content = document.createElement('div');
    const value = document.createElement('strong');
    value.textContent = '--';
    const caption = document.createElement('span');
    caption.textContent = label;
    content.appendChild(value);
    content.appendChild(caption);
    wrapper.appendChild(iconEl);
    wrapper.appendChild(content);
    return { element: wrapper, value };
  }

  function showAddServerCard(options = {}) {
    if (!addServerCard) return;
    const pinned = !!options.pinned;
    if (pinned) addServerPinned = true;
    addServerCard.classList.remove('hidden');
    setAddServerPromptState(true);
    if (svName) svName.focus();
  }

  function hideAddServerCard(options = {}) {
    if (!addServerCard) return;
    if (!options.force && addServerPinned) return;
    addServerCard.classList.add('hidden');
    if (options.force) addServerPinned = false;
    if (!addServerPinned) setAddServerPromptState(false);
  }

  function toggleAddServerCardVisibility() {
    if (!addServerCard) return;
    const willOpen = addServerCard.classList.contains('hidden');
    addServerPinned = willOpen;
    addServerCard.classList.toggle('hidden', !willOpen);
    setAddServerPromptState(willOpen);
    if (willOpen && svName) svName.focus();
  }

  function leaveCurrentServer(reason = 'close') {
    const previous = state.currentServerId;
    if (previous == null) return;
    if (socket?.connected) {
      try { socket.emit('leave-server', previous); }
      catch { /* ignore */ }
    }
    moduleBus.emit('server:disconnected', { serverId: previous, reason });
    state.currentServerId = null;
    highlightSelectedServer();
  }

  function updateWorkspaceDisplay(entry) {
    if (!entry || state.currentServerId == null) return;
    const numericId = Number(entry.data?.id ?? entry.data);
    if (!Number.isFinite(numericId) || numericId !== state.currentServerId) return;
    const server = entry.data || {};
    if (workspaceName) workspaceName.textContent = server.name || `Server #${numericId}`;
    if (workspaceMeta) {
      const tlsLabel = server.tls ? ' · TLS' : '';
      workspaceMeta.textContent = server.host ? `${server.host}:${server.port}${tlsLabel}` : '';
    }
    const status = entry.status;
    const pill = workspaceStatus;
    const players = status?.details?.players?.online ?? null;
    const maxPlayers = status?.details?.players?.max ?? null;
    const queued = status?.details?.queued ?? null;
    const online = !!status?.ok;
    if (pill) {
      let cls = 'status-pill';
      if (online) {
        if (queued && queued > 0) {
          cls += ' degraded';
          pill.textContent = 'Busy';
        } else {
          cls += ' online';
          pill.textContent = 'Online';
        }
      } else {
        cls += ' offline';
        pill.textContent = 'Offline';
      }
      pill.className = cls;
      pill.title = status?.details?.hostname || status?.error || '';
    }
    if (workspacePlayers) {
      if (online && players != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        workspacePlayers.textContent = `${players}${maxInfo}`;
      } else {
        workspacePlayers.textContent = '--';
      }
    }
    if (workspaceQueue) {
      workspaceQueue.textContent = queued != null && queued > 0 ? String(queued) : (online ? '0' : '--');
    }
  }

  function showWorkspaceForServer(id) {
    const entry = state.serverItems.get(String(id));
    if (!entry) return;
    dashboardPanel?.classList.add('hidden');
    settingsPanel?.classList.add('hidden');
    workspacePanel?.classList.remove('hidden');
    updateWorkspaceDisplay(entry);
  }

  function hideWorkspace(reason = 'close') {
    workspacePanel?.classList.add('hidden');
    dashboardPanel?.classList.remove('hidden');
    settingsPanel?.classList.add('hidden');
    leaveCurrentServer(reason);
    ui.clearConsole();
    if (workspaceName) workspaceName.textContent = 'Select a server';
    if (workspaceMeta) workspaceMeta.textContent = 'Pick a server card to inspect live data.';
    if (workspacePlayers) workspacePlayers.textContent = '--';
    if (workspaceQueue) workspaceQueue.textContent = '--';
    if (workspaceStatus) {
      workspaceStatus.className = 'status-pill';
      workspaceStatus.textContent = 'offline';
      workspaceStatus.title = '';
    }
  }

  function ensureSocket() {
    if (socket || !state.API) return socket;
    socket = io(state.API, { transports: ['websocket'] });
    socket.on('connect', () => {
      ui.log('Realtime link established.');
      if (state.currentServerId != null) socket.emit('join-server', state.currentServerId);
      refreshServerStatuses().catch(() => {});
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
        moduleBus.emit('console:message', { serverId: state.currentServerId, message: msg });
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
      if (entry.element) {
        entry.element.classList.toggle('active', active);
        entry.element.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
  }

  function updateServerStatus(id, status) {
    const key = String(id);
    const entry = state.serverItems.get(key);
    if (!entry) return;
    entry.status = status || null;
    const pill = entry.statusPill;
    const details = entry.statusDetails;
    const playersEl = entry.playersValue;
    const queueEl = entry.queueValue;
    if (!status) {
      if (pill) {
        pill.className = 'status-pill';
        pill.textContent = 'Unknown';
        pill.title = '';
      }
      if (details) details.textContent = '';
      if (playersEl) playersEl.textContent = '--';
      if (queueEl) queueEl.textContent = '--';
      updateWorkspaceDisplay(entry);
      return;
    }
    const online = !!status.ok;
    const queued = status?.details?.queued ?? null;
    const players = status?.details?.players?.online ?? null;
    const maxPlayers = status?.details?.players?.max ?? null;
    const lastCheck = status.lastCheck ? new Date(status.lastCheck).toLocaleTimeString() : null;

    if (pill) {
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
    }

    if (playersEl) {
      if (online && players != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        playersEl.textContent = `${players}${maxInfo}`;
      } else {
        playersEl.textContent = '--';
      }
    }
    if (queueEl) {
      queueEl.textContent = queued != null && queued > 0 ? String(queued) : (online ? '0' : '--');
    }
    if (details) {
      const parts = [];
      if (online && players != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        parts.push(`${players}${maxInfo} players`);
      }
      if (online && queued != null && queued > 0) parts.push(`${queued} queued`);
      if (!online && status.error) parts.push(status.error);
      if (lastCheck) parts.push(`checked ${lastCheck}`);
      details.textContent = parts.join(' · ');
      details.title = status?.details?.raw || status?.error || '';
    }
    updateWorkspaceDisplay(entry);
    moduleBus.emit('server:status', { serverId: Number(id), status });
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
    const entry = { data: { ...server }, status: null };
    const card = document.createElement('div');
    card.className = 'server-card';
    card.dataset.serverId = server.id;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const mainRow = document.createElement('div');
    mainRow.className = 'server-card-main';

    const head = document.createElement('div');
    head.className = 'server-card-head';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'server-card-title';
    const nameEl = document.createElement('h3');
    nameEl.textContent = server.name;
    const metaEl = document.createElement('div');
    metaEl.className = 'server-card-meta';
    const tlsLabel = server.tls ? ' · TLS' : '';
    metaEl.textContent = `${server.host}:${server.port}${tlsLabel}`;
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(metaEl);
    const statusPill = document.createElement('span');
    statusPill.className = 'status-pill';
    statusPill.textContent = 'Checking…';
    head.appendChild(titleWrap);
    head.appendChild(statusPill);

    const stats = document.createElement('div');
    stats.className = 'server-card-stats';
    const playersStat = createServerStat('👥', 'Players');
    const queueStat = createServerStat('⏳', 'Queue');
    stats.appendChild(playersStat.element);
    stats.appendChild(queueStat.element);

    mainRow.appendChild(head);
    mainRow.appendChild(stats);

    const foot = document.createElement('div');
    foot.className = 'server-card-foot';
    const details = document.createElement('div');
    details.className = 'server-card-details';
    const actions = document.createElement('div');
    actions.className = 'server-card-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ghost small';
    editBtn.textContent = 'Edit server';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'accent small';
    openBtn.textContent = 'Open workspace';
    openBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      connectServer(server.id);
    });
    actions.appendChild(editBtn);
    actions.appendChild(openBtn);
    foot.appendChild(details);
    foot.appendChild(actions);

    const editForm = document.createElement('form');
    editForm.className = 'server-card-edit hidden';
    editForm.id = `server-edit-${server.id}`;
    editBtn.setAttribute('aria-controls', editForm.id);
    editBtn.setAttribute('aria-expanded', 'false');
    const formGrid = document.createElement('div');
    formGrid.className = 'grid2 stack-sm';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Name';
    const hostInput = document.createElement('input');
    hostInput.placeholder = 'Host/IP';
    const portInput = document.createElement('input');
    portInput.type = 'number';
    portInput.min = '1';
    portInput.placeholder = 'RCON Port';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Leave blank to keep current password';
    formGrid.appendChild(nameInput);
    formGrid.appendChild(hostInput);
    formGrid.appendChild(portInput);
    formGrid.appendChild(passwordInput);
    const tlsCheckboxLabel = document.createElement('label');
    tlsCheckboxLabel.className = 'inline';
    const tlsInput = document.createElement('input');
    tlsInput.type = 'checkbox';
    tlsCheckboxLabel.appendChild(tlsInput);
    tlsCheckboxLabel.appendChild(document.createTextNode(' Use TLS (wss)'));
    const formRow = document.createElement('div');
    formRow.className = 'row';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'accent';
    saveBtn.textContent = 'Save changes';
    formRow.appendChild(cancelBtn);
    formRow.appendChild(saveBtn);
    const feedback = document.createElement('p');
    feedback.className = 'server-edit-feedback hidden';
    editForm.appendChild(formGrid);
    editForm.appendChild(tlsCheckboxLabel);
    editForm.appendChild(formRow);
    editForm.appendChild(feedback);

    function showFeedback(message = '', variant = '') {
      feedback.textContent = message;
      feedback.classList.remove('hidden', 'error', 'success');
      if (!message) {
        feedback.classList.add('hidden');
        return;
      }
      if (variant) feedback.classList.add(variant);
    }

    function resetEditInputs() {
      const data = entry.data || {};
      nameInput.value = data.name || '';
      hostInput.value = data.host || '';
      portInput.value = data.port != null ? String(data.port) : '';
      tlsInput.checked = !!data.tls;
      passwordInput.value = '';
    }

    let editOpen = false;
    function toggleEdit(force) {
      const next = typeof force === 'boolean' ? force : !editOpen;
      if (next === editOpen) return;
      editOpen = next;
      if (next) {
        resetEditInputs();
        showFeedback('');
        editForm.classList.remove('hidden');
        editBtn.textContent = 'Close editor';
        editBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('editing');
        nameInput.focus();
      } else {
        editForm.classList.add('hidden');
        editBtn.textContent = 'Edit server';
        resetEditInputs();
        editBtn.setAttribute('aria-expanded', 'false');
        card.classList.remove('editing');
      }
    }

    cancelBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      showFeedback('');
      toggleEdit(false);
    });

    editBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!editOpen) {
        toggleEdit(true);
      } else {
        toggleEdit(false);
      }
      ev.stopImmediatePropagation();
    });

    editForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = nameInput.value.trim();
      const host = hostInput.value.trim();
      const port = parseInt(portInput.value || '0', 10);
      const password = passwordInput.value.trim();
      const useTls = !!tlsInput.checked;
      if (!name || !host || !Number.isFinite(port) || port <= 0) {
        showFeedback(describeError('missing_fields'), 'error');
        return;
      }
      const payload = { name, host, port, tls: useTls };
      if (password) payload.password = password;
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      showFeedback('Saving…');
      try {
        await api(`/api/servers/${server.id}`, payload, 'PATCH');
        entry.data = { ...entry.data, name, host, port, tls: useTls ? 1 : 0 };
        nameEl.textContent = name;
        metaEl.textContent = `${host}:${port}${useTls ? ' · TLS' : ''}`;
        ui.log('Server updated: ' + name);
        showFeedback('Saved.', 'success');
        setTimeout(() => toggleEdit(false), 700);
      } catch (err) {
        if (errorCode(err) === 'unauthorized') {
          handleUnauthorized();
        } else {
          showFeedback(describeError(err), 'error');
        }
      } finally {
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        passwordInput.value = '';
      }
    });

    card.addEventListener('click', (ev) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (target && (target.closest('.server-card-actions') || target.closest('.server-card-edit'))) {
        return;
      }
      if (editOpen) return;
      connectServer(server.id);
    });

    card.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === card) {
        ev.preventDefault();
        connectServer(server.id);
      }
    });

    card.appendChild(mainRow);
    card.appendChild(foot);
    card.appendChild(editForm);
    if (addServerPrompt && addServerPrompt.parentElement === serversEl) {
      serversEl.insertBefore(card, addServerPrompt);
    } else {
      serversEl.appendChild(card);
    }

    entry.element = card;
    entry.statusPill = statusPill;
    entry.statusDetails = details;
    entry.playersValue = playersStat.value;
    entry.queueValue = queueStat.value;
    entry.toggleEdit = toggleEdit;
    entry.nameEl = nameEl;
    entry.metaEl = metaEl;
    state.serverItems.set(String(server.id), entry);

    updateServerStatus(server.id, status);
  }

  async function refreshServers() {
    try {
      const list = await api('/api/servers');
      serversEl.innerHTML = '';
      state.serverItems.clear();
      if (addServerPrompt) {
        serversEl.appendChild(addServerPrompt);
        setAddServerPromptState(addServerCard && !addServerCard.classList.contains('hidden'));
      }
      const statuses = await fetchServerStatuses();
      for (const server of list) {
        const status = statuses?.[server.id] || statuses?.[String(server.id)];
        renderServer(server, status);
      }
      const hasServers = list.length > 0;
      serversEmpty?.classList.toggle('hidden', hasServers);
      if (!hasServers) {
        showAddServerCard();
      } else if (!addServerPinned) {
        hideAddServerCard();
      }
      highlightSelectedServer();
      moduleBus.emit('servers:updated', { servers: list });
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
    const entry = state.serverItems.get(String(numericId));
    if (!entry) return;
    const previous = state.currentServerId;
    if (previous === numericId) {
      showWorkspaceForServer(numericId);
      updateWorkspaceDisplay(entry);
      return;
    }
    if (previous != null && previous !== numericId) {
      if (socket?.connected) {
        try { socket.emit('leave-server', previous); }
        catch { /* ignore */ }
      }
      moduleBus.emit('server:disconnected', { serverId: previous, reason: 'switch' });
    }
    state.currentServerId = numericId;
    highlightSelectedServer();
    ui.clearConsole();
    const name = entry?.data?.name || `Server #${numericId}`;
    ui.log(`Connecting to ${name}…`);
    const sock = ensureSocket();
    if (sock && sock.connected) {
      sock.emit('join-server', numericId);
    }
    showWorkspaceForServer(numericId);
    moduleBus.emit('server:connected', { serverId: numericId, server: entry?.data || null });
    moduleBus.emit('players:refresh', { reason: 'server-connect', serverId: numericId });
  }

  const ui = {
    showLogin() {
      loginPanel.classList.remove('hidden');
      appPanel.classList.add('hidden');
      mainNav?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      switchPanel('dashboard');
    },
    showApp() {
      loginPanel.classList.add('hidden');
      appPanel.classList.remove('hidden');
      mainNav?.classList.remove('hidden');
      workspacePanel?.classList.add('hidden');
      dashboardPanel?.classList.remove('hidden');
      settingsPanel?.classList.add('hidden');
      switchPanel(state.activePanel || 'dashboard');
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
      if (navSettings) {
        const label = user?.username || 'Account';
        navSettings.textContent = label;
        navSettings.title = 'Open account settings';
      }
      if (welcomeName) welcomeName.textContent = user?.username || 'operator';
      if (profileMenuTrigger) {
        profileMenuTrigger.disabled = !user;
        profileMenuTrigger.setAttribute('aria-expanded', 'false');
        const triggerLabel = user?.username ? `Open profile menu for ${user.username}` : 'Open profile menu';
        profileMenuTrigger.setAttribute('aria-label', triggerLabel);
      }
      closeProfileMenu();
      userBox.innerHTML = '';
      if (profileUsername) profileUsername.textContent = user?.username || '—';
      if (profileRole) {
        const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—';
        profileRole.textContent = roleLabel;
      }
      if (!user) {
        return;
      }
      const header = document.createElement('div');
      header.className = 'user-box-header';
      const strong = document.createElement('strong');
      strong.textContent = user.username;
      header.appendChild(strong);
      if (user.role === 'admin') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Admin';
        header.appendChild(badge);
      }
      userBox.appendChild(header);

      const descriptor = document.createElement('span');
      descriptor.className = 'menu-description';
      descriptor.textContent = user.role === 'admin' ? 'Administrator access' : 'Standard access';
      userBox.appendChild(descriptor);

      const actions = document.createElement('div');
      actions.className = 'user-box-actions';

      const accountBtn = document.createElement('button');
      accountBtn.type = 'button';
      accountBtn.className = 'menu-item';
      accountBtn.setAttribute('role', 'menuitem');
      accountBtn.textContent = 'Account settings';
      accountBtn.addEventListener('click', () => {
        hideWorkspace('nav');
        switchPanel('settings');
        closeProfileMenu();
      });

      const logoutBtn = document.createElement('button');
      logoutBtn.type = 'button';
      logoutBtn.className = 'menu-item danger';
      logoutBtn.setAttribute('role', 'menuitem');
      logoutBtn.textContent = 'Logout';
      logoutBtn.addEventListener('click', () => logout());

      actions.appendChild(accountBtn);
      actions.appendChild(logoutBtn);
      userBox.appendChild(actions);
    }
  };

  function getServerList() {
    return [...state.serverItems.values()].map((entry) => entry.data).filter(Boolean);
  }

  function getServerData(id) {
    return state.serverItems.get(String(id))?.data || null;
  }

  const moduleHostContext = {
    createCard: createModuleCard,
    on: moduleBus.on,
    emit: moduleBus.emit,
    api,
    publicJson,
    log: (line) => ui.log(line),
    describeError,
    errorCode,
    handleUnauthorized,
    registerQuickCommand,
    setQuickInput,
    sendCommand: runRconCommand,
    runCommand: runRconCommand,
    getState: () => ({
      API: state.API,
      currentUser: state.currentUser,
      currentServerId: state.currentServerId,
      servers: getServerList()
    }),
    getServers: getServerList,
    getServer: getServerData,
    getSettings: () => ({ ...state.settings }),
    openSettings: () => switchPanel('settings')
  };

  if (window.ModuleLoader?.init) {
    window.ModuleLoader.init(moduleHostContext);
  }

  function logout() {
    hideWorkspace('logout');
    state.TOKEN = '';
    state.currentUser = null;
    stopStatusPolling();
    disconnectSocket();
    localStorage.removeItem('token');
    state.serverItems.clear();
    state.settings = {};
    state.activePanel = 'dashboard';
    serversEl.innerHTML = '';
    ui.clearConsole();
    ui.setUser(null);
    userCard.classList.add('hidden');
    hideNotice(userFeedback);
    hideNotice(settingsStatus);
    if (rustMapsKeyInput) rustMapsKeyInput.value = '';
    ui.showLogin();
    loadPublicConfig();
    moduleBus.emit('auth:logout');
    moduleBus.emit('settings:updated', { settings: {} });
    mainNav?.classList.add('hidden');
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

  async function loadSettings() {
    if (!state.TOKEN) return;
    hideNotice(settingsStatus);
    try {
      const data = await api('/api/me/settings');
      state.settings = data || {};
      if (rustMapsKeyInput) rustMapsKeyInput.value = state.settings.rustmaps_api_key || '';
      moduleBus.emit('settings:updated', { settings: { ...state.settings } });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to load settings: ' + describeError(err));
    }
  }

  async function saveSettings() {
    if (!state.TOKEN) {
      showNotice(settingsStatus, describeError('unauthorized'), 'error');
      return;
    }
    hideNotice(settingsStatus);
    const payload = { rustmaps_api_key: rustMapsKeyInput?.value?.trim() || '' };
    try {
      const data = await api('/api/me/settings', payload, 'POST');
      state.settings = data || {};
      showNotice(settingsStatus, 'Settings saved.', 'success');
      moduleBus.emit('settings:updated', { settings: { ...state.settings } });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(settingsStatus, describeError(err), 'error');
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
      await loadSettings();
      ui.setUser(me);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      moduleBus.emit('auth:login', { user: state.currentUser, resume: true });
      moduleBus.emit('players:refresh', { reason: 'session-resume' });
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
    const username = loginUsername?.value.trim();
    const password = loginPassword?.value || '';
    if (!username || !password) {
      showNotice(loginError, describeError('missing_fields'), 'error');
      return;
    }
    const restore = btnLogin ? { disabled: btnLogin.disabled, text: btnLogin.textContent } : null;
    if (btnLogin) {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Signing in…';
    }
    try {
      const data = await publicJson('/api/login', { method: 'POST', body: { username, password } });
      state.TOKEN = data.token;
      localStorage.setItem('token', state.TOKEN);
      state.currentUser = { id: data.id, username: data.username, role: data.role };
      await loadSettings();
      ui.setUser(state.currentUser);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      moduleBus.emit('auth:login', { user: state.currentUser, resume: false });
      moduleBus.emit('players:refresh', { reason: 'login' });
      toggleUserCard();
      startStatusPolling();
    } catch (err) {
      showNotice(loginError, describeError(err), 'error');
      if (loginPassword) loginPassword.value = '';
      loginPassword?.focus();
    } finally {
      if (btnLogin && restore) {
        btnLogin.disabled = restore.disabled;
        btnLogin.textContent = restore.text;
      }
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
      addServerPinned = false;
      hideAddServerCard({ force: true });
      await refreshServers();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to add server: ' + describeError(err));
    }
  }

  async function runRconCommand(command) {
    const cmd = (command || '').toString().trim();
    if (!cmd) throw new Error('missing_command');
    if (state.currentServerId == null) throw new Error('no_server_selected');
    return await api(`/api/rcon/${state.currentServerId}`, { cmd }, 'POST');
  }

  async function sendCommand() {
    const cmd = cmdInput?.value.trim();
    if (!cmd) return;
    if (state.currentServerId == null) {
      ui.log('Select a server before sending commands.');
      return;
    }
    try {
      const reply = await runRconCommand(cmd);
      ui.log('> ' + cmd);
      if (reply?.Message) ui.log(reply.Message.trim());
      cmdInput.value = '';
    } catch (err) {
      if (errorCode(err) === 'no_server_selected') {
        ui.log('Select a server before sending commands.');
        return;
      }
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Command failed: ' + describeError(err));
    }
  }

  function bindEvents() {
    navDashboard?.addEventListener('click', () => { hideWorkspace('nav'); switchPanel('dashboard'); closeProfileMenu(); });
    navSettings?.addEventListener('click', () => { hideWorkspace('nav'); switchPanel('settings'); closeProfileMenu(); });
    profileMenuTrigger?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!state.currentUser) return;
      toggleProfileMenu();
    });
    btnSaveSettings?.addEventListener('click', (e) => { e.preventDefault(); saveSettings(); });
    rustMapsKeyInput?.addEventListener('input', () => hideNotice(settingsStatus));
    const triggerLogin = (ev) => {
      ev?.preventDefault();
      handleLogin();
    };
    btnLogin?.addEventListener('click', triggerLogin);
    loginUsername?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') triggerLogin(ev);
    });
    loginPassword?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') triggerLogin(ev);
    });
    loginUsername?.addEventListener('input', () => hideNotice(loginError));
    loginPassword?.addEventListener('input', () => hideNotice(loginError));
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
    addServerPrompt?.addEventListener('click', () => toggleAddServerCardVisibility());
    btnBackToDashboard?.addEventListener('click', () => hideWorkspace('back'));
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
    setAddServerPromptState(addServerCard && !addServerCard.classList.contains('hidden'));
    document.addEventListener('click', (ev) => {
      const target = ev.target instanceof Node ? ev.target : null;
      if (!target) return;
      if (profileMenuTrigger?.contains(target) || userBox?.contains(target)) return;
      closeProfileMenu();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeProfileMenu();
    });
  }

  async function init() {
    setApiBase(detectDefaultApiBase());
    bindEvents();
    if (state.TOKEN) {
      await attemptSessionResume();
    } else {
      ui.showLogin();
    }
  }

  init();
})();
