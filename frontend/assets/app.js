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
  const workspaceChatBody = $('#workspaceChatBody');
  const workspaceChatList = $('#workspaceChatList');
  const workspaceChatEmpty = $('#workspaceChatEmpty');
  const workspaceChatLoading = $('#workspaceChatLoading');
  const workspaceChatNotice = $('#workspaceChatNotice');
  const f7ReportsList = $('#f7ReportsList');
  const f7ReportsLoading = $('#f7ReportsLoading');
  const f7ReportsEmpty = $('#f7ReportsEmpty');
  const f7ReportsError = $('#f7ReportsError');
  const f7ReportPlaceholder = $('#f7ReportPlaceholder');
  const f7ReportDetail = $('#f7ReportDetail');
  const f7ReportDetailTime = $('#f7ReportDetailTime');
  const f7ReportTarget = $('#f7ReportTarget');
  const f7ReportReporter = $('#f7ReportReporter');
  const f7ReportCategory = $('#f7ReportCategory');
  const f7ReportId = $('#f7ReportId');
  const f7ReportMessage = $('#f7ReportMessage');
  const f7ReportHistory = $('#f7ReportHistory');
  const f7ReportHistoryList = $('#f7ReportHistoryList');
  const f7ReportShowAll = $('#f7ReportShowAll');
  const f7ScopeButtons = Array.from(document.querySelectorAll('.reports-scope-btn'));
  const killFeedList = $('#killFeedList');
  const killFeedEmpty = $('#killFeedEmpty');
  const killFeedLoading = $('#killFeedLoading');
  const killFeedNotice = $('#killFeedNotice');
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
  const chatFilterButtons = Array.from(document.querySelectorAll('.chat-filter-btn'));
  const CHAT_REFRESH_INTERVAL_MS = 5000;
  const KILL_FEED_REFRESH_INTERVAL_MS = 30000;
  const KILL_FEED_RETENTION_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_TEAM_CHAT_COLOR = '#3b82f6';
  const workspaceViewDefault = 'players';
  let activeWorkspaceView = workspaceViewDefault;
  const chatState = {
    filter: 'all',
    cache: new Map(),
    lastFetched: new Map(),
    loading: false,
    error: null,
    profileCache: new Map(),
    profileRequests: new Map(),
    teamColors: new Map()
  };
  const killFeedState = {
    cache: new Map(),
    lastFetched: new Map(),
    loading: false,
    error: null
  };
  let killFeedRefreshTimer = null;

  const f7State = {
    serverId: null,
    scope: 'new',
    list: [],
    loading: false,
    error: null,
    activeId: null,
    detailCache: new Map(),
    listRequestToken: null,
    detailRequests: new Map()
  };

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

  chatFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setChatFilter(btn.dataset.channel || 'all');
    });
  });

  f7ScopeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setF7Scope(btn.dataset.scope || 'new');
    });
  });

  if (f7ReportShowAll) {
    f7ReportShowAll.addEventListener('click', () => {
      setF7Scope('all');
      if (f7ReportDetail?.scrollIntoView) {
        try { f7ReportDetail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch { /* ignore */ }
      }
    });
  }

  if (workspaceViewSections.length) {
    setWorkspaceView(workspaceViewDefault);
  }

  function normalizeChatFilter(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (text === 'team') return 'team';
    if (text === 'global') return 'global';
    return 'all';
  }

  function normalizeChatChannel(value) {
    if (typeof value === 'number') {
      return value === 1 ? 'team' : 'global';
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 'global';
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric === 1 ? 'team' : 'global';
      const lower = trimmed.toLowerCase();
      if (lower === 'team') return 'team';
      if (lower === 'global') return 'global';
      if (lower === '1') return 'team';
      if (lower === '0') return 'global';
    }
    return 'global';
  }

  function normalizeChatColor(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return null;
    const hexMatch = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hexMatch) {
      return `#${hexMatch[1].toLowerCase()}`;
    }
    const compact = text.replace(/\s+/g, '');
    const rgbMatch = compact.match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,(0|1|0?\.\d+))?\)$/i);
    if (rgbMatch) {
      const numeric = rgbMatch.slice(1, 4).map((part) => {
        const parsed = Number(part);
        return Number.isFinite(parsed) ? parsed : null;
      });
      if (numeric.some((part) => part == null || part < 0 || part > 255)) return null;
      const alphaRaw = rgbMatch[4];
      if (typeof alphaRaw === 'string') {
        const alpha = Number(alphaRaw);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
        return `rgba(${numeric[0]}, ${numeric[1]}, ${numeric[2]}, ${alpha})`;
      }
      return `rgb(${numeric[0]}, ${numeric[1]}, ${numeric[2]})`;
    }
    return null;
  }

  function parseCssColor(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const hexMatch = trimmed.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3 || hex.length === 4) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
        return { r, g, b, a };
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return { r, g, b, a };
      }
    }
    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      const a = rgbMatch[4] != null ? Number(rgbMatch[4]) : 1;
      if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
      if (!Number.isFinite(a) || a < 0 || a > 1) return null;
      return { r, g, b, a };
    }
    return null;
  }

  function rgbaFromColor(value, alpha = 1) {
    const parsed = parseCssColor(value) || parseCssColor(DEFAULT_TEAM_CHAT_COLOR);
    if (!parsed) return null;
    const clampChannel = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const clampAlpha = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));
    const a = Math.round(clampAlpha(alpha) * 1000) / 1000;
    return `rgba(${clampChannel(parsed.r)}, ${clampChannel(parsed.g)}, ${clampChannel(parsed.b)}, ${a})`;
  }

  function findLatestTeamColor(entries) {
    if (!Array.isArray(entries)) return null;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (!entry) continue;
      if (entry.channel === 'team' && typeof entry.color === 'string' && entry.color) {
        return entry.color;
      }
    }
    return null;
  }

  function getTeamChatColor(serverId, fallback = null) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) {
      return fallback || DEFAULT_TEAM_CHAT_COLOR;
    }
    if (chatState.teamColors.has(numeric)) {
      return chatState.teamColors.get(numeric);
    }
    if (fallback) {
      chatState.teamColors.set(numeric, fallback);
      return fallback;
    }
    return DEFAULT_TEAM_CHAT_COLOR;
  }

  function messageSignature(entry) {
    if (!entry) return '';
    if (entry.id != null) return `id:${entry.id}`;
    return `ts:${entry.createdAt}:${entry.message}`;
  }

  function updateChatFilterButtons() {
    chatFilterButtons.forEach((btn) => {
      const value = normalizeChatFilter(btn.dataset.channel || 'all');
      const active = value === chatState.filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setChatFilter(next) {
    const normalized = normalizeChatFilter(next);
    if (chatState.filter === normalized) return;
    chatState.filter = normalized;
    updateChatFilterButtons();
    renderChatMessages();
  }

  function normalizeChatMessage(payload, fallbackServerId) {
    if (!payload) return null;
    const serverId = Number(payload?.serverId ?? payload?.server_id ?? fallbackServerId);
    if (!Number.isFinite(serverId)) return null;
    const messageText = pickString(
      payload?.message,
      payload?.Message,
      payload?.text,
      payload?.Text,
      payload?.body
    );
    const trimmedMessage = messageText ? messageText.trim() : '';
    if (!trimmedMessage) return null;
    const timestampCandidates = [
      payload?.createdAt,
      payload?.created_at,
      payload?.timestamp,
      payload?.Timestamp,
      payload?.Time,
      payload?.time
    ];
    let createdAt = null;
    for (const candidate of timestampCandidates) {
      const normalized = normalizeChatTimestamp(candidate);
      if (normalized) {
        createdAt = normalized;
        break;
      }
    }
    if (!createdAt) createdAt = new Date().toISOString();
    const idValue = payload?.id
      ?? payload?.Id
      ?? payload?.messageId
      ?? payload?.message_id
      ?? payload?.MessageId
      ?? payload?.MessageID
      ?? null;
    let id = null;
    if (idValue != null) {
      const numeric = Number(idValue);
      if (Number.isFinite(numeric)) id = numeric;
      else {
        const trimmedId = String(idValue).trim();
        id = trimmedId || null;
      }
    }
    const channel = normalizeChatChannel(pickString(
      payload?.channel,
      payload?.Channel,
      payload?.scope,
      payload?.Scope,
      payload?.type,
      payload?.Type
    ));
    const username = pickString(
      payload?.username,
      payload?.Username,
      payload?.user,
      payload?.User,
      payload?.name,
      payload?.Name,
      payload?.displayName,
      payload?.DisplayName
    );
    const steamId = pickString(
      payload?.steamId,
      payload?.SteamId,
      payload?.steamid,
      payload?.SteamID,
      payload?.userId,
      payload?.UserId,
      payload?.userid,
      payload?.playerId,
      payload?.PlayerId
    );
    const raw = pickString(payload?.raw, payload?.Raw);
    const color = normalizeChatColor(pickString(payload?.color, payload?.Color));
    return {
      id,
      serverId,
      channel,
      steamId: steamId || null,
      username: username || null,
      message: trimmedMessage.length > 4000 ? trimmedMessage.slice(0, 4000) : trimmedMessage,
      createdAt,
      raw: raw || null,
      color: color || null
    };
  }

  function normalizeChatProfile(profile, steamId, fallbackName = null) {
    const resolvedId = pickString(profile?.steamid, profile?.SteamId, steamId);
    const displayName = pickString(
      profile?.forced_display_name,
      profile?.forcedDisplayName,
      profile?.display_name,
      profile?.displayName,
      profile?.persona,
      profile?.personaName,
      profile?.personaname,
      profile?.username,
      fallbackName,
      resolvedId
    );
    const avatar = pickString(
      profile?.avatarfull,
      profile?.avatarFull,
      profile?.avatar,
      profile?.avatar_medium,
      profile?.avatarMedium,
      profile?.avatar_url,
      profile?.avatarUrl
    );
    const profileUrl = pickString(
      profile?.profileurl,
      profile?.profile_url,
      profile?.profileUrl
    );
    return {
      steamId: resolvedId || null,
      displayName: displayName || null,
      avatar: avatar || null,
      profileUrl: profileUrl || null
    };
  }

  function normalizeChatTimestamp(value) {
    if (value == null) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const ms = numeric > 1e12 ? numeric : numeric * 1000;
      const fromNumber = new Date(ms);
      if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
    }
    const text = String(value).trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  function queueChatProfileFetch(steamId, { username } = {}) {
    const key = String(steamId || '').trim();
    if (!key || chatState.profileCache.has(key) || chatState.profileRequests.has(key)) return;
    if (!state.TOKEN) return;
    const request = (async () => {
      try {
        const data = await api(`/players/${encodeURIComponent(key)}`);
        chatState.profileCache.set(key, normalizeChatProfile(data, key, username));
      } catch (err) {
        if (errorCode(err) === 'unauthorized') {
          handleUnauthorized();
        } else {
          chatState.profileCache.set(key, normalizeChatProfile(null, key, username));
        }
      } finally {
        chatState.profileRequests.delete(key);
        renderChatMessages();
      }
    })();
    chatState.profileRequests.set(key, request);
  }

  function chatAvatarInitial(name = '') {
    const text = String(name || '').trim();
    if (!text) return '?';
    const code = text.codePointAt(0);
    if (code == null) return '?';
    return String.fromCodePoint(code).toUpperCase();
  }

  function formatChatTimestamp(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const iso = date.toISOString();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return {
      iso,
      label: `${hours}:${minutes}:${seconds}`,
      title: date.toLocaleString()
    };
  }

  function storeChatMessages(serverId, entries, { replace = false } = {}) {
    const key = Number(serverId);
    if (!Number.isFinite(key)) return;
    const previous = chatState.cache.get(key) || [];
    const list = replace ? [] : [...previous];
    if (replace) {
      chatState.teamColors.delete(key);
    }
    const seen = new Set(list.map((item) => messageSignature(item)));
    for (const raw of Array.isArray(entries) ? entries : []) {
      const normalized = normalizeChatMessage(raw, key);
      if (!normalized) continue;
      const signature = messageSignature(normalized);
      if (seen.has(signature)) continue;
      list.push(normalized);
      seen.add(signature);
      if (normalized.steamId) {
        queueChatProfileFetch(normalized.steamId, { username: normalized.username });
      }
    }
    list.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (aTime === bTime) return messageSignature(a).localeCompare(messageSignature(b));
      return aTime - bTime;
    });
    const latestTeamColor = findLatestTeamColor(list);
    if (latestTeamColor) {
      chatState.teamColors.set(key, latestTeamColor);
    } else if (replace) {
      chatState.teamColors.delete(key);
    }
    chatState.cache.set(key, list);
    chatState.lastFetched.set(key, Date.now());
    if (key === state.currentServerId) renderChatMessages();
  }

  function renderChatMessages() {
    if (!workspaceChatList) return;
    updateChatFilterButtons();
    const serverId = state.currentServerId;
    const hasServer = Number.isFinite(serverId);
    const records = hasServer ? (chatState.cache.get(serverId) || []) : [];
    const filtered = chatState.filter === 'all'
      ? records
      : records.filter((entry) => entry.channel === chatState.filter);
    const loadingVisible = chatState.loading && hasServer;
    if (workspaceChatLoading) {
      workspaceChatLoading.classList.toggle('hidden', !loadingVisible);
    }
    if (chatState.error && workspaceChatNotice) {
      showNotice(workspaceChatNotice, chatState.error, 'error');
    } else {
      hideNotice(workspaceChatNotice);
    }
    if (!filtered.length) {
      workspaceChatList.innerHTML = '';
      workspaceChatList.classList.add('hidden');
      if (workspaceChatEmpty) {
        if (!hasServer) {
          workspaceChatEmpty.textContent = 'Select a server to view chat.';
          workspaceChatEmpty.classList.remove('hidden');
        } else if (!loadingVisible) {
          workspaceChatEmpty.textContent = 'No chat messages yet.';
          workspaceChatEmpty.classList.remove('hidden');
        } else {
          workspaceChatEmpty.classList.add('hidden');
        }
      }
      return;
    }
    workspaceChatEmpty?.classList.add('hidden');
    workspaceChatList.classList.remove('hidden');
    workspaceChatList.innerHTML = '';
    filtered.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'chat-entry';
      if (entry.channel === 'team') li.classList.add('team');
      if (entry.id != null) li.dataset.messageId = String(entry.id);
      li.dataset.channel = entry.channel;
      if (entry.steamId) li.dataset.steamId = entry.steamId;
      const channelNumber = entry.channel === 'team' ? 1 : 0;
      li.dataset.channelNumber = String(channelNumber);

      const avatar = document.createElement('div');
      avatar.className = 'chat-entry-avatar';
      const profile = entry.steamId ? chatState.profileCache.get(entry.steamId) : null;
      if (!profile && entry.steamId) queueChatProfileFetch(entry.steamId, { username: entry.username });
      const displayName = (profile?.displayName || entry.username || entry.steamId || 'Unknown').trim();
      const avatarUrl = profile?.avatar || null;
      if (avatarUrl) {
        avatar.classList.add('has-image');
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = displayName ? `${displayName} avatar` : 'Player avatar';
        avatar.appendChild(img);
      } else {
        const avatarLabel = document.createElement('span');
        avatarLabel.className = 'chat-entry-avatar-label';
        avatarLabel.textContent = chatAvatarInitial(displayName);
        avatar.appendChild(avatarLabel);
      }

      const content = document.createElement('div');
      content.className = 'chat-entry-content';
      const meta = document.createElement('div');
      meta.className = 'chat-entry-meta';
      const infoRow = document.createElement('div');
      infoRow.className = 'chat-entry-info';
      const nameEl = profile?.profileUrl ? document.createElement('a') : document.createElement('span');
      nameEl.className = 'chat-entry-name';
      nameEl.textContent = displayName;
      if (profile?.profileUrl) {
        nameEl.href = profile.profileUrl;
        nameEl.target = '_blank';
        nameEl.rel = 'noopener noreferrer';
      }
      infoRow.appendChild(nameEl);

      const channelEl = document.createElement('span');
      channelEl.className = 'chat-entry-channel';
      channelEl.dataset.channelNumber = String(channelNumber);
      channelEl.textContent = channelNumber === 1 ? 'Team (1)' : 'Global (0)';
      infoRow.appendChild(channelEl);

      const timeInfo = formatChatTimestamp(entry.createdAt);
      if (timeInfo) {
        const timeEl = document.createElement('time');
        timeEl.className = 'chat-entry-timestamp';
        timeEl.dateTime = timeInfo.iso;
        timeEl.textContent = timeInfo.label;
        timeEl.title = timeInfo.title;
        infoRow.appendChild(timeEl);
      }

      const hasAvatarImage = !!avatarUrl;
      if (entry.channel === 'team') {
        const teamColor = getTeamChatColor(serverId, entry.color);
        const nameColor = rgbaFromColor(teamColor, 0.95) || teamColor;
        const badgeColor = rgbaFromColor(teamColor, 0.2) || teamColor;
        const borderColor = rgbaFromColor(teamColor, 0.45) || teamColor;
        const avatarColor = rgbaFromColor(teamColor, 0.35) || teamColor;
        if (!hasAvatarImage) {
          avatar.style.backgroundColor = avatarColor || '';
        } else {
          avatar.style.backgroundColor = '';
        }
        nameEl.style.color = nameColor || '';
        channelEl.style.backgroundColor = badgeColor || '';
        channelEl.style.color = nameColor || '';
        li.style.borderLeft = `3px solid ${borderColor || teamColor}`;
      } else {
        if (!hasAvatarImage) {
          avatar.style.backgroundColor = entry.color || '';
        } else {
          avatar.style.backgroundColor = '';
        }
        nameEl.style.color = entry.color || '';
        channelEl.style.backgroundColor = '';
        channelEl.style.color = '';
        li.style.removeProperty('border-left');
      }

      meta.appendChild(infoRow);
      if (entry.steamId) {
        const idEl = document.createElement('span');
        idEl.className = 'chat-entry-id';
        idEl.textContent = `Steam ID: ${entry.steamId}`;
        meta.appendChild(idEl);
      }

      const messageEl = document.createElement('p');
      messageEl.className = 'chat-entry-message';
      messageEl.textContent = entry.message;

      content.append(meta, messageEl);
      li.append(avatar, content);
      workspaceChatList.appendChild(li);
    });
  }

  async function refreshChatForServer(serverId, { force = false } = {}) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return;
    if (!hasServerCapability('console')) return;
    const now = Date.now();
    const last = chatState.lastFetched.get(numeric) || 0;
    if (!force && chatState.cache.has(numeric) && now - last < CHAT_REFRESH_INTERVAL_MS) {
      chatState.loading = false;
      if (numeric === state.currentServerId) renderChatMessages();
      return;
    }
    chatState.loading = true;
    if (numeric === state.currentServerId) renderChatMessages();
    try {
      const data = await api(`/servers/${numeric}/chat?limit=200`);
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      storeChatMessages(numeric, messages, { replace: true });
      chatState.error = null;
      chatState.lastFetched.set(numeric, now);
    } catch (err) {
      chatState.error = describeError(err);
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
      } else {
        ui.log('Failed to load chat history: ' + describeError(err));
      }
    } finally {
      chatState.loading = false;
      if (numeric === state.currentServerId) renderChatMessages();
    }
  }

  function clearChatRefreshTimer() {
    if (chatRefreshTimer) {
      clearInterval(chatRefreshTimer);
      chatRefreshTimer = null;
    }
  }

  function scheduleChatRefresh(serverId) {
    clearChatRefreshTimer();
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return;
    if (!hasServerCapability('console')) return;
    chatRefreshTimer = setInterval(() => {
      if (state.currentServerId !== numeric) {
        clearChatRefreshTimer();
        return;
      }
      if (!hasServerCapability('console')) {
        clearChatRefreshTimer();
        return;
      }
      refreshChatForServer(numeric).catch(() => {});
    }, CHAT_REFRESH_INTERVAL_MS);
  }

  function ingestChatMessage(serverId, payload) {
    if (!payload) return;
    if (Array.isArray(payload)) {
      storeChatMessages(serverId, payload);
    } else {
      storeChatMessages(serverId, [payload]);
    }
  }

  function pickString(...values) {
    for (const value of values) {
      if (value == null) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  const COMBAT_LOG_HEADER_REGEX = /^\s*time\s+attacker\s+id\s+target\s+id\s+weapon\s+ammo\s+area\s+distance\s+old_hp\s+new_hp\s+info\s+hits\s+integrity\s+travel\s+mismatch\s+desync\s*$/i;
  const COMBAT_LOG_ENTRY_REGEX = /^(?<time>-?\d+(?:\.\d+)?)s\s+(?<attacker>\S+)\s+(?<attackerId>-?\d+)\s+(?<target>\S+)\s+(?<targetId>-?\d+)\s+(?<weapon>\S+)\s+(?<ammo>\S+)\s+(?<area>\S+)\s+(?<distance>-?\d+(?:\.\d+)?)(?<distanceUnit>m)?\s+(?<oldHp>-?\d+(?:\.\d+)?)\s+(?<newHp>-?\d+(?:\.\d+)?)\s+(?<info>\S+)\s+(?<hits>-?\d+)\s+(?<integrity>-?\d+(?:\.\d+)?)\s+(?<travel>-?\d+(?:\.\d+)?)(?<travelUnit>s|m)?\s+(?<mismatch>-?\d+(?:\.\d+)?)(?<mismatchUnit>m|s)?\s+(?<desync>-?\d+(?:\.\d+)?)\s*$/i;

  function parseKillRawLog(raw) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;

    const pattern = /^(?:\[(?<victimClan>[^\]]+)\]\s*)?(?<victimName>[^\[]+?)\[(?<victimSteamId>\d+)\]\s+was killed by\s+(?:\[(?<killerClan>[^\]]+)\]\s*)?(?<killerName>[^\[]+?)\[(?<killerSteamId>\d+)\](?<rest>.*)$/i;
    const match = text.match(pattern);
    if (!match || !match.groups) return null;

    const result = {
      victimName: match.groups.victimName?.trim() || null,
      victimClan: match.groups.victimClan?.trim() || null,
      victimSteamId: match.groups.victimSteamId || null,
      killerName: match.groups.killerName?.trim() || null,
      killerClan: match.groups.killerClan?.trim() || null,
      killerSteamId: match.groups.killerSteamId || null
    };

    const rest = match.groups.rest || '';

    const weaponPattern = /\b(?:using|with)\s+(?<weapon>[^@]+?)(?:\s+from\b|\s+at\b|\s*$)/i;
    const weaponMatch = rest.match(weaponPattern);
    if (weaponMatch?.groups?.weapon) {
      const weapon = weaponMatch.groups.weapon.trim();
      if (weapon) result.weapon = weapon;
    }

    const distancePattern = /\bfrom\s+(?<distance>-?\d+(?:\.\d+)?)\s*m\b/i;
    const distanceMatch = rest.match(distancePattern);
    if (distanceMatch?.groups?.distance) {
      const parsed = Number(distanceMatch.groups.distance);
      if (Number.isFinite(parsed)) result.distance = parsed;
    }

    const locationPattern = /\bat\s*\(\s*(?<x>-?\d+(?:\.\d+)?),\s*(?<y>-?\d+(?:\.\d+)?),\s*(?<z>-?\d+(?:\.\d+)?)\s*\)/i;
    const locationMatch = rest.match(locationPattern);
    if (locationMatch?.groups) {
      result.position = {
        x: Number(locationMatch.groups.x),
        y: Number(locationMatch.groups.y),
        z: Number(locationMatch.groups.z)
      };
    }

    return result;
  }

  function parseCombatLogEntries(lines) {
    const records = [];
    if (!Array.isArray(lines) || !lines.length) {
      return { header: [], records };
    }

    const normalized = lines
      .map((line) => (typeof line === 'string' ? line : String(line ?? '')))
      .map((line) => line.replace(/\r/g, ''))
      .map((line) => line.trimEnd())
      .filter((line) => line);

    if (!normalized.length) {
      return { header: [], records };
    }

    let startIndex = 0;
    const headerLine = normalized[0].trim();
    const header = COMBAT_LOG_HEADER_REGEX.test(headerLine) ? headerLine.trim().split(/\s+/) : [];
    if (header.length) {
      startIndex = 1;
    }

    const toNumber = (value) => {
      if (value == null || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    for (let i = startIndex; i < normalized.length; i += 1) {
      const rawLine = normalized[i].trim();
      if (!rawLine || rawLine.startsWith('+')) continue;
      const match = rawLine.match(COMBAT_LOG_ENTRY_REGEX);
      if (!match || !match.groups) continue;
      const groups = match.groups;
      const record = {
        raw: rawLine,
        timeSeconds: toNumber(groups.time),
        timeRaw: groups.time ? `${groups.time}s` : null,
        attacker: groups.attacker || null,
        attackerId: groups.attackerId || null,
        target: groups.target || null,
        targetId: groups.targetId || null,
        weapon: groups.weapon || null,
        ammo: groups.ammo || null,
        area: groups.area || null,
        distanceMeters: toNumber(groups.distance),
        distanceRaw: groups.distance ? `${groups.distance}${groups.distanceUnit || ''}` : null,
        oldHp: toNumber(groups.oldHp),
        newHp: toNumber(groups.newHp),
        info: groups.info || null,
        hits: toNumber(groups.hits),
        integrity: toNumber(groups.integrity),
        travelSeconds: toNumber(groups.travel),
        travelRaw: groups.travel ? `${groups.travel}${groups.travelUnit || ''}` : null,
        mismatchMeters: toNumber(groups.mismatch),
        mismatchRaw: groups.mismatch ? `${groups.mismatch}${groups.mismatchUnit || ''}` : null,
        desync: toNumber(groups.desync)
      };
      records.push(record);
    }

    return { header, records };
  }

  function normalizeKillEvent(raw, serverId) {
    if (!raw) return null;
    const resolvedServerId = Number(raw?.serverId ?? raw?.server_id ?? serverId);
    if (!Number.isFinite(resolvedServerId)) return null;
    const occurredRaw = raw?.occurredAt ?? raw?.occurred_at ?? raw?.createdAt ?? raw?.created_at;
    const occurredDate = occurredRaw ? new Date(occurredRaw) : new Date();
    if (Number.isNaN(occurredDate.getTime())) return null;

    const toNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const rawLog = raw?.raw ?? raw?.raw_log ?? raw?.rawLog ?? null;
    const parsedRaw = parseKillRawLog(rawLog);

    let combatLog = raw?.combatLog ?? raw?.combat_log ?? raw?.combat_log_json ?? null;
    if (typeof combatLog === 'string') {
      try {
        combatLog = JSON.parse(combatLog);
      } catch {
        const cleaned = combatLog.replace(/\r/g, '');
        combatLog = {
          text: cleaned,
          lines: cleaned.split('\n').map((line) => line.trimEnd()).filter((line) => line)
        };
      }
    }
    if (combatLog && typeof combatLog === 'object') {
      const lines = Array.isArray(combatLog.lines)
        ? combatLog.lines.map((line) => String(line ?? '')).map((line) => line.replace(/\r/g, '')).filter((line) => line)
        : typeof combatLog.text === 'string'
          ? combatLog.text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd()).filter((line) => line)
          : [];
      combatLog = {
        text: typeof combatLog.text === 'string' ? combatLog.text : lines.join('\n'),
        lines: lines.slice(0, 200),
        fetchedAt: combatLog.fetchedAt || new Date().toISOString()
      };
      const parsedCombat = parseCombatLogEntries(combatLog.lines);
      if (parsedCombat.records.length) {
        combatLog.records = parsedCombat.records.slice(0, 200);
        combatLog.header = parsedCombat.header;
      }
    } else {
      combatLog = null;
    }

    const position = {
      x: toNumber(raw?.position?.x ?? raw?.pos_x ?? raw?.posX),
      y: toNumber(raw?.position?.y ?? raw?.pos_y ?? raw?.posY),
      z: toNumber(raw?.position?.z ?? raw?.pos_z ?? raw?.posZ)
    };
    let hasPosition = position.x != null || position.y != null || position.z != null;
    if (!hasPosition && parsedRaw?.position) {
      position.x = toNumber(parsedRaw.position.x);
      position.y = toNumber(parsedRaw.position.y);
      position.z = toNumber(parsedRaw.position.z);
      hasPosition = position.x != null || position.y != null || position.z != null;
    }

    let distanceValue = toNumber(raw?.distance);
    if (distanceValue == null && parsedRaw?.distance != null) {
      distanceValue = toNumber(parsedRaw.distance);
    }

    const killerSteamId = pickString(raw?.killerSteamId, raw?.killer_steamid, parsedRaw?.killerSteamId);
    const killerName = pickString(raw?.killerName, raw?.killer_name, parsedRaw?.killerName);
    const killerClan = pickString(raw?.killerClan, raw?.killer_clan, parsedRaw?.killerClan);
    const victimSteamId = pickString(raw?.victimSteamId, raw?.victim_steamid, parsedRaw?.victimSteamId);
    const victimName = pickString(raw?.victimName, raw?.victim_name, parsedRaw?.victimName);
    const victimClan = pickString(raw?.victimClan, raw?.victim_clan, parsedRaw?.victimClan);
    const weapon = pickString(raw?.weapon, parsedRaw?.weapon);

    return {
      id: raw?.id ?? null,
      serverId: resolvedServerId,
      occurredAt: occurredDate.toISOString(),
      killerSteamId,
      killerName,
      killerClan,
      victimSteamId,
      victimName,
      victimClan,
      weapon,
      distance: distanceValue,
      position: hasPosition ? position : null,
      raw: rawLog,
      combatLog,
      combatLogError: raw?.combatLogError ?? raw?.combat_log_error ?? null,
      createdAt: raw?.createdAt ?? raw?.created_at ?? occurredDate.toISOString()
    };
  }

  function killEventSignature(entry) {
    return [
      entry.occurredAt,
      entry.killerSteamId || '',
      entry.victimSteamId || '',
      entry.weapon || '',
      entry.raw || ''
    ].join('::');
  }

  function formatKillPlayerName(name, clan, fallbackId) {
    const baseName = typeof name === 'string' && name.trim() ? name.trim() : (fallbackId ? `Steam ${fallbackId}` : 'Unknown');
    return clan && clan.trim() ? `[${clan.trim()}] ${baseName}` : baseName;
  }

  function formatKillPosition(position) {
    if (!position) return null;
    const coords = ['x', 'y', 'z'].map((axis) => {
      const value = position[axis];
      return Number.isFinite(value) ? Number(value).toFixed(1) : '—';
    });
    if (coords.every((value) => value === '—')) return null;
    return `(${coords.join(', ')})`;
  }

  const COMBAT_LOG_TABLE_COLUMNS = [
    {
      key: 'timeSeconds',
      label: 'Time',
      render: (record) => (Number.isFinite(record.timeSeconds) ? `${record.timeSeconds.toFixed(2)} s` : record.timeRaw || '—')
    },
    { key: 'attacker', label: 'Attacker', render: (record) => record.attacker || '—' },
    { key: 'attackerId', label: 'Attacker ID', render: (record) => record.attackerId || '—' },
    { key: 'target', label: 'Target', render: (record) => record.target || '—' },
    { key: 'targetId', label: 'Target ID', render: (record) => record.targetId || '—' },
    { key: 'weapon', label: 'Weapon', render: (record) => record.weapon || '—' },
    { key: 'ammo', label: 'Ammo', render: (record) => record.ammo || '—' },
    { key: 'area', label: 'Area', render: (record) => record.area || '—' },
    {
      key: 'distanceMeters',
      label: 'Distance',
      render: (record) => (Number.isFinite(record.distanceMeters)
        ? `${record.distanceMeters.toFixed(1)} m`
        : record.distanceRaw || '—')
    },
    {
      key: 'oldHp',
      label: 'Old HP',
      render: (record) => (Number.isFinite(record.oldHp) ? record.oldHp.toFixed(1) : '—')
    },
    {
      key: 'newHp',
      label: 'New HP',
      render: (record) => (Number.isFinite(record.newHp) ? record.newHp.toFixed(1) : '—')
    },
    { key: 'info', label: 'Info', render: (record) => record.info || '—' },
    {
      key: 'hits',
      label: 'Hits',
      render: (record) => (Number.isFinite(record.hits) ? String(record.hits) : '—')
    },
    {
      key: 'integrity',
      label: 'Integrity',
      render: (record) => (Number.isFinite(record.integrity) ? record.integrity.toFixed(2) : '—')
    },
    {
      key: 'travelSeconds',
      label: 'Travel',
      render: (record) => (Number.isFinite(record.travelSeconds)
        ? `${record.travelSeconds.toFixed(2)} s`
        : record.travelRaw || '—')
    },
    {
      key: 'mismatchMeters',
      label: 'Mismatch',
      render: (record) => (Number.isFinite(record.mismatchMeters)
        ? `${record.mismatchMeters.toFixed(2)} m`
        : record.mismatchRaw || '—')
    },
    {
      key: 'desync',
      label: 'Desync',
      render: (record) => (Number.isFinite(record.desync) ? String(record.desync) : '—')
    }
  ];

  function storeKillEvents(serverId, entries, { replace = false } = {}) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return;
    const previous = killFeedState.cache.get(numeric) || [];
    const list = replace ? [] : [...previous];
    const seen = new Set(list.map((entry) => killEventSignature(entry)));
    for (const raw of Array.isArray(entries) ? entries : []) {
      const normalized = normalizeKillEvent(raw, numeric);
      if (!normalized) continue;
      const signature = killEventSignature(normalized);
      if (seen.has(signature)) continue;
      list.push(normalized);
      seen.add(signature);
    }
    list.sort((a, b) => {
      const aTime = Date.parse(a.occurredAt || a.createdAt || '');
      const bTime = Date.parse(b.occurredAt || b.createdAt || '');
      if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
      return 0;
    });
    const cutoff = Date.now() - KILL_FEED_RETENTION_MS;
    const filtered = list.filter((entry) => {
      const ts = Date.parse(entry.occurredAt || entry.createdAt || '');
      return Number.isFinite(ts) ? ts >= cutoff : true;
    }).slice(0, 300);
    killFeedState.cache.set(numeric, filtered);
    killFeedState.lastFetched.set(numeric, Date.now());
    if (numeric === state.currentServerId) renderKillFeed();
  }

  function renderKillFeed() {
    if (!killFeedList) return;
    const serverId = state.currentServerId;
    const hasServer = Number.isFinite(serverId);
    const records = hasServer ? (killFeedState.cache.get(serverId) || []) : [];
    const loadingVisible = killFeedState.loading && hasServer;
    if (killFeedLoading) killFeedLoading.classList.toggle('hidden', !loadingVisible);
    if (killFeedNotice) {
      if (killFeedState.error && hasServer) {
        showNotice(killFeedNotice, killFeedState.error, 'error');
      } else {
        hideNotice(killFeedNotice);
      }
    }
    if (!records.length) {
      if (killFeedList) {
        killFeedList.innerHTML = '';
        killFeedList.classList.add('hidden');
      }
      if (killFeedEmpty) {
        if (!hasServer) {
          killFeedEmpty.textContent = 'Select a server to view the kill feed.';
        } else if (!loadingVisible) {
          killFeedEmpty.textContent = 'No kills recorded in the last 24 hours.';
        }
        killFeedEmpty.classList.remove('hidden');
      }
      return;
    }
    killFeedEmpty?.classList.add('hidden');
    killFeedList.classList.remove('hidden');
    killFeedList.innerHTML = '';

    records.forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'kill-feed-entry';
      const details = document.createElement('details');
      if (index === 0) details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'kill-feed-summary';

      const line = document.createElement('div');
      line.className = 'kill-feed-summary-line';

      const timeInfo = formatChatTimestamp(entry.occurredAt || entry.createdAt);
      if (timeInfo) {
        const timeEl = document.createElement('time');
        timeEl.className = 'kill-feed-time';
        timeEl.dateTime = timeInfo.iso;
        timeEl.textContent = timeInfo.label;
        timeEl.title = timeInfo.title;
        line.appendChild(timeEl);
      }

      const killerEl = document.createElement('span');
      killerEl.className = 'kill-feed-player killer';
      killerEl.textContent = formatKillPlayerName(entry.killerName, entry.killerClan, entry.killerSteamId);
      line.appendChild(killerEl);

      const arrowEl = document.createElement('span');
      arrowEl.className = 'kill-feed-arrow';
      arrowEl.textContent = '→';
      line.appendChild(arrowEl);

      const victimEl = document.createElement('span');
      victimEl.className = 'kill-feed-player victim';
      victimEl.textContent = formatKillPlayerName(entry.victimName, entry.victimClan, entry.victimSteamId);
      line.appendChild(victimEl);

      summary.appendChild(line);

      const summaryMeta = document.createElement('div');
      summaryMeta.className = 'kill-feed-summary-meta';
      if (entry.weapon) {
        const weaponEl = document.createElement('span');
        weaponEl.textContent = entry.weapon;
        summaryMeta.appendChild(weaponEl);
      }
      if (entry.distance != null) {
        const distanceEl = document.createElement('span');
        const distanceValue = Number(entry.distance);
        distanceEl.textContent = Number.isFinite(distanceValue)
          ? `${distanceValue.toFixed(1)} m`
          : `${entry.distance}`;
        summaryMeta.appendChild(distanceEl);
      }
      const posLabel = formatKillPosition(entry.position);
      if (posLabel) {
        const posEl = document.createElement('span');
        posEl.textContent = posLabel;
        summaryMeta.appendChild(posEl);
      }
      if (summaryMeta.childElementCount > 0) summary.appendChild(summaryMeta);

      details.appendChild(summary);

      const detailBody = document.createElement('div');
      detailBody.className = 'kill-feed-detail';

      const metaGrid = document.createElement('div');
      metaGrid.className = 'kill-feed-meta';

      const metaItems = [
        { label: 'Killer Steam ID', value: entry.killerSteamId || '—' },
        { label: 'Victim Steam ID', value: entry.victimSteamId || '—' },
        { label: 'Weapon', value: entry.weapon || '—' },
        { label: 'Distance', value: entry.distance != null && Number.isFinite(Number(entry.distance)) ? `${Number(entry.distance).toFixed(1)} m` : '—' },
        { label: 'Location', value: formatKillPosition(entry.position) || '—' }
      ];

      if (entry.raw) {
        metaItems.push({ label: 'Raw log', value: entry.raw });
      }

      metaItems.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'kill-feed-meta-item';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = item.label;
        const value = document.createElement('span');
        value.className = 'value';
        value.textContent = item.value;
        itemEl.append(label, value);
        metaGrid.appendChild(itemEl);
      });

      detailBody.appendChild(metaGrid);

      if (entry.combatLog) {
        const logWrap = document.createElement('div');
        logWrap.className = 'kill-feed-combatlog';
        const heading = document.createElement('h4');
        heading.textContent = 'Combat log';
        logWrap.appendChild(heading);

        if (Array.isArray(entry.combatLog.records) && entry.combatLog.records.length) {
          const tableWrap = document.createElement('div');
          tableWrap.className = 'kill-feed-combatlog-table-wrap';
          const table = document.createElement('table');
          table.className = 'kill-feed-combatlog-table';

          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          COMBAT_LOG_TABLE_COLUMNS.forEach((column) => {
            const th = document.createElement('th');
            th.textContent = column.label;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);

          const tbody = document.createElement('tbody');
          entry.combatLog.records.forEach((record) => {
            const row = document.createElement('tr');
            COMBAT_LOG_TABLE_COLUMNS.forEach((column) => {
              const td = document.createElement('td');
              try {
                td.textContent = column.render(record);
              } catch {
                td.textContent = '—';
              }
              row.appendChild(td);
            });
            tbody.appendChild(row);
          });
          table.appendChild(tbody);
          tableWrap.appendChild(table);
          logWrap.appendChild(tableWrap);
        } else {
          const pre = document.createElement('pre');
          const lines = Array.isArray(entry.combatLog.lines) && entry.combatLog.lines.length
            ? entry.combatLog.lines.join('\n')
            : (entry.combatLog.text || 'No combat log entries.');
          pre.textContent = lines;
          logWrap.appendChild(pre);
        }

        detailBody.appendChild(logWrap);
      } else if (entry.combatLogError) {
        const logWrap = document.createElement('div');
        logWrap.className = 'kill-feed-combatlog';
        const heading = document.createElement('h4');
        heading.textContent = 'Combat log';
        const notice = document.createElement('p');
        notice.className = 'notice small';
        notice.textContent = entry.combatLogError;
        logWrap.append(heading, notice);
        detailBody.appendChild(logWrap);
      }

      details.appendChild(detailBody);
      li.appendChild(details);
      killFeedList.appendChild(li);
    });
  }

  function clearKillFeedRefreshTimer() {
    if (killFeedRefreshTimer) {
      clearInterval(killFeedRefreshTimer);
      killFeedRefreshTimer = null;
    }
  }

  function scheduleKillFeedRefresh(serverId) {
    clearKillFeedRefreshTimer();
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return;
    if (!hasServerCapability('console')) return;
    killFeedRefreshTimer = setInterval(() => {
      if (state.currentServerId !== numeric) {
        clearKillFeedRefreshTimer();
        return;
      }
      if (!hasServerCapability('console')) {
        clearKillFeedRefreshTimer();
        return;
      }
      refreshKillFeedForServer(numeric).catch(() => {});
    }, KILL_FEED_REFRESH_INTERVAL_MS);
  }

  async function refreshKillFeedForServer(serverId, { force = false } = {}) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return;
    if (!hasServerCapability('console')) return;
    const now = Date.now();
    const last = killFeedState.lastFetched.get(numeric) || 0;
    if (!force && killFeedState.cache.has(numeric) && now - last < KILL_FEED_REFRESH_INTERVAL_MS) {
      killFeedState.loading = false;
      if (numeric === state.currentServerId) renderKillFeed();
      return;
    }
    killFeedState.loading = true;
    if (numeric === state.currentServerId) renderKillFeed();
    try {
      const since = new Date(now - KILL_FEED_RETENTION_MS).toISOString();
      const data = await api(`/servers/${numeric}/kills?limit=200&since=${encodeURIComponent(since)}`);
      const events = Array.isArray(data?.events) ? data.events : [];
      storeKillEvents(numeric, events, { replace: true });
      killFeedState.error = null;
      killFeedState.lastFetched.set(numeric, now);
    } catch (err) {
      killFeedState.error = describeError(err);
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
      } else {
        ui.log('Failed to load kill feed: ' + describeError(err));
      }
    } finally {
      killFeedState.loading = false;
      if (numeric === state.currentServerId) renderKillFeed();
    }
  }

  function handleIncomingKill(payload) {
    if (!payload) return;
    const serverId = Number(payload?.serverId ?? payload?.server_id ?? state.currentServerId);
    if (!Number.isFinite(serverId)) return;
    if (payload?.event) {
      storeKillEvents(serverId, [payload.event]);
    } else if (Array.isArray(payload?.events)) {
      storeKillEvents(serverId, payload.events);
    } else if (Array.isArray(payload)) {
      storeKillEvents(serverId, payload);
    } else if (payload && typeof payload === 'object') {
      storeKillEvents(serverId, [payload]);
    }
    if (serverId === state.currentServerId) {
      killFeedState.error = null;
      renderKillFeed();
    }
  }

  function handleIncomingChat(payload) {
    if (!payload) return;
    const serverId = Number(payload?.serverId ?? payload?.server_id ?? state.currentServerId);
    if (!Number.isFinite(serverId)) return;
    const content = payload?.message ?? payload?.messages ?? payload;
    ingestChatMessage(serverId, content);
  }

  function normalizeF7Report(report) {
    if (!report) return null;
    const id = Number(report.id);
    const serverId = Number(report.serverId ?? report.server_id ?? f7State.serverId);
    const createdAt = pickString(report.createdAt ?? report.created_at) || null;
    const updatedAt = pickString(report.updatedAt ?? report.updated_at) || createdAt;
    return {
      id: Number.isFinite(id) ? id : null,
      serverId: Number.isFinite(serverId) ? serverId : f7State.serverId,
      reportId: pickString(report.reportId ?? report.report_id) || null,
      reporterSteamId: pickString(report.reporterSteamId ?? report.reporter_steamid) || null,
      reporterName: pickString(report.reporterName ?? report.reporter_name) || null,
      targetSteamId: pickString(report.targetSteamId ?? report.target_steamid) || null,
      targetName: pickString(report.targetName ?? report.target_name) || null,
      category: pickString(report.category) || null,
      message: pickString(report.message) || null,
      raw: pickString(report.raw) || null,
      createdAt,
      updatedAt: updatedAt || null
    };
  }

  function updateF7ScopeButtons() {
    const scope = f7State.scope;
    f7ScopeButtons.forEach((btn) => {
      const match = (btn?.dataset?.scope || 'new') === scope;
      btn?.classList?.toggle('active', match);
      btn?.setAttribute?.('aria-selected', match ? 'true' : 'false');
    });
  }

  function renderF7ReportDetail(detail) {
    if (!f7ReportDetail || !f7ReportPlaceholder) return;
    if (!detail) {
      f7ReportDetail.classList.add('hidden');
      if (!Number.isFinite(f7State.serverId)) {
        f7ReportPlaceholder.textContent = 'Select a server to view F7 reports.';
        f7ReportPlaceholder.classList.remove('hidden');
      } else if (!f7State.loading && f7State.list.length === 0) {
        f7ReportPlaceholder.textContent = 'Select a report to review the details.';
        f7ReportPlaceholder.classList.remove('hidden');
      } else if (f7State.loading) {
        f7ReportPlaceholder.textContent = 'Loading reports…';
        f7ReportPlaceholder.classList.remove('hidden');
      } else {
        f7ReportPlaceholder.classList.remove('hidden');
        f7ReportPlaceholder.textContent = 'Select a report to review the details.';
      }
      return;
    }

    f7ReportPlaceholder.classList.add('hidden');
    f7ReportDetail.classList.remove('hidden');

    if (f7ReportDetailTime) {
      const absolute = formatDateTime(detail.createdAt);
      const relative = formatRelativeTime(detail.createdAt);
      f7ReportDetailTime.textContent = relative ? `${absolute} (${relative})` : absolute;
    }

    const renderIdentity = (container, name, steamId) => {
      if (!container) return;
      container.innerHTML = '';
      const label = document.createElement(steamId ? 'a' : 'span');
      label.textContent = name || steamId || '—';
      if (steamId) {
        label.href = `https://steamcommunity.com/profiles/${steamId}`;
        label.target = '_blank';
        label.rel = 'noopener noreferrer';
      }
      container.appendChild(label);
      if (steamId && name && name !== steamId) {
        const idLine = document.createElement('div');
        idLine.className = 'muted small';
        idLine.textContent = steamId;
        container.appendChild(idLine);
      }
    };

    renderIdentity(f7ReportTarget, detail.targetName, detail.targetSteamId);
    renderIdentity(f7ReportReporter, detail.reporterName, detail.reporterSteamId);

    if (f7ReportCategory) f7ReportCategory.textContent = detail.category || '—';
    if (f7ReportId) f7ReportId.textContent = detail.reportId || '—';
    if (f7ReportMessage) f7ReportMessage.textContent = detail.message || 'No additional message provided.';

    if (Array.isArray(detail.recentForTarget) && detail.recentForTarget.length > 0 && f7ReportHistory && f7ReportHistoryList) {
      f7ReportHistory.classList.remove('hidden');
      f7ReportHistoryList.innerHTML = '';
      detail.recentForTarget.forEach((entry) => {
        const normalized = normalizeF7Report(entry);
        if (!normalized) return;
        const li = document.createElement('li');
        const when = document.createElement('span');
        when.textContent = formatRelativeTime(normalized.createdAt) || formatDateTime(normalized.createdAt);
        const reason = document.createElement('span');
        reason.textContent = normalized.category || normalized.message || 'No reason provided';
        li.append(when, reason);
        f7ReportHistoryList.appendChild(li);
      });
    } else if (f7ReportHistory) {
      f7ReportHistory.classList.add('hidden');
      if (f7ReportHistoryList) f7ReportHistoryList.innerHTML = '';
    }
  }

  function renderF7Reports() {
    if (!f7ReportsList) return;
    updateF7ScopeButtons();
    if (f7ReportsLoading) {
      f7ReportsLoading.classList.toggle('hidden', !f7State.loading);
    }
    if (f7ReportsError) {
      if (f7State.error) {
        f7ReportsError.textContent = 'Failed to load F7 reports: ' + f7State.error;
        f7ReportsError.classList.remove('hidden');
      } else {
        f7ReportsError.classList.add('hidden');
        f7ReportsError.textContent = '';
      }
    }

    const hasServer = Number.isFinite(f7State.serverId);
    const reports = Array.isArray(f7State.list) ? f7State.list : [];
    const hasReports = reports.length > 0;

    if (f7ReportsEmpty) {
      const showEmpty = hasServer && !f7State.loading && !f7State.error && !hasReports;
      f7ReportsEmpty.classList.toggle('hidden', !showEmpty);
    }

    f7ReportsList.innerHTML = '';

    if (!hasReports) {
      renderF7ReportDetail(null);
      return;
    }

    const fragment = document.createDocumentFragment();
    const seenIds = new Set();
    const sorted = [...reports].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    sorted.forEach((raw) => {
      const report = normalizeF7Report(raw);
      if (!report) return;
      if (report.id != null && seenIds.has(report.id)) return;
      if (report.id != null) seenIds.add(report.id);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reports-item';
      if (report.id === f7State.activeId) button.classList.add('active');
      const primary = document.createElement('div');
      primary.className = 'reports-item-primary';
      const title = document.createElement('span');
      title.className = 'reports-item-target';
      title.textContent = report.targetName || report.targetSteamId || 'Unknown target';
      primary.appendChild(title);
      if (report.category || report.message) {
        const reason = document.createElement('span');
        reason.className = 'reports-item-reason';
        reason.textContent = report.category || report.message || '';
        primary.appendChild(reason);
      }
      const meta = document.createElement('div');
      meta.className = 'reports-item-meta';
      const time = document.createElement('span');
      time.textContent = formatRelativeTime(report.createdAt) || formatDateTime(report.createdAt);
      meta.appendChild(time);
      const reporter = document.createElement('span');
      reporter.textContent = report.reporterName || report.reporterSteamId || 'Unknown reporter';
      meta.appendChild(reporter);
      button.append(primary, meta);
      button.addEventListener('click', () => {
        if (f7State.activeId === report.id) return;
        f7State.activeId = report.id;
        renderF7Reports();
        if (report.id != null) {
          loadF7ReportDetail(report.id).catch(() => {});
        }
      });
      li.appendChild(button);
      fragment.appendChild(li);
    });

    f7ReportsList.appendChild(fragment);

    if (f7State.activeId == null && sorted.length > 0) {
      f7State.activeId = normalizeF7Report(sorted[0])?.id ?? null;
    }
    const detail = f7State.activeId != null ? f7State.detailCache.get(f7State.activeId) : null;
    renderF7ReportDetail(detail || null);
  }

  async function refreshF7Reports({ force = false } = {}) {
    const serverId = Number(f7State.serverId);
    if (!Number.isFinite(serverId)) {
      f7State.list = [];
      renderF7Reports();
      return;
    }
    if (!hasServerCapability('view')) {
      f7State.list = [];
      f7State.error = null;
      f7State.loading = false;
      renderF7Reports();
      return;
    }
    if (f7State.loading && !force) return;
    f7State.loading = true;
    const requestToken = Symbol('f7ListRequest');
    f7State.listRequestToken = requestToken;
    renderF7Reports();
    const params = new URLSearchParams();
    params.set('scope', f7State.scope);
    params.set('limit', f7State.scope === 'all' ? '100' : '25');
    try {
      const data = await api(`/servers/${serverId}/f7-reports?${params.toString()}`);
      const list = Array.isArray(data?.reports) ? data.reports.map((item) => normalizeF7Report(item)).filter(Boolean) : [];
      if (f7State.listRequestToken === requestToken && Number(f7State.serverId) === serverId) {
        f7State.list = list;
        if (list.length && (f7State.activeId == null || !list.some((item) => item.id === f7State.activeId))) {
          f7State.activeId = list[0]?.id ?? null;
        }
        f7State.error = null;
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      if (f7State.listRequestToken === requestToken && Number(f7State.serverId) === serverId) {
        f7State.error = describeError(err);
      }
    } finally {
      if (f7State.listRequestToken !== requestToken || Number(f7State.serverId) !== serverId) {
        return;
      }
      f7State.loading = false;
      renderF7Reports();
      if (f7State.activeId != null) {
        loadF7ReportDetail(f7State.activeId).catch(() => {});
      }
      if (f7State.listRequestToken === requestToken) {
        f7State.listRequestToken = null;
      }
    }
  }

  async function loadF7ReportDetail(reportId, { force = false } = {}) {
    const serverId = Number(f7State.serverId);
    if (!Number.isFinite(serverId)) return;
    const numericId = Number(reportId);
    if (!Number.isFinite(numericId)) return;
    if (!force && f7State.detailCache.has(numericId)) {
      renderF7ReportDetail(f7State.detailCache.get(numericId));
      return;
    }
    const requestToken = Symbol('f7DetailRequest');
    f7State.detailRequests.set(numericId, requestToken);
    try {
      const data = await api(`/servers/${serverId}/f7-reports/${numericId}`);
      if (f7State.detailRequests.get(numericId) !== requestToken || Number(f7State.serverId) !== serverId) {
        return;
      }
      const detail = {
        ...normalizeF7Report(data?.report),
        recentForTarget: Array.isArray(data?.recentForTarget)
          ? data.recentForTarget.map((item) => normalizeF7Report(item)).filter(Boolean)
          : []
      };
      f7State.detailCache.set(numericId, detail);
      if (numericId === f7State.activeId) {
        renderF7ReportDetail(detail);
      }
    } catch (err) {
      if (f7State.detailRequests.get(numericId) === requestToken && Number(f7State.serverId) === serverId) {
        ui.log('Failed to load report details: ' + describeError(err));
      }
    }
    if (f7State.detailRequests.get(numericId) === requestToken) {
      f7State.detailRequests.delete(numericId);
    }
  }

  function setF7Scope(scope) {
    const normalized = scope === 'all' ? 'all' : 'new';
    if (f7State.scope === normalized) return;
    f7State.scope = normalized;
    updateF7ScopeButtons();
    refreshF7Reports({ force: true }).catch(() => {});
  }

  function prepareF7ForServer(serverId) {
    const numeric = Number(serverId);
    f7State.serverId = Number.isFinite(numeric) ? numeric : null;
    f7State.list = [];
    f7State.detailCache.clear();
    f7State.activeId = null;
    f7State.error = null;
    f7State.loading = false;
    f7State.listRequestToken = null;
    f7State.detailRequests.clear();
    f7State.scope = 'new';
    updateF7ScopeButtons();
    renderF7Reports();
    if (!Number.isFinite(numeric) || !hasServerCapability('view')) {
      return;
    }
    refreshF7Reports({ force: true }).catch(() => {});
  }

  function resetF7Reports() {
    f7State.serverId = null;
    f7State.list = [];
    f7State.detailCache.clear();
    f7State.activeId = null;
    f7State.error = null;
    f7State.loading = false;
    f7State.listRequestToken = null;
    f7State.detailRequests.clear();
    updateF7ScopeButtons();
    renderF7Reports();
  }

  function handleIncomingF7Report(payload) {
    if (!payload) return;
    const report = normalizeF7Report(payload);
    if (!report) return;
    if (!hasServerCapability('view')) return;
    if (Number(report.serverId) !== Number(state.currentServerId)) return;
    if (report.id != null) {
      f7State.detailCache.set(report.id, { ...report, recentForTarget: [] });
    }
    const shouldTrack = f7State.scope === 'new' || f7State.scope === 'all';
    if (shouldTrack) {
      const matchesReport = (item) => {
        if (!item) return false;
        if (report.id != null && item.id != null) return item.id === report.id;
        if (report.reportId && item.reportId) return item.reportId === report.reportId;
        return (
          !!report.createdAt &&
          report.createdAt === item.createdAt &&
          report.reporterSteamId === item.reporterSteamId &&
          report.targetSteamId === item.targetSteamId
        );
      };
      const existingIndex = f7State.list.findIndex((item) => matchesReport(item));
      if (existingIndex !== -1) {
        f7State.list.splice(existingIndex, 1);
      }
      f7State.list.unshift(report);
      if (f7State.list.length > 200) f7State.list.length = 200;
    }
    if (report.id != null) {
      if (f7State.activeId == null) {
        f7State.activeId = report.id;
      }
      if (f7State.activeId === report.id) {
        loadF7ReportDetail(report.id, { force: true }).catch(() => {});
      }
    }
    renderF7Reports();
  }

  renderChatMessages();
  renderF7Reports();

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

  let socket = null;
  let chatRefreshTimer = null;
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
    custom_level_url: 'This server is using a custom map. Configure a Facepunch level URL to enable the live map.',
    live_map_failed: 'Unable to load the live map right now.',
    manual_refresh_cooldown: 'Manual live map refresh is cooling down. Try again in a few seconds.',
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
    image_too_large:
      'The server rejected the image as too large. The control panel accepts files up to 40 MB, but your hosting provider may enforce a smaller limit. Try a smaller image or contact your host to raise the cap.',
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
    const hasWindow = typeof window !== 'undefined' && window?.location;
    const stored = normalizeApiBase(localStorage.getItem('apiBase'));

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

    if (stored) return stored;

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
    clearChatRefreshTimer();
    clearKillFeedRefreshTimer();
    killFeedState.loading = false;
    killFeedState.error = null;
    state.currentServerId = null;
    if (typeof window !== 'undefined') window.__workspaceSelectedServer = null;
    emitWorkspaceEvent('workspace:server-cleared', { reason });
    resetF7Reports();
    highlightSelectedServer();
    renderChatMessages();
    renderKillFeed();
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

  const relativeTimeFormatter = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    : null;

  function formatRelativeTime(value) {
    const text = pickString(value);
    if (!text) return '';
    const date = new Date(text);
    if (Number.isNaN(date.valueOf())) return text;
    if (!relativeTimeFormatter) return date.toLocaleString();
    const diff = date.getTime() - Date.now();
    const thresholds = [
      { unit: 'day', ms: 86400000 },
      { unit: 'hour', ms: 3600000 },
      { unit: 'minute', ms: 60000 },
      { unit: 'second', ms: 1000 }
    ];
    for (const { unit, ms } of thresholds) {
      if (Math.abs(diff) >= ms || unit === 'second') {
        const rounded = Math.round(diff / ms);
        return relativeTimeFormatter.format(rounded, unit);
      }
    }
    return date.toLocaleString();
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
    socket.on('chat', (payload) => {
      handleIncomingChat(payload);
    });
    socket.on('f7-report', (payload) => {
      handleIncomingF7Report(payload);
    });
    socket.on('kill', (payload) => {
      handleIncomingKill(payload);
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
      renderChatMessages();
      renderKillFeed();
      refreshChatForServer(numericId).catch(() => {});
      scheduleChatRefresh(numericId);
      refreshKillFeedForServer(numericId).catch(() => {});
      scheduleKillFeedRefresh(numericId);
      return;
    }
    if (previous != null && previous !== numericId) {
      if (socket?.connected && hasServerCapability('console')) {
        try { socket.emit('leave-server', previous); }
        catch { /* ignore */ }
      }
      moduleBus.emit('server:disconnected', { serverId: previous, reason: 'switch' });
    }
    clearChatRefreshTimer();
    clearKillFeedRefreshTimer();
    state.currentServerId = numericId;
    prepareF7ForServer(numericId);
    if (typeof window !== 'undefined') window.__workspaceSelectedServer = numericId;
    emitWorkspaceEvent('workspace:server-selected', { serverId: numericId });
    highlightSelectedServer();
    ui.clearConsole();
    renderChatMessages();
    renderKillFeed();
    refreshChatForServer(numericId, { force: true }).catch(() => {});
    scheduleChatRefresh(numericId);
    refreshKillFeedForServer(numericId, { force: true }).catch(() => {});
    scheduleKillFeedRefresh(numericId);

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
    chatState.cache.clear();
    chatState.lastFetched.clear();
    chatState.loading = false;
    chatState.error = null;
    chatState.profileCache.clear();
    chatState.profileRequests.clear();
    chatState.teamColors.clear();
    resetF7Reports();
    renderChatMessages();
    clearKillFeedRefreshTimer();
    killFeedState.cache.clear();
    killFeedState.lastFetched.clear();
    killFeedState.loading = false;
    killFeedState.error = null;
    renderKillFeed();
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
      const fallbackCode = res.status === 413 ? 'image_too_large' : 'api_error';
      const code = data?.error || fallbackCode;
      const err = new Error(code);
      err.status = res.status;
      if (data?.error) err.code = data.error;
      else if (code !== 'api_error') err.code = code;
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
