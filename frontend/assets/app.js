(() => {
  const $ = (sel) => document.querySelector(sel);

  const serversEl = $('#servers');
  const consoleEl = $('#console');
  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const userBox = $('#userBox');
  const mainNav = $('#mainNav');
  const navDashboard = $('#navDashboard');
  const navTeam = $('#navTeam');
  const navSettings = $('#navSettings');
  const teamSwitcher = $('#teamSwitcher');
  const teamSelect = $('#teamSelect');
  const teamSelectLabel = $('#teamSelectLabel');
  const dashboardPanel = $('#dashboardPanel');
  const teamPanel = $('#teamPanel');
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
  const cmdInputDefaultPlaceholder = cmdInput?.getAttribute('placeholder') || '';
  const loginUsername = $('#username');
  const loginPassword = $('#password');
  const btnLogin = $('#btnLogin');
  const regUsername = $('#regUsername');
  const regPassword = $('#regPassword');
  const regConfirm = $('#regConfirm');
  const userCreateSection = $('#userCreateSection');
  const newUserName = $('#newUserName');
  const newUserPassword = $('#newUserPassword');
  const newUserRole = $('#newUserRole');
  const btnCreateUser = $('#btnCreateUser');
  const existingUserName = $('#existingUserName');
  const existingUserRole = $('#existingUserRole');
  const btnAddExistingUser = $('#btnAddExistingUser');
  const existingUserFeedback = $('#existingUserFeedback');
  const roleManager = $('#roleManager');
  const roleEditor = $('#roleEditor');
  const rolesHeader = $('#rolesHeader');
  const rolesDescription = $('#rolesDescription');
  const rolesSection = roleManager?.closest('.team-section') || null;
  const roleSelect = $('#roleSelect');
  const roleNameInput = $('#roleName');
  const roleDescriptionInput = $('#roleDescription');
  const roleServersList = $('#roleServersList');
  const roleCapabilitiesContainer = $('#roleCapabilities');
  const roleGlobalContainer = $('#roleGlobalPermissions');
  const newRoleKey = $('#newRoleKey');
  const newRoleName = $('#newRoleName');
  const btnCreateRole = $('#btnCreateRole');
  const btnSaveRole = $('#btnSaveRole');
  const btnDeleteRole = $('#btnDeleteRole');
  const roleFeedback = $('#roleFeedback');
  const roleEditorEmpty = $('#roleEditorEmpty');
  const roleLockedNotice = $('#roleLockedNotice');
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
  const userDetailsOverlay = $('#userDetailsOverlay');
  const userDetailsPanel = $('#userDetailsPanel');
  const userDetailsClose = $('#userDetailsClose');
  const userDetailsName = $('#userDetailsName');
  const userDetailsSubtitle = $('#userDetailsSubtitle');
  const userDetailsRole = $('#userDetailsRole');
  const userDetailsRoleBadge = $('#userDetailsRoleBadge');
  const userDetailsCreated = $('#userDetailsCreated');
  const userDetailsId = $('#userDetailsId');
  const userDetailsRoleSelect = $('#userDetailsRoleSelect');
  const userDetailsSaveRole = $('#userDetailsSaveRole');
  const userDetailsResetPassword = $('#userDetailsResetPassword');
  const userDetailsDelete = $('#userDetailsDelete');
  const userDetailsSelfNotice = $('#userDetailsSelfNotice');
  const userDetailsRoleStatus = $('#userDetailsRoleStatus');
  const dialogOverlay = $('#dialogOverlay');
  const dialogModal = $('#dialogModal');
  const dialogTitle = $('#dialogTitle');
  const dialogMessage = $('#dialogMessage');
  const dialogInputWrap = $('#dialogInputWrap');
  const dialogInputLabel = $('#dialogInputLabel');
  const dialogInput = $('#dialogInput');
  const dialogError = $('#dialogError');
  const dialogConfirmBtn = $('#dialogConfirm');
  const dialogCancelBtn = $('#dialogCancel');

  const workspaceViewSections = Array.from(document.querySelectorAll('.workspace-view'));
  const workspaceViewSectionMap = new Map(workspaceViewSections.map((section) => [section.dataset.view, section]));
  const workspaceViewButtons = workspaceMenu ? Array.from(workspaceMenu.querySelectorAll('.menu-tab')) : [];
  const workspaceViewDefault = 'players';
  let activeWorkspaceView = workspaceViewDefault;

  function emitWorkspaceEvent(name, detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch { /* ignore */ }
  }

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
    const visibleButtons = workspaceViewButtons.filter((btn) => !btn.classList.contains('permission-hidden') && !btn.disabled);
    if (visibleButtons.length === 0) {
      activeWorkspaceView = workspaceViewDefault;
      workspaceViewSections.forEach((section) => {
        section.classList.remove('active');
        section.setAttribute('aria-hidden', 'true');
      });
      return;
    }
    const available = new Set(visibleButtons.map((btn) => btn.dataset.view));
    let target = available.has(nextView) ? nextView : visibleButtons[0]?.dataset.view || workspaceViewDefault;
    if (!available.has(target)) target = visibleButtons[0]?.dataset.view || workspaceViewDefault;
    activeWorkspaceView = target;
    workspaceViewButtons.forEach((btn) => {
      const allowed = !btn.classList.contains('permission-hidden') && !btn.disabled;
      const match = allowed && btn.dataset.view === target;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    workspaceViewSections.forEach((section) => {
      const allowed = !section.classList.contains('permission-hidden');
      const match = allowed && section.dataset.view === target;
      section.classList.toggle('active', match);
      section.setAttribute('aria-hidden', match ? 'false' : 'true');
    });
  }

  workspaceViewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.classList.contains('permission-hidden')) return;
      setWorkspaceView(btn.dataset.view);
    });
  });

  if (workspaceViewSections.length) {
    setWorkspaceView(workspaceViewDefault);
  }

  const ROLE_CAPABILITY_INFO = {
    view: {
      name: 'View status',
      description: 'See live server status, player counts, and performance metrics.'
    },
    console: {
      name: 'View console',
      description: 'Open the live console stream to monitor server output.'
    },
    commands: {
      name: 'Run commands',
      description: 'Send RCON commands and use quick actions from the panel.'
    },
    liveMap: {
      name: 'View live map',
      description: 'Access the interactive in-game map with player positions.'
    },
    players: {
      name: 'Manage players',
      description: 'Kick, ban, and manage player information for the server.'
    },
    manage: {
      name: 'Manage server',
      description: 'Change server settings, restarts, and configuration details.'
    },
    discord: {
      name: 'Discord link',
      description: 'Manage the Discord integration for status updates and commands.'
    }
  };

  const ROLE_GLOBAL_PERMISSION_INFO = {
    manageUsers: {
      name: 'Manage team',
      description: 'Invite, remove, and edit teammates across the panel.'
    },
    manageServers: {
      name: 'Manage servers',
      description: 'Add, edit, or remove servers and their connection settings.'
    },
    manageRoles: {
      name: 'Manage roles',
      description: 'Create, edit, and delete roles or adjust their permissions.'
    }
  };

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
    activeTeamId: null,
    activeTeamName: null,
    teams: [],
    roles: [],
    roleTemplates: { serverCapabilities: [], globalPermissions: [] }
  };

  let socket = null;
  let addServerPinned = false;
  let activeUserDetails = null;
  let lastUserDetailsTrigger = null;
  let activeRoleEditKey = null;
  let roleServersSelection = [];
  let roleServersPreviousSelection = [];
  let roleEditorLocked = false;

  function currentUserPermissions() {
    return state.currentUser?.permissions || {};
  }

  function hasGlobalPermission(permission) {
    return !!currentUserPermissions().global?.[permission];
  }

  function serverPermissionConfig() {
    return currentUserPermissions().servers || {};
  }

  function hasServerCapability(capability) {
    const caps = serverPermissionConfig().capabilities || {};
    return !!caps[capability];
  }

  function allowedServerList() {
    if (!state.currentUser) return [];
    const allowed = serverPermissionConfig().allowed;
    if (Array.isArray(allowed)) {
      return allowed;
    }
    if (typeof allowed === 'string') {
      const normalized = allowed.trim().toLowerCase();
      if (normalized === '*' || normalized === 'all') {
        return ['*'];
      }
    }
    return [];
  }

  function canAccessServerId(serverId) {
    const allowed = allowedServerList();
    if (allowed.includes('*')) return true;
    const idNum = Number(serverId);
    const idStr = String(serverId);
    return allowed.some((entry) => {
      if (String(entry) === idStr) return true;
      const numeric = Number(entry);
      return Number.isFinite(numeric) && numeric === idNum;
    });
  }

  function syncServerPermissions(servers = []) {
    if (!state.currentUser) return;
    const current = state.currentUser.permissions || {};
    const serverPerms = current.servers || {};
    let allowed = serverPerms.allowed;
    if (allowed === '*' || allowed === 'all') {
      allowed = ['*'];
    }
    if (!Array.isArray(allowed)) {
      allowed = [];
    }
    if (allowed.includes('*')) return;
    const toKey = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? String(numeric) : String(value);
    };
    const allowedKeys = new Set(allowed.map(toKey));
    let changed = false;
    for (const server of Array.isArray(servers) ? servers : []) {
      const id = server?.id;
      if (id == null) continue;
      const key = toKey(id);
      if (!allowedKeys.has(key)) {
        allowedKeys.add(key);
        changed = true;
      }
    }
    if (!changed) return;
    const nextAllowed = Array.from(allowedKeys).map((value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : value;
    });
    state.currentUser.permissions = {
      ...current,
      servers: {
        ...serverPerms,
        allowed: nextAllowed
      }
    };
    moduleBus.emit('permissions:updated', {
      permissions: currentUserPermissions(),
      allowedServers: allowedServerList()
    });
  }

  const userDetailsDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

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

  function applyTeamContext(context = {}) {
    if (typeof context.activeTeamId !== 'undefined') {
      state.activeTeamId = context.activeTeamId == null ? null : Number(context.activeTeamId);
    }
    if (typeof context.activeTeamName !== 'undefined') {
      state.activeTeamName = context.activeTeamName || null;
    }
    if (Array.isArray(context.teams)) {
      state.teams = context.teams.map((team) => ({ ...team }));
    }
    if (state.currentUser) {
      if (context.role) state.currentUser.role = context.role;
      if (context.roleName) state.currentUser.roleName = context.roleName;
      if (context.permissions) state.currentUser.permissions = context.permissions;
      state.currentUser.activeTeamId = state.activeTeamId;
      state.currentUser.activeTeamName = state.activeTeamName;
    }
    renderTeamSwitcher();
  }

  function updateTeamSelectLabel() {
    if (!teamSelectLabel) return;
    teamSelectLabel.textContent = 'Team Selector';
  }

  function renderTeamSwitcher() {
    if (!teamSwitcher || !teamSelect) return;
    const teams = Array.isArray(state.teams) ? state.teams : [];
    if (!teams.length) {
      teamSwitcher.classList.add('hidden');
      teamSwitcher.setAttribute('aria-hidden', 'true');
      teamSelect.innerHTML = '';
      updateTeamSelectLabel();
      return;
    }
    teamSwitcher.classList.remove('hidden');
    teamSwitcher.setAttribute('aria-hidden', 'false');
    teamSelect.innerHTML = '';
    const currentUserId = Number(state.currentUser?.id);
    const hasCurrentUserId = Number.isFinite(currentUserId);
    const currentUsername = typeof state.currentUser?.username === 'string'
      ? state.currentUser.username.trim()
      : '';

    teams.forEach((team) => {
      if (!team) return;
      const option = document.createElement('option');
      option.value = String(team.id);
      const ownerId = Number(team.ownerId ?? team.owner_id ?? team.owner_user_id);
      const isOwner = hasCurrentUserId && Number.isFinite(ownerId) && ownerId === currentUserId;
      let label = team.name || `Team ${team.id}`;
      if (isOwner) {
        const ownerLabel = currentUsername || label;
        label = `${ownerLabel} (owner)`;
      } else {
        const roleSuffix = team.roleName || team.role;
        label = roleSuffix ? `${label} (${roleSuffix})` : label;
      }
      option.textContent = label;
      teamSelect.appendChild(option);
    });
    const selectedTeam = teams.find((team) => Number(team.id) === Number(state.activeTeamId));
    if (selectedTeam) {
      teamSelect.value = String(selectedTeam.id);
    } else if (teams.length) {
      teamSelect.value = String(teams[0].id);
    }
    teamSelect.disabled = teams.length <= 1;
    updateTeamSelectLabel();
  }

  async function onTeamSelectionChange() {
    if (!teamSelect) return;
    const value = teamSelect.value;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === Number(state.activeTeamId)) return;
    try {
      const response = await api('/me/active-team', { teamId: numeric }, 'POST');
      applyTeamContext(response || {});
      ui.setUser(state.currentUser);
      updateTeamAccessView({ refreshUsers: true });
      applyPermissionGates();
      await loadRoles();
      closeUserDetails();
      hideWorkspace('team-switch');
      await refreshServers();
      moduleBus.emit('players:refresh', { reason: 'team-switch', teamId: numeric });
    } catch (err) {
      if (teamSelect && state.activeTeamId != null) {
        teamSelect.value = String(state.activeTeamId);
      }
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to switch team: ' + describeError(err));
    }
  }

  async function refreshUserContext() {
    if (!state.TOKEN) return;
    try {
      const me = await api('/me');
      if (!me) return;
      state.currentUser = {
        id: me.id,
        username: me.username,
        role: me.role,
        roleName: me.roleName || me.role,
        permissions: me.permissions || {},
        activeTeamId: me.activeTeamId ?? null,
        activeTeamName: me.activeTeamName || null
      };
      applyTeamContext(me);
      ui.setUser(state.currentUser);
      applyPermissionGates();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to refresh account context: ' + describeError(err));
    }
  }

  function closeProfileMenu() {
    setProfileMenuOpen(false);
  }

  function formatUserRole(role) {
    if (!role) return '—';
    if (typeof role === 'object') {
      if (role.roleName) return role.roleName;
      if (role.name) return role.name;
      return formatUserRole(role.role);
    }
    const value = String(role).trim();
    if (!value) return '—';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatUserJoined(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    try {
      return userDetailsDateFormatter.format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  function isUserDetailsOpen() {
    return !!(userDetailsPanel && !userDetailsPanel.classList.contains('hidden'));
  }

  const dialogState = {
    open: false,
    resolver: null,
    options: null,
    lastFocus: null
  };

  function isDialogSupported() {
    return !!(dialogOverlay && dialogModal && dialogConfirmBtn);
  }

  function isDialogOpen() {
    return dialogState.open;
  }

  function setDialogError(message = '') {
    if (!dialogError) return;
    dialogError.textContent = message;
    if (message) dialogError.classList.remove('hidden');
    else dialogError.classList.add('hidden');
    if (dialogInputWrap) dialogInputWrap.classList.toggle('invalid', !!message);
  }

  function resetDialogUi() {
    setDialogError('');
    if (dialogInputWrap) dialogInputWrap.classList.remove('invalid');
    if (dialogInput) {
      dialogInput.value = '';
      dialogInput.placeholder = '';
      dialogInput.type = 'text';
      dialogInput.removeAttribute('minlength');
      dialogInput.removeAttribute('maxlength');
      delete dialogInput.dataset.required;
    }
    if (dialogInputLabel) dialogInputLabel.textContent = 'Value';
  }

  function hideDialogElements() {
    if (dialogOverlay) {
      dialogOverlay.classList.add('hidden');
      dialogOverlay.setAttribute('aria-hidden', 'true');
    }
    if (dialogModal) {
      dialogModal.classList.add('hidden');
      dialogModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
  }

  function finishDialog(result) {
    if (!dialogState.open) return;
    dialogState.open = false;
    hideDialogElements();
    resetDialogUi();
    const resolver = dialogState.resolver;
    dialogState.resolver = null;
    dialogState.options = null;
    const focusTarget = dialogState.lastFocus;
    dialogState.lastFocus = null;
    if (focusTarget && document.body.contains(focusTarget)) {
      requestAnimationFrame(() => focusTarget.focus());
    }
    resolver?.(result);
  }

  function cancelDialog() {
    finishDialog({ confirmed: false, cancelled: true });
  }

  function openDialog(options = {}) {
    if (!isDialogSupported()) {
      return Promise.resolve({ confirmed: false, cancelled: true });
    }
    if (dialogState.open) {
      finishDialog({ confirmed: false, cancelled: true });
    }
    const opts = options || {};
    resetDialogUi();
    return new Promise((resolve) => {
      dialogState.open = true;
      dialogState.resolver = resolve;
      dialogState.options = opts;
      dialogState.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (dialogTitle) dialogTitle.textContent = opts.title || 'Confirm';
      const messageText = opts.message || '';
      if (dialogMessage) {
        dialogMessage.textContent = messageText;
        dialogMessage.classList.toggle('hidden', !messageText);
      }
      if (dialogModal) {
        if (messageText) dialogModal.setAttribute('aria-describedby', 'dialogMessage');
        else dialogModal.removeAttribute('aria-describedby');
      }

      const hasPrompt = !!opts.prompt;
      if (dialogInputWrap) dialogInputWrap.classList.toggle('hidden', !hasPrompt);
      if (hasPrompt && dialogInput) {
        const prompt = opts.prompt || {};
        dialogInput.type = prompt.type || 'text';
        dialogInput.value = prompt.value != null ? String(prompt.value) : '';
        dialogInput.placeholder = prompt.placeholder || '';
        if (prompt.maxLength != null) dialogInput.maxLength = Number(prompt.maxLength);
        else dialogInput.removeAttribute('maxlength');
        if (prompt.minLength != null) dialogInput.minLength = Number(prompt.minLength);
        else dialogInput.removeAttribute('minlength');
        dialogInput.dataset.required = prompt.required ? 'true' : '';
        if (dialogInputLabel) dialogInputLabel.textContent = prompt.label || 'Value';
      }

      if (dialogCancelBtn) {
        const showCancel = opts.showCancel !== false;
        dialogCancelBtn.classList.toggle('hidden', !showCancel);
        dialogCancelBtn.textContent = opts.cancelText || 'Cancel';
      }

      if (dialogConfirmBtn) dialogConfirmBtn.textContent = opts.confirmText || 'Confirm';

      if (dialogOverlay) {
        dialogOverlay.classList.remove('hidden');
        dialogOverlay.setAttribute('aria-hidden', 'false');
      }
      if (dialogModal) {
        dialogModal.classList.remove('hidden');
        dialogModal.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
          if (hasPrompt && dialogInput) dialogInput.focus();
          else dialogConfirmBtn?.focus();
        });
      }
      document.body.classList.add('modal-open');
    });
  }

  async function confirmDialog(options = {}) {
    const result = await openDialog(options);
    return !!result?.confirmed;
  }

  async function promptDialog(options = {}) {
    const result = await openDialog({
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText ?? 'Cancel',
      showCancel: options.cancelText !== null,
      prompt: {
        label: options.label || 'Value',
        placeholder: options.placeholder || '',
        value: options.defaultValue != null ? options.defaultValue : '',
        minLength: typeof options.minLength === 'number' ? options.minLength : null,
        maxLength: typeof options.maxLength === 'number' ? options.maxLength : null,
        required: !!options.required,
        type: options.type || 'text',
        requiredMessage: options.requiredMessage,
        minMessage: options.minMessage
      }
    });
    if (!result?.confirmed) return null;
    return result.value != null ? result.value : '';
  }

  dialogOverlay?.addEventListener('click', (event) => {
    if (event.target === dialogOverlay) cancelDialog();
  });

  dialogCancelBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    cancelDialog();
  });

  dialogModal?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!dialogState.open) return;
    const opts = dialogState.options || {};
    const prompt = opts.prompt || null;
    if (prompt && dialogInput) {
      const value = dialogInput.value;
      if (prompt.required && value.length === 0) {
        setDialogError(prompt.requiredMessage || 'This field is required.');
        dialogInput.focus();
        return;
      }
      if (prompt.minLength && value.length < prompt.minLength) {
        setDialogError(prompt.minMessage || `Enter at least ${prompt.minLength} characters.`);
        dialogInput.focus();
        return;
      }
      setDialogError('');
      finishDialog({ confirmed: true, value });
      return;
    }
    finishDialog({ confirmed: true });
  });

  dialogInput?.addEventListener('input', () => {
    if (dialogState.open) setDialogError('');
  });

  function renderUserDetails(user) {
    if (!userDetailsPanel || !user) return;
    const isSelf = user.id === state.currentUser?.id;
    const roleLabel = formatUserRole(user);
    if (userDetailsName) {
      const baseName = user.username || '—';
      userDetailsName.textContent = roleLabel && roleLabel !== '—'
        ? `${baseName} (${roleLabel})`
        : baseName;
    }
    if (userDetailsSubtitle) {
      userDetailsSubtitle.textContent = isSelf
        ? 'Signed in with this account'
        : 'Review access and credentials';
    }
    if (userDetailsRole) userDetailsRole.textContent = roleLabel;
    if (userDetailsRoleBadge) userDetailsRoleBadge.textContent = roleLabel;
    if (userDetailsCreated) userDetailsCreated.textContent = formatUserJoined(user.created_at);
    if (userDetailsId) userDetailsId.textContent = user.id != null ? String(user.id) : '—';
    if (userDetailsSelfNotice) userDetailsSelfNotice.classList.toggle('hidden', !isSelf);
    if (userDetailsRoleSelect) {
      userDetailsRoleSelect.value = user.role || '';
      userDetailsRoleSelect.disabled = isSelf || !hasGlobalPermission('manageUsers');
    }
    if (userDetailsSaveRole) userDetailsSaveRole.disabled = isSelf || !hasGlobalPermission('manageUsers');
    hideNotice(userDetailsRoleStatus);
    if (userDetailsResetPassword) userDetailsResetPassword.disabled = !state.currentUser || user.id === state.currentUser.id;
    if (userDetailsDelete) userDetailsDelete.disabled = isSelf;
  }

  function openUserDetails(user) {
    if (!userDetailsPanel || !userDetailsOverlay) return;
    activeUserDetails = { ...user };
    renderUserDetails(activeUserDetails);
    userDetailsOverlay.classList.remove('hidden');
    userDetailsOverlay.setAttribute('aria-hidden', 'false');
    userDetailsPanel.classList.remove('hidden');
    userDetailsPanel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      userDetailsPanel?.focus();
    });
  }

  function closeUserDetails() {
    if (!userDetailsPanel || !userDetailsOverlay) return;
    if (userDetailsPanel.classList.contains('hidden')) return;
    userDetailsOverlay.classList.add('hidden');
    userDetailsOverlay.setAttribute('aria-hidden', 'true');
    userDetailsPanel.classList.add('hidden');
    userDetailsPanel.setAttribute('aria-hidden', 'true');
    activeUserDetails = null;
    if (lastUserDetailsTrigger && document.body.contains(lastUserDetailsTrigger)) {
      requestAnimationFrame(() => lastUserDetailsTrigger?.focus());
    }
    lastUserDetailsTrigger = null;
  }

  function findRoleDefinition(key) {
    if (!key) return null;
    return state.roles.find((role) => role.key === key) || null;
  }

  async function handleUserDetailsRoleSave() {
    if (!activeUserDetails || !userDetailsRoleSelect) return;
    if (!hasGlobalPermission('manageUsers')) return;
    const selected = userDetailsRoleSelect.value;
    if (!selected || selected === activeUserDetails.role) {
      showNotice(userDetailsRoleStatus, 'Select a different role before updating.', 'error');
      return;
    }
    try {
      await api(`/users/${activeUserDetails.id}`, { role: selected }, 'PATCH');
      const roleDef = findRoleDefinition(selected);
      activeUserDetails = {
        ...activeUserDetails,
        role: selected,
        roleName: roleDef?.name || selected
      };
      showNotice(userDetailsRoleStatus, 'Role updated successfully.', 'success');
      renderUserDetails(activeUserDetails);
      await loadUsers();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userDetailsRoleStatus, describeError(err), 'error');
    }
  }

  async function handleUserDetailsPasswordReset() {
    if (!activeUserDetails) return;
    const newPass = await promptDialog({
      title: 'Reset password',
      message: `Enter a new password for ${activeUserDetails.username}.`,
      confirmText: 'Update password',
      label: 'New password',
      placeholder: 'Minimum 8 characters',
      required: true,
      minLength: 8,
      type: 'password',
      requiredMessage: 'Password is required.',
      minMessage: 'Password must be at least 8 characters.'
    });
    if (newPass == null) return;
    if (newPass.length < 8) {
      showNotice(userFeedback, 'Password must be at least 8 characters.', 'error');
      return;
    }
    try {
      await api(`/users/${activeUserDetails.id}/password`, { newPassword: newPass }, 'POST');
      showNotice(userFeedback, 'Password updated for ' + activeUserDetails.username, 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userFeedback, describeError(err), 'error');
    }
  }

  async function handleUserDetailsDelete() {
    if (!activeUserDetails) return;
    const confirmed = await confirmDialog({
      title: 'Remove user',
      message: `Remove ${activeUserDetails.username}? This cannot be undone.`,
      confirmText: 'Remove user',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      await api(`/users/${activeUserDetails.id}`, null, 'DELETE');
      showNotice(userFeedback, 'Removed ' + activeUserDetails.username, 'success');
      closeUserDetails();
      loadUsers();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userFeedback, describeError(err), 'error');
    }
  }

  userDetailsOverlay?.addEventListener('click', (event) => {
    if (event.target === userDetailsOverlay) {
      closeUserDetails();
    }
  });

  userDetailsClose?.addEventListener('click', () => {
    closeUserDetails();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (isDialogOpen()) {
        event.preventDefault();
        cancelDialog();
        return;
      }
      if (isUserDetailsOpen()) {
        event.preventDefault();
        closeUserDetails();
      }
    }
  });

  userDetailsSaveRole?.addEventListener('click', handleUserDetailsRoleSave);
  userDetailsResetPassword?.addEventListener('click', handleUserDetailsPasswordReset);
  userDetailsDelete?.addEventListener('click', handleUserDetailsDelete);

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

  function updateWorkspaceCapabilityVisibility() {
    const visibleViews = [];
    workspaceViewButtons.forEach((btn) => {
      const view = btn.dataset.view;
      const capability = btn.dataset.capability || '';
      const allowed = !capability || hasServerCapability(capability);
      btn.classList.toggle('permission-hidden', !allowed);
      btn.classList.toggle('hidden', !allowed);
      btn.disabled = !allowed;
      btn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      if (allowed) visibleViews.push(view);
      const section = workspaceViewSectionMap.get(view);
      if (section) {
        section.classList.toggle('permission-hidden', !allowed);
        section.classList.toggle('hidden', !allowed);
        if (!allowed) section.setAttribute('aria-hidden', 'true');
      }
    });
    return visibleViews;
  }

  function applyPermissionGates() {
    const canManageServers = hasGlobalPermission('manageServers');
    if (addServerPrompt) {
      addServerPrompt.classList.toggle('hidden', !canManageServers);
      addServerPrompt.setAttribute('aria-hidden', canManageServers ? 'false' : 'true');
      if (!canManageServers) setAddServerPromptState(false);
    }
    if (!canManageServers) {
      hideAddServerCard({ force: true });
      addServerCard?.classList.add('hidden');
    } else if (addServerPinned && addServerCard) {
      addServerCard.classList.remove('hidden');
    }
    if (btnAddServer) btnAddServer.disabled = !canManageServers;
    [svName, svHost, svPort, svPass, svTLS].forEach((el) => {
      if (el) el.disabled = !canManageServers;
    });

    const canManageUsers = hasGlobalPermission('manageUsers');
    const canManageRoles = hasGlobalPermission('manageRoles');
    const canAccessTeam = canManageUsers || canManageRoles;
    if (userCreateSection) userCreateSection.classList.toggle('hidden', !canManageUsers);
    if (newUserName) newUserName.disabled = !canManageUsers;
    if (newUserPassword) newUserPassword.disabled = !canManageUsers;
    if (btnCreateUser) btnCreateUser.disabled = !canManageUsers;
    if (newUserRole) newUserRole.disabled = !canManageUsers || !state.roles.length;
    if (existingUserName) existingUserName.disabled = !canManageUsers;
    if (existingUserRole) existingUserRole.disabled = !canManageUsers || !state.roles.length;
    if (btnAddExistingUser) btnAddExistingUser.disabled = !canManageUsers;
    if (!canManageUsers) {
      hideNotice(userFeedback);
      hideNotice(existingUserFeedback);
    }

    const hasConsole = hasServerCapability('console');
    const hasCommands = hasServerCapability('commands');
    if (cmdInput) {
      cmdInput.disabled = !hasCommands;
      cmdInput.placeholder = hasCommands ? cmdInputDefaultPlaceholder : 'Commands unavailable for your role.';
      if (!hasCommands) cmdInput.value = '';
    }
    if (btnSend) btnSend.disabled = !hasCommands;
    if (quickCommandsEl) {
      quickCommandsEl.classList.toggle('hidden', !hasCommands);
      quickCommandsEl.setAttribute('aria-hidden', hasCommands ? 'false' : 'true');
      quickCommandsEl.querySelectorAll('button').forEach((btn) => { btn.disabled = !hasCommands; });
    }
    if (btnClearConsole) btnClearConsole.disabled = !hasConsole;

    const visibleViews = updateWorkspaceCapabilityVisibility();
    if (visibleViews.includes(activeWorkspaceView)) {
      setWorkspaceView(activeWorkspaceView);
    } else {
      setWorkspaceView(visibleViews[0] || workspaceViewDefault);
    }

    if (!canAccessTeam && state.activePanel === 'team') {
      switchPanel('dashboard');
    } else {
      updateTeamAccessView({ refreshUsers: state.activePanel === 'team' });
    }
    moduleBus.emit('permissions:updated', {
      permissions: currentUserPermissions(),
      allowedServers: allowedServerList()
    });
  }

  function switchPanel(panel = 'dashboard') {
    const canAccessTeam = hasGlobalPermission('manageUsers') || hasGlobalPermission('manageRoles');
    let nextPanel = panel;
    if (nextPanel === 'team' && !canAccessTeam) nextPanel = 'dashboard';
    state.activePanel = nextPanel;

    const isDashboard = nextPanel === 'dashboard';
    const isSettings = nextPanel === 'settings';
    const isTeam = nextPanel === 'team';

    if (isSettings) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      settingsPanel?.classList.remove('hidden');
    } else if (isTeam) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      teamPanel?.classList.remove('hidden');
    } else {
      dashboardPanel?.classList.remove('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
    }

    navDashboard?.classList.toggle('active', isDashboard);
    navSettings?.classList.toggle('active', isSettings);
    navTeam?.classList.toggle('active', isTeam);

    if (!isSettings) {
      hideNotice(settingsStatus);
      hideNotice(passwordStatus);
    }

    updateTeamAccessView({ refreshUsers: isTeam });
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
    no_active_team: 'Select or create a team before performing this action.',
    invalid_team: 'The selected team is not available to you.',
    user_not_found: 'No account exists with that username.',
    already_member: 'That user is already part of this team.',
    rustmaps_api_key_missing: 'Add your RustMaps API key in Settings to enable the live map.',
    rustmaps_unauthorized: 'RustMaps rejected the configured API key. Double-check it in Settings.',
    rustmaps_not_found: 'RustMaps has not published a generated map for this seed yet.',
    rustmaps_error: 'RustMaps responded with an unexpected error.',
    rustmaps_image_error: 'RustMaps returned an invalid map image.',
    live_map_failed: 'Unable to load the live map right now.',
    playerlist_failed: 'The server did not return a live player list.',
    missing_command: 'Provide a command before sending.',
    no_server_selected: 'Select a server before sending commands.',
    forbidden: 'You do not have permission to perform this action.',
    invalid_role_key: 'Provide a valid role key (letters, numbers, hyphens or underscores).',
    invalid_name: 'Role name cannot be empty.',
    reserved_role: 'This role key is reserved by the system.',
    role_exists: 'A role with that key already exists.',
    role_in_use: 'This role is currently assigned to one or more users.',
    cannot_edit_active_role: 'You cannot edit a role that is currently assigned to you.',
    invalid_payload: 'The request payload was not accepted.',
    missing_image: 'Choose an image before uploading.',
    invalid_image: 'The selected image could not be processed.',
    unsupported_image_type: 'Only PNG, JPEG, or WebP images are supported.',
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
      await api('/password', { currentPassword: currentValue, newPassword: nextValue }, 'POST');
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

  function setApiBase(value) {
    const normalized = normalizeApiBase(value);
    if (!normalized) return;
    state.API = normalized;
    localStorage.setItem('apiBase', normalized);
    if (typeof window !== 'undefined') {
      window.API_BASE = normalized;
    }
    emitWorkspaceEvent('workspace:api-base', { base: normalized });
    loadPublicConfig();
  }

  function detectDefaultApiBase() {
    const stored = normalizeApiBase(localStorage.getItem('apiBase'));
    if (stored) return stored;

    const hasWindow = typeof window !== 'undefined' && window?.location;
    const metaContent = document.querySelector('meta[name="panel-api-base"]')?.content?.trim();

    if (metaContent) {
      if (hasWindow) {
        try {
          const metaUrl = new URL(metaContent, window.location.origin);
          const normalizedMeta = normalizeApiBase(metaUrl.href);
          if (normalizedMeta) return normalizedMeta;
        } catch {
          const normalizedFallback = normalizeApiBase(metaContent);
          if (normalizedFallback) return normalizedFallback;
        }
      } else {
        const normalizedMeta = normalizeApiBase(metaContent);
        if (normalizedMeta) return normalizedMeta;
      }
    }

    if (hasWindow && window.location?.origin) {
      const normalizedOrigin = normalizeApiBase(window.location.origin);
      if (normalizedOrigin) return normalizedOrigin;
    }

    return normalizeApiBase('http://localhost');
  }

  async function loadPublicConfig() {
    if (!state.API) return;
    try {
      const res = await fetch(state.API + '/public-config');
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
    if (!hasGlobalPermission('manageServers')) return;
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
    if (!hasGlobalPermission('manageServers')) return;
    const willOpen = addServerCard.classList.contains('hidden');
    addServerPinned = willOpen;
    addServerCard.classList.toggle('hidden', !willOpen);
    setAddServerPromptState(willOpen);
    if (willOpen && svName) svName.focus();
  }

  function leaveCurrentServer(reason = 'close') {
    const previous = state.currentServerId;
    if (previous == null) return;
    if (socket?.connected && hasServerCapability('console')) {
      try { socket.emit('leave-server', previous); }
      catch { /* ignore */ }
    }
    moduleBus.emit('server:disconnected', { serverId: previous, reason });
    state.currentServerId = null;
    if (typeof window !== 'undefined') window.__workspaceSelectedServer = null;
    emitWorkspaceEvent('workspace:server-cleared', { reason });
    highlightSelectedServer();
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

    const playersCurrent = Number.isFinite(playersOnline) && playersOnline >= 0 ? playersOnline : 0;
    const playersMaxSafe = Number.isFinite(maxPlayers) && maxPlayers >= 0 ? maxPlayers : null;
    const joiningValue = Number.isFinite(joiningCount) && joiningCount >= 0 ? joiningCount : 0;
    emitWorkspaceEvent('workspace:server-status', {
      serverId: numericId,
      status: {
        players: { current: playersCurrent, max: playersMaxSafe },
        joining: joiningValue,
        presence: online ? 'online' : 'dnd',
        presenceLabel: online ? 'Online' : 'Do Not Disturb',
        lastCheck: status?.lastCheck || null
      }
    });
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

  function resolveSocketBase() {
    const base = state.API || '';
    if (/^https?:\/\//i.test(base)) {
      try {
        const url = new URL(base);
        return url.origin;
      } catch {
        return '';
      }
    }
    return '';
  }

  function ensureSocket() {
    if (socket || !state.API) return socket;
    const socketBase = resolveSocketBase();
    socket = io(socketBase || undefined, {
      transports: ['websocket'],
      auth: { token: state.TOKEN || undefined }
    });
    socket.on('connect', () => {
      ui.log('Realtime link established.');
      if (state.currentServerId != null && hasServerCapability('console') && canAccessServerId(state.currentServerId)) {
        socket.emit('join-server', state.currentServerId);
      }
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
      return await api('/servers/status');
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
    const canManageServer = hasGlobalPermission('manageServers');
    let editForm = null;
    let editBtn = null;
    let removeBtn = null;
    let cancelBtn = null;
    let saveBtn = null;
    let nameInput = null;
    let hostInput = null;
    let portInput = null;
    let passwordInput = null;
    let tlsInput = null;
    let feedback = null;
    let editOpen = false;
    let toggleEdit = () => {};

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'accent small';
    openBtn.textContent = 'Open workspace';
    openBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      connectServer(server.id);
    });

    if (canManageServer) {
      editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'ghost small';
      editBtn.textContent = 'Edit server';
      actions.appendChild(editBtn);

      editForm = document.createElement('form');
      editForm.className = 'server-card-edit hidden';
      editForm.id = `server-edit-${server.id}`;
      editBtn.setAttribute('aria-controls', editForm.id);
      editBtn.setAttribute('aria-expanded', 'false');
      const formGrid = document.createElement('div');
      formGrid.className = 'grid2 stack-sm';
      nameInput = document.createElement('input');
      nameInput.placeholder = 'Name';
      hostInput = document.createElement('input');
      hostInput.placeholder = 'Host/IP';
      portInput = document.createElement('input');
      portInput.type = 'number';
      portInput.min = '1';
      portInput.placeholder = 'RCON Port';
      passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.placeholder = 'Leave blank to keep current password';
      formGrid.appendChild(nameInput);
      formGrid.appendChild(hostInput);
      formGrid.appendChild(portInput);
      formGrid.appendChild(passwordInput);
      const tlsCheckboxLabel = document.createElement('label');
      tlsCheckboxLabel.className = 'inline';
      tlsInput = document.createElement('input');
      tlsInput.type = 'checkbox';
      tlsCheckboxLabel.appendChild(tlsInput);
      tlsCheckboxLabel.appendChild(document.createTextNode(' Use TLS (wss)'));
      const removeRow = document.createElement('div');
      removeRow.className = 'row remove-row';
      removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'ghost danger';
      removeBtn.textContent = 'Remove server';
      removeRow.appendChild(removeBtn);

      const formRow = document.createElement('div');
      formRow.className = 'row';
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = 'Cancel';
      saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'accent';
      saveBtn.textContent = 'Save changes';
      formRow.appendChild(cancelBtn);
      formRow.appendChild(saveBtn);
      feedback = document.createElement('p');
      feedback.className = 'server-edit-feedback hidden';
      editForm.appendChild(formGrid);
      editForm.appendChild(tlsCheckboxLabel);
      editForm.appendChild(removeRow);
      editForm.appendChild(formRow);
      editForm.appendChild(feedback);

      const showFeedback = (message = '', variant = '') => {
        feedback.textContent = message;
        feedback.classList.remove('hidden', 'error', 'success');
        if (!message) {
          feedback.classList.add('hidden');
          return;
        }
        if (variant) feedback.classList.add(variant);
      };

      const resetEditInputs = () => {
        const data = entry.data || {};
        nameInput.value = data.name || '';
        hostInput.value = data.host || '';
        portInput.value = data.port != null ? String(data.port) : '';
        tlsInput.checked = !!data.tls;
        passwordInput.value = '';
      };

      toggleEdit = (force) => {
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
      };

      cancelBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        showFeedback('');
        toggleEdit(false);
      });

      removeBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const label = entry.data?.name || server.name || `Server #${server.id}`;
        const confirmed = await confirmDialog({
          title: 'Remove server',
          message: `Remove ${label}? This cannot be undone.`,
          confirmText: 'Remove server',
          cancelText: 'Cancel'
        });
        if (!confirmed) return;
        removeBtn.disabled = true;
        cancelBtn.disabled = true;
        saveBtn.disabled = true;
        showFeedback('Removing…');
        try {
          await api(`/servers/${server.id}`, null, 'DELETE');
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
        toggleEdit(!editOpen);
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
          await api(`/servers/${server.id}`, payload, 'PATCH');
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
    }

    actions.appendChild(openBtn);
    foot.appendChild(details);
    foot.appendChild(actions);

    card.addEventListener('click', (ev) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (target && (target.closest('.server-card-actions') || (canManageServer && target.closest('.server-card-edit')))) {
        return;
      }
      if (canManageServer && editOpen) return;
      connectServer(server.id);
    });

    card.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === card) {
        ev.preventDefault();
        if (canManageServer && editOpen) return;
        connectServer(server.id);
      }
    });

    card.appendChild(mainRow);
    card.appendChild(foot);
    if (editForm) card.appendChild(editForm);
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
      const list = await api('/servers');
      syncServerPermissions(list);
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
    if (!canAccessServerId(numericId) || !hasServerCapability('view')) {
      ui.log('You do not have permission to access this server.');
      return;
    }
    const previous = state.currentServerId;
    if (previous === numericId) {
      showWorkspaceForServer(numericId);
      updateWorkspaceDisplay(entry);
      if (typeof window !== 'undefined') window.__workspaceSelectedServer = numericId;
      emitWorkspaceEvent('workspace:server-selected', { serverId: numericId, repeat: true });
      return;
    }
    if (previous != null && previous !== numericId) {
      if (socket?.connected && hasServerCapability('console')) {
        try { socket.emit('leave-server', previous); }
        catch { /* ignore */ }
      }
      moduleBus.emit('server:disconnected', { serverId: previous, reason: 'switch' });
    }
    state.currentServerId = numericId;
    if (typeof window !== 'undefined') window.__workspaceSelectedServer = numericId;
    emitWorkspaceEvent('workspace:server-selected', { serverId: numericId });
    highlightSelectedServer();
    ui.clearConsole();
    const name = entry?.data?.name || `Server #${numericId}`;
    const consoleAccess = hasServerCapability('console');
    ui.log(`${consoleAccess ? 'Connecting to' : 'Opening'} ${name}...`);
    const sock = ensureSocket();
    if (sock && sock.connected && consoleAccess) {
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
    confirm(options) {
      return confirmDialog(options);
    },
    prompt(options) {
      return promptDialog(options);
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
        profileRole.textContent = formatUserRole(user);
      }
      if (!user) {
        applyPermissionGates();
        return;
      }
      const header = document.createElement('div');
      header.className = 'user-box-header';
      const strong = document.createElement('strong');
      strong.textContent = user.username;
      header.appendChild(strong);
      if (user.role) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = formatUserRole(user);
        header.appendChild(badge);
      }
      userBox.appendChild(header);

      const descriptor = document.createElement('span');
      descriptor.className = 'menu-description';
      descriptor.textContent = `Role: ${formatUserRole(user)}`;
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
      applyPermissionGates();
    }
  };

  function getServerList() {
    return [...state.serverItems.values()].map((entry) => entry.data).filter(Boolean);
  }

  function getServerData(id) {
    return state.serverItems.get(String(id))?.data || null;
  }

  function isAbsoluteUrl(value) {
    return /^https?:\/\//i.test(String(value || ''));
  }

  async function authorizedFetch(path, options = {}) {
    if (!state.TOKEN) throw new Error('unauthorized');
    const { absolute = false, headers: inputHeaders, ...rest } = options || {};
    const headers = new Headers(inputHeaders || {});
    headers.set('Authorization', 'Bearer ' + state.TOKEN);
    const fetchOptions = { ...rest, headers };
    const target = absolute || isAbsoluteUrl(path) ? String(path || '') : state.API + String(path || '');
    let res;
    try {
      res = await fetch(target, fetchOptions);
    } catch (err) {
      if (err instanceof TypeError) throw new Error('network_error');
      throw err;
    }
    if (res.status === 401) throw new Error('unauthorized');
    return res;
  }

  const moduleHostContext = {
    createCard: createModuleCard,
    on: moduleBus.on,
    emit: moduleBus.emit,
    api,
    publicJson,
    authorizedFetch,
    log: (line) => ui.log(line),
    describeError,
    errorCode,
    handleUnauthorized,
    registerQuickCommand,
    setQuickInput,
    confirm: (options) => confirmDialog(options),
    prompt: (options) => promptDialog(options),
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
    state.activeTeamId = null;
    state.activeTeamName = null;
    state.teams = [];
    stopStatusPolling();
    disconnectSocket();
    localStorage.removeItem('token');
    state.serverItems.clear();
    state.settings = {};
    state.activePanel = 'dashboard';
    state.roles = [];
    state.roleTemplates = { serverCapabilities: [], globalPermissions: [] };
    activeRoleEditKey = null;
    updateRoleOptions();
    updateRoleManagerVisibility(false);
    updateTeamAccessView();
    renderTeamSwitcher();
    serversEl.innerHTML = '';
    ui.clearConsole();
    ui.setUser(null);
    closeUserDetails();
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
    const opts = { method, headers, cache: 'no-store' };
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
    const opts = { method, cache: 'no-store' };
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
    if (!hasGlobalPermission('manageUsers')) return;
    hideNotice(userFeedback);
    try {
      const list = await api('/users');
      userList.innerHTML = '';
      let activeMatch = null;
      for (const user of list) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'user-item';
        const primary = document.createElement('div');
        primary.className = 'user-item-primary';
        const name = document.createElement('span');
        name.className = 'user-item-name';
        name.textContent = user.username;
        primary.appendChild(name);
        const meta = document.createElement('span');
        meta.className = 'user-item-meta';
        meta.textContent = `Role: ${formatUserRole(user)}`;
        primary.appendChild(meta);
        button.appendChild(primary);

        const trailing = document.createElement('div');
        trailing.className = 'user-item-trailing';
        if (user.id === state.currentUser.id) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'You';
          trailing.appendChild(badge);
        }
        const chevron = document.createElement('span');
        chevron.className = 'user-item-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '›';
        trailing.appendChild(chevron);
        button.appendChild(trailing);

        button.addEventListener('click', () => {
          lastUserDetailsTrigger = button;
          openUserDetails(user);
        });

        li.appendChild(button);
        userList.appendChild(li);

        if (activeUserDetails && user.id === activeUserDetails.id) {
          activeMatch = user;
          if (isUserDetailsOpen()) {
            lastUserDetailsTrigger = button;
          }
        }
      }
      if (activeUserDetails) {
        if (activeMatch) {
          activeUserDetails = { ...activeMatch };
          renderUserDetails(activeUserDetails);
        } else {
          closeUserDetails();
        }
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(userFeedback, describeError(err), 'error');
    }
  }

  function normalizeRoleServerSelection(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    const normalized = [];
    const seen = new Set();
    let allowAll = false;
    list.forEach((value) => {
      if (value == null) return;
      const key = String(value).trim();
      if (!key) return;
      if (key === '*') {
        allowAll = true;
        return;
      }
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(key);
      }
    });
    if (allowAll) return ['*'];
    return normalized;
  }

  function setRoleServersSelection(list) {
    roleServersSelection = normalizeRoleServerSelection(list);
    if (!roleServersSelection.includes('*')) {
      roleServersPreviousSelection = [...roleServersSelection];
    } else {
      roleServersPreviousSelection = [];
    }
    syncRoleServerCheckboxState();
  }

  function getRoleServersSelection() {
    if (roleServersSelection.includes('*')) return ['*'];
    return [...roleServersSelection];
  }

  function formatPermissionLabel(value) {
    if (!value) return '';
    return String(value)
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/^./, (c) => c.toUpperCase());
  }

  function createRoleServerOption(value, title, description, { missing = false } = {}) {
    const label = document.createElement('label');
    label.className = `role-checkbox${missing ? ' missing' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.roleServer = value;
    label.appendChild(input);
    const content = document.createElement('div');
    content.className = 'role-checkbox-content';
    const heading = document.createElement('span');
    heading.className = 'role-checkbox-title';
    heading.textContent = title;
    content.appendChild(heading);
    if (description) {
      const desc = document.createElement('span');
      desc.className = 'role-checkbox-description';
      desc.textContent = description;
      content.appendChild(desc);
    }
    label.appendChild(content);
    return label;
  }

  function createRolePermissionOption(type, value, info = {}) {
    const label = document.createElement('label');
    label.className = 'role-checkbox role-permission';
    const input = document.createElement('input');
    input.type = 'checkbox';
    if (type === 'capability') input.dataset.roleCapability = value;
    else if (type === 'global') input.dataset.roleGlobal = value;
    label.appendChild(input);
    const content = document.createElement('div');
    content.className = 'role-checkbox-content';
    const heading = document.createElement('span');
    heading.className = 'role-checkbox-title';
    heading.textContent = info.name || formatPermissionLabel(value);
    content.appendChild(heading);
    if (info.description) {
      const desc = document.createElement('span');
      desc.className = 'role-checkbox-description';
      desc.textContent = info.description;
      content.appendChild(desc);
    }
    label.appendChild(content);
    return label;
  }

  function syncRoleServerCheckboxState() {
    if (!roleServersList) return;
    const allowAll = roleServersSelection.includes('*');
    roleServersList.querySelectorAll('input[type="checkbox"][data-role-server]').forEach((input) => {
      const value = input.dataset.roleServer;
      if (!value) return;
      const shouldCheck = allowAll ? value === '*' : roleServersSelection.includes(value);
      input.checked = shouldCheck;
      if (value === '*') {
        input.indeterminate = false;
      }
    });
    setRoleEditorLocked(roleEditorLocked);
  }

  function renderRoleServersOptions() {
    if (!roleServersList) return;
    const servers = getServerList();
    const knownIds = new Set(servers.map((server) => String(server.id)));
    roleServersList.innerHTML = '';
    const allOption = createRoleServerOption('*', 'All servers', 'Grant access to every server you add.');
    roleServersList.appendChild(allOption);
    if (!servers.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small role-checkbox-empty';
      empty.textContent = 'No servers available yet. Create a server to assign access.';
      roleServersList.appendChild(empty);
    } else {
      servers.forEach((server) => {
        const value = String(server.id);
        const host = server.host || server.address || '';
        const port = server.port != null ? `:${server.port}` : '';
        const tls = server.tls ? ' · TLS' : '';
        const description = host ? `${host}${port}${tls}` : '';
        roleServersList.appendChild(
          createRoleServerOption(value, server.name || `Server #${value}`, description || null)
        );
      });
    }
    const missing = roleServersSelection.filter((value) => value !== '*' && !knownIds.has(value));
    missing.forEach((value) => {
      roleServersList.appendChild(
        createRoleServerOption(value, `Server #${value}`, 'No longer available', { missing: true })
      );
    });
    syncRoleServerCheckboxState();
  }

  function handleRoleServersChange(event) {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (!target || target.type !== 'checkbox') return;
    if (roleEditorLocked) {
      syncRoleServerCheckboxState();
      return;
    }
    const value = target.dataset.roleServer;
    if (!value) return;
    hideNotice(roleFeedback);
    if (value === '*') {
      if (target.checked) {
        roleServersPreviousSelection = roleServersSelection.includes('*')
          ? []
          : roleServersSelection.filter((entry) => entry !== '*');
        roleServersSelection = ['*'];
      } else {
        roleServersSelection = [...roleServersPreviousSelection];
        roleServersPreviousSelection = [];
      }
    } else {
      const current = new Set(roleServersSelection.filter((entry) => entry !== '*'));
      if (target.checked) {
        current.add(value);
      } else {
        current.delete(value);
      }
      roleServersSelection = [...current];
      roleServersPreviousSelection = [...roleServersSelection];
      const allOption = roleServersList?.querySelector('input[type="checkbox"][data-role-server="*"]');
      if (allOption && allOption.checked) {
        allOption.checked = false;
      }
    }
    syncRoleServerCheckboxState();
  }

  moduleBus.on('servers:updated', () => {
    renderRoleServersOptions();
  });

  function renderRoleEditorFields() {
    if (roleCapabilitiesContainer) {
      roleCapabilitiesContainer.innerHTML = '';
      const caps = state.roleTemplates?.serverCapabilities || [];
      if (!caps.length) {
        const note = document.createElement('p');
        note.className = 'muted small role-checkbox-empty';
        note.textContent = 'No server capabilities available.';
        roleCapabilitiesContainer.appendChild(note);
      } else {
        caps.forEach((cap) => {
          const info = ROLE_CAPABILITY_INFO[cap] || { name: formatPermissionLabel(cap) };
          const label = createRolePermissionOption('capability', cap, info);
          const input = label.querySelector('input');
          if (input) input.addEventListener('change', () => hideNotice(roleFeedback));
          roleCapabilitiesContainer.appendChild(label);
        });
      }
    }
    if (roleGlobalContainer) {
      roleGlobalContainer.innerHTML = '';
      const perms = state.roleTemplates?.globalPermissions || [];
      if (!perms.length) {
        const note = document.createElement('p');
        note.className = 'muted small role-checkbox-empty';
        note.textContent = 'No global permissions available.';
        roleGlobalContainer.appendChild(note);
      } else {
        perms.forEach((perm) => {
          const info = ROLE_GLOBAL_PERMISSION_INFO[perm] || { name: formatPermissionLabel(perm) };
          const label = createRolePermissionOption('global', perm, info);
          const input = label.querySelector('input');
          if (input) input.addEventListener('change', () => hideNotice(roleFeedback));
          roleGlobalContainer.appendChild(label);
        });
      }
    }
    setRoleEditorLocked(roleEditorLocked);
  }

  function getDefaultRoleKey(roles = state.roles) {
    const list = Array.isArray(roles) ? roles : [];
    if (!list.length) return '';
    const preferred = list.find((role) => role?.key === 'user');
    if (preferred?.key) return preferred.key;
    return list[0]?.key || '';
  }

  function applyDefaultRoleSelection(select, roles = state.roles) {
    if (!select) return;
    const defaultKey = getDefaultRoleKey(roles);
    const options = Array.from(select.options || []).map((opt) => opt.value);
    if (defaultKey && options.includes(defaultKey)) {
      select.value = defaultKey;
    } else if (options.length) {
      select.value = options[0];
    } else {
      select.value = '';
    }
  }

  function populateRoleSelectOptions(select, roles = [], preserve = true) {
    if (!select) return;
    const previous = preserve ? select.value : '';
    select.innerHTML = '';
    roles.forEach((role) => {
      const option = document.createElement('option');
      option.value = role.key;
      option.textContent = role.name || role.key;
      select.appendChild(option);
    });
    if (roles.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No roles available';
      select.appendChild(option);
      select.disabled = true;
      select.value = '';
      return;
    }
    select.disabled = false;
    if (previous && roles.some((role) => role.key === previous)) {
      select.value = previous;
    } else {
      applyDefaultRoleSelection(select, roles);
    }
  }

  function updateRoleOptions() {
    const roles = state.roles || [];
    populateRoleSelectOptions(newUserRole, roles);
    populateRoleSelectOptions(existingUserRole, roles);
    populateRoleSelectOptions(userDetailsRoleSelect, roles);
    populateRoleSelectOptions(roleSelect, roles, false);
  }

  function applyRoleToEditor(role) {
    if (!roleEditor) return;
    hideNotice(roleFeedback);
    if (!role) {
      roleEditor.classList.add('hidden');
      roleEditor.setAttribute('aria-hidden', 'true');
      if (roleEditorEmpty) roleEditorEmpty.classList.remove('hidden');
      setRoleEditorLocked(false);
      return;
    }
    roleEditor.classList.remove('hidden');
    roleEditor.setAttribute('aria-hidden', 'false');
    if (roleEditorEmpty) roleEditorEmpty.classList.add('hidden');
    if (roleSelect && roleSelect.value !== role.key) roleSelect.value = role.key;
    if (roleNameInput) roleNameInput.value = role.name || '';
    if (roleDescriptionInput) roleDescriptionInput.value = role.description || '';
    setRoleServersSelection(role.permissions?.servers?.allowed);
    renderRoleServersOptions();
    if (roleCapabilitiesContainer) {
      const caps = role.permissions?.servers?.capabilities || {};
      roleCapabilitiesContainer.querySelectorAll('input[data-role-capability]').forEach((input) => {
        const cap = input.dataset.roleCapability;
        input.checked = !!caps?.[cap];
      });
    }
    if (roleGlobalContainer) {
      const globals = role.permissions?.global || {};
      roleGlobalContainer.querySelectorAll('input[data-role-global]').forEach((input) => {
        const perm = input.dataset.roleGlobal;
        input.checked = !!globals?.[perm];
      });
    }
    const currentRoleKey = (state.currentUser?.role || '').toLowerCase();
    const editorRoleKey = (role.key || '').toLowerCase();
    const shouldLock = !!currentRoleKey && !!editorRoleKey && currentRoleKey === editorRoleKey;
    setRoleEditorLocked(shouldLock);
  }

  function openRoleEditor(key) {
    activeRoleEditKey = key || null;
    const role = findRoleDefinition(activeRoleEditKey);
    applyRoleToEditor(role);
  }

  function collectRoleCapabilities() {
    const result = {};
    if (!roleCapabilitiesContainer) return result;
    roleCapabilitiesContainer.querySelectorAll('input[data-role-capability]').forEach((input) => {
      const cap = input.dataset.roleCapability;
      if (!cap) return;
      result[cap] = !!input.checked;
    });
    return result;
  }

  function collectRoleGlobalPermissions() {
    const result = {};
    if (!roleGlobalContainer) return result;
    roleGlobalContainer.querySelectorAll('input[data-role-global]').forEach((input) => {
      const perm = input.dataset.roleGlobal;
      if (!perm) return;
      result[perm] = !!input.checked;
    });
    return result;
  }

  function setRoleEditorLocked(locked) {
    roleEditorLocked = !!locked;
    if (roleEditor) {
      roleEditor.classList.toggle('role-editor-locked', roleEditorLocked);
      roleEditor.setAttribute('aria-disabled', roleEditorLocked ? 'true' : 'false');
    }
    if (roleLockedNotice) {
      roleLockedNotice.classList.toggle('hidden', !roleEditorLocked);
    }
    if (roleNameInput) roleNameInput.disabled = roleEditorLocked;
    if (roleDescriptionInput) roleDescriptionInput.disabled = roleEditorLocked;
    if (btnSaveRole) btnSaveRole.disabled = roleEditorLocked;
    if (btnDeleteRole) btnDeleteRole.disabled = roleEditorLocked;
    const allowAll = roleServersSelection.includes('*');
    roleServersList?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const isAllToggle = input.dataset.roleServer === '*';
      input.disabled = roleEditorLocked || (!isAllToggle && allowAll);
    });
    roleCapabilitiesContainer?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.disabled = roleEditorLocked;
    });
    roleGlobalContainer?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.disabled = roleEditorLocked;
    });
  }

  async function handleRoleCreate() {
    if (!hasGlobalPermission('manageRoles')) return;
    hideNotice(roleFeedback);
    const keyValue = (newRoleKey?.value || '').trim().toLowerCase();
    const nameValue = newRoleName?.value?.trim();
    if (!keyValue || !nameValue) {
      showNotice(roleFeedback, 'Provide both a key and name for the role.', 'error');
      return;
    }
    try {
      await api('/roles', { key: keyValue, name: nameValue }, 'POST');
      if (newRoleKey) newRoleKey.value = '';
      if (newRoleName) newRoleName.value = '';
      showNotice(roleFeedback, 'Role created. Configure its permissions below.', 'success');
      await loadRoles();
      openRoleEditor(keyValue);
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function handleRoleSave() {
    if (!hasGlobalPermission('manageRoles') || !activeRoleEditKey) return;
    hideNotice(roleFeedback);
    if (roleEditorLocked) {
      showNotice(roleFeedback, 'Select a different role before editing.', 'error');
      return;
    }
    const nameValue = roleNameInput?.value?.trim();
    if (!nameValue) {
      showNotice(roleFeedback, 'Role name cannot be empty.', 'error');
      return;
    }
    const payload = {
      name: nameValue,
      description: roleDescriptionInput?.value?.trim() || null,
      allowedServers: getRoleServersSelection(),
      capabilities: collectRoleCapabilities(),
      global: collectRoleGlobalPermissions()
    };
    try {
      await api(`/roles/${activeRoleEditKey}`, payload, 'PATCH');
      showNotice(roleFeedback, 'Role updated.', 'success');
      await loadRoles();
      openRoleEditor(activeRoleEditKey);
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function handleRoleDelete() {
    if (!hasGlobalPermission('manageRoles') || !activeRoleEditKey) return;
    hideNotice(roleFeedback);
    const role = findRoleDefinition(activeRoleEditKey);
    if (!role) return;
    const confirmed = await confirmDialog({
      title: 'Delete role',
      message: `Delete the role "${role.name || role.key}"? This cannot be undone.`,
      confirmText: 'Delete role',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      await api(`/roles/${activeRoleEditKey}`, null, 'DELETE');
      showNotice(roleFeedback, 'Role removed.', 'success');
      activeRoleEditKey = null;
      await loadRoles();
      if (state.roles.length) {
        openRoleEditor(state.roles[0].key);
      } else {
        applyRoleToEditor(null);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function loadRoles() {
    if (!state.TOKEN) return;
    if (!hasGlobalPermission('manageRoles') && !hasGlobalPermission('manageUsers')) {
      state.roles = [];
      state.roleTemplates = { serverCapabilities: [], globalPermissions: [] };
      activeRoleEditKey = null;
      updateRoleOptions();
      updateRoleManagerVisibility(false);
      applyPermissionGates();
      return;
    }
    try {
      const data = await api('/roles');
      state.roles = Array.isArray(data?.roles) ? data.roles : [];
      state.roleTemplates = data?.templates || { serverCapabilities: [], globalPermissions: [] };
      renderRoleEditorFields();
      updateRoleOptions();
      if (newUserRole && !newUserRole.value) applyDefaultRoleSelection(newUserRole);
      if (existingUserRole && !existingUserRole.value) applyDefaultRoleSelection(existingUserRole);
      if (!state.roles.length) {
        activeRoleEditKey = null;
        applyRoleToEditor(null);
      } else if (hasGlobalPermission('manageRoles')) {
        const target = activeRoleEditKey && state.roles.some((role) => role.key === activeRoleEditKey)
          ? activeRoleEditKey
          : state.roles[0]?.key;
        if (target) openRoleEditor(target);
      } else {
        activeRoleEditKey = null;
        applyRoleToEditor(null);
      }
      applyPermissionGates();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to load roles: ' + describeError(err));
    }
  }

  function updateRoleManagerVisibility(canManageRoles) {
    if (!roleManager) return;
    const active = !!canManageRoles;
    roleManager.classList.toggle('hidden', !active);
    roleManager.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (rolesHeader) {
      rolesHeader.classList.toggle('hidden', !active);
      rolesHeader.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (rolesDescription) {
      rolesDescription.classList.toggle('hidden', !active);
      rolesDescription.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (rolesSection) {
      rolesSection.classList.toggle('hidden', !active);
      rolesSection.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (!active) {
      activeRoleEditKey = null;
      applyRoleToEditor(null);
    } else if (!activeRoleEditKey && state.roles.length) {
      openRoleEditor(state.roles[0].key);
    }
  }

  function toggleUserCard() {
    const canUsers = hasGlobalPermission('manageUsers');
    const canRoles = hasGlobalPermission('manageRoles');
    if (canUsers || canRoles) {
      userCard.classList.remove('hidden');
      if (canUsers) {
        loadUsers();
      } else {
        userList.innerHTML = '';
        closeUserDetails();
      }
      if (userCreateSection) userCreateSection.classList.toggle('hidden', !canUsers);
      updateRoleManagerVisibility(canRoles);
    } else {
      select.value = roles[0].key;
    }
  }

  function updateRoleOptions() {
    const roles = state.roles || [];
    populateRoleSelectOptions(newUserRole, roles);
    populateRoleSelectOptions(existingUserRole, roles);
    populateRoleSelectOptions(userDetailsRoleSelect, roles);
    populateRoleSelectOptions(roleSelect, roles, false);
  }

  function applyRoleToEditor(role) {
    if (!roleEditor) return;
    hideNotice(roleFeedback);
    if (!role) {
      roleEditor.classList.add('hidden');
      roleEditor.setAttribute('aria-hidden', 'true');
      return;
    }
    roleEditor.classList.remove('hidden');
    roleEditor.setAttribute('aria-hidden', 'false');
    if (roleSelect && roleSelect.value !== role.key) roleSelect.value = role.key;
    if (roleNameInput) roleNameInput.value = role.name || '';
    if (roleDescriptionInput) roleDescriptionInput.value = role.description || '';
    setRoleServersSelection(role.permissions?.servers?.allowed);
    renderRoleServersOptions();
    if (roleCapabilitiesContainer) {
      const caps = role.permissions?.servers?.capabilities || {};
      roleCapabilitiesContainer.querySelectorAll('input[data-role-capability]').forEach((input) => {
        const cap = input.dataset.roleCapability;
        input.checked = !!caps?.[cap];
      });
    }
    if (roleGlobalContainer) {
      const globals = role.permissions?.global || {};
      roleGlobalContainer.querySelectorAll('input[data-role-global]').forEach((input) => {
        const perm = input.dataset.roleGlobal;
        input.checked = !!globals?.[perm];
      });
    }
  }

  function openRoleEditor(key) {
    activeRoleEditKey = key || null;
    const role = findRoleDefinition(activeRoleEditKey);
    applyRoleToEditor(role);
  }

  function collectRoleCapabilities() {
    const result = {};
    if (!roleCapabilitiesContainer) return result;
    roleCapabilitiesContainer.querySelectorAll('input[data-role-capability]').forEach((input) => {
      const cap = input.dataset.roleCapability;
      if (!cap) return;
      result[cap] = !!input.checked;
    });
    return result;
  }

  function collectRoleGlobalPermissions() {
    const result = {};
    if (!roleGlobalContainer) return result;
    roleGlobalContainer.querySelectorAll('input[data-role-global]').forEach((input) => {
      const perm = input.dataset.roleGlobal;
      if (!perm) return;
      result[perm] = !!input.checked;
    });
    return result;
  }

  async function handleRoleCreate() {
    if (!hasGlobalPermission('manageRoles')) return;
    hideNotice(roleFeedback);
    const keyValue = (newRoleKey?.value || '').trim().toLowerCase();
    const nameValue = newRoleName?.value?.trim();
    if (!keyValue || !nameValue) {
      showNotice(roleFeedback, 'Provide both a key and name for the role.', 'error');
      return;
    }
    try {
      await api('/roles', { key: keyValue, name: nameValue }, 'POST');
      if (newRoleKey) newRoleKey.value = '';
      if (newRoleName) newRoleName.value = '';
      showNotice(roleFeedback, 'Role created. Configure its permissions below.', 'success');
      await loadRoles();
      openRoleEditor(keyValue);
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function handleRoleSave() {
    if (!hasGlobalPermission('manageRoles') || !activeRoleEditKey) return;
    hideNotice(roleFeedback);
    const nameValue = roleNameInput?.value?.trim();
    if (!nameValue) {
      showNotice(roleFeedback, 'Role name cannot be empty.', 'error');
      return;
    }
    const payload = {
      name: nameValue,
      description: roleDescriptionInput?.value?.trim() || null,
      allowedServers: getRoleServersSelection(),
      capabilities: collectRoleCapabilities(),
      global: collectRoleGlobalPermissions()
    };
    try {
      await api(`/roles/${activeRoleEditKey}`, payload, 'PATCH');
      showNotice(roleFeedback, 'Role updated.', 'success');
      await loadRoles();
      openRoleEditor(activeRoleEditKey);
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function handleRoleDelete() {
    if (!hasGlobalPermission('manageRoles') || !activeRoleEditKey) return;
    hideNotice(roleFeedback);
    const role = findRoleDefinition(activeRoleEditKey);
    if (!role) return;
    const confirmed = await confirmDialog({
      title: 'Delete role',
      message: `Delete the role "${role.name || role.key}"? This cannot be undone.`,
      confirmText: 'Delete role',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      await api(`/roles/${activeRoleEditKey}`, null, 'DELETE');
      showNotice(roleFeedback, 'Role removed.', 'success');
      activeRoleEditKey = null;
      await loadRoles();
      if (state.roles.length) {
        openRoleEditor(state.roles[0].key);
      } else {
        applyRoleToEditor(null);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(roleFeedback, describeError(err), 'error');
    }
  }

  async function loadRoles() {
    if (!state.TOKEN) return;
    if (!hasGlobalPermission('manageRoles') && !hasGlobalPermission('manageUsers')) {
      state.roles = [];
      state.roleTemplates = { serverCapabilities: [], globalPermissions: [] };
      activeRoleEditKey = null;
      updateRoleOptions();
      updateRoleManagerVisibility(false);
      applyPermissionGates();
      return;
    }
    try {
      const data = await api('/roles');
      state.roles = Array.isArray(data?.roles) ? data.roles : [];
      state.roleTemplates = data?.templates || { serverCapabilities: [], globalPermissions: [] };
      renderRoleEditorFields();
      updateRoleOptions();
      if (!state.roles.length) {
        activeRoleEditKey = null;
        applyRoleToEditor(null);
      } else if (hasGlobalPermission('manageRoles')) {
        const target = activeRoleEditKey && state.roles.some((role) => role.key === activeRoleEditKey)
          ? activeRoleEditKey
          : state.roles[0]?.key;
        if (target) openRoleEditor(target);
      } else {
        activeRoleEditKey = null;
        applyRoleToEditor(null);
      }
      applyPermissionGates();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to load roles: ' + describeError(err));
    }
  }

  function updateRoleManagerVisibility(canManageRoles) {
    if (!roleManager) return;
    const active = !!canManageRoles;
    roleManager.classList.toggle('hidden', !active);
    roleManager.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (rolesHeader) {
      rolesHeader.classList.toggle('hidden', !active);
      rolesHeader.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (rolesDescription) {
      rolesDescription.classList.toggle('hidden', !active);
      rolesDescription.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (rolesSection) {
      rolesSection.classList.toggle('hidden', !active);
      rolesSection.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (!active) {
      activeRoleEditKey = null;
      applyRoleToEditor(null);
    } else if (!activeRoleEditKey && state.roles.length) {
      openRoleEditor(state.roles[0].key);
    }
  }

  function updateTeamAccessView({ refreshUsers = false } = {}) {
    const canUsers = hasGlobalPermission('manageUsers');
    const canRoles = hasGlobalPermission('manageRoles');
    const canAccessTeam = canUsers || canRoles;

    if (navTeam) {
      navTeam.classList.toggle('hidden', !canAccessTeam);
      navTeam.setAttribute('aria-hidden', canAccessTeam ? 'false' : 'true');
      navTeam.disabled = !canAccessTeam;
      if (!canAccessTeam) navTeam.classList.remove('active');
    }

    if (!canAccessTeam) {
      if (teamPanel) teamPanel.classList.add('hidden');
      if (state.activePanel === 'team') switchPanel('dashboard');
      if (userCard) userCard.classList.add('hidden');
      userList.innerHTML = '';
      closeUserDetails();
      if (userCreateSection) userCreateSection.classList.add('hidden');
      updateRoleManagerVisibility(false);
      return;
    }

    if (userCard) userCard.classList.remove('hidden');
    if (userCreateSection) userCreateSection.classList.toggle('hidden', !canUsers);

    if (canUsers && refreshUsers) {
      loadUsers();
    } else if (!canUsers) {
      userList.innerHTML = '';
      closeUserDetails();
      if (userCreateSection) userCreateSection.classList.add('hidden');
      updateRoleManagerVisibility(false);
    }

    updateRoleManagerVisibility(canRoles);
  }

  async function loadSettings() {
    if (!state.TOKEN) return;
    hideNotice(settingsStatus);
    try {
      const data = await api('/me/settings');
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
      const data = await api('/me/settings', payload, 'POST');
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
      const me = await api('/me');
      state.currentUser = {
        id: me.id,
        username: me.username,
        role: me.role,
        roleName: me.roleName || me.role,
        permissions: me.permissions || {}
      };
      applyTeamContext(me);
      await loadRoles();
      await loadSettings();
      ui.setUser(state.currentUser);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      moduleBus.emit('auth:login', { user: state.currentUser, resume: true });
      moduleBus.emit('players:refresh', { reason: 'session-resume' });
      updateTeamAccessView({ refreshUsers: true });
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
      const data = await publicJson('/login', { method: 'POST', body: { username, password } });
      state.TOKEN = data.token;
      localStorage.setItem('token', state.TOKEN);
      state.currentUser = {
        id: data.id,
        username: data.username,
        role: data.role,
        roleName: data.roleName || data.role,
        permissions: data.permissions || {}
      };
      applyTeamContext(data);
      await loadRoles();
      await loadSettings();
      ui.setUser(state.currentUser);
      ui.showApp();
      ensureSocket();
      await refreshServers();
      moduleBus.emit('auth:login', { user: state.currentUser, resume: false });
      moduleBus.emit('players:refresh', { reason: 'login' });
      updateTeamAccessView({ refreshUsers: true });
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
      await publicJson('/register', { method: 'POST', body: { username, password } });
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
    if (!hasGlobalPermission('manageServers')) {
      ui.log('You do not have permission to manage servers.');
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
      await api('/servers', { name, host, port, password, tls: useTls }, 'POST');
      ui.log('Server added: ' + name);
      if (svName) svName.value = '';
      if (svHost) svHost.value = '';
      if (svPort) svPort.value = '28017';
      if (svPass) svPass.value = '';
      if (svTLS) svTLS.checked = false;
      addServerPinned = false;
      hideAddServerCard({ force: true });
      await refreshUserContext();
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
    if (!hasServerCapability('commands')) throw new Error('forbidden');
    if (!canAccessServerId(state.currentServerId)) throw new Error('forbidden');
    return await api(`/rcon/${state.currentServerId}`, { cmd }, 'POST');
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
      const shouldEchoReply = !socket?.connected
        || !hasServerCapability('console')
        || !canAccessServerId(state.currentServerId);
      if (reply?.Message && shouldEchoReply) {
        ui.log(reply.Message.trim());
      }
      cmdInput.value = '';
    } catch (err) {
      if (errorCode(err) === 'no_server_selected') {
        ui.log('Select a server before sending commands.');
        return;
      }
      if (errorCode(err) === 'forbidden') {
        ui.log(describeError(err));
        return;
      }
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Command failed: ' + describeError(err));
    }
  }

  function bindEvents() {
    navDashboard?.addEventListener('click', () => { hideWorkspace('nav'); switchPanel('dashboard'); closeProfileMenu(); });
    navTeam?.addEventListener('click', () => {
      if (navTeam.disabled) return;
      hideWorkspace('nav');
      switchPanel('team');
      closeProfileMenu();
    });
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
    teamSelect?.addEventListener('change', onTeamSelectionChange);
    btnCreateUser?.addEventListener('click', async () => {
      if (!hasGlobalPermission('manageUsers')) return;
      hideNotice(userFeedback);
      hideNotice(existingUserFeedback);
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
        await api('/users', { username, password, role }, 'POST');
        showNotice(userFeedback, 'Created user ' + username, 'success');
        if (newUserName) newUserName.value = '';
        if (newUserPassword) newUserPassword.value = '';
        if (newUserRole) applyDefaultRoleSelection(newUserRole);
        if (existingUserRole) applyDefaultRoleSelection(existingUserRole);
        loadUsers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        else showNotice(userFeedback, describeError(err), 'error');
      }
    });
    btnAddExistingUser?.addEventListener('click', async () => {
      if (!hasGlobalPermission('manageUsers')) return;
      hideNotice(existingUserFeedback);
      const username = existingUserName?.value.trim();
      const role = existingUserRole?.value || 'user';
      if (!username) {
        showNotice(existingUserFeedback, describeError('missing_fields'), 'error');
        return;
      }
      try {
        await api('/users', { username, role }, 'POST');
        showNotice(existingUserFeedback, `Added ${username} to the team.`, 'success');
        if (existingUserName) existingUserName.value = '';
        if (existingUserRole) applyDefaultRoleSelection(existingUserRole);
        loadUsers();
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        else showNotice(existingUserFeedback, describeError(err), 'error');
      }
    });
    existingUserName?.addEventListener('input', () => hideNotice(existingUserFeedback));
    existingUserRole?.addEventListener('change', () => hideNotice(existingUserFeedback));
    userDetailsRoleSelect?.addEventListener('change', () => hideNotice(userDetailsRoleStatus));
    roleSelect?.addEventListener('change', () => {
      if (!hasGlobalPermission('manageRoles')) return;
      hideNotice(roleFeedback);
      openRoleEditor(roleSelect.value);
    });
    btnCreateRole?.addEventListener('click', (ev) => {
      ev.preventDefault();
      handleRoleCreate();
    });
    btnSaveRole?.addEventListener('click', (ev) => {
      ev.preventDefault();
      handleRoleSave();
    });
    btnDeleteRole?.addEventListener('click', (ev) => {
      ev.preventDefault();
      handleRoleDelete();
    });
    newRoleKey?.addEventListener('input', () => hideNotice(roleFeedback));
    newRoleName?.addEventListener('input', () => hideNotice(roleFeedback));
    roleNameInput?.addEventListener('input', () => hideNotice(roleFeedback));
    roleDescriptionInput?.addEventListener('input', () => hideNotice(roleFeedback));
    roleServersList?.addEventListener('change', handleRoleServersChange);
    renderRoleServersOptions();
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
    applyPermissionGates();
    if (state.TOKEN) {
      await attemptSessionResume();
    } else {
      ui.showLogin();
    }
  }

  init();
})();
