(() => {
  const PERMISSIONS = {
    SYSTEM_ADMIN: 'system.admin',
    USERS_MANAGE: 'users.manage',
    SERVERS_VIEW: 'servers.view',
    SERVERS_MANAGE: 'servers.manage',
    SERVERS_CONTROL: 'servers.control',
    SERVERS_MONITOR: 'servers.monitor',
    PLAYERS_VIEW: 'players.view',
    PLAYERS_MANAGE: 'players.manage'
  };

  const $ = (sel) => document.querySelector(sel);

  const serversEl = $('#servers');
  const consoleEl = $('#console');
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
  const defaultCommandPlaceholder = cmdInput?.placeholder || '';
  const loginUsername = $('#username');
  const loginPassword = $('#password');
  const btnLogin = $('#btnLogin');
  const regUsername = $('#regUsername');
  const regPassword = $('#regPassword');
  const regConfirm = $('#regConfirm');
  const newUserName = $('#newUserName');
  const newUserPassword = $('#newUserPassword');
  const newUserRole = $('#newUserRole');
  const newUserRoles = $('#newUserRoles');
  const btnCreateUser = $('#btnCreateUser');
  const newRoleName = $('#newRoleName');
  const newRoleDescription = $('#newRoleDescription');
  const btnCreateRole = $('#btnCreateRole');
  const roleFeedback = $('#roleFeedback');
  const roleList = $('#roleList');
  const quickCommandsEl = $('#quickCommands');
  const rustMapsKeyInput = $('#rustMapsKey');
  const btnSaveSettings = $('#btnSaveSettings');
  const settingsStatus = $('#settingsStatus');
  const currentPasswordInput = $('#currentPassword');
  const newPasswordInput = $('#newPassword');
  const confirmPasswordInput = $('#confirmPassword');
  const btnChangePassword = $('#btnChangePassword');
  const passwordStatus = $('#passwordStatus');
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
  const workspaceJoining = $('#workspaceJoining');
  const workspaceMenu = $('#workspaceMenu');
  const workspaceInfoPlayers = $('#workspaceInfoPlayers');
  const workspaceInfoMaxPlayers = $('#workspaceInfoMaxPlayers');
  const workspaceInfoQueue = $('#workspaceInfoQueue');
  const workspaceInfoJoining = $('#workspaceInfoJoining');
  const workspaceInfoGameTime = $('#workspaceInfoGameTime');
  const workspaceInfoUptime = $('#workspaceInfoUptime');
  const workspaceInfoFramerate = $('#workspaceInfoFramerate');
  const workspaceInfoNetworkIn = $('#workspaceInfoNetworkIn');
  const workspaceInfoNetworkOut = $('#workspaceInfoNetworkOut');
  const workspaceInfoSaveCreatedTime = $('#workspaceInfoSaveCreatedTime');
  const btnBackToDashboard = $('#btnBackToDashboard');
  const profileUsername = $('#profileUsername');
  const profileRole = $('#profileRole');
  const moduleFallback = $('#moduleFallback');

  const workspaceViewSections = Array.from(document.querySelectorAll('.workspace-view'));
  const workspaceViewButtons = workspaceMenu ? Array.from(workspaceMenu.querySelectorAll('.menu-tab')) : [];
  const workspaceViewDefault = 'players';
  let activeWorkspaceView = workspaceViewDefault;

  const moduleSlots = new Map();
  document.querySelectorAll('[data-module-card]').forEach((card) => {
    const id = card?.dataset?.moduleCard;
    if (!id) return;
    const body = card.querySelector('[data-module-slot]');
    if (!body) return;
    const header = card.querySelector('.card-header') || null;
    const actions = card.querySelector('[data-module-actions]') || null;
    const titleEl = header?.querySelector('[data-module-title]') || header?.querySelector('h3') || null;
    moduleSlots.set(id, { card, body, header, actions, titleEl });
  });

  function setWorkspaceView(nextView = workspaceViewDefault) {
    const available = new Set(workspaceViewButtons.map((btn) => btn.dataset.view));
    const target = available.has(nextView) ? nextView : workspaceViewDefault;
    activeWorkspaceView = target;
    workspaceViewButtons.forEach((btn) => {
      const match = btn.dataset.view === target;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    workspaceViewSections.forEach((section) => {
      const match = section.dataset.view === target;
      section.classList.toggle('active', match);
      section.setAttribute('aria-hidden', match ? 'false' : 'true');
    });
  }

  workspaceViewButtons.forEach((btn) => {
    btn.addEventListener('click', () => setWorkspaceView(btn.dataset.view));
  });

  if (workspaceViewSections.length) {
    setWorkspaceView(workspaceViewDefault);
  }

  const state = {
    API: '',
    TOKEN: localStorage.getItem('token') || '',
    currentUser: null,
    currentServerId: null,
    serverItems: new Map(),
    allowRegistration: false,
    statusTimer: null,
    settings: {},
    activePanel: 'dashboard',
    roles: [],
    permissionDefinitions: []
  };

  let socket = null;
  let addServerPinned = false;

  function normalisePermissionEntry(entry) {
    const key = typeof entry?.permission === 'string' ? entry.permission.trim().toLowerCase() : '';
    if (!key) return null;
    let serverId = null;
    if (Object.prototype.hasOwnProperty.call(entry || {}, 'serverId')) {
      const numeric = Number(entry.serverId);
      if (Number.isFinite(numeric)) serverId = Math.trunc(numeric);
    } else if (Object.prototype.hasOwnProperty.call(entry || {}, 'server_id')) {
      const numeric = Number(entry.server_id);
      if (Number.isFinite(numeric)) serverId = Math.trunc(numeric);
    }
    return { key, serverId };
  }

  function permissionMatches(pattern, target) {
    if (!pattern) return false;
    if (pattern === '*' || pattern === target) return true;
    const patternParts = pattern.split('.');
    const targetParts = target.split('.');
    for (let i = 0; i < patternParts.length; i += 1) {
      const currentPattern = patternParts[i];
      const currentTarget = targetParts[i];
      if (currentPattern === '*') return true;
      if (typeof currentTarget === 'undefined') return false;
      if (currentPattern !== currentTarget) return false;
    }
    return patternParts.length === targetParts.length;
  }

  function refreshPermissionCache(user) {
    if (!user) return;
    const entries = Array.isArray(user.permissions) ? user.permissions : [];
    user._normalizedPermissions = entries.map((entry) => normalisePermissionEntry(entry)).filter(Boolean);
  }

  function can(permission, serverId = null) {
    const user = state.currentUser;
    if (!user) return false;
    const key = typeof permission === 'string' ? permission.trim().toLowerCase() : '';
    if (!key) return false;
    if ((user.role || '').toLowerCase() === 'admin') return true;
    const entries = Array.isArray(user._normalizedPermissions) ? user._normalizedPermissions : [];
    const targetServer = Number.isFinite(Number(serverId)) ? Math.trunc(Number(serverId)) : null;
    for (const entry of entries) {
      if (entry.key === PERMISSIONS.SYSTEM_ADMIN || entry.key === '*') return true;
      if (!permissionMatches(entry.key, key)) continue;
      if (entry.serverId == null) return true;
      if (targetServer != null && entry.serverId === targetServer) return true;
    }
    return false;
  }

  function setCurrentUser(user) {
    if (user) {
      if (!Array.isArray(user.permissions)) user.permissions = [];
      if (!Array.isArray(user.roles)) user.roles = [];
      refreshPermissionCache(user);
    }
    state.currentUser = user || null;
    updateServerManagementUi();
    updateCommandAccess();
  }

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
    const manageServers = can(PERMISSIONS.SERVERS_MANAGE);
    if (!manageServers) {
      addServerPrompt.classList.add('hidden');
      addServerPrompt.classList.remove('open');
      addServerPrompt.setAttribute('aria-hidden', 'true');
      addServerPrompt.setAttribute('aria-expanded', 'false');
      return;
    }
    const active = !!open;
    addServerPrompt.classList.remove('hidden');
    addServerPrompt.setAttribute('aria-hidden', 'false');
    addServerPrompt.setAttribute('aria-expanded', active ? 'true' : 'false');
    addServerPrompt.classList.toggle('open', active);
  }

  function updateServerManagementUi() {
    const manageServers = can(PERMISSIONS.SERVERS_MANAGE);
    if (btnAddServer) {
      btnAddServer.disabled = !manageServers;
      btnAddServer.title = manageServers ? 'Save server' : 'You do not have permission to add servers.';
    }
    if (addServerCard) {
      if (!manageServers) {
        addServerCard.classList.add('hidden');
        addServerPinned = false;
      }
      const hidden = !manageServers || addServerCard.classList.contains('hidden');
      addServerCard.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    if (!manageServers) {
      setAddServerPromptState(false);
    } else if (addServerCard && !addServerCard.classList.contains('hidden')) {
      setAddServerPromptState(true);
    } else {
      setAddServerPromptState(false);
    }
  }

  function updateCommandAccess() {
    const serverId = state.currentServerId;
    const hasServer = serverId != null;
    const canControl = hasServer
      ? can(PERMISSIONS.SERVERS_CONTROL, serverId)
      : can(PERMISSIONS.SERVERS_CONTROL);
    const disabled = !hasServer || !canControl;
    if (cmdInput) {
      let placeholder = defaultCommandPlaceholder;
      if (!hasServer) placeholder = 'Select a server to run commands.';
      else if (!canControl) placeholder = 'You do not have permission to run commands on this server.';
      cmdInput.disabled = disabled;
      cmdInput.placeholder = disabled ? placeholder : defaultCommandPlaceholder;
    }
    if (btnSend) btnSend.disabled = disabled;
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
    if (panel !== 'settings') {
      hideNotice(settingsStatus);
      hideNotice(passwordStatus);
    }
  }

  function createModuleCard({ id, title, icon } = {}) {
    if (!id) throw new Error('Module id is required');
    const slot = moduleSlots.get(id);
    if (slot && slot.body) {
      const headingEl = slot.titleEl || null;
      if (headingEl) {
        const baseText = typeof title === 'string' && title.length
          ? title
          : (headingEl.textContent || id || 'Module');
        headingEl.textContent = icon ? `${icon} ${baseText}`.trim() : baseText;
      }
      slot.card?.classList.remove('module-hidden');
      return {
        card: slot.card,
        header: slot.header,
        body: slot.body,
        actions: slot.actions || null,
        setTitle(value) {
          if (!headingEl) return;
          headingEl.textContent = value || '';
        },
        remove() {
          if (slot.body) slot.body.innerHTML = '';
          slot.card?.classList.add('module-hidden');
        }
      };
    }

    const host = moduleFallback || workspacePanel;
    if (!host) throw new Error('Module mount element missing');
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
    host.appendChild(card);
    host.classList.remove('hidden');
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
    forbidden: 'You do not have permission to perform that action.',
    invalid_payload: 'The request payload was not accepted.',
    missing_image: 'Choose an image before uploading.',
    invalid_image: 'The selected image could not be processed.',
    image_too_large: 'The image is too large. Please upload a file under 20 MB.',
    map_upload_failed: 'Uploading the map image failed. Please try again.',
    invalid_current_password: 'The current password you entered is incorrect.',
    password_mismatch: 'New password and confirmation do not match.'
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

  function clearPasswordInputs() {
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
  }

  async function changePassword() {
    if (!state.TOKEN) {
      showNotice(passwordStatus, describeError('unauthorized'), 'error');
      return;
    }
    hideNotice(passwordStatus);
    const currentValue = currentPasswordInput?.value || '';
    const nextValue = newPasswordInput?.value || '';
    const confirmValue = confirmPasswordInput?.value || '';
    if (!currentValue || !nextValue || !confirmValue) {
      showNotice(passwordStatus, describeError('missing_fields'), 'error');
      return;
    }
    if (nextValue.length < 8) {
      showNotice(passwordStatus, describeError('weak_password'), 'error');
      return;
    }
    if (nextValue !== confirmValue) {
      showNotice(passwordStatus, describeError('password_mismatch'), 'error');
      return;
    }
    const restore = btnChangePassword
      ? { disabled: btnChangePassword.disabled, text: btnChangePassword.textContent }
      : null;
    if (btnChangePassword) {
      btnChangePassword.disabled = true;
      btnChangePassword.textContent = 'Updating…';
    }
    try {
      await api('/api/password', { currentPassword: currentValue, newPassword: nextValue }, 'POST');
      showNotice(passwordStatus, 'Password updated successfully.', 'success');
      clearPasswordInputs();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(passwordStatus, describeError(err), 'error');
    } finally {
      if (btnChangePassword && restore) {
        btnChangePassword.disabled = restore.disabled;
        btnChangePassword.textContent = restore.text;
      }
    }
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
    if (!addServerCard || !can(PERMISSIONS.SERVERS_MANAGE)) return;
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
    if (!addServerCard || !can(PERMISSIONS.SERVERS_MANAGE)) return;
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
    updateCommandAccess();
  }

  function coerceNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function pickNumber(...values) {
    for (const value of values) {
      const num = coerceNumber(value);
      if (num != null) return num;
    }
    return null;
  }

  function pickString(...values) {
    for (const value of values) {
      if (value == null) continue;
      const str = String(value).trim();
      if (str) return str;
    }
    return null;
  }

  function parseServerInfo(details) {
    if (!details || typeof details !== 'object') return null;
    const candidates = [
      details.serverInfo,
      details.serverinfo,
      details.ServerInfo,
      details.info,
      details.serverInfoRaw,
      details.rawInfo
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === 'object') return candidate;
      if (typeof candidate === 'string') {
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch { /* ignore */ }
      }
    }
    if (typeof details.raw === 'string') {
      try {
        const parsed = JSON.parse(details.raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* ignore */ }
    }
    return null;
  }

  function formatUptime(seconds) {
    const value = coerceNumber(seconds);
    if (value == null) return '—';
    const total = Math.max(0, Math.floor(value));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }

  function formatNumber(value, { fractionDigits } = {}) {
    const num = coerceNumber(value);
    if (num == null) return '—';
    if (typeof fractionDigits === 'number') return num.toFixed(fractionDigits);
    return num.toLocaleString();
  }

  function formatDateTime(value) {
    const text = pickString(value);
    if (!text) return '—';
    const date = new Date(text);
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
    return text;
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
    const serverInfo = status?.details ? parseServerInfo(status.details) : null;
    const pill = workspaceStatus;
    const playersOnline = pickNumber(status?.details?.players?.online, serverInfo?.Players, serverInfo?.players);
    const maxPlayers = pickNumber(status?.details?.players?.max, serverInfo?.MaxPlayers, serverInfo?.maxPlayers);
    const queueCount = pickNumber(status?.details?.queued, serverInfo?.Queued, serverInfo?.queue);
    const joiningCount = pickNumber(status?.details?.joining, status?.details?.sleepers, serverInfo?.Joining, serverInfo?.joining);
    const framerate = pickNumber(serverInfo?.Framerate, serverInfo?.framerate, serverInfo?.fps);
    const networkIn = pickNumber(serverInfo?.NetworkIn, serverInfo?.networkIn, serverInfo?.network_in);
    const networkOut = pickNumber(serverInfo?.NetworkOut, serverInfo?.networkOut, serverInfo?.network_out);
    const uptimeSeconds = pickNumber(serverInfo?.Uptime, serverInfo?.uptime, serverInfo?.uptimeSeconds, serverInfo?.UptimeSeconds);
    const gameTime = pickString(serverInfo?.GameTime, serverInfo?.gameTime, serverInfo?.game_time);
    const lastSave = pickString(serverInfo?.SaveCreatedTime, serverInfo?.saveCreatedTime, serverInfo?.save_created_time);
    const hostname = pickString(status?.details?.hostname, serverInfo?.Hostname, serverInfo?.hostname);
    const online = !!status?.ok;
    if (pill) {
      let cls = 'status-pill';
      if (online) {
        if (queueCount && queueCount > 0) {
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
      pill.title = hostname || status?.error || '';
    }
    if (workspacePlayers) {
      if (online && playersOnline != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        workspacePlayers.textContent = `${playersOnline}${maxInfo}`;
      } else {
        workspacePlayers.textContent = '--';
      }
    }
    if (workspaceQueue) {
      workspaceQueue.textContent = queueCount != null && queueCount > 0 ? String(queueCount) : (online ? '0' : '--');
    }
    if (workspaceJoining) {
      workspaceJoining.textContent = joiningCount != null ? String(joiningCount) : (online ? '0' : '--');
    }
    if (workspaceInfoPlayers) {
      workspaceInfoPlayers.textContent = playersOnline != null ? playersOnline.toLocaleString() : (online ? '0' : '—');
    }
    if (workspaceInfoMaxPlayers) {
      workspaceInfoMaxPlayers.textContent = maxPlayers != null ? maxPlayers.toLocaleString() : '—';
    }
    if (workspaceInfoQueue) {
      workspaceInfoQueue.textContent = queueCount != null ? queueCount.toLocaleString() : (online ? '0' : '—');
    }
    if (workspaceInfoJoining) {
      workspaceInfoJoining.textContent = joiningCount != null ? joiningCount.toLocaleString() : (online ? '0' : '—');
    }
    if (workspaceInfoGameTime) {
      workspaceInfoGameTime.textContent = formatDateTime(gameTime);
    }
    if (workspaceInfoUptime) {
      workspaceInfoUptime.textContent = formatUptime(uptimeSeconds);
    }
    if (workspaceInfoFramerate) {
      if (framerate != null) {
        const digits = Number.isInteger(framerate) ? 0 : 1;
        workspaceInfoFramerate.textContent = `${formatNumber(framerate, { fractionDigits: digits })} fps`;
      } else {
        workspaceInfoFramerate.textContent = '—';
      }
    }
    if (workspaceInfoNetworkIn) {
      workspaceInfoNetworkIn.textContent = networkIn != null ? networkIn.toLocaleString() : '—';
    }
    if (workspaceInfoNetworkOut) {
      workspaceInfoNetworkOut.textContent = networkOut != null ? networkOut.toLocaleString() : '—';
    }
    if (workspaceInfoSaveCreatedTime) {
      workspaceInfoSaveCreatedTime.textContent = formatDateTime(lastSave);
    }
  }

  function showWorkspaceForServer(id) {
    const entry = state.serverItems.get(String(id));
    if (!entry) return;
    dashboardPanel?.classList.add('hidden');
    settingsPanel?.classList.add('hidden');
    workspacePanel?.classList.remove('hidden');
    setWorkspaceView(workspaceViewDefault);
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
    if (workspaceJoining) workspaceJoining.textContent = '--';
    if (workspaceStatus) {
      workspaceStatus.className = 'status-pill';
      workspaceStatus.textContent = 'offline';
      workspaceStatus.title = '';
    }
    if (workspaceInfoPlayers) workspaceInfoPlayers.textContent = '—';
    if (workspaceInfoMaxPlayers) workspaceInfoMaxPlayers.textContent = '—';
    if (workspaceInfoQueue) workspaceInfoQueue.textContent = '—';
    if (workspaceInfoJoining) workspaceInfoJoining.textContent = '—';
    if (workspaceInfoGameTime) workspaceInfoGameTime.textContent = '—';
    if (workspaceInfoUptime) workspaceInfoUptime.textContent = '—';
    if (workspaceInfoFramerate) workspaceInfoFramerate.textContent = '—';
    if (workspaceInfoNetworkIn) workspaceInfoNetworkIn.textContent = '—';
    if (workspaceInfoNetworkOut) workspaceInfoNetworkOut.textContent = '—';
    if (workspaceInfoSaveCreatedTime) workspaceInfoSaveCreatedTime.textContent = '—';
    setWorkspaceView(workspaceViewDefault);
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
      const raw = typeof msg === 'string'
        ? msg
        : (msg?.Message ?? msg?.message ?? '');
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text) {
        ui.log(text);
      }

      moduleBus.emit('console:message', { serverId: state.currentServerId, message: msg });

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
    const joiningEl = entry.joiningValue;
    if (!status) {
      if (pill) {
        pill.className = 'status-pill';
        pill.textContent = 'Unknown';
        pill.title = '';
      }
      if (details) details.textContent = '';
      if (playersEl) playersEl.textContent = '--';
      if (queueEl) queueEl.textContent = '--';
      if (joiningEl) joiningEl.textContent = '--';
      updateWorkspaceDisplay(entry);
      return;
    }
    const online = !!status.ok;
    const serverInfo = status?.details ? parseServerInfo(status.details) : null;
    const queued = pickNumber(status?.details?.queued, serverInfo?.Queued, serverInfo?.queue);
    const players = pickNumber(status?.details?.players?.online, serverInfo?.Players, serverInfo?.players);
    const maxPlayers = pickNumber(status?.details?.players?.max, serverInfo?.MaxPlayers, serverInfo?.maxPlayers);
    const joining = pickNumber(status?.details?.joining, status?.details?.sleepers, serverInfo?.Joining, serverInfo?.joining);
    const hostname = pickString(status?.details?.hostname, serverInfo?.Hostname, serverInfo?.hostname);
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
      pill.title = hostname || status?.error || '';
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
    if (joiningEl) {
      joiningEl.textContent = joining != null ? String(joining) : (online ? '0' : '--');
    }
    if (details) {
      const parts = [];
      if (online && players != null) {
        const maxInfo = maxPlayers != null ? `/${maxPlayers}` : '';
        parts.push(`${players}${maxInfo} players`);
      }
      if (online && queued != null && queued > 0) parts.push(`${queued} queued`);
      if (online && joining != null && joining > 0) parts.push(`${joining} joining`);
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
    const joiningStat = createServerStat('🚪', 'Joining');
    stats.appendChild(playersStat.element);
    stats.appendChild(queueStat.element);
    stats.appendChild(joiningStat.element);

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
    const removeRow = document.createElement('div');
    removeRow.className = 'row remove-row';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ghost danger';
    removeBtn.textContent = 'Remove server';
    removeRow.appendChild(removeBtn);

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
    editForm.appendChild(removeRow);
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

    removeBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const label = entry.data?.name || server.name || `Server #${server.id}`;
      if (!confirm(`Remove ${label}? This cannot be undone.`)) return;
      removeBtn.disabled = true;
      cancelBtn.disabled = true;
      saveBtn.disabled = true;
      showFeedback('Removing…');
      try {
        await api(`/api/servers/${server.id}`, null, 'DELETE');
        ui.log('Server removed: ' + label);
        const wasActive = state.currentServerId === server.id;
        toggleEdit(false);
        state.serverItems.delete(String(server.id));
        card.remove();
        highlightSelectedServer();
        moduleBus.emit('servers:updated', { servers: getServerList() });
        if (wasActive) hideWorkspace('remove');
        await refreshServers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') {
          handleUnauthorized();
        } else {
          showFeedback(describeError(err), 'error');
        }
      } finally {
        removeBtn.disabled = false;
        cancelBtn.disabled = false;
        saveBtn.disabled = false;
      }
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
    entry.joiningValue = joiningStat.value;
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
      const manageServers = can(PERMISSIONS.SERVERS_MANAGE);
      if (addServerPrompt && manageServers) {
        serversEl.appendChild(addServerPrompt);
      }
      setAddServerPromptState(addServerCard && !addServerCard.classList.contains('hidden'));
      const statuses = await fetchServerStatuses();
      for (const server of list) {
        const status = statuses?.[server.id] || statuses?.[String(server.id)];
        renderServer(server, status);
      }
      if (state.currentServerId != null && !state.serverItems.has(String(state.currentServerId))) {
        leaveCurrentServer('removed');
      }
      const hasServers = list.length > 0;
      if (serversEmpty) {
        serversEmpty.textContent = manageServers
          ? 'No servers added yet. Connect your first Rust server to get started.'
          : 'No servers are currently shared with your account.';
      }
      serversEmpty?.classList.toggle('hidden', hasServers);
      if (!hasServers) {
        if (manageServers) {
          showAddServerCard();
        } else {
          hideAddServerCard({ force: true });
        }
      } else if (!addServerPinned || !manageServers) {
        hideAddServerCard();
      }
      highlightSelectedServer();
      renderRoles();
      moduleBus.emit('servers:updated', { servers: list });
      updateServerManagementUi();
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
    updateCommandAccess();
    ui.clearConsole();
    const name = entry?.data?.name || `Server #${numericId}`;
    ui.log(`Connecting to ${name}...`);
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
        const extraRoles = Array.isArray(user?.roles) && user.roles.length
          ? ` • ${user.roles.map((r) => r.name).join(', ')}`
          : '';
        profileRole.textContent = roleLabel + extraRoles;
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
      const baseDescriptor = user.role === 'admin' ? 'Administrator access' : 'Standard access';
      const extraDescriptor = Array.isArray(user.roles) && user.roles.length
        ? ` • Roles: ${user.roles.map((r) => r.name).join(', ')}`
        : '';
      descriptor.textContent = baseDescriptor + extraDescriptor;
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
    setCurrentUser(null);
    stopStatusPolling();
    disconnectSocket();
    localStorage.removeItem('token');
    state.serverItems.clear();
    state.settings = {};
    state.activePanel = 'dashboard';
    state.roles = [];
    state.permissionDefinitions = [];
    serversEl.innerHTML = '';
    ui.clearConsole();
    ui.setUser(null);
    userCard.classList.add('hidden');
    hideNotice(userFeedback);
    hideNotice(settingsStatus);
    hideNotice(passwordStatus);
    clearPasswordInputs();
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
    if (!can(PERMISSIONS.USERS_MANAGE)) return;
    hideNotice(userFeedback);
    try {
      const list = await api('/api/users');
      userList.innerHTML = '';
      const availableRoles = Array.isArray(state.roles) ? state.roles : [];
      const size = Math.min(6, Math.max(availableRoles.length, 3));
      for (const user of list) {
        const li = document.createElement('li');
        li.className = 'user-entry';
        const left = document.createElement('div');
        left.className = 'user-entry-main';
        const strong = document.createElement('strong');
        strong.textContent = user.username;
        left.appendChild(strong);
        const baseMeta = document.createElement('div');
        baseMeta.className = 'muted small';
        const baseRole = user.role === 'admin' ? 'Admin' : 'User';
        baseMeta.textContent = `Base role: ${baseRole}`;
        left.appendChild(baseMeta);
        if (Array.isArray(user.roles) && user.roles.length) {
          const customMeta = document.createElement('div');
          customMeta.className = 'muted small';
          customMeta.textContent = 'Custom roles: ' + user.roles.map((r) => r.name).join(', ');
          left.appendChild(customMeta);
        }
        const rolesWrap = document.createElement('div');
        rolesWrap.className = 'user-role-editor';
        const rolesLabel = document.createElement('label');
        rolesLabel.textContent = 'Assign roles';
        const select = document.createElement('select');
        select.multiple = true;
        select.size = size;
        select.className = 'user-role-select';
        const selectedIds = new Set((user.roles || []).map((r) => Number(r.id)));
        for (const role of availableRoles) {
          const option = document.createElement('option');
          option.value = role.id;
          option.textContent = role.name;
          if (selectedIds.has(Number(role.id))) option.selected = true;
          select.appendChild(option);
        }
        rolesLabel.appendChild(select);
        rolesWrap.appendChild(rolesLabel);
        if (!availableRoles.length) {
          const hint = document.createElement('p');
          hint.className = 'muted small';
          hint.textContent = 'Create a custom role to assign granular permissions.';
          rolesWrap.appendChild(hint);
          select.disabled = true;
        }
        const saveRolesBtn = document.createElement('button');
        saveRolesBtn.className = 'ghost small';
        saveRolesBtn.textContent = 'Save roles';
        if (!availableRoles.length) {
          saveRolesBtn.disabled = true;
          saveRolesBtn.title = 'Create a custom role first.';
        }
        saveRolesBtn.onclick = async () => {
          if (!availableRoles.length) return;
          const selected = Array.from(select.options)
            .filter((opt) => opt.selected)
            .map((opt) => Number(opt.value))
            .filter((value) => Number.isFinite(value));
          try {
            await api(`/api/users/${user.id}/roles`, { roles: selected }, 'PUT');
            showNotice(userFeedback, `Updated roles for ${user.username}`, 'success');
            loadUsers();
          } catch (err) {
            if (errorCode(err) === 'unauthorized') handleUnauthorized();
            else showNotice(userFeedback, describeError(err), 'error');
          }
        };
        rolesWrap.appendChild(saveRolesBtn);
        left.appendChild(rolesWrap);

        const right = document.createElement('div');
        right.className = 'user-entry-actions';
        if (user.id === state.currentUser?.id) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'You';
          right.appendChild(badge);
        } else {
          const roleBtn = document.createElement('button');
          roleBtn.className = 'ghost small';
          roleBtn.textContent = user.role === 'admin' ? 'Demote to user' : 'Promote to admin';
          roleBtn.onclick = async () => {
            try {
              await api(`/api/users/${user.id}`, { role: user.role === 'admin' ? 'user' : 'admin' }, 'PATCH');
              showNotice(userFeedback, 'Updated base role for ' + user.username, 'success');
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
      if (!availableRoles.length) {
        const emptyHint = document.createElement('p');
        emptyHint.className = 'muted small';
        emptyHint.textContent = 'Create custom roles to assign granular permissions.';
        userList.appendChild(emptyHint);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userFeedback, describeError(err), 'error');
    }
  }

  async function loadRoles() {
    if (!can(PERMISSIONS.USERS_MANAGE)) {
      state.roles = [];
      state.permissionDefinitions = [];
      renderRoleOptions();
      renderRoles();
      return;
    }
    try {
      const payload = await api('/api/roles');
      state.roles = Array.isArray(payload?.roles) ? payload.roles : [];
      state.permissionDefinitions = Array.isArray(payload?.definitions) ? payload.definitions : [];
      renderRoleOptions();
      renderRoles();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else console.error('Failed to load roles', err);
    }
  }

  function renderRoleOptions() {
    if (!newUserRoles) return;
    newUserRoles.innerHTML = '';
    const roles = Array.isArray(state.roles) ? state.roles : [];
    newUserRoles.disabled = roles.length === 0;
    newUserRoles.size = Math.min(6, Math.max(roles.length, 3));
    if (!roles.length) {
      const placeholder = document.createElement('option');
      placeholder.disabled = true;
      placeholder.textContent = 'No custom roles yet';
      newUserRoles.appendChild(placeholder);
      return;
    }
    for (const role of roles) {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = role.name;
      newUserRoles.appendChild(option);
    }
  }

  async function saveRolePermissions(roleId, permissions, roleName = 'role') {
    try {
      const response = await api(`/api/roles/${roleId}/permissions`, { permissions }, 'PUT');
      const match = state.roles.find((r) => Number(r.id) === Number(roleId));
      if (match) match.permissions = Array.isArray(response?.permissions) ? response.permissions : [];
      renderRoles();
      loadUsers();
      showNotice(roleFeedback, `Updated permissions for ${roleName}.`, 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  function renderRoles() {
    if (!roleList) return;
    roleList.innerHTML = '';
    if (!can(PERMISSIONS.USERS_MANAGE)) return;
    const roles = Array.isArray(state.roles) ? state.roles : [];
    const definitions = Array.isArray(state.permissionDefinitions) ? state.permissionDefinitions : [];
    const servers = getServerList();
    if (!roles.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small';
      empty.textContent = 'No custom roles defined yet.';
      roleList.appendChild(empty);
      return;
    }
    const findDefinition = (key) => definitions.find((def) => (def.key || '').toLowerCase() === key.toLowerCase()) || null;
    const readServerId = (entry) => {
      if (!entry) return null;
      const raw = entry.serverId ?? entry.server_id;
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const hasDefinitions = definitions.length > 0;
    if (!hasDefinitions) {
      const info = document.createElement('p');
      info.className = 'muted small';
      info.textContent = 'Permission catalog unavailable. Existing permissions can be removed, but new ones cannot be added until definitions load.';
      roleList.appendChild(info);
    }
    for (const role of roles) {
      const card = document.createElement('div');
      card.className = 'role-item';
      const header = document.createElement('div');
      header.className = 'role-item-header';
      const title = document.createElement('strong');
      title.textContent = role.name;
      header.appendChild(title);
      const actions = document.createElement('div');
      actions.className = 'role-item-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ghost small danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = async () => {
        if (!confirm(`Delete ${role.name}? Users assigned to it will lose its permissions.`)) return;
        try {
          await api(`/api/roles/${role.id}`, null, 'DELETE');
          showNotice(roleFeedback, `Deleted ${role.name}.`, 'success');
          await loadRoles();
          loadUsers();
        } catch (err) {
          if (errorCode(err) === 'unauthorized') handleUnauthorized();
          else showNotice(roleFeedback, describeError(err), 'error');
        }
      };
      actions.appendChild(deleteBtn);
      header.appendChild(actions);
      card.appendChild(header);
      if (role.description) {
        const desc = document.createElement('p');
        desc.className = 'muted small';
        desc.textContent = role.description;
        card.appendChild(desc);
      }
      const permList = document.createElement('ul');
      permList.className = 'role-permissions';
      if (!Array.isArray(role.permissions) || role.permissions.length === 0) {
        const emptyPerm = document.createElement('li');
        emptyPerm.className = 'muted small';
        emptyPerm.textContent = 'No permissions assigned.';
        permList.appendChild(emptyPerm);
      } else {
        for (const entry of role.permissions) {
          const info = findDefinition(entry.permission) || { label: entry.permission, description: '' };
          const entryServerId = readServerId(entry);
          const item = document.createElement('li');
          const label = document.createElement('span');
          const serverLabel = entryServerId != null
            ? (servers.find((srv) => Number(srv?.id) === Number(entryServerId))?.name || `Server #${entryServerId}`)
            : 'All servers';
          label.textContent = `${info.label || entry.permission} — ${serverLabel}`;
          item.appendChild(label);
          const removeBtn = document.createElement('button');
          removeBtn.className = 'ghost small';
          removeBtn.textContent = 'Remove';
          removeBtn.onclick = () => {
            const next = (role.permissions || []).filter((perm) => {
              const permServerId = readServerId(perm);
              return !(perm.permission === entry.permission && permServerId === entryServerId);
            });
            saveRolePermissions(role.id, next, role.name);
          };
          item.appendChild(removeBtn);
          permList.appendChild(item);
        }
      }
      card.appendChild(permList);

      const editor = document.createElement('div');
      editor.className = 'role-permission-editor';
      const permSelect = document.createElement('select');
      permSelect.className = 'role-permission-select';
      if (hasDefinitions) {
        for (const def of definitions) {
          const opt = document.createElement('option');
          opt.value = def.key;
          opt.textContent = def.label;
          permSelect.appendChild(opt);
        }
      } else {
        permSelect.disabled = true;
        permSelect.title = 'Permission catalog unavailable.';
      }
      const serverSelect = document.createElement('select');
      serverSelect.className = 'role-server-select';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All servers';
      serverSelect.appendChild(allOption);
      for (const server of servers) {
        const opt = document.createElement('option');
        opt.value = server.id;
        opt.textContent = server.name;
        serverSelect.appendChild(opt);
      }
      const updateServerSelect = () => {
        if (!hasDefinitions) {
          serverSelect.value = '';
          serverSelect.disabled = true;
          return;
        }
        const selectedDef = findDefinition(permSelect.value);
        if (!selectedDef || !selectedDef.allowServerScope) {
          serverSelect.value = '';
          serverSelect.disabled = true;
        } else {
          serverSelect.disabled = false;
        }
      };
      permSelect.addEventListener('change', updateServerSelect);
      updateServerSelect();
      const addBtn = document.createElement('button');
      addBtn.className = 'ghost small';
      addBtn.textContent = 'Add permission';
      if (!hasDefinitions) {
        addBtn.disabled = true;
        addBtn.title = 'Permission catalog unavailable.';
      }
      addBtn.onclick = () => {
        const key = permSelect.value;
        if (!key) return;
        const selectedDef = findDefinition(key);
        let serverId = null;
        if (selectedDef?.allowServerScope && !serverSelect.disabled && serverSelect.value) {
          serverId = Number(serverSelect.value);
        }
        const exists = (role.permissions || []).some((perm) => {
          const permServerId = readServerId(perm);
          return perm.permission === key && ((permServerId ?? null) === (serverId ?? null));
        });
        if (exists) {
          showNotice(roleFeedback, 'Permission already assigned.', 'error');
          return;
        }
        const next = [...(role.permissions || []), { permission: key, serverId: serverId ?? null }];
        saveRolePermissions(role.id, next, role.name);
      };
      editor.appendChild(permSelect);
      editor.appendChild(serverSelect);
      editor.appendChild(addBtn);
      card.appendChild(editor);
      roleList.appendChild(card);
    }
  }

  function toggleUserCard() {
    if (can(PERMISSIONS.USERS_MANAGE)) {
      userCard.classList.remove('hidden');
      loadRoles().then(() => loadUsers());
    } else {
      userCard.classList.add('hidden');
      userList.innerHTML = '';
      state.roles = [];
      state.permissionDefinitions = [];
      renderRoleOptions();
      renderRoles();
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
      setCurrentUser(me);
      await loadSettings();
      ui.setUser(state.currentUser);
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
      const loginUser = data.user || (typeof data.id !== 'undefined' ? { id: data.id, username: data.username, role: data.role, roles: [], permissions: [] } : null);
      setCurrentUser(loginUser);
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
    if (!can(PERMISSIONS.SERVERS_MANAGE)) {
      ui.log('You do not have permission to add servers.');
      return;
    }
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
    const serverId = state.currentServerId;
    if (serverId == null) throw new Error('no_server_selected');
    if (!can(PERMISSIONS.SERVERS_CONTROL, serverId)) {
      ui.log('You do not have permission to run commands on this server.');
      throw new Error('forbidden');
    }
    return await api(`/api/rcon/${serverId}`, { cmd }, 'POST');
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
      if (errorCode(err) === 'forbidden') return;
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
    btnChangePassword?.addEventListener('click', (e) => { e.preventDefault(); changePassword(); });
    currentPasswordInput?.addEventListener('input', () => hideNotice(passwordStatus));
    newPasswordInput?.addEventListener('input', () => hideNotice(passwordStatus));
    confirmPasswordInput?.addEventListener('input', () => hideNotice(passwordStatus));
    confirmPasswordInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        changePassword();
      }
    });
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
      if (!can(PERMISSIONS.USERS_MANAGE)) return;
      hideNotice(userFeedback);
      const username = newUserName?.value.trim();
      const password = newUserPassword?.value || '';
      const role = newUserRole?.value || 'user';
      const extraRoles = Array.from(newUserRoles?.options || [])
        .filter((opt) => opt.selected)
        .map((opt) => Number(opt.value))
        .filter((value) => Number.isFinite(value));
      if (!username || !password) {
        showNotice(userFeedback, describeError('missing_fields'), 'error');
        return;
      }
      if (password.length < 8) {
        showNotice(userFeedback, describeError('weak_password'), 'error');
        return;
      }
      try {
        await api('/api/users', { username, password, role, roles: extraRoles }, 'POST');
        showNotice(userFeedback, 'Created user ' + username, 'success');
        if (newUserName) newUserName.value = '';
        if (newUserPassword) newUserPassword.value = '';
        if (newUserRole) newUserRole.value = 'user';
        if (newUserRoles) {
          Array.from(newUserRoles.options).forEach((opt) => { opt.selected = false; });
        }
        loadUsers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        else showNotice(userFeedback, describeError(err), 'error');
      }
    });
    btnCreateRole?.addEventListener('click', async () => {
      if (!can(PERMISSIONS.USERS_MANAGE)) return;
      hideNotice(roleFeedback);
      const name = newRoleName?.value.trim();
      const description = newRoleDescription?.value.trim() || '';
      if (!name) {
        showNotice(roleFeedback, 'Role name is required.', 'error');
        return;
      }
      try {
        await api('/api/roles', { name, description }, 'POST');
        showNotice(roleFeedback, `Created role ${name}.`, 'success');
        if (newRoleName) newRoleName.value = '';
        if (newRoleDescription) newRoleDescription.value = '';
        await loadRoles();
        loadUsers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        else showNotice(roleFeedback, describeError(err), 'error');
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
