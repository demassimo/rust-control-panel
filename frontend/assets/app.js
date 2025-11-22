(() => {
  const $ = (sel) => document.querySelector(sel);

  const serversEl = $('#servers');
  const consoleEl = $('#console');
  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const userBox = $('#userBox');
  const mainNav = $('#mainNav');
  const navDashboard = $('#navDashboard');
  const navLinked = $('#navLinked');
  const navTeam = $('#navTeam');
  const navAdmin = $('#navAdmin');
  const navDiscord = $('#navDiscord');
  const navSettings = $('#navSettings');
  const teamSwitcher = $('#teamSwitcher');
  const teamSelect = $('#teamSelect');
  const teamSelectLabel = $('#teamSelectLabel');
  const dashboardPanel = $('#dashboardPanel');
  const linkedAccountsPanel = $('#linkedAccountsPanel');
  const teamPanel = $('#teamPanel');
  const adminPanel = $('#adminPanel');
  const discordPanel = $('#discordPanel');
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
  const adminUserList = $('#adminUserList');
  const adminUserEmpty = $('#adminUserEmpty');
  const adminUserDetails = $('#adminUserDetails');
  const adminDetailUsername = $('#adminDetailUsername');
  const adminDetailCreated = $('#adminDetailCreated');
  const adminUserRoleSelect = $('#adminUserRoleSelect');
  const adminUserSaveRole = $('#adminUserSaveRole');
  const adminUserRoleStatus = $('#adminUserRoleStatus');
  const adminUserResetPassword = $('#adminUserResetPassword');
  const adminUserDelete = $('#adminUserDelete');
  const adminUserDangerStatus = $('#adminUserDangerStatus');
  const adminUserTeams = $('#adminUserTeams');
  const adminAssignTeam = $('#adminAssignTeam');
  const adminAssignRole = $('#adminAssignRole');
  const adminUserSuperuser = $('#adminUserSuperuser');
  const btnAdminAssignTeam = $('#btnAdminAssignTeam');
  const adminAssignStatus = $('#adminAssignStatus');
  const adminNewUserName = $('#adminNewUserName');
  const adminNewUserPassword = $('#adminNewUserPassword');
  const adminNewUserRole = $('#adminNewUserRole');
  const adminNewUserTeam = $('#adminNewUserTeam');
  const adminNewUserSuperuser = $('#adminNewUserSuperuser');
  const btnAdminCreateUser = $('#btnAdminCreateUser');
  const adminUserFeedback = $('#adminUserFeedback');
  const adminTeamList = $('#adminTeamList');
  const adminUserSearch = $('#adminUserSearch');
  const adminUserCount = $('#adminUserCount');
  const adminSuperuserCount = $('#adminSuperuserCount');
  const adminOrgCount = $('#adminOrgCount');
  const adminScopeBadge = $('#adminScopeBadge');
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

  const DISCORD_ALLOWED_PRESENCES = new Set(['online', 'idle', 'dnd', 'invisible']);
  const DISCORD_PRESENCE_LABELS = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    invisible: 'Invisible'
  };
  const DISCORD_PRESENCE_CLASS = {
    online: 'online',
    idle: 'degraded',
    dnd: 'offline',
    invisible: 'offline'
  };
  const DEFAULT_DISCORD_PRESENCE_TEMPLATE = '{statusEmoji} {playerCount} on {serverName}';
  const DEFAULT_DISCORD_PRESENCE_STATUSES = {
    online: 'online',
    offline: 'dnd',
    stale: 'idle',
    waiting: 'idle'
  };
  const DEFAULT_DISCORD_STATUS_FIELDS = {
    joining: true,
    queued: true,
    sleepers: true,
    fps: true,
    lastUpdate: true
  };
  const DEFAULT_DISCORD_TICKETING_CONFIG = {
    enabled: false,
    categoryId: '',
    logChannelId: '',
    staffRoleId: '',
    pingStaffOnOpen: true,
    panelChannelId: '',
    panelMessageId: ''
  };
  const DISCORD_STATUS_FIELD_LABELS = {
    joining: 'Joining players',
    queued: 'Queue length',
    sleepers: 'Sleeping players',
    fps: 'Server FPS',
    lastUpdate: 'Last update timestamp'
  };

  const superuserUi = Boolean(typeof window !== 'undefined' && window.SUPERUSER_MODE);
  const defaultPanel = superuserUi
    ? 'admin'
    : (typeof window !== 'undefined' && window.DEFAULT_PANEL)
      ? String(window.DEFAULT_PANEL)
      : 'dashboard';
  const state = {
    API: '',
    TOKEN: localStorage.getItem('token') || '',
    currentUser: null,
    currentServerId: null,
    serverItems: new Map(),
    allowRegistration: false,
    statusTimer: null,
    settings: {},
    security: { totpEnabled: false, passkeys: [], pendingSecret: null, loaded: false },
    activePanel: defaultPanel,
    activeTeamId: null,
    activeTeamName: null,
    teams: [],
    roles: [],
    roleTemplates: { serverCapabilities: [], globalPermissions: [] },
    teamDiscord: { hasToken: false, guildId: null, tokenPreview: null, loading: false, loadedTeamId: null },
    teamAuth: { loading: false, enabled: false, roleId: null, logChannelId: null, loaded: false, loadedTeamId: null },
    workspaceDiscord: {
      serverId: null,
      loading: false,
      saving: false,
      error: null,
      integration: null,
      status: null,
      config: defaultWorkspaceDiscordConfig()
    },
    pendingMfa: null,
    admin: {
      users: [],
      teams: [],
      selectedUserId: null,
      loading: false
    },
    superuserUi
  };
  let adminUserFilter = '';
  const loginUsername = $('#username');
  const loginPassword = $('#password');
  const loginMfaStep = $('#mfaStep');
  const loginMfaCode = $('#loginMfaCode');
  const loginMfaStatus = $('#loginMfaStatus');
  const btnSubmitMfa = $('#btnSubmitMfa');
  const btnMfaUsePasskey = $('#btnMfaUsePasskey');
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
  const teamDiscordSection = $('#teamDiscordSection');
  const teamDiscordStatusSection = $('#teamDiscordStatusSection');
  const teamDiscordForm = $('#teamDiscordForm');
  const teamDiscordGuildId = $('#teamDiscordGuildId');
  const teamDiscordToken = $('#teamDiscordToken');
  const btnSaveTeamDiscord = $('#btnSaveTeamDiscord');
  const btnRemoveTeamDiscord = $('#btnRemoveTeamDiscord');
  const teamDiscordStatus = $('#teamDiscordStatus');
  const teamDiscordSummary = $('#teamDiscordSummary');
  const teamDiscordSummaryGuild = $('#teamDiscordSummaryGuild');
  const teamDiscordSummaryToken = $('#teamDiscordSummaryToken');
  const teamAuthSection = $('#teamAuthSection');
  const teamAuthForm = $('#teamAuthForm');
  const teamAuthEnabledInput = $('#teamAuthEnabled');
  const teamAuthRoleInput = $('#teamAuthRole');
  const teamAuthLogChannelInput = $('#teamAuthLogChannel');
  const teamAuthStatus = $('#teamAuthStatus');
  const btnSaveTeamAuth = $('#teamAuthSave');
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
  const mfaStatusLabel = $('#mfaStatus');
  const totpSecretValue = $('#totpSecret');
  const totpUriValue = $('#totpUri');
  const totpSetupFields = $('#totpSetupFields');
  const totpCodeInput = $('#totpCode');
  const btnStartTotp = $('#btnStartTotp');
  const btnEnableTotp = $('#btnEnableTotp');
  const btnDisableTotp = $('#btnDisableTotp');
  const mfaStatusMessage = $('#mfaStatusMessage');
  const passkeyList = $('#passkeyList');
  const btnRegisterPasskey = $('#btnRegisterPasskey');
  const passkeyStatus = $('#passkeyStatus');
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
  const discordBotStatusPill = $('#discord-bot-status');
  const discordSettingsGrid = $('#discord-settings');
  const discordStatusServerSelect = $('#discord-status-server');
  const discordCurrentPlayers = $('#discord-current-players');
  const discordMaxPlayers = $('#discord-max-players');
  const discordJoiningPlayers = $('#discord-joining');
  const discordLastCheck = $('#discord-last-check');
  const discordPresenceTemplateSummary = $('#discord-presence-template');
  const discordPresenceStatusOnline = $('#discord-presence-status-online');
  const discordPresenceStatusOffline = $('#discord-presence-status-offline');
  const discordPresenceStatusStale = $('#discord-presence-status-stale');
  const discordPresenceStatusWaiting = $('#discord-presence-status-waiting');
  const discordEnabledFieldsList = $('#discord-enabled-fields');
  const discordEnabledFieldsEmpty = $('#discord-enabled-fields-empty');
  const discordTicketingSummaryStatus = $('#discord-ticketing-summary-status');
  const discordTicketingSummaryCategory = $('#discord-ticketing-summary-category');
  const discordTicketingSummaryLog = $('#discord-ticketing-summary-log');
  const discordTicketingSummaryRole = $('#discord-ticketing-summary-role');
  const discordStatusForm = $('#discord-status-form');
  const discordStatusNotice = $('#discord-status-notice');
  const discordPresenceTemplateInput = $('#discord-presence-template-input');
  const discordPresenceOnlineSelect = $('#discord-presence-online');
  const discordPresenceOfflineSelect = $('#discord-presence-offline');
  const discordPresenceStaleSelect = $('#discord-presence-stale');
  const discordPresenceWaitingSelect = $('#discord-presence-waiting');
  const discordStatusFieldInputs = Array.from(document.querySelectorAll('[data-status-field]'));
  const discordTicketingEnabledInput = $('#discord-ticketing-enabled');
  const discordTicketingCategoryInput = $('#discord-ticketing-category');
  const discordTicketingLogInput = $('#discord-ticketing-log');
  const discordTicketingRoleInput = $('#discord-ticketing-role');
  const discordTicketingPingInput = $('#discord-ticketing-ping');
  const discordTicketingPanelChannelInput = $('#discord-ticketing-panel-channel');
  const discordTicketingPanelMessageInput = $('#discord-ticketing-panel-message');
  const aqTicketsList = $('#aqTicketsList');
  const aqTicketsLoading = $('#aqTicketsLoading');
  const aqTicketsError = $('#aqTicketsError');
  const aqTicketsEmpty = $('#aqTicketsEmpty');
  const aqTicketsCount = $('#aqTicketsCount');
  const aqTicketPlaceholder = $('#aqTicketPlaceholder');
  const aqTicketDetail = $('#aqTicketDetail');
  const aqTicketSubject = $('#aqTicketSubject');
  const aqTicketMeta = $('#aqTicketMeta');
  const aqTicketNumber = $('#aqTicketNumber');
  const aqTicketPreviewLink = $('#aqTicketPreviewLink');
  const aqTicketDialog = $('#aqTicketDialog');
  const aqTicketDialogLoading = $('#aqTicketDialogLoading');
  const aqTicketDialogEmpty = $('#aqTicketDialogEmpty');
  const aqTicketDialogError = $('#aqTicketDialogError');
  const aqTicketReply = $('#aqTicketReply');
  const aqTicketReplyForm = $('#aqTicketReplyForm');
  const aqTicketReplyInput = $('#aqTicketReplyInput');
  const aqTicketReplySubmit = $('#aqTicketReplySubmit');
  const aqTicketReplyError = $('#aqTicketReplyError');
  const aqTicketReplyNotice = $('#aqTicketReplyNotice');
  const f7ReportsList = $('#f7ReportsList');
  const f7ReportsLoading = $('#f7ReportsLoading');
  const f7ReportsEmpty = $('#f7ReportsEmpty');
  const f7ReportsError = $('#f7ReportsError');
  const f7ReportsCount = $('#f7ReportsCount');
  const f7ReportsSearch = $('#f7ReportsSearch');
  const f7ReportPlaceholder = $('#f7ReportPlaceholder');
  const f7ReportDetail = $('#f7ReportDetail');
  const f7ReportDetailTime = $('#f7ReportDetailTime');
  const f7ReportTarget = $('#f7ReportTarget');
  const f7ReportReporter = $('#f7ReportReporter');
  const f7ReportCategory = $('#f7ReportCategory');
  const f7ReportId = $('#f7ReportId');
  const f7ReportMessage = $('#f7ReportMessage');
  const f7ReportTargetSummary = $('#f7ReportTargetSummary');
  const f7ReportSummaryTotal = $('#f7ReportSummaryTotal');
  const f7ReportSummaryRecent = $('#f7ReportSummaryRecent');
  const f7ReportSummaryRecentLabel = $('#f7ReportSummaryRecentLabel');
  const f7ReportSummaryReporters = $('#f7ReportSummaryReporters');
  const f7ReportSummaryFirst = $('#f7ReportSummaryFirst');
  const f7ReportSummaryLast = $('#f7ReportSummaryLast');
  const f7ReportSummaryCategories = $('#f7ReportSummaryCategories');
  const f7ReportTargetProfile = $('#f7ReportTargetProfile');
  const f7ReportProfileAvatar = $('#f7ReportProfileAvatar');
  const f7ReportProfileName = $('#f7ReportProfileName');
  const f7ReportProfileSteam = $('#f7ReportProfileSteam');
  const f7ReportProfileCountry = $('#f7ReportProfileCountry');
  const f7ReportProfileVac = $('#f7ReportProfileVac');
  const f7ReportProfileGameBans = $('#f7ReportProfileGameBans');
  const f7ReportProfileLastBan = $('#f7ReportProfileLastBan');
  const f7ReportProfilePlaytime = $('#f7ReportProfilePlaytime');
  const f7ReportProfileStatus = $('#f7ReportProfileStatus');
  const f7ReportHistory = $('#f7ReportHistory');
  const f7ReportHistoryList = $('#f7ReportHistoryList');
  const f7ReportsFocus = $('#f7ReportsFocus');
  const f7ReportsFocusLabel = $('#f7ReportsFocusLabel');
  const f7ReportsClearFocus = $('#f7ReportsClearFocus');
  const f7ReportShowAll = $('#f7ReportShowAll');
  const f7ReportOpenProfile = $('#f7ReportOpenProfile');
  const f7ScopeButtons = Array.from(document.querySelectorAll('.reports-scope-btn'));

  const regionDisplay = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;
  const COUNTRY_FALLBACKS = { UK: 'United Kingdom', EU: 'European Union' };
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
    teamColors: new Map(),
    teamPalettes: new Map(),
    playerTeams: new Map()
  };
  const killFeedState = {
    cache: new Map(),
    lastFetched: new Map(),
    renderSignatures: new Map(),
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
    detailRequests: new Map(),
    filter: '',
    filterActive: false,
    totalCount: 0,
    visibleCount: 0,
    focusTarget: null,
    focusLabel: ''
  };
  let f7FilterTimer = null;
  const f7ProfileCache = new Map();
  const f7ProfileRequests = new Map();

  const aqState = {
    serverId: null,
    list: [],
    loadingList: false,
    listError: null,
    selectedId: null,
    detailCache: new Map(),
    listRequestToken: null,
    detailRequests: new Map(),
    detailLoading: false,
    detailError: null,
    replying: false,
    replyError: null
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
    if (target === 'settings') {
      ensureDiscordStatusSelection();
    }
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
      const detail = f7State.activeId != null ? f7State.detailCache.get(f7State.activeId) : null;
      const targetSteamId = pickString(detail?.targetSteamId)?.trim();
      if (!targetSteamId) return;
      const label = pickString(detail?.targetName) || targetSteamId;
      if (f7State.focusTarget === targetSteamId) {
        clearF7FocusTarget();
      } else {
        focusF7ReportsOnTarget(targetSteamId, label);
      }
      if (f7ReportDetail?.scrollIntoView) {
        try { f7ReportDetail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch { /* ignore */ }
      }
    });
  }

  if (f7ReportsClearFocus) {
    f7ReportsClearFocus.addEventListener('click', () => {
      clearF7FocusTarget();
      if (f7ReportDetail?.scrollIntoView) {
        try { f7ReportDetail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch { /* ignore */ }
      }
    });
  }

  if (f7ReportsSearch) {
    const commitFilter = () => {
      const value = f7ReportsSearch.value || '';
      if (value === f7State.filter) return;
      f7State.filter = value;
      renderF7Reports();
    };
    const onSearchInput = () => {
      if (f7FilterTimer) clearTimeout(f7FilterTimer);
      f7FilterTimer = setTimeout(() => {
        f7FilterTimer = null;
        commitFilter();
      }, 200);
    };
    f7ReportsSearch.addEventListener('input', onSearchInput);
    f7ReportsSearch.addEventListener('search', commitFilter);
  }

  if (f7ReportOpenProfile) {
    f7ReportOpenProfile.addEventListener('click', () => {
      const detail = f7State.activeId != null ? f7State.detailCache.get(f7State.activeId) : null;
      const payload = buildF7PlayerPayload(detail);
      if (!payload?.steamid) return;
      window.dispatchEvent(new CustomEvent('players:open-profile', {
        detail: {
          steamId: payload.steamid,
          player: payload,
          source: 'f7-reports'
        }
      }));
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

  function normalizeServerId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeTeamId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function resolvePlayerSteamIdForMapping(player) {
    if (!player || typeof player !== 'object') return '';
    const candidates = [
      player.steamId,
      player.steamid,
      player.SteamID,
      player.SteamId,
      player.userid,
      player.userId,
      player.UserId,
      player.id,
      player.ID,
      player.entityId,
      player.EntityId
    ];
    for (const candidate of candidates) {
      if (candidate == null) continue;
      const value = String(candidate).trim();
      if (value) return value;
    }
    return '';
  }

  function resolvePlayerTeamIdForMapping(player) {
    if (!player || typeof player !== 'object') return null;
    const candidates = [
      player.teamId,
      player.TeamId,
      player.teamID,
      player.TeamID,
      player.team,
      player.Team
    ];
    for (const candidate of candidates) {
      const teamId = normalizeTeamId(candidate);
      if (teamId != null) return teamId;
    }
    return null;
  }

  function assignMapIfChanged(storage, key, nextMap) {
    const previous = storage.get(key);
    if (previous && previous.size === nextMap.size) {
      let identical = true;
      for (const [entryKey, entryValue] of nextMap.entries()) {
        if (previous.get(entryKey) !== entryValue) {
          identical = false;
          break;
        }
      }
      if (identical) {
        for (const entryKey of previous.keys()) {
          if (!nextMap.has(entryKey)) {
            identical = false;
            break;
          }
        }
      }
      if (identical) return false;
    }
    storage.set(key, nextMap);
    return true;
  }

  function updatePlayerTeamMapping(serverId, players) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return false;
    const next = new Map();
    for (const player of Array.isArray(players) ? players : []) {
      const steamId = resolvePlayerSteamIdForMapping(player);
      if (!steamId) continue;
      const teamId = resolvePlayerTeamIdForMapping(player);
      if (teamId == null) continue;
      next.set(steamId, teamId);
    }
    return assignMapIfChanged(chatState.playerTeams, numeric, next);
  }

  function updateServerTeamPalette(serverId, colors) {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return false;
    const next = new Map();
    for (const entry of Array.isArray(colors) ? colors : []) {
      const teamId = normalizeTeamId(entry?.teamId ?? entry?.team_id ?? entry?.id);
      const color = pickString(entry?.color ?? entry?.value ?? entry?.hex);
      if (teamId == null || !color) continue;
      next.set(teamId, color);
    }
    return assignMapIfChanged(chatState.teamPalettes, numeric, next);
  }

  const TEAM_ID_PATTERNS = [
    /\bteam\s*(?:chat)?\s*(?:#|id[:=])\s*(\d+)\b/i,
    /\bteam\s*(\d+)\b/i
  ];

  function parseTeamIdFromText(text) {
    if (typeof text !== 'string') return null;
    for (const pattern of TEAM_ID_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const teamId = normalizeTeamId(match[1]);
        if (teamId != null) return teamId;
      }
    }
    return null;
  }

  function resolveTeamIdForEntry(serverId, entry) {
    if (!entry || entry.channel !== 'team') return null;
    const numericServerId = Number(serverId);
    const entrySteamId = pickString(entry.steamId);
    if (entrySteamId && Number.isFinite(numericServerId)) {
      const teamMap = chatState.playerTeams.get(numericServerId);
      const mapped = teamMap?.get(entrySteamId);
      if (mapped != null) return mapped;
    }
    const sources = [];
    if (entry.raw) sources.push(entry.raw);
    if (entry.message) sources.push(entry.message);
    for (const source of sources) {
      const teamId = parseTeamIdFromText(source);
      if (teamId != null) return teamId;
    }
    return null;
  }

  function resolveTeamMessageColor(serverId, entry) {
    const numericServerId = Number(serverId);
    const baseColor = getTeamChatColor(numericServerId, entry?.color);
    if (!entry || entry.channel !== 'team') {
      return pickString(baseColor, DEFAULT_TEAM_CHAT_COLOR);
    }
    const teamId = resolveTeamIdForEntry(numericServerId, entry);
    if (teamId != null) {
      const palette = chatState.teamPalettes.get(numericServerId);
      const paletteColor = palette?.get(teamId);
      const normalized = pickString(paletteColor);
      if (normalized) return normalized;
    }
    const direct = pickString(entry?.color);
    return pickString(direct, baseColor, DEFAULT_TEAM_CHAT_COLOR);
  }

  function handlePlayersListUpdate(payload = {}) {
    const players = Array.isArray(payload.players) ? payload.players : [];
    const explicitServerId = payload.serverId;
    let serverId = normalizeServerId(explicitServerId);
    if (serverId == null && explicitServerId === undefined) {
      serverId = normalizeServerId(state.currentServerId);
    }
    if (serverId == null) return;
    const changed = updatePlayerTeamMapping(serverId, players);
    const currentServerId = normalizeServerId(state.currentServerId);
    if (changed && currentServerId != null && currentServerId === serverId) {
      renderChatMessages();
    }
  }

  function handleTeamColorsUpdate(payload = {}) {
    const colors = Array.isArray(payload.colors) ? payload.colors : [];
    const explicitServerId = payload.serverId;
    let serverId = normalizeServerId(explicitServerId);
    if (serverId == null && explicitServerId === undefined) {
      serverId = normalizeServerId(state.currentServerId);
    }
    if (serverId == null) return;
    const changed = updateServerTeamPalette(serverId, colors);
    const currentServerId = normalizeServerId(state.currentServerId);
    if (changed && currentServerId != null && currentServerId === serverId) {
      renderChatMessages();
    }
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
    const serverId = Number(state.currentServerId);
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
        const teamColor = resolveTeamMessageColor(serverId, entry) || DEFAULT_TEAM_CHAT_COLOR;
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

  const COMBAT_LOG_HEADER_REGEX = /^\s*time\s+attacker\s+id\s+target\s+id\s+weapon\s+ammo\s+area\s+distance\s+old[_\s]*hp\s+new[_\s]*hp\s+info\s+hits\s+integrity\s+travel\s+mismatch\s+desync\s*$/i;
  const COMBAT_LOG_ENTRY_REGEX = new RegExp(
    [
      '^(?<time>-?\\d+(?:\\.\\d+)?)s\\s+',
      '(?<attacker>.+?)\\s+',
      '(?<attackerId>-?\\d+)\\s+',
      '(?<target>.+?)\\s+',
      '(?<targetId>-?\\d+)\\s+',
      '(?<weapon>\\S+|-|N\\/?A|—)\\s+',
      '(?<ammo>\\S+|-|N\\/?A|—)\\s+',
      '(?<area>\\S+)\\s+',
      '(?<distance>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s*(?<distanceUnit>m)?\\s+',
      '(?<oldHp>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s+',
      '(?<newHp>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s+',
      '(?<info>.*?)\\s+',
      '(?<hits>-?\\d+|N\\/?A|—|-)\\s+',
      '(?<integrity>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s+',
      '(?<travel>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s*(?<travelUnit>s|m)?\\s+',
      '(?<mismatch>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s*(?<mismatchUnit>m|s)?\\s+',
      '(?<desync>-?\\d+(?:\\.\\d+)?|N\\/?A|—|-)\\s*$'
    ].join(''),
    'iu'
  );
  const COMBAT_LOG_MEASUREMENT_PATTERN = /^(-?\d+(?:\.\d+)?|N\/?A|—|-)$/i;

  function splitCombatLogMeasurement(token, units = []) {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (!trimmed) {
      return { value: '', unit: '' };
    }

    const normalisedUnits = units.map((unit) => String(unit || '').toLowerCase());
    const lower = trimmed.toLowerCase();
    for (const unit of normalisedUnits) {
      if (unit && lower.endsWith(unit)) {
        const valuePart = trimmed.slice(0, trimmed.length - unit.length).trim();
        if (valuePart && COMBAT_LOG_MEASUREMENT_PATTERN.test(valuePart)) {
          return { value: valuePart, unit };
        }
      }
    }

    if (COMBAT_LOG_MEASUREMENT_PATTERN.test(trimmed)) {
      return { value: trimmed, unit: '' };
    }

    return { value: trimmed, unit: '' };
  }

  function parseCombatLogFallbackGroups(rawLine) {
    const headMatch = rawLine.match(/^(-?\d+(?:\.\d+)?)(?:s)?\s+(.*?)\s+(-?\d+)\s+(.*?)\s+(-?\d+)\s+(.*)$/i);
    if (!headMatch) {
      return null;
    }

    const [, timeRaw, attackerRaw, attackerIdRaw, targetRaw, targetIdRaw, remainderRaw] = headMatch;
    const remainder = remainderRaw.replace(/\t+/g, ' ').trim();
    if (!remainder) {
      return null;
    }

    const segments = remainder
      .split(/\s{2,}/)
      .map((segment) => segment.trim())
      .filter((segment) => segment);

    if (segments.length < 11) {
      return null;
    }

    const baseColumns = segments.slice(0, 6);
    if (baseColumns.length < 6) {
      return null;
    }

    const tailStart = segments.length - 5;
    if (tailStart < 6) {
      return null;
    }

    const infoSegments = segments.slice(6, tailStart);
    const infoValue = infoSegments.length ? infoSegments.join('  ') : '';

    const timeParts = splitCombatLogMeasurement(timeRaw, ['s']);
    const distanceParts = splitCombatLogMeasurement(baseColumns[3], ['m']);
    const travelParts = splitCombatLogMeasurement(segments[tailStart + 2], ['s', 'm']);
    const mismatchParts = splitCombatLogMeasurement(segments[tailStart + 3], ['s', 'm']);
    const desyncParts = splitCombatLogMeasurement(segments[tailStart + 4], ['s', 'm']);

    const attackerId = String(attackerIdRaw ?? '').trim();
    const targetId = String(targetIdRaw ?? '').trim();
    if (!/^-?\d+$/.test(attackerId) || !/^-?\d+$/.test(targetId)) {
      return null;
    }

    const groups = {
      time: timeParts.value,
      attacker: attackerRaw?.trim() ?? '',
      attackerId,
      target: targetRaw?.trim() ?? '',
      targetId,
      weapon: baseColumns[0] ?? '',
      ammo: baseColumns[1] ?? '',
      area: baseColumns[2] ?? '',
      distance: distanceParts.value,
      distanceUnit: distanceParts.unit,
      oldHp: baseColumns[4] ?? '',
      newHp: baseColumns[5] ?? '',
      info: infoValue,
      hits: segments[tailStart] ?? '',
      integrity: segments[tailStart + 1] ?? '',
      travel: travelParts.value,
      travelUnit: travelParts.unit,
      mismatch: mismatchParts.value,
      mismatchUnit: mismatchParts.unit,
      desync: desyncParts.value
    };

    if (!groups.time) {
      return null;
    }

    return groups;
  }

  const NIL = /^(?:-|N\/?A|—)$/i;
  function num(value) {
    if (value == null) return null;
    const trimmed = typeof value === 'string' ? value.trim() : String(value);
    if (!trimmed || NIL.test(trimmed)) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function text(value) {
    if (value == null) return null;
    const trimmed = typeof value === 'string' ? value.trim() : String(value);
    return trimmed && !NIL.test(trimmed) ? trimmed : null;
  }

  function parseKillRawLog(raw) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;

    const victimPattern = /^(?:\[(?<victimClan>[^\]]+)\]\s*)?(?<victimName>[^\[]+?)\[(?<victimSteamId>\d+)\]\s+was killed by\s+(?<killerPart>.+)$/i;
    const victimMatch = text.match(victimPattern);
    if (!victimMatch?.groups) return null;

    const result = {
      victimName: victimMatch.groups.victimName?.trim() || null,
      victimClan: victimMatch.groups.victimClan?.trim() || null,
      victimSteamId: victimMatch.groups.victimSteamId || null,
      killerName: null,
      killerClan: null,
      killerSteamId: null
    };

    const killerPart = victimMatch.groups.killerPart || '';
    const killerPattern = /^(?:\[(?<killerClan>[^\]]+)\]\s*)?(?<killerName>.*?)(?:\[(?<killerSteamId>\d+)\])?(?<rest>(?:\s+.*)?)$/i;
    const killerMatch = killerPart.match(killerPattern);

    let rest = '';
    if (killerMatch?.groups) {
      result.killerName = killerMatch.groups.killerName?.trim() || null;
      result.killerClan = killerMatch.groups.killerClan?.trim() || null;
      result.killerSteamId = killerMatch.groups.killerSteamId || null;
      rest = killerMatch.groups.rest || '';
    } else {
      result.killerName = killerPart.trim() || null;
      rest = '';
    }

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

    for (let i = startIndex; i < normalized.length; i += 1) {
      const rawLine = normalized[i].trim();
      if (!rawLine || rawLine.startsWith('+')) continue;
      const match = rawLine.match(COMBAT_LOG_ENTRY_REGEX);
      const groups = match?.groups ?? parseCombatLogFallbackGroups(rawLine);
      if (!groups) continue;
      const timeValue = text(groups.time);
      const distanceValue = text(groups.distance);
      const distanceUnit = groups.distanceUnit ? groups.distanceUnit.trim() : '';
      const travelValue = text(groups.travel);
      const travelUnit = groups.travelUnit ? groups.travelUnit.trim() : '';
      const mismatchValue = text(groups.mismatch);
      const mismatchUnit = groups.mismatchUnit ? groups.mismatchUnit.trim() : '';
      const record = {
        raw: rawLine,
        timeSeconds: num(timeValue),
        timeRaw: timeValue ? `${timeValue}s` : null,
        attacker: text(groups.attacker),
        attackerId: text(groups.attackerId),
        target: text(groups.target),
        targetId: text(groups.targetId),
        weapon: text(groups.weapon),
        ammo: text(groups.ammo),
        area: text(groups.area),
        distanceMeters: num(distanceValue),
        distanceRaw: distanceValue ? `${distanceValue}${distanceUnit}` : null,
        oldHp: num(groups.oldHp),
        newHp: num(groups.newHp),
        info: text(groups.info),
        hits: num(groups.hits),
        integrity: num(groups.integrity),
        travelSeconds: num(travelValue),
        travelRaw: travelValue ? `${travelValue}${travelUnit}` : null,
        mismatchMeters: num(mismatchValue),
        mismatchRaw: mismatchValue ? `${mismatchValue}${mismatchUnit}` : null,
        desync: num(groups.desync)
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
      const limitedLines = lines.slice(0, 20);
      const limitedText = limitedLines.join('\n');
      combatLog = {
        text: limitedText,
        lines: limitedLines,
        fetchedAt: combatLog.fetchedAt || new Date().toISOString()
      };
      const parsedCombat = parseCombatLogEntries(combatLog.lines);
      if (parsedCombat.records.length) {
        combatLog.records = parsedCombat.records.slice(0, 20);
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
    let weapon = pickString(raw?.weapon, parsedRaw?.weapon);
    const rawWeapon = weapon;

    if (combatLog?.records?.length) {
      for (let i = combatLog.records.length - 1; i >= 0; i -= 1) {
        const record = combatLog.records[i];
        const info = String(record?.info || '').toLowerCase();
        const isKillRecord =
          info.includes('killed') ||
          (record?.newHp != null && Number.isFinite(record.newHp) && record.newHp <= 0);
        if (!isKillRecord) continue;

        if (record?.weapon) {
          weapon = record.weapon;
        }
        if (record?.distanceMeters != null && Number.isFinite(record.distanceMeters)) {
          distanceValue = record.distanceMeters;
        } else if (record?.distanceRaw) {
          const parsedDistance = toNumber(String(record.distanceRaw).replace(/[^0-9.-]+/g, ''));
          if (parsedDistance != null) distanceValue = parsedDistance;
        }
        break;
      }
    }

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
      rawWeapon,
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
      (entry.rawWeapon ?? entry.weapon ?? ''),
      entry.raw || ''
    ].join('::');
  }

  function killFeedRenderSignature(records) {
    return records
      .map((entry) => {
        const distanceValue = Number(entry.distance);
        const coords = entry.position
          ? ['x', 'y', 'z']
              .map((axis) => {
                const value = Number(entry.position?.[axis]);
                return Number.isFinite(value) ? value.toFixed(3) : '';
              })
              .join(',')
          : '';
        const combatLogLines = Array.isArray(entry.combatLog?.lines)
          ? entry.combatLog.lines.join('|')
          : entry.combatLog?.text || '';
        return [
          killEventSignature(entry),
          Number.isFinite(distanceValue) ? distanceValue.toFixed(3) : '',
          coords,
          entry.weapon || '',
          combatLogLines,
          entry.combatLogError || ''
        ].join('@@');
      })
      .join('##');
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
      if (seen.has(signature)) {
        for (let i = 0; i < list.length; i += 1) {
          if (killEventSignature(list[i]) === signature) {
            list[i] = { ...list[i], ...normalized };
            break;
          }
        }
        continue;
      }
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
      if (hasServer) killFeedState.renderSignatures.delete(serverId);
      return;
    }
    killFeedEmpty?.classList.add('hidden');
    killFeedList.classList.remove('hidden');

    const renderSignature = killFeedRenderSignature(records);
    const previousSignature = killFeedState.renderSignatures.get(serverId);
    if (
      previousSignature === renderSignature &&
      killFeedList.childElementCount > 0
    ) {
      return;
    }

    const openSignatures = new Set();
    killFeedList.querySelectorAll('li[data-signature]').forEach((item) => {
      const signature = item?.dataset?.signature;
      const detailsEl = item.querySelector('details');
      if (signature && detailsEl?.open) {
        openSignatures.add(signature);
      }
    });

    const previousScrollTop = killFeedList.scrollTop;
    const previousScrollHeight = killFeedList.scrollHeight;
    const anchoredToTop = previousScrollTop <= 1;

    killFeedList.innerHTML = '';

    records.forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'kill-feed-entry';
      const signature = killEventSignature(entry);
      li.dataset.signature = signature;
      const details = document.createElement('details');
      const shouldOpen = openSignatures.size
        ? openSignatures.has(signature)
        : index === 0;
      if (shouldOpen) details.open = true;

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

    if (anchoredToTop) {
      killFeedList.scrollTop = 0;
    } else {
      const newScrollHeight = killFeedList.scrollHeight;
      const delta = newScrollHeight - previousScrollHeight;
      killFeedList.scrollTop = Math.max(0, previousScrollTop + (Number.isFinite(delta) ? delta : 0));
    }

    killFeedState.renderSignatures.set(serverId, renderSignature);
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

  function normalizeAqTicket(ticket) {
    if (!ticket) return null;
    const id = Number(ticket.id ?? ticket.ticketId);
    const serverId = Number(ticket.serverId ?? ticket.server_id ?? aqState.serverId);
    const teamId = Number(ticket.teamId ?? ticket.team_id ?? state.activeTeamId);
    const ticketNumber = Number(ticket.ticketNumber ?? ticket.ticket_number);
    const createdAt = pickString(ticket.createdAt ?? ticket.created_at) || null;
    const updatedAt = pickString(ticket.updatedAt ?? ticket.updated_at) || createdAt;
    return {
      id: Number.isFinite(id) ? id : null,
      serverId: Number.isFinite(serverId) ? serverId : aqState.serverId,
      teamId: Number.isFinite(teamId) ? teamId : (Number.isFinite(state.activeTeamId) ? state.activeTeamId : null),
      ticketNumber: Number.isFinite(ticketNumber) ? ticketNumber : null,
      subject: pickString(ticket.subject) || 'No subject provided',
      details: pickString(ticket.details) || '',
      createdBy: pickString(ticket.createdBy ?? ticket.created_by) || null,
      createdByTag: pickString(ticket.createdByTag ?? ticket.created_by_tag) || null,
      status: pickString(ticket.status) || 'open',
      createdAt,
      updatedAt,
      closedAt: pickString(ticket.closedAt ?? ticket.closed_at) || null,
      closedBy: pickString(ticket.closedBy ?? ticket.closed_by) || null,
      closedByTag: pickString(ticket.closedByTag ?? ticket.closed_by_tag) || null,
      closeReason: pickString(ticket.closeReason ?? ticket.close_reason) || null,
      previewToken: pickString(ticket.previewToken ?? ticket.preview_token) || null,
      previewUrl: pickString(ticket.previewUrl ?? ticket.preview_url ?? ticket.previewPath ?? ticket.preview_path) || null
    };
  }

  function normalizeAqDialogEntry(entry) {
    if (!entry) return null;
    const id = pickString(entry.id);
    const role = (pickString(entry.role) || 'requester').toLowerCase();
    const postedAt = pickString(entry.postedAt ?? entry.timestamp) || null;
    const content = pickString(entry.content) || '';
    const authorTag = pickString(entry.authorTag ?? entry.author_tag ?? entry.author) || null;
    const authorId = pickString(entry.authorId ?? entry.author_id) || null;
    return {
      id: id || (authorId && postedAt ? `${authorId}:${postedAt}` : null),
      role,
      postedAt,
      content,
      authorTag,
      authorId
    };
  }

  function normaliseF7FilterTokens(value) {
    if (value == null) return [];
    const text = String(value).trim().toLowerCase();
    if (!text) return [];
    return text.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  }

  function matchesF7Filter(report, tokens = []) {
    if (!report) return false;
    if (!Array.isArray(tokens) || tokens.length === 0) return true;
    return tokens.every((token) => matchF7Token(report, token));
  }

  function matchF7Token(report, token) {
    if (!token) return true;
    const raw = String(token).trim();
    if (!raw) return true;
    let key = null;
    let value = raw;
    if (raw.includes(':')) {
      const parts = raw.split(/:(.+)/);
      if (parts.length >= 2) {
        key = parts[0]?.trim().toLowerCase() || null;
        value = parts[1]?.trim() || '';
      }
    }
    if (!value) return true;
    const target = value.toLowerCase();
    const compare = (fields) => fields.some((field) => {
      if (field == null) return false;
      const str = String(field).toLowerCase();
      return str.includes(target);
    });
    if (key) {
      switch (key) {
        case 'target':
        case 'player':
          return compare([report.targetName, report.targetSteamId]);
        case 'reporter':
          return compare([report.reporterName, report.reporterSteamId]);
        case 'reason':
        case 'category':
          return compare([report.category, report.message]);
        case 'id':
          return compare([report.reportId, report.id]);
        default:
          break;
      }
    }
    return compare([
      report.targetName,
      report.targetSteamId,
      report.reporterName,
      report.reporterSteamId,
      report.category,
      report.message,
      report.reportId,
      report.id
    ]);
  }

  function updateF7ScopeButtons() {
    const scope = f7State.scope;
    const focusActive = !!f7State.focusTarget;
    f7ScopeButtons.forEach((btn) => {
      if (!btn) return;
      const btnScope = btn.dataset?.scope || 'new';
      const match = btnScope === scope;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
      const shouldDisable = focusActive && btnScope !== 'all';
      if (shouldDisable) {
        btn.setAttribute('disabled', 'true');
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
      }
    });
  }

  function renderF7FocusBanner() {
    if (!f7ReportsFocus) return;
    const focusActive = !!f7State.focusTarget;
    if (focusActive) {
      const label = f7State.focusLabel || f7State.focusTarget;
      f7ReportsFocus.classList.remove('hidden');
      if (f7ReportsFocusLabel) {
        f7ReportsFocusLabel.textContent = label
          ? `Showing reports for ${label}`
          : 'Showing reports for selected player';
      }
      if (f7ReportsClearFocus) {
        f7ReportsClearFocus.disabled = false;
      }
    } else {
      f7ReportsFocus.classList.add('hidden');
      if (f7ReportsFocusLabel) {
        f7ReportsFocusLabel.textContent = '';
      }
      if (f7ReportsClearFocus) {
        f7ReportsClearFocus.disabled = true;
      }
    }
  }

  function focusF7ReportsOnTarget(steamId, label) {
    const id = pickString(steamId)?.trim();
    if (!id) return;
    const name = pickString(label)?.trim() || '';
    if (f7State.focusTarget === id && f7State.scope === 'all') return;
    f7State.focusTarget = id;
    f7State.focusLabel = name;
    f7State.scope = 'all';
    f7State.filter = '';
    f7State.filterActive = false;
    if (f7ReportsSearch) {
      f7ReportsSearch.value = '';
    }
    f7State.activeId = null;
    f7State.list = [];
    f7State.detailCache.clear();
    f7State.loading = true;
    renderF7FocusBanner();
    updateF7ScopeButtons();
    renderF7Reports();
    refreshF7Reports({ force: true }).catch(() => {});
  }

  function clearF7FocusTarget({ resetScope = true, refresh = true } = {}) {
    if (!f7State.focusTarget) return;
    f7State.focusTarget = null;
    f7State.focusLabel = '';
    if (resetScope) {
      f7State.scope = 'new';
    }
    renderF7FocusBanner();
    updateF7ScopeButtons();
    f7State.list = [];
    f7State.detailCache.clear();
    f7State.activeId = null;
    if (refresh) {
      f7State.loading = true;
      renderF7Reports();
      refreshF7Reports({ force: true }).catch(() => {});
    } else {
      renderF7Reports();
    }
  }

  function renderF7ReportDetail(detail) {
    if (!f7ReportDetail || !f7ReportPlaceholder) return;
    const focusActive = !!f7State.focusTarget;
    if (!detail) {
      f7ReportDetail.classList.add('hidden');
      renderF7TargetSummary(null);
      renderF7TargetProfile(null);
      if (f7ReportOpenProfile) {
        f7ReportOpenProfile.disabled = true;
        delete f7ReportOpenProfile.dataset.steamid;
      }
      if (f7ReportShowAll) {
        f7ReportShowAll.disabled = true;
        f7ReportShowAll.textContent = 'View all reports for this player';
        f7ReportShowAll.setAttribute('aria-pressed', 'false');
      }
      const filterActive = !!f7State.filterActive;
      const totalCount = Number(f7State.totalCount) || 0;
      const visibleCount = Number(f7State.visibleCount) || 0;
      if (!Number.isFinite(f7State.serverId)) {
        f7ReportPlaceholder.textContent = 'Select a server to view F7 reports.';
        f7ReportPlaceholder.classList.remove('hidden');
      } else if (filterActive && totalCount > 0 && visibleCount === 0) {
        f7ReportPlaceholder.textContent = 'No reports match your search. Clear the filter to see everything.';
        f7ReportPlaceholder.classList.remove('hidden');
      } else if (!f7State.loading && totalCount === 0) {
        f7ReportPlaceholder.textContent = focusActive
          ? 'No reports found for this player yet.'
          : 'Select a report to review the details.';
        f7ReportPlaceholder.classList.remove('hidden');
      } else if (f7State.loading) {
        f7ReportPlaceholder.textContent = focusActive
          ? 'Loading player report history…'
          : 'Loading reports…';
        f7ReportPlaceholder.classList.remove('hidden');
      } else {
        f7ReportPlaceholder.classList.remove('hidden');
        f7ReportPlaceholder.textContent = focusActive
          ? "Select a report to review this player's history."
          : 'Select a report to review the details.';
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

    renderF7TargetSummary(detail.targetSummary || null);
    renderF7TargetProfile(detail);

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

    if (f7ReportShowAll) {
      const steamId = pickString(detail.targetSteamId)?.trim();
      const isFocused = steamId && f7State.focusTarget === steamId;
      f7ReportShowAll.disabled = !steamId;
      if (isFocused) {
        f7ReportShowAll.textContent = 'Back to recent reports';
        f7ReportShowAll.setAttribute('aria-pressed', 'true');
      } else {
        f7ReportShowAll.textContent = 'View all reports for this player';
        f7ReportShowAll.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function renderF7Reports() {
    if (!f7ReportsList) return;
    updateF7ScopeButtons();
    renderF7FocusBanner();
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
    const focusActive = !!f7State.focusTarget;
    const focusLabel = focusActive ? (f7State.focusLabel || f7State.focusTarget || '') : '';
    if (f7ReportsSearch) f7ReportsSearch.disabled = !hasServer;

    const baseList = Array.isArray(f7State.list) ? f7State.list : [];
    const normalised = baseList
      .map((item) => normalizeF7Report(item))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

    const deduped = [];
    const seenIds = new Set();
    for (const report of normalised) {
      if (report?.id != null) {
        if (seenIds.has(report.id)) continue;
        seenIds.add(report.id);
      }
      deduped.push(report);
    }

    const filterText = (f7State.filter || '').trim();
    const filterTokens = normaliseF7FilterTokens(filterText);
    const visible = filterTokens.length > 0
      ? deduped.filter((report) => matchesF7Filter(report, filterTokens))
      : deduped;

    f7State.totalCount = deduped.length;
    f7State.visibleCount = visible.length;
    f7State.filterActive = filterTokens.length > 0;

    if (f7ReportsCount) {
      if (!hasServer) {
        f7ReportsCount.textContent = '';
      } else if (f7State.loading && deduped.length === 0) {
        f7ReportsCount.textContent = 'Loading…';
      } else if (f7State.error) {
        f7ReportsCount.textContent = 'Unable to load';
      } else if (deduped.length === 0) {
        f7ReportsCount.textContent = focusActive
          ? (focusLabel ? `No reports for ${focusLabel}` : 'No reports for selected player')
          : 'No reports';
      } else if (filterTokens.length > 0) {
        const label = deduped.length === 1 ? 'report' : 'reports';
        const suffix = focusActive
          ? focusLabel
            ? ` ${label} for ${focusLabel}`
            : ` ${label} for selected player`
          : ` ${label}`;
        f7ReportsCount.textContent = `Showing ${visible.length} of ${deduped.length}${suffix}`;
      } else {
        const label = deduped.length === 1 ? 'report' : 'reports';
        if (focusActive) {
          f7ReportsCount.textContent = focusLabel
            ? `${deduped.length} ${label} for ${focusLabel}`
            : `${deduped.length} ${label} for selected player`;
        } else {
          f7ReportsCount.textContent = `${deduped.length} ${label}`;
        }
      }
    }

    if (f7ReportsEmpty) {
      const showEmpty = hasServer && !f7State.loading && !f7State.error && deduped.length === 0;
      const showFilteredEmpty = hasServer && !f7State.loading && !f7State.error && deduped.length > 0 && visible.length === 0;
      if (showFilteredEmpty) {
        f7ReportsEmpty.textContent = focusActive
          ? 'No reports for this player match your filter.'
          : 'No reports match your filter.';
      } else if (focusActive) {
        f7ReportsEmpty.textContent = focusLabel
          ? `No reports found for ${focusLabel}.`
          : 'No reports found for this player yet.';
      } else {
        f7ReportsEmpty.textContent = 'No F7 reports yet.';
      }
      f7ReportsEmpty.classList.toggle('hidden', !(showEmpty || showFilteredEmpty));
    }

    f7ReportsList.innerHTML = '';

    if (visible.length === 0) {
      f7State.activeId = null;
      renderF7ReportDetail(null);
      return;
    }

    const fragment = document.createDocumentFragment();
    visible.forEach((report) => {
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

    if (f7State.activeId == null || !visible.some((item) => item.id === f7State.activeId)) {
      f7State.activeId = visible[0]?.id ?? null;
    }

    const detail = f7State.activeId != null ? f7State.detailCache.get(f7State.activeId) : null;
    renderF7ReportDetail(detail || null);
    if (f7State.activeId != null && !f7State.detailCache.has(f7State.activeId)) {
      loadF7ReportDetail(f7State.activeId).catch(() => {});
    }
  }

  function describeCountry(value) {
    const text = pickString(value);
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    if (COUNTRY_FALLBACKS[upper]) return COUNTRY_FALLBACKS[upper];
    if (!/^[A-Z]{2}$/.test(upper)) return trimmed;
    if (regionDisplay) {
      try {
        const label = regionDisplay.of(upper);
        if (label && label !== upper) return label;
      } catch { /* ignore */ }
    }
    return COUNTRY_FALLBACKS[upper] || upper;
  }

  function formatCountryDetail(name, code) {
    const label = pickString(name) || null;
    const upper = pickString(code)?.toUpperCase() || null;
    if (label && upper) return `${label} (${upper})`;
    if (label) return label;
    if (upper) return describeCountry(upper);
    return null;
  }

  function describeRecentWindow(windowMs) {
    const value = Number(windowMs);
    if (!Number.isFinite(value) || value <= 0) return 'Recent reports';
    const days = Math.round(value / (24 * 60 * 60 * 1000));
    if (days >= 7) return `Reports (last ${days} days)`;
    if (days >= 2) return `Reports (last ${days} days)`;
    if (days === 1) return 'Reports (last 24 hours)';
    const hours = Math.round(value / (60 * 60 * 1000));
    if (hours >= 1) return `Reports (last ${hours} hours)`;
    return 'Recent reports';
  }

  function renderF7TargetSummary(summary) {
    if (!f7ReportTargetSummary) return;
    if (!summary || typeof summary !== 'object') {
      f7ReportTargetSummary.classList.add('hidden');
      if (f7ReportSummaryCategories) f7ReportSummaryCategories.innerHTML = '';
      if (f7ReportSummaryRecentLabel) f7ReportSummaryRecentLabel.textContent = 'Reports this week';
      return;
    }
    f7ReportTargetSummary.classList.remove('hidden');
    if (f7ReportSummaryTotal) f7ReportSummaryTotal.textContent = formatNumber(summary.totalReports ?? summary.total_reports ?? 0);
    if (f7ReportSummaryRecent) f7ReportSummaryRecent.textContent = formatNumber(summary.recentReports ?? summary.recent_reports ?? 0);
    if (f7ReportSummaryReporters) f7ReportSummaryReporters.textContent = formatNumber(summary.reporterCount ?? summary.reporter_count ?? 0);
    if (f7ReportSummaryFirst) f7ReportSummaryFirst.textContent = formatAbsoluteWithRelative(summary.firstReportedAt ?? summary.first_report_at);
    if (f7ReportSummaryLast) f7ReportSummaryLast.textContent = formatAbsoluteWithRelative(summary.lastReportedAt ?? summary.last_report_at);
    if (f7ReportSummaryRecentLabel) {
      const label = describeRecentWindow(summary.recentWindowMs ?? summary.recent_window_ms);
      f7ReportSummaryRecentLabel.textContent = label || 'Recent reports';
    }
    if (f7ReportSummaryCategories) {
      f7ReportSummaryCategories.innerHTML = '';
      const categories = Array.isArray(summary.topCategories ?? summary.top_categories) ? summary.topCategories ?? summary.top_categories : [];
      categories.filter(Boolean).forEach((entry) => {
        const category = pickString(entry.category, entry.name) || 'Unspecified';
        const count = Number(entry.count ?? entry.total) || 0;
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = `${category} · ${formatNumber(count)}`;
        f7ReportSummaryCategories.appendChild(tag);
      });
    }
  }

  function normalizeF7PlayerProfile(data, steamId, fallbackName) {
    const resolvedId = pickString(data?.steamid, data?.steamId, steamId);
    const forcedName = pickString(data?.forced_display_name, data?.forcedDisplayName);
    const persona = pickString(
      forcedName,
      data?.display_name,
      data?.displayName,
      data?.persona,
      data?.personaName,
      fallbackName,
      resolvedId
    );
    const rawDisplay = pickString(data?.raw_display_name, data?.rawDisplayName, persona, fallbackName, resolvedId);
    const profileUrl = pickString(data?.profileurl, data?.profile_url, data?.profileUrl) || (resolvedId ? `https://steamcommunity.com/profiles/${resolvedId}` : null);
    const avatarFull = pickString(data?.avatarfull, data?.avatarFull, data?.avatar);
    const countryCode = pickString(data?.country);
    const ipCountryCode = pickString(data?.ip_country_code, data?.ipCountryCode);
    const ipCountryName = pickString(data?.ip_country_name, data?.ipCountryName);
    const vacBanned = Number(data?.vac_banned ?? data?.vacBanned) > 0 ? 1 : 0;
    const gameBans = Number(data?.game_bans ?? data?.gameBans ?? 0) || 0;
    const lastBanDays = Number(data?.last_ban_days ?? data?.lastBanDays ?? data?.daysSinceLastBan);
    const playtimeMinutes = Number(
      data?.rust_playtime_minutes
      ?? data?.rustPlaytimeMinutes
      ?? data?.total_playtime_minutes
      ?? data?.totalPlaytimeMinutes
    );
    return {
      steamid: resolvedId || steamId || null,
      display_name: persona || fallbackName || resolvedId || null,
      persona: persona || null,
      raw_display_name: rawDisplay || null,
      profileurl: profileUrl,
      avatar: avatarFull || null,
      avatarfull: avatarFull || null,
      country: countryCode || null,
      ip_country_code: ipCountryCode || null,
      ip_country_name: ipCountryName || null,
      vac_banned: vacBanned,
      game_bans: Number.isFinite(gameBans) && gameBans > 0 ? gameBans : 0,
      last_ban_days: Number.isFinite(lastBanDays) && lastBanDays >= 0 ? Math.round(lastBanDays) : null,
      rust_playtime_minutes: Number.isFinite(playtimeMinutes) && playtimeMinutes > 0 ? Math.round(playtimeMinutes) : null,
      playtime_updated_at: pickString(data?.playtime_updated_at, data?.playtimeUpdatedAt) || null,
      forced_display_name: forcedName || null
    };
  }

  function ensureF7PlayerProfile(detail) {
    if (!detail) return null;
    const steamId = pickString(detail.targetSteamId);
    const key = steamId ? steamId.trim() : '';
    if (!key) return null;
    const cached = f7ProfileCache.get(key);
    if (cached) return cached;
    if (f7ProfileRequests.has(key) || !state.TOKEN) return null;
    const request = (async () => {
      try {
        const data = await api(`/players/${encodeURIComponent(key)}`);
        const normalized = normalizeF7PlayerProfile(data || {}, key, detail.targetName || detail.targetSteamId);
        f7ProfileCache.set(key, { status: 'ready', profile: normalized, error: null });
      } catch (err) {
        if (errorCode(err) === 'unauthorized') handleUnauthorized();
        const description = describeError(err);
        f7ProfileCache.set(key, { status: 'error', profile: null, error: description });
      } finally {
        f7ProfileRequests.delete(key);
        const active = f7State.activeId != null ? f7State.detailCache.get(f7State.activeId) : null;
        if (active && active.targetSteamId && String(active.targetSteamId).trim() === key) {
          renderF7TargetProfile(active);
        }
      }
    })();
    f7ProfileRequests.set(key, request);
    return null;
  }

  function renderF7TargetProfile(detail) {
    if (!f7ReportTargetProfile) return;
    const steamId = pickString(detail?.targetSteamId);
    if (!detail || !steamId) {
      f7ReportTargetProfile.classList.add('hidden');
      if (f7ReportProfileName) f7ReportProfileName.textContent = '—';
      if (f7ReportProfileSteam) f7ReportProfileSteam.textContent = '—';
      if (f7ReportProfileCountry) f7ReportProfileCountry.textContent = '—';
      if (f7ReportProfileVac) f7ReportProfileVac.textContent = '—';
      if (f7ReportProfileGameBans) f7ReportProfileGameBans.textContent = '—';
      if (f7ReportProfileLastBan) f7ReportProfileLastBan.textContent = '—';
      if (f7ReportProfilePlaytime) {
        f7ReportProfilePlaytime.textContent = '—';
        f7ReportProfilePlaytime.removeAttribute('title');
      }
      if (f7ReportProfileStatus) {
        f7ReportProfileStatus.textContent = '';
        f7ReportProfileStatus.classList.add('hidden');
      }
      if (f7ReportOpenProfile) {
        f7ReportOpenProfile.disabled = true;
        delete f7ReportOpenProfile.dataset.steamid;
      }
      if (f7ReportProfileAvatar) f7ReportProfileAvatar.innerHTML = '';
      return;
    }
    const cacheEntry = ensureF7PlayerProfile(detail) || f7ProfileCache.get(steamId.trim());
    const profile = cacheEntry?.profile || null;
    const loading = !profile && f7ProfileRequests.has(steamId.trim());
    const errorMessage = cacheEntry?.error;
    const displayName = pickString(
      profile?.display_name,
      profile?.persona,
      detail.targetName,
      steamId
    );
    f7ReportTargetProfile.classList.remove('hidden');
    if (f7ReportProfileName) f7ReportProfileName.textContent = displayName || 'Unknown player';
    if (f7ReportProfileSteam) {
      f7ReportProfileSteam.innerHTML = '';
      const link = document.createElement('a');
      link.textContent = steamId;
      link.href = `https://steamcommunity.com/profiles/${steamId}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      f7ReportProfileSteam.appendChild(link);
    }
    if (f7ReportProfileAvatar) {
      f7ReportProfileAvatar.innerHTML = '';
      const avatarUrl = profile?.avatarfull || profile?.avatar || null;
      if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = `${displayName || 'Player'} avatar`;
        img.loading = 'lazy';
        f7ReportProfileAvatar.appendChild(img);
      } else {
        f7ReportProfileAvatar.textContent = chatAvatarInitial(displayName || steamId);
      }
    }
    if (f7ReportProfileCountry) {
      const steamCountry = profile?.country || null;
      const ipCountryCode = profile?.ip_country_code || null;
      const ipCountryName = profile?.ip_country_name || null;
      const parts = [];
      const steamLabel = steamCountry ? formatCountryDetail(describeCountry(steamCountry), steamCountry) : null;
      if (steamLabel) parts.push(`Steam: ${steamLabel}`);
      const ipLabel = ipCountryCode || ipCountryName
        ? formatCountryDetail(ipCountryName || describeCountry(ipCountryCode), ipCountryCode)
        : null;
      if (ipLabel) parts.push(`IP: ${ipLabel}`);
      f7ReportProfileCountry.textContent = parts.length ? parts.join(' · ') : '—';
    }
    if (f7ReportProfileVac) {
      const vac = Number(profile?.vac_banned) > 0;
      f7ReportProfileVac.textContent = vac ? 'VAC ban on record' : 'None';
    }
    if (f7ReportProfileGameBans) {
      const bans = Number(profile?.game_bans) || 0;
      f7ReportProfileGameBans.textContent = bans > 0 ? `${formatNumber(bans)}` : '0';
    }
    if (f7ReportProfileLastBan) {
      f7ReportProfileLastBan.textContent = describeBanAge(profile?.last_ban_days, Number(profile?.vac_banned) > 0, Number(profile?.game_bans) || 0);
    }
    if (f7ReportProfilePlaytime) {
      f7ReportProfilePlaytime.textContent = formatPlaytimeMinutes(profile?.rust_playtime_minutes);
      const updated = profile?.playtime_updated_at;
      if (updated) {
        f7ReportProfilePlaytime.title = `Updated ${formatAbsoluteWithRelative(updated)}`;
      } else {
        f7ReportProfilePlaytime.removeAttribute('title');
      }
    }
    if (f7ReportProfileStatus) {
      if (errorMessage) {
        f7ReportProfileStatus.textContent = 'Unable to load profile: ' + errorMessage;
        f7ReportProfileStatus.classList.remove('hidden');
      } else if (loading) {
        f7ReportProfileStatus.textContent = 'Loading latest Steam profile…';
        f7ReportProfileStatus.classList.remove('hidden');
      } else {
        f7ReportProfileStatus.textContent = '';
        f7ReportProfileStatus.classList.add('hidden');
      }
    }
    if (f7ReportOpenProfile) {
      f7ReportOpenProfile.disabled = false;
      f7ReportOpenProfile.dataset.steamid = steamId;
    }
  }

  function formatPlaytimeMinutes(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return '—';
    const total = Math.max(0, Math.round(value));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} h`;
    return `${hours} h ${mins} min`;
  }

  function describeBanAge(days, vacBanned, gameBans) {
    const hasBan = (Number(vacBanned) > 0) || (Number(gameBans) > 0);
    if (!hasBan) return 'No bans';
    const value = Number(days);
    if (!Number.isFinite(value) || value < 0) return 'Unknown';
    if (value === 0) return 'Today';
    if (value === 1) return '1 day ago';
    if (value < 30) return `${value} days ago`;
    const months = Math.floor(value / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(value / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }

  function buildF7PlayerPayload(detail) {
    if (!detail) return null;
    const steamId = pickString(detail.targetSteamId);
    if (!steamId) return null;
    const key = steamId.trim();
    const cached = f7ProfileCache.get(key);
    const baseName = pickString(
      cached?.profile?.display_name,
      detail.targetName,
      steamId
    ) || steamId;
    const payload = { ...(cached?.profile || {}) };
    payload.steamid = payload.steamid || steamId;
    payload.display_name = payload.display_name || baseName;
    payload.persona = payload.persona || baseName;
    if (!payload.profileurl) {
      payload.profileurl = `https://steamcommunity.com/profiles/${steamId}`;
    }
    return payload;
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
    if (f7State.focusTarget) {
      params.set('target', f7State.focusTarget);
      params.set('scope', 'all');
      params.set('limit', '100');
    } else {
      params.set('scope', f7State.scope);
      params.set('limit', f7State.scope === 'all' ? '100' : '25');
    }
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
      const baseReport = normalizeF7Report(data?.report);
      const previous = f7State.detailCache.get(numericId) || {};
      const detail = {
        ...baseReport,
        recentForTarget: Array.isArray(data?.recentForTarget)
          ? data.recentForTarget.map((item) => normalizeF7Report(item)).filter(Boolean)
          : [],
        targetSummary: data?.targetSummary ?? previous.targetSummary ?? null
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
    let focusCleared = false;
    if (f7State.focusTarget && normalized !== 'all') {
      focusCleared = true;
      clearF7FocusTarget({ resetScope: false, refresh: false });
    }
    if (!focusCleared && f7State.scope === normalized) return;
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
    f7State.filter = '';
    f7State.filterActive = false;
    f7State.totalCount = 0;
    f7State.visibleCount = 0;
    f7State.focusTarget = null;
    f7State.focusLabel = '';
    f7ProfileCache.clear();
    f7ProfileRequests.clear();
    if (f7FilterTimer) {
      clearTimeout(f7FilterTimer);
      f7FilterTimer = null;
    }
    if (f7ReportsSearch) {
      f7ReportsSearch.value = '';
      f7ReportsSearch.disabled = !Number.isFinite(numeric);
    }
    if (f7ReportsCount) f7ReportsCount.textContent = '';
    updateF7ScopeButtons();
    renderF7FocusBanner();
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
    f7State.filter = '';
    f7State.filterActive = false;
    f7State.totalCount = 0;
    f7State.visibleCount = 0;
    f7State.focusTarget = null;
    f7State.focusLabel = '';
    f7ProfileCache.clear();
    f7ProfileRequests.clear();
    if (f7FilterTimer) {
      clearTimeout(f7FilterTimer);
      f7FilterTimer = null;
    }
    if (f7ReportsSearch) {
      f7ReportsSearch.value = '';
      f7ReportsSearch.disabled = true;
    }
    if (f7ReportsCount) f7ReportsCount.textContent = '';
    updateF7ScopeButtons();
    renderF7FocusBanner();
    renderF7Reports();
  }

  function renderAqTickets() {
    if (aqTicketsLoading) {
      aqTicketsLoading.classList.toggle('hidden', !aqState.loadingList);
    }
    if (aqTicketsError) {
      if (aqState.listError) {
        aqTicketsError.textContent = aqState.listError;
        aqTicketsError.classList.remove('hidden');
      } else {
        aqTicketsError.textContent = '';
        aqTicketsError.classList.add('hidden');
      }
    }
    const hasServer = Number.isFinite(aqState.serverId);
    if (aqTicketsEmpty) {
      const showEmpty = hasServer && !aqState.loadingList && !aqState.listError && aqState.list.length === 0;
      aqTicketsEmpty.classList.toggle('hidden', !showEmpty);
    }
    if (aqTicketsCount) {
      if (!hasServer) {
        aqTicketsCount.textContent = '';
      } else if (aqState.loadingList && aqState.list.length === 0) {
        aqTicketsCount.textContent = 'Loading…';
      } else if (aqState.listError) {
        aqTicketsCount.textContent = 'Unable to load tickets';
      } else {
        const total = aqState.list.length;
        if (total === 0) {
          aqTicketsCount.textContent = 'No tickets';
        } else {
          const label = total === 1 ? 'ticket' : 'tickets';
          aqTicketsCount.textContent = `Showing ${total} ${label}`;
        }
      }
    }
    if (!aqTicketsList) return;
    aqTicketsList.innerHTML = '';
    const list = Array.isArray(aqState.list) ? aqState.list : [];
    list.forEach((ticket) => {
      const normalized = normalizeAqTicket(ticket);
      if (!normalized) return;
      const li = document.createElement('li');
      li.className = 'aq-item';
      if (normalized.id != null) li.dataset.ticketId = String(normalized.id);
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '0');
      const active = normalized.id != null && normalized.id === aqState.selectedId;
      li.classList.toggle('active', active);
      li.setAttribute('aria-selected', active ? 'true' : 'false');
      const statusLower = (normalized.status || '').toLowerCase();
      li.classList.toggle('closed', statusLower === 'closed');

      const title = document.createElement('div');
      title.className = 'aq-item-title';
      title.textContent = normalized.subject || 'No subject provided';
      li.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'aq-item-meta';
      const parts = [];
      if (normalized.ticketNumber != null) parts.push(`#${normalized.ticketNumber}`);
      const opener = normalized.createdByTag || normalized.createdBy;
      const createdLabel = normalized.createdAt
        ? formatRelativeTime(normalized.createdAt) || formatDateTime(normalized.createdAt)
        : null;
      if (statusLower === 'closed') {
        const closedWhen = normalized.closedAt
          ? formatRelativeTime(normalized.closedAt) || formatDateTime(normalized.closedAt)
          : null;
        const closedBy = normalized.closedByTag || normalized.closedBy || 'Unknown staff';
        const closedParts = ['Closed'];
        if (closedWhen) closedParts.push(closedWhen);
        closedParts.push(`by ${closedBy}`);
        parts.push(closedParts.join(' '));
        if (createdLabel || opener) {
          const openedParts = [];
          openedParts.push('Opened');
          if (createdLabel) openedParts.push(createdLabel);
          const openedBy = opener || 'Unknown requester';
          openedParts.push(`by ${openedBy}`);
          parts.push(openedParts.join(' '));
        }
      } else {
        const statusLabel = (normalized.status || 'open').replace(/^[a-z]/, (char) => char.toUpperCase());
        parts.push(statusLabel);
        if (opener) parts.push(opener);
        if (createdLabel) parts.push(createdLabel);
      }
      meta.textContent = parts.join(' • ');
      li.appendChild(meta);

      if (normalized.details) {
        const preview = document.createElement('div');
        preview.className = 'aq-item-preview';
        preview.textContent = normalized.details;
        li.appendChild(preview);
      }

      aqTicketsList.appendChild(li);
    });
    if (aqTicketPlaceholder && !Number.isFinite(aqState.serverId)) {
      aqTicketPlaceholder.textContent = 'Select a server to view AQ tickets.';
      aqTicketPlaceholder.classList.remove('hidden');
      if (aqTicketDetail) {
        aqTicketDetail.classList.add('hidden');
        aqTicketDetail.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function getActiveAqTicketDetail() {
    const id = Number(aqState.selectedId);
    if (!Number.isFinite(id)) return null;
    return aqState.detailCache.get(id) || null;
  }

  function renderAqTicketReply(detail) {
    if (!aqTicketReply) return;
    const activeDetail = detail && detail.ticket ? detail : null;
    if (!activeDetail) {
      aqTicketReply.classList.add('hidden');
      if (aqTicketReplyInput) {
        aqTicketReplyInput.value = '';
        aqTicketReplyInput.disabled = true;
      }
      if (aqTicketReplySubmit) {
        aqTicketReplySubmit.disabled = true;
        aqTicketReplySubmit.textContent = 'Send reply';
      }
      if (aqTicketReplyError) {
        aqTicketReplyError.textContent = '';
        aqTicketReplyError.classList.add('hidden');
      }
      if (aqTicketReplyNotice) {
        aqTicketReplyNotice.textContent = '';
        aqTicketReplyNotice.classList.add('hidden');
      }
      return;
    }
    const ticket = normalizeAqTicket(activeDetail.ticket);
    const isClosed = (ticket?.status || '').toLowerCase() === 'closed';
    const sending = aqState.replying;
    const message = aqTicketReplyInput?.value || '';
    const hasMessage = message.trim().length > 0;
    aqTicketReply.classList.remove('hidden');
    if (aqTicketReplyInput) {
      aqTicketReplyInput.disabled = sending || isClosed;
    }
    if (aqTicketReplySubmit) {
      aqTicketReplySubmit.disabled = sending || isClosed || !hasMessage;
      aqTicketReplySubmit.textContent = sending ? 'Sending…' : 'Send reply';
    }
    if (aqTicketReplyError) {
      if (aqState.replyError) {
        aqTicketReplyError.textContent = aqState.replyError;
        aqTicketReplyError.classList.remove('hidden');
      } else {
        aqTicketReplyError.textContent = '';
        aqTicketReplyError.classList.add('hidden');
      }
    }
    if (aqTicketReplyNotice) {
      if (isClosed) {
        aqTicketReplyNotice.textContent = 'This ticket is closed. Replies are disabled.';
        aqTicketReplyNotice.classList.remove('hidden');
      } else {
        aqTicketReplyNotice.textContent = '';
        aqTicketReplyNotice.classList.add('hidden');
      }
    }
  }

  function renderAqTicketDetail(detail) {
    const hasServer = Number.isFinite(aqState.serverId);
    const activeDetail = detail && detail.ticket ? detail : null;
    if (aqTicketDialogLoading) {
      aqTicketDialogLoading.classList.toggle('hidden', !aqState.detailLoading);
    }
    if (aqTicketDialogError) {
      if (aqState.detailError) {
        aqTicketDialogError.textContent = aqState.detailError;
        aqTicketDialogError.classList.remove('hidden');
      } else {
        aqTicketDialogError.textContent = '';
        aqTicketDialogError.classList.add('hidden');
      }
    }
    if (!activeDetail) {
      if (aqTicketDetail) {
        aqTicketDetail.classList.add('hidden');
        aqTicketDetail.setAttribute('aria-hidden', 'true');
      }
      if (aqTicketPreviewLink) {
        aqTicketPreviewLink.classList.add('hidden');
        aqTicketPreviewLink.removeAttribute('href');
      }
      if (aqTicketPlaceholder) {
        if (!hasServer) {
          aqTicketPlaceholder.textContent = 'Select a server to view AQ tickets.';
        } else if (aqState.loadingList) {
          aqTicketPlaceholder.textContent = 'Loading tickets…';
        } else {
          aqTicketPlaceholder.textContent = aqState.list.length > 0
            ? 'Select a ticket to view the conversation.'
            : 'No tickets for this server yet.';
        }
        aqTicketPlaceholder.classList.remove('hidden');
      }
      if (aqTicketDialogEmpty) aqTicketDialogEmpty.classList.add('hidden');
      if (aqTicketDialog) aqTicketDialog.innerHTML = '';
      renderAqTicketReply(null);
      return;
    }

    if (aqTicketPlaceholder) aqTicketPlaceholder.classList.add('hidden');
    if (aqTicketDetail) {
      aqTicketDetail.classList.remove('hidden');
      aqTicketDetail.setAttribute('aria-hidden', 'false');
    }

    const ticket = normalizeAqTicket(activeDetail.ticket);
    if (aqTicketSubject) {
      aqTicketSubject.textContent = ticket?.subject || 'No subject provided';
    }
    if (aqTicketNumber) {
      aqTicketNumber.textContent = ticket?.ticketNumber != null ? `#${ticket.ticketNumber}` : '';
    }
    if (aqTicketMeta) {
      const statusLower = (ticket?.status || '').toLowerCase();
      if (statusLower === 'closed') {
        const closedWhen = ticket?.closedAt
          ? formatRelativeTime(ticket.closedAt) || formatDateTime(ticket.closedAt)
          : 'Unknown time';
        const closedBy = ticket?.closedByTag || ticket?.closedBy || 'Unknown staff';
        const openedWhen = ticket?.createdAt
          ? formatRelativeTime(ticket.createdAt) || formatDateTime(ticket.createdAt)
          : null;
        const opener = ticket?.createdByTag || ticket?.createdBy || 'Unknown requester';
        const closedText = `Closed ${closedWhen} by ${closedBy}`;
        const openedText = openedWhen
          ? `Opened ${openedWhen} by ${opener}`
          : `Opened by ${opener}`;
        aqTicketMeta.textContent = `${closedText} • ${openedText}`;
      } else {
        const statusLabelRaw = ticket?.status || 'open';
        const statusLabel = statusLabelRaw.toLowerCase() === 'open'
          ? 'Open ticket'
          : statusLabelRaw.replace(/^[a-z]/, (char) => char.toUpperCase());
        const opener = ticket?.createdByTag || ticket?.createdBy || 'Unknown requester';
        const when = ticket?.createdAt
          ? formatRelativeTime(ticket.createdAt) || formatDateTime(ticket.createdAt)
          : 'Unknown time';
        aqTicketMeta.textContent = `${statusLabel} • Opened ${when} by ${opener}`;
      }
    }
    if (aqTicketPreviewLink) {
      const previewUrl = activeDetail?.previewUrl || ticket?.previewUrl || null;
      if (previewUrl) {
        aqTicketPreviewLink.href = previewUrl;
        aqTicketPreviewLink.classList.remove('hidden');
      } else {
        aqTicketPreviewLink.classList.add('hidden');
        aqTicketPreviewLink.removeAttribute('href');
      }
    }

    if (aqTicketDialog) {
      aqTicketDialog.innerHTML = '';
      const dialogEntries = Array.isArray(activeDetail.dialog) ? activeDetail.dialog : [];
      dialogEntries.forEach((entry) => {
        const normalized = normalizeAqDialogEntry(entry);
        if (!normalized || !normalized.content) return;
        const li = document.createElement('li');
        li.className = 'aq-dialog-entry';
        if (normalized.role === 'staff') li.classList.add('staff');

        const meta = document.createElement('div');
        meta.className = 'aq-dialog-meta';
        const author = document.createElement('span');
        author.textContent = normalized.authorTag || normalized.authorId || (normalized.role === 'staff' ? 'Staff' : 'Requester');
        meta.appendChild(author);
        if (normalized.postedAt) {
          const when = document.createElement('span');
          when.textContent = formatRelativeTime(normalized.postedAt) || formatDateTime(normalized.postedAt);
          meta.appendChild(when);
        }
        li.appendChild(meta);

        const contentWrap = document.createElement('div');
        contentWrap.className = 'aq-dialog-content';
        const paragraph = document.createElement('p');
        paragraph.textContent = normalized.content;
        contentWrap.appendChild(paragraph);
        li.appendChild(contentWrap);

        aqTicketDialog.appendChild(li);
      });
      if (aqTicketDialogEmpty) {
        const showEmpty = dialogEntries.length === 0 && !aqState.detailLoading && !aqState.detailError;
        aqTicketDialogEmpty.classList.toggle('hidden', !showEmpty);
      }
    }
    renderAqTicketReply(activeDetail);
  }

  async function submitAqTicketReply(event) {
    event.preventDefault();
    if (aqState.replying) return;
    const serverId = Number(aqState.serverId);
    const ticketId = Number(aqState.selectedId);
    if (!Number.isFinite(serverId) || !Number.isFinite(ticketId)) return;
    if (!aqTicketReplyInput) return;
    const message = aqTicketReplyInput.value || '';
    if (!message.trim()) {
      aqState.replyError = describeError('message_required');
      renderAqTicketReply(getActiveAqTicketDetail());
      aqTicketReplyInput.focus();
      return;
    }
    aqState.replying = true;
    aqState.replyError = null;
    renderAqTicketReply(getActiveAqTicketDetail());
    try {
      await api(`/servers/${serverId}/aq-tickets/${ticketId}/reply`, { message }, 'POST');
      aqTicketReplyInput.value = '';
      aqState.replyError = null;
      await loadAqTicketDetail(ticketId, { force: true });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        handleUnauthorized();
        return;
      }
      aqState.replyError = describeError(err);
    } finally {
      aqState.replying = false;
      renderAqTicketReply(getActiveAqTicketDetail());
    }
  }

  async function refreshAqTickets({ force = false } = {}) {
    const serverId = Number(aqState.serverId);
    if (!Number.isFinite(serverId) || !hasServerCapability('view')) {
      aqState.list = [];
      aqState.listError = null;
      aqState.loadingList = false;
      aqState.selectedId = null;
      renderAqTickets();
      renderAqTicketDetail(null);
      return;
    }
    if (aqState.loadingList && !force) return;
    aqState.loadingList = true;
    aqState.listError = null;
    const requestToken = Symbol('aqTicketsList');
    aqState.listRequestToken = requestToken;
    renderAqTickets();
    try {
      const params = new URLSearchParams({ status: 'all', limit: '50' });
      const data = await api(`/servers/${serverId}/aq-tickets?${params.toString()}`);
      if (aqState.listRequestToken !== requestToken || Number(aqState.serverId) !== serverId) return;
      const list = Array.isArray(data?.tickets)
        ? data.tickets.map((item) => normalizeAqTicket(item)).filter(Boolean)
        : [];
      aqState.list = list;
      if (list.length === 0) {
        aqState.selectedId = null;
      } else if (aqState.selectedId == null || !list.some((ticket) => ticket.id === aqState.selectedId)) {
        aqState.selectedId = list[0]?.id ?? null;
      }
      aqState.listError = null;
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      if (aqState.listRequestToken === requestToken && Number(aqState.serverId) === serverId) {
        aqState.listError = 'Failed to load tickets: ' + describeError(err);
      }
    } finally {
      if (aqState.listRequestToken !== requestToken || Number(aqState.serverId) !== serverId) return;
      aqState.loadingList = false;
      aqState.listRequestToken = null;
      renderAqTickets();
      if (aqState.selectedId != null) {
        loadAqTicketDetail(aqState.selectedId).catch(() => {});
      } else {
        renderAqTicketDetail(null);
      }
    }
  }

  async function loadAqTicketDetail(ticketId, { force = false } = {}) {
    const serverId = Number(aqState.serverId);
    if (!Number.isFinite(serverId)) return;
    const numericId = Number(ticketId);
    if (!Number.isFinite(numericId)) return;
    if (!force && aqState.detailCache.has(numericId)) {
      const cached = aqState.detailCache.get(numericId);
      aqState.detailLoading = false;
      aqState.detailError = null;
      if (numericId === aqState.selectedId) renderAqTicketDetail(cached);
      return;
    }
    aqState.detailLoading = true;
    aqState.detailError = null;
    if (numericId === aqState.selectedId) renderAqTicketDetail(aqState.detailCache.get(numericId) || null);
    const requestToken = Symbol('aqTicketDetail');
    aqState.detailRequests.set(numericId, requestToken);
    try {
      const data = await api(`/servers/${serverId}/aq-tickets/${numericId}`);
      if (aqState.detailRequests.get(numericId) !== requestToken || Number(aqState.serverId) !== serverId) return;
      const ticket = normalizeAqTicket(data?.ticket);
      const dialog = Array.isArray(data?.dialog)
        ? data.dialog.map((entry) => normalizeAqDialogEntry(entry)).filter((entry) => entry && entry.content)
        : [];
      const previewUrl = pickString(data?.previewUrl ?? data?.preview_url ?? ticket?.previewUrl ?? null) || null;
      const detail = { ticket, dialog, previewUrl };
      aqState.detailCache.set(numericId, detail);
      aqState.detailError = null;
      aqState.detailLoading = false;
      if (numericId === aqState.selectedId) {
        renderAqTicketDetail(detail);
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      if (aqState.detailRequests.get(numericId) === requestToken && Number(aqState.serverId) === serverId) {
        aqState.detailError = 'Failed to load conversation: ' + describeError(err);
        aqState.detailLoading = false;
        if (numericId === aqState.selectedId) {
          renderAqTicketDetail(aqState.detailCache.get(numericId) || null);
        }
      }
    } finally {
      if (aqState.detailRequests.get(numericId) === requestToken) {
        aqState.detailRequests.delete(numericId);
      }
      if (aqState.detailRequests.size === 0) {
        aqState.detailLoading = false;
      }
    }
  }

  function setAqSelectedTicket(ticketId, { force = false } = {}) {
    const numericId = Number(ticketId);
    if (!Number.isFinite(numericId)) {
      aqState.selectedId = null;
      renderAqTickets();
      renderAqTicketDetail(null);
      return;
    }
    if (aqState.selectedId === numericId && !force) {
      if (aqState.detailCache.has(numericId)) {
        renderAqTicketDetail(aqState.detailCache.get(numericId));
      } else {
        loadAqTicketDetail(numericId).catch(() => {});
      }
      return;
    }
    aqState.selectedId = numericId;
    aqState.replying = false;
    aqState.replyError = null;
    if (aqTicketReplyInput) aqTicketReplyInput.value = '';
    renderAqTickets();
    if (aqState.detailCache.has(numericId)) {
      aqState.detailError = null;
      aqState.detailLoading = false;
      renderAqTicketDetail(aqState.detailCache.get(numericId));
    } else {
      aqState.detailLoading = true;
      aqState.detailError = null;
      renderAqTicketDetail(null);
    }
    loadAqTicketDetail(numericId, { force }).catch(() => {});
  }

  function prepareAqTicketsForServer(serverId) {
    const numeric = Number(serverId);
    aqState.serverId = Number.isFinite(numeric) ? numeric : null;
    aqState.list = [];
    aqState.listError = null;
    aqState.loadingList = false;
    aqState.selectedId = null;
    aqState.listRequestToken = null;
    aqState.detailError = null;
    aqState.detailLoading = false;
    aqState.detailCache.clear();
    aqState.detailRequests.clear();
    aqState.replying = false;
    aqState.replyError = null;
    renderAqTickets();
    renderAqTicketDetail(null);
    if (!Number.isFinite(numeric) || !hasServerCapability('view')) {
      return;
    }
    refreshAqTickets({ force: true }).catch(() => {});
  }

  function resetAqTickets() {
    aqState.serverId = null;
    aqState.list = [];
    aqState.listError = null;
    aqState.loadingList = false;
    aqState.selectedId = null;
    aqState.listRequestToken = null;
    aqState.detailError = null;
    aqState.detailLoading = false;
    aqState.detailCache.clear();
    aqState.detailRequests.clear();
    aqState.replying = false;
    aqState.replyError = null;
    renderAqTickets();
    renderAqTicketDetail(null);
  }

  if (aqTicketsList) {
    aqTicketsList.addEventListener('click', (event) => {
      const target = event.target.closest('.aq-item');
      if (!target) return;
      const id = Number(target.dataset.ticketId);
      if (!Number.isFinite(id)) return;
      setAqSelectedTicket(id);
    });
    aqTicketsList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target.closest('.aq-item');
      if (!target) return;
      const id = Number(target.dataset.ticketId);
      if (!Number.isFinite(id)) return;
      event.preventDefault();
      setAqSelectedTicket(id);
    });
  }

  aqTicketReplyForm?.addEventListener('submit', submitAqTicketReply);
  aqTicketReplyInput?.addEventListener('input', () => {
    if (aqState.replyError) {
      aqState.replyError = null;
    }
    renderAqTicketReply(getActiveAqTicketDetail());
  });

  discordStatusForm?.addEventListener('submit', handleDiscordStatusSubmit);
  discordStatusServerSelect?.addEventListener('change', handleDiscordStatusServerChange);

  const ticketingInputs = [
    discordTicketingCategoryInput,
    discordTicketingLogInput,
    discordTicketingRoleInput,
    discordTicketingPanelChannelInput,
    discordTicketingPanelMessageInput
  ];

  function updateTicketingState() {
    if (!state.workspaceDiscord.config) {
      state.workspaceDiscord.config = defaultWorkspaceDiscordConfig();
    }
    const ticketing = state.workspaceDiscord.config.ticketing || { ...DEFAULT_DISCORD_TICKETING_CONFIG };
    ticketing.enabled = Boolean(discordTicketingEnabledInput?.checked);
    ticketing.categoryId = (discordTicketingCategoryInput?.value || '').trim();
    ticketing.logChannelId = (discordTicketingLogInput?.value || '').trim();
    ticketing.staffRoleId = (discordTicketingRoleInput?.value || '').trim();
    ticketing.pingStaffOnOpen = Boolean(discordTicketingPingInput?.checked);
    ticketing.panelChannelId = (discordTicketingPanelChannelInput?.value || '').trim();
    ticketing.panelMessageId = (discordTicketingPanelMessageInput?.value || '').trim();
    state.workspaceDiscord.config.ticketing = ticketing;
    hideNotice(discordStatusNotice);
    updateWorkspaceDiscordConfigUi(state.workspaceDiscord.config);
  }

  discordTicketingEnabledInput?.addEventListener('change', updateTicketingState);
  discordTicketingPingInput?.addEventListener('change', updateTicketingState);
  ticketingInputs.forEach((input) => {
    input?.addEventListener('input', updateTicketingState);
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('workspace:server-selected', (event) => {
      const id = Number(event?.detail?.serverId);
      if (!Number.isFinite(id)) return;
      if (Number(aqState.serverId) === id) {
        if (event?.detail?.repeat) {
          refreshAqTickets({ force: true }).catch(() => {});
        }
        return;
      }
      prepareAqTicketsForServer(id);
    });
    window.addEventListener('workspace:server-cleared', () => {
      resetAqTickets();
    });
    window.addEventListener('workspace:server-selected', (event) => {
      const id = Number(event?.detail?.serverId);
      if (!Number.isFinite(id)) return;
      const force = Boolean(event?.detail?.repeat);
      if (discordStatusServerSelect) {
        const idStr = String(id);
        const hasOption = Array.from(discordStatusServerSelect.options).some((opt) => opt.value === idStr);
        if (!hasOption) {
          renderDiscordStatusServerOptions();
        }
        discordStatusServerSelect.value = idStr;
      }
      loadWorkspaceDiscord(id, { force }).catch(() => {});
    });
    window.addEventListener('workspace:server-cleared', () => {
      resetWorkspaceDiscord();
    });
    window.addEventListener('workspace:server-status', (event) => {
      const id = Number(event?.detail?.serverId);
      if (!Number.isFinite(id)) return;
      if (Number(state.workspaceDiscord.serverId) !== id) return;
      setWorkspaceDiscordStatus(event?.detail?.status || null);
      updateWorkspaceDiscordUi();
    });
  }

  resetAqTickets();
  resetWorkspaceDiscord();

  function handleIncomingF7Report(payload) {
    if (!payload) return;
    const report = normalizeF7Report(payload);
    if (!report) return;
    if (!hasServerCapability('view')) return;
    if (Number(report.serverId) !== Number(state.currentServerId)) return;
    if (f7State.focusTarget) {
      const targetId = pickString(report.targetSteamId)?.trim();
      if (!targetId || targetId !== f7State.focusTarget) {
        return;
      }
    }
    if (report.id != null) {
      f7State.detailCache.set(report.id, { ...report, recentForTarget: [], targetSummary: null });
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
    if (isSuperuser()) return true;
    const globalPerms = currentUserPermissions().global || {};
    if (globalPerms['*'] || globalPerms.all) return true;
    return !!globalPerms[permission];
  }

  function isSuperuser() {
    return Boolean(state.currentUser?.superuser);
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
    const previousTeamId = state.activeTeamId;
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
    if (state.teamDiscord) {
      let appliedFromContext = false;
      if (context.teamDiscord && typeof context.teamDiscord === 'object') {
        state.teamDiscord.hasToken = Boolean(context.teamDiscord.hasToken);
        state.teamDiscord.guildId =
          context.teamDiscord.guildId != null && context.teamDiscord.guildId !== ''
            ? String(context.teamDiscord.guildId)
            : null;
        state.teamDiscord.tokenPreview =
          context.teamDiscord.tokenPreview != null && context.teamDiscord.tokenPreview !== ''
            ? String(context.teamDiscord.tokenPreview)
            : null;
        state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
        appliedFromContext = true;
      } else if (typeof context.activeTeamHasDiscordToken !== 'undefined') {
        state.teamDiscord.hasToken = Boolean(context.activeTeamHasDiscordToken);
        if (typeof context.activeTeamDiscordGuildId !== 'undefined') {
          state.teamDiscord.guildId =
            context.activeTeamDiscordGuildId != null && context.activeTeamDiscordGuildId !== ''
              ? String(context.activeTeamDiscordGuildId)
              : null;
        }
        if (typeof context.activeTeamDiscordTokenPreview !== 'undefined') {
          const preview = context.activeTeamDiscordTokenPreview;
          state.teamDiscord.tokenPreview = preview != null && preview !== '' ? String(preview) : null;
        } else if (!state.teamDiscord.hasToken) {
          state.teamDiscord.tokenPreview = null;
        }
        state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
        appliedFromContext = true;
      }
      if (state.activeTeamId !== previousTeamId) {
        if (!appliedFromContext) {
          state.teamDiscord.loadedTeamId = null;
          state.teamDiscord.hasToken = false;
          state.teamDiscord.guildId = null;
          state.teamDiscord.tokenPreview = null;
        }
        state.teamDiscord.loading = false;
        hideNotice(teamDiscordStatus);
        if (teamDiscordToken) teamDiscordToken.value = '';
        if (teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
          teamDiscordGuildId.value = state.teamDiscord.guildId || '';
        }
      }
    }
    if (state.teamAuth) {
      let appliedAuthContext = false;
      if (context.teamAuth && typeof context.teamAuth === 'object') {
        state.teamAuth.enabled = Boolean(context.teamAuth.enabled);
        state.teamAuth.roleId =
          context.teamAuth.roleId != null && context.teamAuth.roleId !== ''
            ? String(context.teamAuth.roleId)
            : null;
        state.teamAuth.logChannelId =
          context.teamAuth.logChannelId != null && context.teamAuth.logChannelId !== ''
            ? String(context.teamAuth.logChannelId)
            : null;
        state.teamAuth.loaded = true;
        state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
        appliedAuthContext = true;
      } else if (typeof context.activeTeamRequiresDiscordAuth !== 'undefined') {
        state.teamAuth.enabled = Boolean(context.activeTeamRequiresDiscordAuth);
        if (typeof context.activeTeamDiscordRoleId !== 'undefined') {
          state.teamAuth.roleId =
            context.activeTeamDiscordRoleId != null && context.activeTeamDiscordRoleId !== ''
              ? String(context.activeTeamDiscordRoleId)
              : null;
        }
        if (typeof context.activeTeamDiscordAuthLogChannelId !== 'undefined') {
          const channel = context.activeTeamDiscordAuthLogChannelId;
          state.teamAuth.logChannelId = channel != null && channel !== '' ? String(channel) : null;
        }
        state.teamAuth.loaded = true;
        state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
        appliedAuthContext = true;
      }
      if (state.activeTeamId !== previousTeamId) {
        if (!appliedAuthContext) {
          state.teamAuth.loaded = false;
          state.teamAuth.loadedTeamId = null;
          state.teamAuth.enabled = false;
          state.teamAuth.roleId = null;
          state.teamAuth.logChannelId = null;
          if (teamAuthEnabledInput && !teamAuthEnabledInput.matches(':focus')) {
            teamAuthEnabledInput.checked = false;
          }
          if (teamAuthRoleInput && document.activeElement !== teamAuthRoleInput) {
            teamAuthRoleInput.value = '';
          }
          if (teamAuthLogChannelInput && document.activeElement !== teamAuthLogChannelInput) {
            teamAuthLogChannelInput.value = '';
          }
        }
        state.teamAuth.loading = false;
        hideNotice(teamAuthStatus);
      }
    }
    updateTeamDiscordUi();
    updateTeamAuthUi();
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
        superuser: Boolean(me.superuser),
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

  moduleBus.on('players:list', handlePlayersListUpdate);
  moduleBus.on('map:team-colors', handleTeamColorsUpdate);

  if (typeof window !== 'undefined') {
    window.addEventListener('players:list', (event) => handlePlayersListUpdate(event?.detail || {}));
    window.addEventListener('map:team-colors', (event) => handleTeamColorsUpdate(event?.detail || {}));
  }

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
    const adminOnlyMode = state.superuserUi === true;
    const canManageServers = adminOnlyMode ? false : hasGlobalPermission('manageServers');
    const canManageUsers = adminOnlyMode ? false : hasGlobalPermission('manageUsers');
    const canManageRoles = adminOnlyMode ? false : hasGlobalPermission('manageRoles');
    const canAccessTeam = adminOnlyMode ? false : (canManageUsers || canManageRoles);
    const canAccessLinked = adminOnlyMode ? false : canAccessTeam;
    const canAccessAdminPanel = isSuperuser() && hasGlobalPermission('manageUsers');
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

    if (adminPanel) {
      adminPanel.classList.toggle('hidden', !canAccessAdminPanel);
      adminPanel.setAttribute('aria-hidden', canAccessAdminPanel ? 'false' : 'true');
    }
    [
      adminNewUserName,
      adminNewUserPassword,
      adminNewUserRole,
      adminNewUserTeam,
      adminAssignTeam,
      adminAssignRole,
      adminUserSuperuser,
      adminNewUserSuperuser,
      adminUserSearch
    ].forEach((el) => {
      if (el) el.disabled = !canAccessAdminPanel;
    });
    if (btnAdminCreateUser) btnAdminCreateUser.disabled = !canAccessAdminPanel;
    if (btnAdminAssignTeam) btnAdminAssignTeam.disabled = !canAccessAdminPanel || !state.admin.teams.length;
    if (adminUserSaveRole) adminUserSaveRole.disabled = !canAccessAdminPanel;
    if (adminUserResetPassword) adminUserResetPassword.disabled = !canAccessAdminPanel;
    if (adminUserDelete) adminUserDelete.disabled = !canAccessAdminPanel;
    if (!canAccessAdminPanel) {
      resetAdminView();
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

    if (!canAccessLinked && state.activePanel === 'linked') {
      switchPanel('dashboard');
    }

    if (!canAccessTeam && state.activePanel === 'team') {
      switchPanel('dashboard');
    } else {
      updateTeamAccessView({
        refreshUsers: state.activePanel === 'team',
        refreshAdmin: state.activePanel === 'admin'
      });
    }
    moduleBus.emit('permissions:updated', {
      permissions: currentUserPermissions(),
      allowedServers: allowedServerList()
    });
  }

  function switchPanel(panel = 'dashboard') {
    const adminOnlyMode = state.superuserUi === true;
    const superuser = isSuperuser();
    const canAccessTeam = adminOnlyMode ? false : (hasGlobalPermission('manageUsers') || hasGlobalPermission('manageRoles'));
    const canAccessLinked = adminOnlyMode ? false : canAccessTeam;
    const canAccessAdmin = adminOnlyMode ? superuser : (superuser && hasGlobalPermission('manageUsers'));
    const canAccessDiscord = adminOnlyMode ? false : canManageTeamDiscord();
    const canAccessSettings = Boolean(state.currentUser);
    const fallbackPanel = adminOnlyMode
      ? (canAccessAdmin ? 'admin' : (canAccessSettings ? 'settings' : 'dashboard'))
      : 'dashboard';
    let nextPanel = adminOnlyMode
      ? (panel === 'settings' ? 'settings' : 'admin')
      : panel;
    if (
      (nextPanel === 'team' && !canAccessTeam)
      || (nextPanel === 'discord' && !canAccessDiscord)
      || (nextPanel === 'linked' && !canAccessLinked)
      || (nextPanel === 'admin' && !canAccessAdmin)
    ) {
      nextPanel = fallbackPanel;
    }
    if (nextPanel === 'settings' && !canAccessSettings) nextPanel = fallbackPanel;
    state.activePanel = nextPanel;

    const isDashboard = nextPanel === 'dashboard';
    const isSettings = nextPanel === 'settings';
    const isTeam = nextPanel === 'team';
    const isDiscord = nextPanel === 'discord';
    const isLinked = nextPanel === 'linked';
    const isAdmin = nextPanel === 'admin';

    if (isSettings) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      adminPanel?.classList.add('hidden');
      discordPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.add('hidden');
      settingsPanel?.classList.remove('hidden');
    } else if (isDiscord) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      adminPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.add('hidden');
      discordPanel?.classList.remove('hidden');
    } else if (isTeam) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      discordPanel?.classList.add('hidden');
      adminPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.add('hidden');
      teamPanel?.classList.remove('hidden');
    } else if (isAdmin) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      discordPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      adminPanel?.classList.remove('hidden');
    } else if (isLinked) {
      dashboardPanel?.classList.add('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      adminPanel?.classList.add('hidden');
      discordPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.remove('hidden');
    } else {
      dashboardPanel?.classList.remove('hidden');
      workspacePanel?.classList.add('hidden');
      settingsPanel?.classList.add('hidden');
      teamPanel?.classList.add('hidden');
      adminPanel?.classList.add('hidden');
      discordPanel?.classList.add('hidden');
      linkedAccountsPanel?.classList.add('hidden');
    }

    navDashboard?.classList.toggle('active', isDashboard);
    navSettings?.classList.toggle('active', isSettings);
    navTeam?.classList.toggle('active', isTeam);
    navDiscord?.classList.toggle('active', isDiscord);
    navLinked?.classList.toggle('active', isLinked);
    navAdmin?.classList.toggle('active', isAdmin);

    if (!isSettings) {
      hideNotice(settingsStatus);
      hideNotice(passwordStatus);
    }

    updateTeamAccessView({ refreshUsers: isTeam, refreshAdmin: isAdmin });
    if (isDiscord) {
      if (state.teamDiscord.loadedTeamId !== state.activeTeamId && !state.teamDiscord.loading) {
        loadTeamDiscord({ force: true }).catch(() => {});
      } else {
        updateTeamDiscordUi();
      }
      loadTeamAuthSettings({ force: true }).catch(() => {});
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
    missing_token: 'Add the team Discord token before saving.',
    missing_bot_token: 'Add the server Discord bot token before saving.',
    missing_guild_id: 'Add the Discord guild ID before saving.',
    no_server_selected: 'Select a server before sending commands.',
    forbidden: 'You do not have permission to perform this action.',
    not_supported: 'This feature is not available on the current server.',
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
    password_mismatch: 'New password and confirmation do not match.',
    message_required: 'Enter a reply before sending.',
    message_too_long: 'Your reply is too long for Discord. Try a shorter message.',
    discord_not_configured: 'Link the Discord bot in Settings before replying to tickets.',
    ticket_closed: 'This ticket is closed. Replies are disabled.',
    ticket_channel_missing: 'The Discord channel for this ticket no longer exists.',
    discord_unavailable: 'Discord messaging is not available on this server.',
    discord_post_failed: 'Discord rejected the reply. Check the bot permissions and try again.',
    discord_unreachable: 'Unable to reach Discord right now. Try again shortly.',
    discord_rate_limited: 'Discord rate limited the bot. Wait a few moments and try again.',
    mfa_required: 'Two-factor authentication required. Complete verification to continue.',
    invalid_mfa_code: 'The verification code was not accepted.',
    mfa_expired: 'Your verification window expired. Please sign in again.',
    no_passkeys: 'No passkeys are registered for this account.',
    passkeys_unavailable: 'Passkeys are not available on this server.',
    registration_expired: 'The registration request expired. Start again.',
    invalid_passkey: 'The passkey response could not be validated.'
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

  function bufferFromBase64Url(value) {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const normalized = base64 + pad;
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function base64UrlFromBuffer(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function preparePublicKeyOptions(options) {
    if (!options || typeof options !== 'object') return null;
    const clone = typeof structuredClone === 'function'
      ? structuredClone(options)
      : JSON.parse(JSON.stringify(options));
    if (clone.challenge) clone.challenge = bufferFromBase64Url(clone.challenge);
    if (clone.user?.id) clone.user.id = bufferFromBase64Url(clone.user.id);
    const transformDescriptor = (desc) => {
      const next = { ...desc };
      if (next.id) next.id = bufferFromBase64Url(next.id);
      return next;
    };
    if (Array.isArray(clone.allowCredentials)) {
      clone.allowCredentials = clone.allowCredentials.map(transformDescriptor);
    }
    if (Array.isArray(clone.excludeCredentials)) {
      clone.excludeCredentials = clone.excludeCredentials.map(transformDescriptor);
    }
    return clone;
  }

  function credentialToJSON(credential) {
    if (!credential) return null;
    const response = credential.response || {};
    return {
      id: credential.id,
      rawId: base64UrlFromBuffer(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: response.clientDataJSON ? base64UrlFromBuffer(response.clientDataJSON) : null,
        authenticatorData: response.authenticatorData ? base64UrlFromBuffer(response.authenticatorData) : null,
        signature: response.signature ? base64UrlFromBuffer(response.signature) : null,
        userHandle: response.userHandle ? base64UrlFromBuffer(response.userHandle) : null,
        attestationObject: response.attestationObject ? base64UrlFromBuffer(response.attestationObject) : null,
        transports: typeof response.getTransports === 'function' ? response.getTransports() : response.transports || undefined,
        publicKeyAlgorithm: response.publicKeyAlgorithm,
        publicKey: response.publicKey ? base64UrlFromBuffer(response.publicKey) : undefined
      },
      clientExtensionResults: credential.getClientExtensionResults
        ? credential.getClientExtensionResults()
        : undefined
    };
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
    resetAqTickets();
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

  const PLACEHOLDER_STRINGS = new Set(['-', '--', 'n/a', 'na', 'none', 'null', 'undefined']);

  function normalizePlaceholderCandidate(str) {
    const trimmed = str.replace(/[\u2013\u2014\u2212]/g, '-').trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').toLowerCase();
    return normalized;
  }

  function pickServerInfoString(...values) {
    for (const value of values) {
      if (value == null) continue;
      const str = String(value).trim();
      if (!str) continue;
      const normalized = normalizePlaceholderCandidate(str);
      if (!normalized) continue;
      const collapsed = normalized.replace(/[^a-z0-9]/g, '');
      const dashNormalized = str.replace(/[\u2013\u2014\u2212]/g, '-');
      const bareNa = collapsed === 'na' && !/[\/\.\-\s]/.test(dashNormalized);
      const isPlaceholder =
        (PLACEHOLDER_STRINGS.has(normalized) && !(normalized === 'na' && bareNa)) ||
        (collapsed && PLACEHOLDER_STRINGS.has(collapsed) && !bareNa);
      if (isPlaceholder) continue;
      return str;
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

  function formatAbsoluteWithRelative(value) {
    const absolute = formatDateTime(value);
    const relative = formatRelativeTime(value);
    return relative ? `${absolute} (${relative})` : absolute;
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
    const gameTime = pickServerInfoString(serverInfo?.GameTime, serverInfo?.gameTime, serverInfo?.game_time);
    const lastSave = pickServerInfoString(serverInfo?.SaveCreatedTime, serverInfo?.saveCreatedTime, serverInfo?.save_created_time);
    const hostname = pickServerInfoString(status?.details?.hostname, serverInfo?.Hostname, serverInfo?.hostname);
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

  function defaultWorkspaceDiscordConfig() {
    return {
      presenceTemplate: DEFAULT_DISCORD_PRESENCE_TEMPLATE,
      presenceStatuses: { ...DEFAULT_DISCORD_PRESENCE_STATUSES },
      fields: { ...DEFAULT_DISCORD_STATUS_FIELDS },
      ticketing: { ...DEFAULT_DISCORD_TICKETING_CONFIG }
    };
  }

  function sanitizePresenceValue(value, key) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (DISCORD_ALLOWED_PRESENCES.has(raw)) return raw;
    return DEFAULT_DISCORD_PRESENCE_STATUSES[key] || DEFAULT_DISCORD_PRESENCE_STATUSES.online;
  }

  function normalizeWorkspacePresenceTemplate(value) {
    if (typeof value !== 'string') return DEFAULT_DISCORD_PRESENCE_TEMPLATE;
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_DISCORD_PRESENCE_TEMPLATE;
    return trimmed.slice(0, 190);
  }

  function normalizeWorkspacePresenceStatuses(statuses = {}) {
    const base = DEFAULT_DISCORD_PRESENCE_STATUSES;
    return {
      online: sanitizePresenceValue(statuses.online, 'online'),
      offline: sanitizePresenceValue(statuses.offline, 'offline'),
      stale: sanitizePresenceValue(statuses.stale, 'stale'),
      waiting: sanitizePresenceValue(statuses.waiting, 'waiting')
    };
  }

  function normalizeWorkspaceStatusFields(fields = {}) {
    const base = DEFAULT_DISCORD_STATUS_FIELDS;
    return {
      joining: typeof fields.joining === 'boolean' ? fields.joining : base.joining,
      queued: typeof fields.queued === 'boolean' ? fields.queued : base.queued,
      sleepers: typeof fields.sleepers === 'boolean' ? fields.sleepers : base.sleepers,
      fps: typeof fields.fps === 'boolean' ? fields.fps : base.fps,
      lastUpdate: typeof fields.lastUpdate === 'boolean' ? fields.lastUpdate : base.lastUpdate
    };
  }

  function normalizeSnowflake(value) {
    if (value == null) return '';
    const text = String(value).trim();
    return text;
  }

  function normalizeWorkspaceTicketing(ticketing = {}) {
    const source = ticketing && typeof ticketing === 'object' ? ticketing : {};
    const base = DEFAULT_DISCORD_TICKETING_CONFIG;
    return {
      enabled: typeof source.enabled === 'boolean' ? source.enabled : base.enabled,
      categoryId: normalizeSnowflake(source.categoryId ?? source.category_id ?? base.categoryId),
      logChannelId: normalizeSnowflake(source.logChannelId ?? source.log_channel_id ?? base.logChannelId),
      staffRoleId: normalizeSnowflake(source.staffRoleId ?? source.staff_role_id ?? base.staffRoleId),
      pingStaffOnOpen: typeof source.pingStaffOnOpen === 'boolean' ? source.pingStaffOnOpen : base.pingStaffOnOpen,
      panelChannelId: normalizeSnowflake(source.panelChannelId ?? source.panel_channel_id ?? base.panelChannelId),
      panelMessageId: normalizeSnowflake(source.panelMessageId ?? source.panel_message_id ?? base.panelMessageId)
    };
  }

  function normalizeWorkspaceDiscordConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    return {
      presenceTemplate: normalizeWorkspacePresenceTemplate(source.presenceTemplate),
      presenceStatuses: normalizeWorkspacePresenceStatuses(source.presenceStatuses || {}),
      fields: normalizeWorkspaceStatusFields(source.fields || {}),
      ticketing: normalizeWorkspaceTicketing(source.ticketing || {})
    };
  }

  function presenceLabelFor(value) {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return DISCORD_PRESENCE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Offline');
  }

  function presenceClassFor(value) {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return DISCORD_PRESENCE_CLASS[key] || DISCORD_PRESENCE_CLASS.dnd;
  }

  function normalizeWorkspaceDiscordStatus(status) {
    if (!status || typeof status !== 'object') return null;
    const playersCurrent = Number(status.players?.current);
    const playersMax = Number(status.players?.max);
    const joiningRaw = Number(status.joining);
    const presenceRaw = pickString(status.presence)?.toLowerCase();
    const presence = DISCORD_ALLOWED_PRESENCES.has(presenceRaw)
      ? presenceRaw
      : (status.serverOnline ? 'online' : 'dnd');
    const presenceLabel = pickString(status.presenceLabel) || presenceLabelFor(presence);
    const lastCheck = pickString(status.lastCheck) || null;
    return {
      serverOnline: Boolean(status.serverOnline ?? presence === 'online'),
      players: {
        current: Number.isFinite(playersCurrent) && playersCurrent >= 0 ? playersCurrent : 0,
        max: Number.isFinite(playersMax) && playersMax >= 0 ? playersMax : null
      },
      joining: Number.isFinite(joiningRaw) && joiningRaw >= 0 ? joiningRaw : null,
      presence,
      presenceLabel,
      lastCheck
    };
  }

  function setWorkspaceDiscordConfig(config) {
    const normalized = normalizeWorkspaceDiscordConfig(config);
    state.workspaceDiscord.config = normalized;
    updateWorkspaceDiscordConfigUi(normalized);
  }

  function updateWorkspaceDiscordConfigUi(config = state.workspaceDiscord.config) {
    const details = config || defaultWorkspaceDiscordConfig();
    if (discordPresenceTemplateInput) discordPresenceTemplateInput.value = details.presenceTemplate || '';
    if (discordPresenceTemplateSummary) {
      const template = details.presenceTemplate || DEFAULT_DISCORD_PRESENCE_TEMPLATE;
      discordPresenceTemplateSummary.textContent = template;
      discordPresenceTemplateSummary.title = template;
    }
    if (discordPresenceOnlineSelect) discordPresenceOnlineSelect.value = details.presenceStatuses.online;
    if (discordPresenceOfflineSelect) discordPresenceOfflineSelect.value = details.presenceStatuses.offline;
    if (discordPresenceStaleSelect) discordPresenceStaleSelect.value = details.presenceStatuses.stale;
    if (discordPresenceWaitingSelect) discordPresenceWaitingSelect.value = details.presenceStatuses.waiting;
    if (discordPresenceStatusOnline) discordPresenceStatusOnline.textContent = presenceLabelFor(details.presenceStatuses.online);
    if (discordPresenceStatusOffline) {
      discordPresenceStatusOffline.textContent = presenceLabelFor(details.presenceStatuses.offline);
    }
    if (discordPresenceStatusStale) discordPresenceStatusStale.textContent = presenceLabelFor(details.presenceStatuses.stale);
    if (discordPresenceStatusWaiting) {
      discordPresenceStatusWaiting.textContent = presenceLabelFor(details.presenceStatuses.waiting);
    }
    discordStatusFieldInputs.forEach((input) => {
      if (!input) return;
      const key = input.dataset?.statusField;
      if (!key) return;
      input.checked = Boolean(details.fields[key]);
    });
    updateWorkspaceDiscordEnabledFields(details.fields);

    const ticketing = details.ticketing || DEFAULT_DISCORD_TICKETING_CONFIG;
    const ticketingEnabled = Boolean(ticketing.enabled);
    if (discordTicketingEnabledInput && !discordTicketingEnabledInput.matches(':focus')) {
      discordTicketingEnabledInput.checked = ticketingEnabled;
    }
    if (discordTicketingCategoryInput && document.activeElement !== discordTicketingCategoryInput) {
      discordTicketingCategoryInput.value = ticketing.categoryId || '';
    }
    if (discordTicketingLogInput && document.activeElement !== discordTicketingLogInput) {
      discordTicketingLogInput.value = ticketing.logChannelId || '';
    }
    if (discordTicketingRoleInput && document.activeElement !== discordTicketingRoleInput) {
      discordTicketingRoleInput.value = ticketing.staffRoleId || '';
    }
    if (discordTicketingPingInput) {
      discordTicketingPingInput.checked = Boolean(ticketing.pingStaffOnOpen);
    }
    if (discordTicketingPanelChannelInput && document.activeElement !== discordTicketingPanelChannelInput) {
      discordTicketingPanelChannelInput.value = ticketing.panelChannelId || '';
    }
    if (discordTicketingPanelMessageInput && document.activeElement !== discordTicketingPanelMessageInput) {
      discordTicketingPanelMessageInput.value = ticketing.panelMessageId || '';
    }
    const ticketingInputs = [
      discordTicketingCategoryInput,
      discordTicketingLogInput,
      discordTicketingRoleInput,
      discordTicketingPanelChannelInput,
      discordTicketingPanelMessageInput
    ];
    ticketingInputs.forEach((input) => {
      if (!input) return;
      input.disabled = !ticketingEnabled;
    });
    if (discordTicketingSummaryStatus) {
      discordTicketingSummaryStatus.textContent = ticketingEnabled ? 'Enabled' : 'Disabled';
    }
    const formatTicketValue = (value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text ? text : 'Not set';
    };
    if (discordTicketingSummaryCategory) {
      discordTicketingSummaryCategory.textContent = formatTicketValue(ticketing.categoryId);
    }
    if (discordTicketingSummaryLog) {
      discordTicketingSummaryLog.textContent = formatTicketValue(ticketing.logChannelId);
    }
    if (discordTicketingSummaryRole) {
      discordTicketingSummaryRole.textContent = formatTicketValue(ticketing.staffRoleId);
    }
  }

  function updateWorkspaceDiscordEnabledFields(fields = {}) {
    if (!discordEnabledFieldsList) return;
    discordEnabledFieldsList.innerHTML = '';
    const active = Object.entries(fields)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
    if (!active.length) {
      if (discordEnabledFieldsEmpty) discordEnabledFieldsEmpty.classList.remove('hidden');
      return;
    }
    active.forEach((key) => {
      const label = DISCORD_STATUS_FIELD_LABELS[key] || key;
      const item = document.createElement('li');
      item.textContent = label;
      discordEnabledFieldsList.appendChild(item);
    });
    if (discordEnabledFieldsEmpty) discordEnabledFieldsEmpty.classList.add('hidden');
  }

  function setWorkspaceDiscordStatus(status) {
    const normalized = normalizeWorkspaceDiscordStatus(status);
    state.workspaceDiscord.status = normalized;
    updateWorkspaceDiscordStatusUi(normalized);
  }

  function updateWorkspaceDiscordStatusUi(status = state.workspaceDiscord.status) {
    const details = status && typeof status === 'object' ? status : null;
    if (!details) {
      if (discordBotStatusPill) {
        discordBotStatusPill.className = 'status-pill bot-status-pill offline';
        discordBotStatusPill.textContent = 'Not linked';
        discordBotStatusPill.title = '';
      }
      if (discordCurrentPlayers) discordCurrentPlayers.textContent = '—';
      if (discordMaxPlayers) discordMaxPlayers.textContent = '—';
      if (discordJoiningPlayers) discordJoiningPlayers.textContent = '—';
      if (discordLastCheck) {
        discordLastCheck.textContent = 'Last check: —';
        discordLastCheck.removeAttribute('title');
      }
      return;
    }
    const presenceClass = presenceClassFor(details.presence);
    if (discordBotStatusPill) {
      discordBotStatusPill.className = `status-pill bot-status-pill ${presenceClass}`;
      discordBotStatusPill.textContent = details.presenceLabel || presenceLabelFor(details.presence);
      discordBotStatusPill.title = details.presenceLabel || '';
    }
    if (discordCurrentPlayers) {
      const value = Number.isFinite(details.players?.current) ? details.players.current : 0;
      discordCurrentPlayers.textContent = value.toLocaleString();
    }
    if (discordMaxPlayers) {
      const max = Number.isFinite(details.players?.max) ? details.players.max : null;
      discordMaxPlayers.textContent = max != null ? max.toLocaleString() : '—';
    }
    if (discordJoiningPlayers) {
      const joining = Number.isFinite(details.joining) ? details.joining : null;
      discordJoiningPlayers.textContent = joining != null ? joining.toLocaleString() : '—';
    }
    if (discordLastCheck) {
      if (details.lastCheck) {
        const relative = formatRelativeTime(details.lastCheck);
        const absolute = formatDateTime(details.lastCheck);
        discordLastCheck.textContent = `Last check: ${relative || absolute || details.lastCheck}`;
        discordLastCheck.title = absolute || details.lastCheck;
      } else {
        discordLastCheck.textContent = 'Last check: —';
        discordLastCheck.removeAttribute('title');
      }
    }
  }

  function setDiscordStatusFormDisabled(disabled) {
    if (!discordStatusForm) return;
    discordStatusForm.querySelectorAll('input, textarea, select, button').forEach((el) => {
      el.disabled = disabled;
    });
    const busy = disabled && (state.workspaceDiscord.loading || state.workspaceDiscord.saving);
    discordStatusForm.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function updateWorkspaceDiscordUi() {
    updateWorkspaceDiscordConfigUi();
    updateWorkspaceDiscordStatusUi();
    if (discordSettingsGrid) {
      discordSettingsGrid.setAttribute('aria-busy', state.workspaceDiscord.loading ? 'true' : 'false');
    }
    if (!discordStatusForm || !discordStatusNotice) return;

    const serverId = state.workspaceDiscord.serverId;
    if (!Number.isFinite(serverId)) {
      setDiscordStatusFormDisabled(true);
      showNotice(discordStatusNotice, 'Select a server to manage the Discord status embed.', 'info');
      return;
    }

    if (!hasServerCapability('discord')) {
      setDiscordStatusFormDisabled(true);
      showNotice(discordStatusNotice, 'You do not have permission to manage the Discord bot for this server.', 'error');
      return;
    }

    if (state.workspaceDiscord.loading) {
      setDiscordStatusFormDisabled(true);
      showNotice(discordStatusNotice, 'Loading Discord settings…', 'info');
      return;
    }

    if (state.workspaceDiscord.error) {
      setDiscordStatusFormDisabled(true);
      showNotice(discordStatusNotice, state.workspaceDiscord.error, 'error');
      return;
    }

    if (!state.workspaceDiscord.integration) {
      setDiscordStatusFormDisabled(true);
      showNotice(
        discordStatusNotice,
        'Link the server Discord bot in the Team → Discord tab to enable status embeds.',
        'warning'
      );
      return;
    }

    setDiscordStatusFormDisabled(state.workspaceDiscord.saving);
    if (state.workspaceDiscord.saving) {
      showNotice(discordStatusNotice, 'Saving status settings…', 'info');
    } else if (!discordStatusNotice.classList.contains('success')) {
      hideNotice(discordStatusNotice);
    }
  }

  async function loadWorkspaceDiscord(serverId, { force = false } = {}) {
    const numericId = Number(serverId);
    if (!Number.isFinite(numericId)) {
      state.workspaceDiscord.serverId = null;
      state.workspaceDiscord.integration = null;
      state.workspaceDiscord.error = null;
      setWorkspaceDiscordConfig(defaultWorkspaceDiscordConfig());
      setWorkspaceDiscordStatus(null);
      updateWorkspaceDiscordUi();
      if (discordStatusServerSelect && discordStatusServerSelect.value !== '') {
        discordStatusServerSelect.value = '';
      }
      return;
    }

    state.workspaceDiscord.serverId = numericId;
    if (discordStatusServerSelect) {
      const targetValue = String(numericId);
      if (discordStatusServerSelect.value !== targetValue) {
        const hasOption = Array.from(discordStatusServerSelect.options).some((opt) => opt.value === targetValue);
        if (!hasOption) {
          renderDiscordStatusServerOptions();
        }
        discordStatusServerSelect.value = targetValue;
      }
    }

    if (!hasServerCapability('discord')) {
      state.workspaceDiscord.integration = null;
      state.workspaceDiscord.error = null;
      setWorkspaceDiscordConfig(defaultWorkspaceDiscordConfig());
      setWorkspaceDiscordStatus(null);
      updateWorkspaceDiscordUi();
      return;
    }

    if (!force && state.workspaceDiscord.integration && Number(state.workspaceDiscord.integration.serverId) === numericId) {
      state.workspaceDiscord.error = null;
      updateWorkspaceDiscordUi();
      return;
    }

    state.workspaceDiscord.loading = true;
    state.workspaceDiscord.error = null;
    updateWorkspaceDiscordUi();
    try {
      const data = await api(`/servers/${encodeURIComponent(numericId)}/discord`);
      const integration = data?.integration || null;
      const status = data?.status || null;
      state.workspaceDiscord.integration = integration;
      setWorkspaceDiscordConfig(integration?.config || null);
      setWorkspaceDiscordStatus(status);
      state.workspaceDiscord.error = null;
      hideNotice(discordStatusNotice);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'not_supported') {
        state.workspaceDiscord.error = 'This server does not support Discord integrations.';
      } else {
        state.workspaceDiscord.error = 'Failed to load Discord settings: ' + describeError(err);
      }
      state.workspaceDiscord.integration = null;
      setWorkspaceDiscordConfig(defaultWorkspaceDiscordConfig());
      setWorkspaceDiscordStatus(null);
    } finally {
      state.workspaceDiscord.loading = false;
      updateWorkspaceDiscordUi();
    }
  }

  function resetWorkspaceDiscord() {
    state.workspaceDiscord.serverId = null;
    state.workspaceDiscord.loading = false;
    state.workspaceDiscord.saving = false;
    state.workspaceDiscord.error = null;
    state.workspaceDiscord.integration = null;
    setWorkspaceDiscordConfig(defaultWorkspaceDiscordConfig());
    setWorkspaceDiscordStatus(null);
    updateWorkspaceDiscordUi();
    if (discordStatusServerSelect) {
      discordStatusServerSelect.value = '';
    }
    renderDiscordStatusServerOptions();
  }

  function gatherWorkspaceDiscordPayload() {
    const template = normalizeWorkspacePresenceTemplate(discordPresenceTemplateInput?.value);
    const statuses = {
      online: sanitizePresenceValue(discordPresenceOnlineSelect?.value, 'online'),
      offline: sanitizePresenceValue(discordPresenceOfflineSelect?.value, 'offline'),
      stale: sanitizePresenceValue(discordPresenceStaleSelect?.value, 'stale'),
      waiting: sanitizePresenceValue(discordPresenceWaitingSelect?.value, 'waiting')
    };
    const fields = { ...DEFAULT_DISCORD_STATUS_FIELDS };
    discordStatusFieldInputs.forEach((input) => {
      if (!input) return;
      const key = input.dataset?.statusField;
      if (!key) return;
      fields[key] = Boolean(input.checked);
    });
    const toOptionalId = (value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text ? text : null;
    };
    const ticketing = {
      enabled: Boolean(discordTicketingEnabledInput?.checked),
      categoryId: toOptionalId(discordTicketingCategoryInput?.value),
      logChannelId: toOptionalId(discordTicketingLogInput?.value),
      staffRoleId: toOptionalId(discordTicketingRoleInput?.value),
      pingStaffOnOpen: Boolean(discordTicketingPingInput?.checked),
      panelChannelId: toOptionalId(discordTicketingPanelChannelInput?.value),
      panelMessageId: toOptionalId(discordTicketingPanelMessageInput?.value)
    };
    return {
      presenceTemplate: template,
      presenceStatuses: statuses,
      fields,
      ticketing
    };
  }

  async function handleDiscordStatusSubmit(ev) {
    ev?.preventDefault();
    if (!hasServerCapability('discord')) {
      showNotice(discordStatusNotice, 'You do not have permission to manage the Discord bot for this server.', 'error');
      return;
    }
    const serverId = state.workspaceDiscord.serverId;
    if (!Number.isFinite(serverId)) {
      showNotice(discordStatusNotice, 'Select a server to manage the Discord status embed.', 'error');
      return;
    }
    if (!state.workspaceDiscord.integration) {
      showNotice(
        discordStatusNotice,
        'Link the server Discord bot in the Team → Discord tab before updating the status embed.',
        'warning'
      );
      return;
    }
    const payload = gatherWorkspaceDiscordPayload();
    state.workspaceDiscord.saving = true;
    updateWorkspaceDiscordUi();
    try {
      const body = { config: payload };
      const data = await api(`/servers/${encodeURIComponent(serverId)}/discord`, body, 'POST');
      const integration = data?.integration || null;
      state.workspaceDiscord.integration = integration;
      setWorkspaceDiscordConfig(integration?.config || payload);
      setWorkspaceDiscordStatus(data?.status || state.workspaceDiscord.status);
      state.workspaceDiscord.error = null;
      showNotice(discordStatusNotice, 'Discord status settings saved.', 'success');
    } catch (err) {
      showNotice(discordStatusNotice, describeError(err), 'error');
    } finally {
      state.workspaceDiscord.saving = false;
      updateWorkspaceDiscordUi();
    }
  }

  function handleDiscordStatusServerChange() {
    if (!discordStatusServerSelect) return;
    if (!canManageTeamDiscord()) {
      discordStatusServerSelect.value = '';
      return;
    }
    const value = discordStatusServerSelect.value;
    if (!value) {
      loadWorkspaceDiscord(null, { force: true }).catch(() => {});
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      loadWorkspaceDiscord(null, { force: true }).catch(() => {});
      return;
    }
    loadWorkspaceDiscord(numeric, { force: true }).catch(() => {});
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
    if (typeof io !== 'function') {
      ui.log('Realtime link unavailable: socket client not loaded (blocked by CSP?).');
      return null;
    }
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
    const hostname = pickServerInfoString(status?.details?.hostname, serverInfo?.Hostname, serverInfo?.hostname);
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
    if (state.superuserUi) {
      if (serversEl) serversEl.innerHTML = '';
      if (serversEmpty) serversEmpty.classList.add('hidden');
      hideAddServerCard({ force: true });
      return;
    }
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
      refreshAqTickets({ force: true }).catch(() => {});
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
    prepareAqTicketsForServer(numericId);
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
    refreshAqTickets({ force: true }).catch(() => {});

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

  function getManageableDiscordServers() {
    return getServerList().filter((server) => canAccessServerId(server.id));
  }

  function renderDiscordStatusServerOptions() {
    if (!discordStatusServerSelect) return;
    const select = discordStatusServerSelect;
    const servers = getManageableDiscordServers();
    const currentValue = select.value;
    const desiredValue = (() => {
      const selectedId = Number.isFinite(state.workspaceDiscord.serverId)
        ? String(state.workspaceDiscord.serverId)
        : '';
      if (selectedId && servers.some((server) => String(server.id) === selectedId)) return selectedId;
      if (currentValue && servers.some((server) => String(server.id) === currentValue)) return currentValue;
      return '';
    })();

    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = servers.length ? 'Select a server…' : 'No servers available';
    placeholder.disabled = servers.length === 0;
    placeholder.selected = desiredValue === '';
    select.appendChild(placeholder);

    for (const server of servers) {
      const option = document.createElement('option');
      option.value = String(server.id);
      option.textContent = server.name;
      option.selected = option.value === desiredValue;
      select.appendChild(option);
    }

    if (desiredValue) {
      select.value = desiredValue;
    } else {
      select.value = '';
    }

    const canManage = canManageTeamDiscord();
    select.disabled = !canManage || servers.length === 0;
  }

  function ensureDiscordStatusSelection({ force = false } = {}) {
    if (!discordStatusServerSelect) return;
    renderDiscordStatusServerOptions();
    const servers = getManageableDiscordServers();
    const canManage = canManageTeamDiscord();
    if (teamDiscordStatusSection) {
      teamDiscordStatusSection.classList.toggle('hidden', !canManage);
      teamDiscordStatusSection.setAttribute('aria-hidden', canManage ? 'false' : 'true');
    }
    if (!canManage || servers.length === 0) {
      if (discordStatusServerSelect.value !== '') {
        discordStatusServerSelect.value = '';
      }
      if (state.workspaceDiscord.serverId != null) {
        loadWorkspaceDiscord(null, { force: true }).catch(() => {});
      } else {
        updateWorkspaceDiscordUi();
      }
      return;
    }

    let targetId = null;
    if (Number.isFinite(state.workspaceDiscord.serverId)) {
      const numeric = Number(state.workspaceDiscord.serverId);
      if (servers.some((server) => Number(server.id) === numeric)) {
        targetId = numeric;
      }
    }
    if (!Number.isFinite(targetId) && Number.isFinite(state.currentServerId)) {
      const numeric = Number(state.currentServerId);
      if (servers.some((server) => Number(server.id) === numeric)) {
        targetId = numeric;
      }
    }
    if (!Number.isFinite(targetId) && servers.length > 0) {
      targetId = Number(servers[0].id);
    }

    if (!Number.isFinite(targetId)) {
      if (discordStatusServerSelect.value !== '') {
        discordStatusServerSelect.value = '';
      }
      loadWorkspaceDiscord(null, { force: true }).catch(() => {});
      return;
    }

    const targetValue = String(targetId);
    if (discordStatusServerSelect.value !== targetValue) {
      discordStatusServerSelect.value = targetValue;
      force = true;
    }

    if (force || Number(state.workspaceDiscord.serverId) !== targetId) {
      loadWorkspaceDiscord(targetId, { force }).catch(() => {});
    }
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
    state.security = { totpEnabled: false, passkeys: [], pendingSecret: null, loaded: false };
    state.pendingMfa = null;
    state.activePanel = 'dashboard';
    state.roles = [];
    state.roleTemplates = { serverCapabilities: [], globalPermissions: [] };
    state.teamDiscord = { hasToken: false, guildId: null, tokenPreview: null, loading: false, loadedTeamId: null };
    state.teamAuth = { loading: false, enabled: false, roleId: null, logChannelId: null, loaded: false, loadedTeamId: null };
    activeRoleEditKey = null;
    updateRoleOptions();
    updateRoleManagerVisibility(false);
    resetAdminView();
    hideNotice(teamDiscordStatus);
    if (teamDiscordToken) teamDiscordToken.value = '';
    if (teamDiscordGuildId) teamDiscordGuildId.value = '';
    hideNotice(teamAuthStatus);
    if (teamAuthEnabledInput) teamAuthEnabledInput.checked = false;
    if (teamAuthRoleInput) teamAuthRoleInput.value = '';
    if (teamAuthLogChannelInput) teamAuthLogChannelInput.value = '';
    updateTeamDiscordUi();
    updateTeamAccessView();
    renderTeamSwitcher();
    serversEl.innerHTML = '';
    ui.clearConsole();
    ui.setUser(null);
    closeUserDetails();
    hideNotice(userFeedback);
    hideNotice(settingsStatus);
    hideNotice(passwordStatus);
    hideNotice(mfaStatusMessage);
    hideNotice(passkeyStatus);
    resetLoginMfa();
    clearPasswordInputs();
    if (rustMapsKeyInput) rustMapsKeyInput.value = '';
    chatState.cache.clear();
    chatState.lastFetched.clear();
    chatState.loading = false;
    chatState.error = null;
    chatState.profileCache.clear();
    chatState.profileRequests.clear();
    chatState.teamColors.clear();
    chatState.teamPalettes.clear();
    chatState.playerTeams.clear();
    resetF7Reports();
    renderChatMessages();
    clearKillFeedRefreshTimer();
    killFeedState.cache.clear();
    killFeedState.lastFetched.clear();
    killFeedState.renderSignatures.clear();
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
      err.body = data;
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

  function resetAdminView() {
    state.admin.users = [];
    state.admin.teams = [];
    state.admin.selectedUserId = null;
    adminUserFilter = '';
    if (adminUserSearch) adminUserSearch.value = '';
    if (adminUserCount) adminUserCount.textContent = '0';
    if (adminSuperuserCount) adminSuperuserCount.textContent = '0';
    if (adminOrgCount) adminOrgCount.textContent = '0';
    if (adminScopeBadge) adminScopeBadge.textContent = 'Global scope';
    if (adminUserList) adminUserList.innerHTML = '';
    if (adminUserEmpty) adminUserEmpty.classList.remove('hidden');
    if (adminUserTeams) adminUserTeams.innerHTML = '';
    if (adminTeamList) adminTeamList.innerHTML = '';
    if (adminDetailUsername) adminDetailUsername.textContent = '—';
    if (adminDetailCreated) adminDetailCreated.textContent = '—';
    if (adminUserRoleSelect) adminUserRoleSelect.value = '';
    if (adminUserSuperuser) adminUserSuperuser.checked = false;
    hideNotice(adminUserRoleStatus);
    hideNotice(adminAssignStatus);
    hideNotice(adminUserDangerStatus);
    hideNotice(adminUserFeedback);
  }

  function getAdminSelectedUser() {
    return state.admin.users.find((user) => user.id === state.admin.selectedUserId) || null;
  }

  function populateAdminTeamSelect(select, { allowEmpty = false, placeholder = '' } = {}) {
    if (!select) return;
    const teams = state.admin.teams || [];
    const previous = select.value;
    select.innerHTML = '';
    if (allowEmpty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = placeholder || 'Do not assign';
      select.appendChild(option);
    }
    teams.forEach((team) => {
      const option = document.createElement('option');
      option.value = team.id != null ? String(team.id) : '';
      const memberCount = Number.isFinite(team.member_count) ? ` • ${team.member_count} member(s)` : '';
      option.textContent = team.name ? `${team.name}${memberCount}` : `Team #${team.id}`;
      select.appendChild(option);
    });
    if (!teams.length && !allowEmpty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No organizations available';
      select.appendChild(option);
      select.disabled = true;
      select.value = '';
      return;
    }
    select.disabled = !teams.length && !allowEmpty;
    if (previous && Array.from(select.options).some((opt) => opt.value === previous)) {
      select.value = previous;
    } else if (select.options.length > 0) {
      select.value = select.options[0].value;
    }
  }

  function renderAdminTeamOptions() {
    populateAdminTeamSelect(adminNewUserTeam, { allowEmpty: true, placeholder: 'Do not assign' });
    populateAdminTeamSelect(adminAssignTeam, { allowEmpty: false, placeholder: '' });
  }

  function renderAdminTeams() {
    if (!adminTeamList) return;
    adminTeamList.innerHTML = '';
    const teams = state.admin.teams || [];
    if (!teams.length) {
      const empty = document.createElement('li');
      empty.className = 'muted small';
      empty.textContent = 'No organizations have been created yet.';
      adminTeamList.appendChild(empty);
      return;
    }
    teams.forEach((team) => {
      const li = document.createElement('li');
      li.className = 'admin-team-item';
      const name = document.createElement('div');
      name.className = 'user-item-name';
      name.textContent = team.name || `Team #${team.id}`;
      li.appendChild(name);
      const meta = document.createElement('div');
      meta.className = 'admin-team-meta';
      const members = document.createElement('span');
      members.textContent = `${Number(team.member_count ?? 0)} member(s)`;
      meta.appendChild(members);
      if (team.created_at) {
        const created = document.createElement('span');
        created.textContent = formatUserJoined(team.created_at);
        meta.appendChild(created);
      }
      li.appendChild(meta);
      adminTeamList.appendChild(li);
    });
  }

  function renderAdminScopeSummary() {
    const users = state.admin.users || [];
    const teams = state.admin.teams || [];
    const superusers = users.filter((user) => user.superuser).length;
    if (adminUserCount) adminUserCount.textContent = users.length.toLocaleString();
    if (adminSuperuserCount) adminSuperuserCount.textContent = superusers.toLocaleString();
    if (adminOrgCount) adminOrgCount.textContent = teams.length.toLocaleString();
    if (adminScopeBadge) {
      adminScopeBadge.textContent = `Global scope • ${teams.length.toLocaleString()} orgs visible`;
    }
    renderAdminTeams();
  }

  function renderAdminUsers() {
    if (!adminUserList) return;
    adminUserList.innerHTML = '';
    const users = state.admin.users || [];
    const filter = adminUserFilter.trim().toLowerCase();
    const filtered = filter
      ? users.filter((user) => {
        const username = (user.username || '').toLowerCase();
        const roleLabel = (formatUserRole(user) || '').toString().toLowerCase();
        const teamMatch = Array.isArray(user.teams)
          ? user.teams.some((team) => (team.name || `team #${team.id}`).toLowerCase().includes(filter))
          : false;
        return username.includes(filter) || roleLabel.includes(filter) || teamMatch;
      })
      : users;
    if (!filtered.length) {
      if (adminUserEmpty) adminUserEmpty.classList.remove('hidden');
      if (adminUserEmpty) {
        adminUserEmpty.textContent = filter ? 'No users match this search.' : 'No users found.';
      }
      return;
    }
    if (adminUserEmpty) adminUserEmpty.classList.add('hidden');
    filtered.forEach((user) => {
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
      const orgCount = Array.isArray(user.teams) ? user.teams.length : 0;
      meta.textContent = `Role: ${formatUserRole(user)} • Orgs: ${orgCount}`;
      primary.appendChild(meta);
      button.appendChild(primary);
      const trailing = document.createElement('div');
      trailing.className = 'user-item-trailing';
      if (user.id === state.currentUser?.id) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'You';
        trailing.appendChild(badge);
      }
      if (user.superuser) {
        const badge = document.createElement('span');
        badge.className = 'badge strong';
        badge.textContent = 'Superuser';
        trailing.appendChild(badge);
      }
      const chevron = document.createElement('span');
      chevron.className = 'user-item-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';
      trailing.appendChild(chevron);
      button.appendChild(trailing);
      if (state.admin.selectedUserId === user.id) {
        button.classList.add('active');
      }
      button.addEventListener('click', () => {
        state.admin.selectedUserId = user.id;
        renderAdminUsers();
        renderAdminUserDetails(user);
      });
      li.appendChild(button);
      adminUserList.appendChild(li);
    });
  }

  function renderAdminMemberships(user) {
    if (!adminUserTeams) return;
    adminUserTeams.innerHTML = '';
    if (!user || !Array.isArray(user.teams) || !user.teams.length) {
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent = 'No organization memberships yet.';
      adminUserTeams.appendChild(li);
      return;
    }
    user.teams.forEach((team) => {
      const li = document.createElement('li');
      li.className = 'admin-membership-item';
      const label = document.createElement('div');
      label.className = 'admin-membership-label';
      const name = document.createElement('span');
      name.className = 'user-item-name';
      name.textContent = team.name || `Team #${team.id}`;
      const meta = document.createElement('span');
      meta.className = 'muted small';
      meta.textContent = `Role: ${formatUserRole(team.roleName || team.role)}`;
      label.appendChild(name);
      label.appendChild(meta);
      li.appendChild(label);
      const actions = document.createElement('div');
      actions.className = 'admin-membership-actions';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'ghost danger';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => handleAdminRemoveMembership(user.id, team.id));
      actions.appendChild(removeBtn);
      li.appendChild(actions);
      adminUserTeams.appendChild(li);
    });
  }

  function renderAdminUserDetails(user) {
    const hasUser = Boolean(user);
    if (adminUserDetails) {
      adminUserDetails.classList.toggle('muted', !hasUser);
    }
    if (!hasUser) {
      if (adminDetailUsername) adminDetailUsername.textContent = '—';
      if (adminDetailCreated) adminDetailCreated.textContent = '—';
      if (adminUserRoleSelect) adminUserRoleSelect.value = '';
      renderAdminMemberships(null);
      if (btnAdminAssignTeam) btnAdminAssignTeam.disabled = true;
      if (adminAssignTeam) adminAssignTeam.disabled = true;
      if (adminAssignRole) adminAssignRole.disabled = true;
      if (adminUserSaveRole) adminUserSaveRole.disabled = true;
      if (adminUserResetPassword) adminUserResetPassword.disabled = true;
      if (adminUserDelete) adminUserDelete.disabled = true;
      return;
    }
    if (adminDetailUsername) adminDetailUsername.textContent = user.username || '—';
    if (adminDetailCreated) adminDetailCreated.textContent = formatUserJoined(user.created_at);
    if (adminUserRoleSelect) adminUserRoleSelect.value = user.role || '';
    if (adminUserSuperuser) adminUserSuperuser.checked = Boolean(user.superuser);
    if (btnAdminAssignTeam) btnAdminAssignTeam.disabled = !state.admin.teams.length;
    if (adminAssignTeam) adminAssignTeam.disabled = !state.admin.teams.length;
    if (adminAssignRole) adminAssignRole.disabled = !state.roles.length;
    const isSelf = user.id === state.currentUser?.id;
    if (adminUserSaveRole) adminUserSaveRole.disabled = !hasGlobalPermission('manageUsers');
    if (adminUserResetPassword) adminUserResetPassword.disabled = isSelf;
    if (adminUserDelete) adminUserDelete.disabled = isSelf;
    renderAdminMemberships(user);
  }

  async function loadAdminOverview({ preserveSelection = true, selectUserId = null } = {}) {
    if (!hasGlobalPermission('manageUsers')) {
      resetAdminView();
      return;
    }
    hideNotice(adminUserFeedback);
    hideNotice(adminUserRoleStatus);
    hideNotice(adminAssignStatus);
    hideNotice(adminUserDangerStatus);
    state.admin.loading = true;
    try {
      const [users, teams] = await Promise.all([
        api('/admin/users'),
        api('/admin/teams')
      ]);
      state.admin.users = Array.isArray(users) ? users : [];
      state.admin.teams = Array.isArray(teams) ? teams : [];
      renderAdminTeamOptions();
      renderAdminScopeSummary();
      const desiredId = selectUserId != null
        ? selectUserId
        : preserveSelection
          ? state.admin.selectedUserId
          : null;
      if (desiredId && state.admin.users.some((entry) => entry.id === desiredId)) {
        state.admin.selectedUserId = desiredId;
      } else {
        state.admin.selectedUserId = state.admin.users[0]?.id ?? null;
      }
      renderAdminUsers();
      renderAdminUserDetails(getAdminSelectedUser());
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminUserFeedback, describeError(err), 'error');
    } finally {
      state.admin.loading = false;
    }
  }

  async function handleAdminCreateUser() {
    if (!hasGlobalPermission('manageUsers')) return;
    hideNotice(adminUserFeedback);
    const username = adminNewUserName?.value?.trim();
    const password = adminNewUserPassword?.value || '';
    const role = adminNewUserRole?.value || '';
    const teamIdRaw = adminNewUserTeam?.value || '';
    const superuser = adminNewUserSuperuser?.checked || false;
    if (!username || !password) {
      showNotice(adminUserFeedback, describeError('missing_fields'), 'error');
      return;
    }
    if (password.length < 8) {
      showNotice(adminUserFeedback, 'Password must be at least 8 characters.', 'error');
      return;
    }
    const payload = { username, password, role, superuser };
    if (teamIdRaw) payload.teamId = teamIdRaw;
    try {
      const created = await api('/admin/users', payload, 'POST');
      showNotice(adminUserFeedback, 'User created successfully.', 'success');
      if (adminNewUserPassword) adminNewUserPassword.value = '';
      if (adminNewUserSuperuser) adminNewUserSuperuser.checked = false;
      await loadAdminOverview({ preserveSelection: false, selectUserId: created?.id });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminUserFeedback, describeError(err), 'error');
    }
  }

  async function handleAdminRoleSave() {
    const user = getAdminSelectedUser();
    if (!user || !adminUserRoleSelect) return;
    const role = adminUserRoleSelect.value;
    const desiredSuperuser = adminUserSuperuser?.checked ?? user.superuser;
    const roleChanged = !!role && role !== user.role;
    const superuserChanged = Boolean(desiredSuperuser) !== Boolean(user.superuser);
    if (!roleChanged && !superuserChanged) {
      showNotice(adminUserRoleStatus, 'Select a different role or superuser state before updating.', 'error');
      return;
    }
    try {
      await api(`/admin/users/${user.id}`, { role, superuser: desiredSuperuser }, 'PATCH');
      showNotice(adminUserRoleStatus, 'Role updated.', 'success');
      await loadAdminOverview({ selectUserId: user.id });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminUserRoleStatus, describeError(err), 'error');
    }
  }

  async function handleAdminPasswordReset() {
    const user = getAdminSelectedUser();
    if (!user) return;
    const newPass = await promptDialog({
      title: 'Reset password',
      message: `Enter a new password for ${user.username}.`,
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
    try {
      await api(`/admin/users/${user.id}/password`, { newPassword: newPass }, 'POST');
      showNotice(adminUserRoleStatus, 'Password updated.', 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminUserRoleStatus, describeError(err), 'error');
    }
  }

  async function handleAdminDeleteUser() {
    const user = getAdminSelectedUser();
    if (!user) return;
    const confirmed = await confirmDialog({
      title: 'Delete user',
      message: `Delete ${user.username}? This cannot be undone.`,
      confirmText: 'Delete user',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      await api(`/admin/users/${user.id}`, null, 'DELETE');
      showNotice(adminUserDangerStatus, 'User deleted.', 'success');
      await loadAdminOverview({ preserveSelection: false });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminUserDangerStatus, describeError(err), 'error');
    }
  }

  async function handleAdminAssignTeam() {
    const user = getAdminSelectedUser();
    if (!user || !adminAssignTeam) return;
    const teamId = adminAssignTeam.value;
    const role = adminAssignRole?.value || 'user';
    if (!teamId) {
      showNotice(adminAssignStatus, 'Select an organization before assigning.', 'error');
      return;
    }
    try {
      await api(`/admin/users/${user.id}/teams`, { teamId, role }, 'POST');
      showNotice(adminAssignStatus, 'Added to organization.', 'success');
      await loadAdminOverview({ selectUserId: user.id });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminAssignStatus, describeError(err), 'error');
    }
  }

  async function handleAdminRemoveMembership(userId, teamId) {
    if (!Number.isFinite(userId) || !Number.isFinite(teamId)) return;
    try {
      await api(`/admin/users/${userId}/teams/${teamId}`, null, 'DELETE');
      if (state.admin.selectedUserId === userId) {
        await loadAdminOverview({ selectUserId: userId });
      } else {
        await loadAdminOverview();
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(adminAssignStatus, describeError(err), 'error');
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

  moduleBus.on('servers:updated', () => {
    renderDiscordStatusServerOptions();
    if (state.activePanel === 'workspace' && activeWorkspaceView === 'settings') {
      ensureDiscordStatusSelection();
    }
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
      populateRoleSelectOptions(adminNewUserRole, roles);
      populateRoleSelectOptions(adminAssignRole, roles);
      populateRoleSelectOptions(adminUserRoleSelect, roles);
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
    const adminOnlyMode = state.superuserUi === true;
    const canUsers = adminOnlyMode ? false : hasGlobalPermission('manageUsers');
    const canRoles = adminOnlyMode ? false : hasGlobalPermission('manageRoles');
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
      populateRoleSelectOptions(adminNewUserRole, roles);
      populateRoleSelectOptions(adminAssignRole, roles);
      populateRoleSelectOptions(adminUserRoleSelect, roles);
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

  function canManageTeamDiscord() {
    return hasGlobalPermission('manageUsers') || hasGlobalPermission('manageRoles');
  }

  function normalizeTeamAuthRoleId(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }

  function normalizeTeamAuthLogChannelId(value) {
    if (value == null) return '';
    const digits = String(value).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return digits.slice(0, 64);
  }

  function updateTeamAuthUi() {
    if (!teamAuthSection) return;
    const canManage = canManageTeamDiscord();
    const authState = state.teamAuth || {};
    const loading = !!authState.loading;
    const enabled = !!authState.enabled;

    teamAuthSection.classList.toggle('hidden', !canManage);
    teamAuthSection.setAttribute('aria-hidden', canManage ? 'false' : 'true');

    if (!canManage) {
      hideNotice(teamAuthStatus);
    }

    if (teamAuthEnabledInput) {
      if (!teamAuthEnabledInput.matches(':focus')) {
        teamAuthEnabledInput.checked = canManage ? enabled : false;
      }
      teamAuthEnabledInput.disabled = !canManage || loading;
    }

    if (teamAuthRoleInput) {
      const storedRoleId = normalizeTeamAuthRoleId(authState.roleId);
      if (document.activeElement !== teamAuthRoleInput) {
        teamAuthRoleInput.value = storedRoleId;
      }
      const checkboxChecked = teamAuthEnabledInput ? !!teamAuthEnabledInput.checked : enabled;
      teamAuthRoleInput.disabled = !canManage || loading || !checkboxChecked;
      if (teamAuthRoleInput.disabled && document.activeElement === teamAuthRoleInput) {
        teamAuthRoleInput.blur();
      }
    }

    if (teamAuthLogChannelInput) {
      const storedLogChannel = normalizeTeamAuthLogChannelId(authState.logChannelId);
      if (document.activeElement !== teamAuthLogChannelInput) {
        teamAuthLogChannelInput.value = storedLogChannel;
      }
      const checkboxChecked = teamAuthEnabledInput ? !!teamAuthEnabledInput.checked : enabled;
      teamAuthLogChannelInput.disabled = !canManage || loading || !checkboxChecked;
      if (teamAuthLogChannelInput.disabled && document.activeElement === teamAuthLogChannelInput) {
        teamAuthLogChannelInput.blur();
      }
    }

    if (btnSaveTeamAuth) {
      btnSaveTeamAuth.disabled = !canManage || loading;
    }
  }

  async function handleTeamAuthSubmit(ev) {
    ev?.preventDefault();
    if (!canManageTeamDiscord()) return;

    const enabled = !!teamAuthEnabledInput?.checked;
    const roleValue = normalizeTeamAuthRoleId(teamAuthRoleInput?.value);
    const logChannelValue = normalizeTeamAuthLogChannelId(teamAuthLogChannelInput?.value);
    const payload = {
      enabled,
      roleId: roleValue ? roleValue : null,
      logChannelId: logChannelValue ? logChannelValue : null
    };

    state.teamAuth.enabled = payload.enabled;
    state.teamAuth.roleId = payload.roleId;
    state.teamAuth.logChannelId = payload.logChannelId;
    state.teamAuth.loading = true;
    updateTeamAuthUi();
    showNotice(teamAuthStatus, 'Saving authentication settings…', 'info');

    try {
      const data = await api('/team/auth/settings', payload, 'POST');
      state.teamAuth.enabled = !!(data?.enabled ?? payload.enabled);
      state.teamAuth.roleId = data?.roleId != null && data.roleId !== '' ? String(data.roleId) : (payload.roleId || null);
      state.teamAuth.logChannelId =
        data?.logChannelId != null && data.logChannelId !== ''
          ? String(data.logChannelId)
          : (payload.logChannelId || null);
      state.teamAuth.loaded = true;
      state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
      showNotice(teamAuthStatus, 'Authentication settings saved.', 'success');
    } catch (err) {
      const code = errorCode(err);
      showNotice(teamAuthStatus, describeError(code || err), 'error');
    } finally {
      state.teamAuth.loading = false;
      updateTeamAuthUi();
    }
  }
  function updateTeamDiscordUi() {
    if (!teamDiscordSection) return;
    const canManage = canManageTeamDiscord();
    const stateObj = state.teamDiscord || {};
    const hasToken = !!stateObj.hasToken;
    const loading = !!stateObj.loading;
    let guildIdStored = '';
    if (typeof stateObj.guildId === 'string') {
      guildIdStored = stateObj.guildId;
    } else if (stateObj.guildId != null) {
      guildIdStored = String(stateObj.guildId);
    }
    const hasSettings = hasToken || (!!guildIdStored && guildIdStored.length > 0);
    const tokenPreview = typeof stateObj.tokenPreview === 'string' && stateObj.tokenPreview.length
      ? stateObj.tokenPreview
      : null;
    teamDiscordSection.classList.toggle('hidden', !canManage);
    teamDiscordSection.setAttribute('aria-hidden', canManage ? 'false' : 'true');
    if (teamDiscordGuildId) {
      teamDiscordGuildId.placeholder = hasSettings ? 'Guild ID stored — enter to replace' : 'Enter Discord guild ID';
      teamDiscordGuildId.disabled = !canManage || loading;
    }
    if (teamDiscordToken) {
      teamDiscordToken.placeholder = hasToken ? 'Token stored — enter to replace' : 'Paste Discord bot token';
      teamDiscordToken.disabled = !canManage || loading;
    }
    if (btnSaveTeamDiscord) btnSaveTeamDiscord.disabled = !canManage || loading;
    if (btnRemoveTeamDiscord) btnRemoveTeamDiscord.disabled = !canManage || loading || !hasSettings;
    if (teamDiscordSummary) {
      teamDiscordSummary.classList.toggle('hidden', !canManage);
      teamDiscordSummary.setAttribute('aria-hidden', canManage ? 'false' : 'true');
    }
    if (teamDiscordSummaryGuild) {
      teamDiscordSummaryGuild.textContent = guildIdStored ? guildIdStored : 'Not set';
    }
    if (teamDiscordSummaryToken) {
      if (hasToken) {
        teamDiscordSummaryToken.textContent = tokenPreview || 'Stored token (hidden)';
      } else {
        teamDiscordSummaryToken.textContent = 'Not linked';
      }
    }
    if (canManage) {
      renderDiscordStatusServerOptions();
    } else if (discordStatusServerSelect) {
      discordStatusServerSelect.value = '';
      discordStatusServerSelect.disabled = true;
    }
    updateTeamAuthUi();
  }

  async function loadTeamAuthSettings({ force = false } = {}) {
    if (!teamAuthSection) return;
    if (!state.TOKEN) return;
    if (!canManageTeamDiscord()) {
      state.teamAuth.loading = false;
      state.teamAuth.enabled = false;
      state.teamAuth.roleId = null;
      state.teamAuth.logChannelId = null;
      state.teamAuth.loaded = false;
      state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
      hideNotice(teamAuthStatus);
      updateTeamAuthUi();
      return;
    }

    if (!force && state.teamAuth.loaded && state.teamAuth.loadedTeamId === state.activeTeamId) {
      updateTeamAuthUi();
      return;
    }

    state.teamAuth.loading = true;
    hideNotice(teamAuthStatus);
    updateTeamAuthUi();

    let unauthorized = false;
    try {
      const data = await api('/team/auth/settings');
      state.teamAuth.enabled = Boolean(data?.enabled);
      state.teamAuth.roleId = data?.roleId != null && data.roleId !== '' ? String(data.roleId) : null;
      state.teamAuth.logChannelId =
        data?.logChannelId != null && data.logChannelId !== '' ? String(data.logChannelId) : null;
      state.teamAuth.loaded = true;
      state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        unauthorized = true;
        handleUnauthorized();
      } else {
        state.teamAuth.loaded = false;
        state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
        state.teamAuth.logChannelId = null;
        showNotice(teamAuthStatus, describeError(err), 'error');
      }
    } finally {
      state.teamAuth.loading = false;
      if (!unauthorized) {
        updateTeamAuthUi();
      }
    }
  }

  async function loadTeamDiscord({ force = false } = {}) {
    if (!teamDiscordSection) return;
    if (!state.TOKEN) return;
    if (!canManageTeamDiscord()) {
      state.teamDiscord.hasToken = false;
      state.teamDiscord.guildId = null;
      state.teamDiscord.tokenPreview = null;
      state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
      updateTeamDiscordUi();
      state.teamAuth.loading = false;
      state.teamAuth.enabled = false;
      state.teamAuth.roleId = null;
      state.teamAuth.logChannelId = null;
      state.teamAuth.loaded = false;
      state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
      hideNotice(teamAuthStatus);
      updateTeamAuthUi();
      return;
    }
    if (!force && state.teamDiscord.loadedTeamId === state.activeTeamId) {
      updateTeamDiscordUi();
      return;
    }
    state.teamDiscord.loading = true;
    updateTeamDiscordUi();
    hideNotice(teamDiscordStatus);
    let unauthorized = false;
    try {
      const data = await api('/team/discord');
      state.teamDiscord.hasToken = Boolean(data?.hasToken);
      state.teamDiscord.guildId = data?.guildId ? String(data.guildId) : null;
      state.teamDiscord.tokenPreview = data?.tokenPreview ? String(data.tokenPreview) : null;
      state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
      if (!state.teamDiscord.hasToken && teamDiscordToken) {
        teamDiscordToken.value = '';
      }
      if (teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
        teamDiscordGuildId.value = state.teamDiscord.guildId || '';
      }
      if (!state.teamDiscord.guildId && teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
        teamDiscordGuildId.value = '';
      }
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        unauthorized = true;
        handleUnauthorized();
      } else {
        state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
        showNotice(teamDiscordStatus, describeError(err), 'error');
      }
    } finally {
      state.teamDiscord.loading = false;
      if (!state.teamDiscord.hasToken) {
        state.teamDiscord.tokenPreview = null;
      }
      updateTeamDiscordUi();
      if (canManageTeamDiscord()) {
        loadTeamAuthSettings({ force: true }).catch(() => {});
      }
    }
    if (unauthorized) return;
  }

  async function handleTeamDiscordSubmit(ev) {
    ev?.preventDefault();
    if (!canManageTeamDiscord()) return;
    if (!teamDiscordToken) return;
    const value = teamDiscordToken.value.trim();
    if (!value) {
      showNotice(teamDiscordStatus, describeError('missing_token'), 'error');
      return;
    }
    const guildInput = teamDiscordGuildId ? teamDiscordGuildId.value.trim() : '';
    const cleanedGuildId = guildInput.replace(/[^0-9]/g, '');
    if (!cleanedGuildId) {
      showNotice(teamDiscordStatus, describeError('missing_guild_id'), 'error');
      return;
    }
    state.teamDiscord.loading = true;
    updateTeamDiscordUi();
    hideNotice(teamDiscordStatus);
    let unauthorized = false;
    try {
      const data = await api('/team/discord', { token: value, guildId: cleanedGuildId }, 'POST');
      state.teamDiscord.hasToken = Boolean(data?.hasToken);
      state.teamDiscord.guildId = data?.guildId ? String(data.guildId) : cleanedGuildId;
      state.teamDiscord.tokenPreview = data?.tokenPreview ? String(data.tokenPreview) : null;
      state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
      teamDiscordToken.value = '';
      if (teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
        teamDiscordGuildId.value = state.teamDiscord.guildId || '';
      }
      showNotice(teamDiscordStatus, 'Discord settings saved.', 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        unauthorized = true;
        handleUnauthorized();
      } else {
        showNotice(teamDiscordStatus, describeError(err), 'error');
      }
    } finally {
      state.teamDiscord.loading = false;
      if (!state.teamDiscord.hasToken) {
        state.teamDiscord.tokenPreview = null;
    }
  if (state.teamAuth) {
      if (context.teamAuth && typeof context.teamAuth === 'object') {
        state.teamAuth.enabled = Boolean(context.teamAuth.enabled);
        state.teamAuth.roleId =
          context.teamAuth.roleId != null && context.teamAuth.roleId !== ''
            ? String(context.teamAuth.roleId)
            : null;
        state.teamAuth.logChannelId =
          context.teamAuth.logChannelId != null && context.teamAuth.logChannelId !== ''
            ? String(context.teamAuth.logChannelId)
            : null;
        state.teamAuth.loaded = true;
        state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
      } else if (typeof context.activeTeamRequiresDiscordAuth !== 'undefined') {
        state.teamAuth.enabled = Boolean(context.activeTeamRequiresDiscordAuth);
        if (typeof context.activeTeamDiscordRoleId !== 'undefined') {
          state.teamAuth.roleId =
            context.activeTeamDiscordRoleId != null && context.activeTeamDiscordRoleId !== ''
              ? String(context.activeTeamDiscordRoleId)
              : null;
        }
        if (typeof context.activeTeamDiscordAuthLogChannelId !== 'undefined') {
          const channel = context.activeTeamDiscordAuthLogChannelId;
          state.teamAuth.logChannelId = channel != null && channel !== '' ? String(channel) : null;
        }
        state.teamAuth.loaded = true;
        state.teamAuth.loadedTeamId = state.activeTeamId ?? null;
      }
      if (state.activeTeamId !== previousTeamId) {
        const hasAuthContext = !!(context.teamAuth && typeof context.teamAuth === 'object');
        const hasLegacyAuthContext = typeof context.activeTeamRequiresDiscordAuth !== 'undefined';
        state.teamAuth.loading = false;
        if (!hasAuthContext && !hasLegacyAuthContext) {
          state.teamAuth.loaded = false;
          state.teamAuth.loadedTeamId = null;
          state.teamAuth.enabled = false;
          state.teamAuth.roleId = null;
          state.teamAuth.logChannelId = null;
          if (teamAuthEnabledInput && !teamAuthEnabledInput.matches(':focus')) {
            teamAuthEnabledInput.checked = false;
          }
          if (teamAuthRoleInput && document.activeElement !== teamAuthRoleInput) {
            teamAuthRoleInput.value = '';
          }
          if (teamAuthLogChannelInput && document.activeElement !== teamAuthLogChannelInput) {
            teamAuthLogChannelInput.value = '';
          }
        }
        hideNotice(teamAuthStatus);
      }
    }
    updateTeamDiscordUi();
    updateTeamAuthUi();
  }
    if (unauthorized) return;
  }

  async function handleTeamDiscordRemove(ev) {
    ev?.preventDefault();
    if (!canManageTeamDiscord()) return;
    const guildIdStored =
      typeof state.teamDiscord.guildId === 'string'
        ? state.teamDiscord.guildId
        : state.teamDiscord.guildId != null
          ? String(state.teamDiscord.guildId)
          : '';
    const hasSettings = state.teamDiscord.hasToken || (guildIdStored && guildIdStored.length > 0);
    if (!hasSettings) {
      showNotice(teamDiscordStatus, 'No Discord settings are stored for this team.', 'error');
      return;
    }
    state.teamDiscord.loading = true;
    updateTeamDiscordUi();
    hideNotice(teamDiscordStatus);
    let unauthorized = false;
    try {
      const data = await api('/team/discord', null, 'DELETE');
      state.teamDiscord.hasToken = Boolean(data?.hasToken);
      state.teamDiscord.guildId = data?.guildId ? String(data.guildId) : null;
      state.teamDiscord.tokenPreview = data?.tokenPreview ? String(data.tokenPreview) : null;
      state.teamDiscord.loadedTeamId = state.activeTeamId ?? null;
      if (teamDiscordToken) teamDiscordToken.value = '';
      if (teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
        teamDiscordGuildId.value = state.teamDiscord.guildId || '';
      }
      showNotice(teamDiscordStatus, 'Removed the stored Discord settings.', 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        unauthorized = true;
        handleUnauthorized();
      } else {
        showNotice(teamDiscordStatus, describeError(err), 'error');
      }
    } finally {
      state.teamDiscord.loading = false;
      if (!state.teamDiscord.hasToken) {
        state.teamDiscord.tokenPreview = null;
      }
      updateTeamDiscordUi();
    }
    if (unauthorized) return;
  }

  function updateTeamAccessView({ refreshUsers = false, refreshAdmin = false } = {}) {
    const adminOnlyMode = state.superuserUi === true;
    const superuser = isSuperuser();
    const canUsers = adminOnlyMode ? false : hasGlobalPermission('manageUsers');
    const canRoles = adminOnlyMode ? false : hasGlobalPermission('manageRoles');
    const canAccessTeam = adminOnlyMode ? false : (canUsers || canRoles);
    const canManageDiscord = adminOnlyMode ? false : canManageTeamDiscord();
    const canAccessLinked = adminOnlyMode ? false : (canUsers || canRoles);
    const canAccessAdmin = superuser && hasGlobalPermission('manageUsers');

    if (navDashboard) {
      navDashboard.classList.toggle('hidden', adminOnlyMode);
      navDashboard.setAttribute('aria-hidden', adminOnlyMode ? 'true' : 'false');
      navDashboard.disabled = adminOnlyMode;
      if (adminOnlyMode) navDashboard.classList.remove('active');
    }

    if (navTeam) {
      navTeam.classList.toggle('hidden', !canAccessTeam);
      navTeam.setAttribute('aria-hidden', canAccessTeam ? 'false' : 'true');
      navTeam.disabled = !canAccessTeam;
      if (!canAccessTeam) navTeam.classList.remove('active');
    }

    if (navLinked) {
      navLinked.classList.toggle('hidden', !canAccessLinked);
      navLinked.setAttribute('aria-hidden', canAccessLinked ? 'false' : 'true');
      navLinked.disabled = !canAccessLinked;
      if (!canAccessLinked) navLinked.classList.remove('active');
    }

    if (navDiscord) {
      navDiscord.classList.toggle('hidden', !canManageDiscord);
      navDiscord.setAttribute('aria-hidden', canManageDiscord ? 'false' : 'true');
      navDiscord.disabled = !canManageDiscord;
      if (!canManageDiscord) navDiscord.classList.remove('active');
    }

    if (navAdmin) {
      navAdmin.classList.toggle('hidden', !canAccessAdmin);
      navAdmin.setAttribute('aria-hidden', canAccessAdmin ? 'false' : 'true');
      navAdmin.disabled = !canAccessAdmin;
      if (!canAccessAdmin) navAdmin.classList.remove('active');
    }

    if (teamSwitcher && adminOnlyMode) {
      teamSwitcher.classList.add('hidden');
      teamSwitcher.setAttribute('aria-hidden', 'true');
    }

    if (!canAccessTeam) {
      if (teamPanel) teamPanel.classList.add('hidden');
      if (state.activePanel === 'team') switchPanel('dashboard');
      if (!canManageDiscord) {
        if (discordPanel) discordPanel.classList.add('hidden');
        if (state.activePanel === 'discord') switchPanel('dashboard');
      }
      if (!canAccessLinked) {
        linkedAccountsPanel?.classList.add('hidden');
        if (state.activePanel === 'linked') switchPanel('dashboard');
      }
      if (userCard) userCard.classList.add('hidden');
      if (userList) userList.innerHTML = '';
      closeUserDetails();
      if (userCreateSection) userCreateSection.classList.add('hidden');
      updateRoleManagerVisibility(false);
      state.teamDiscord.hasToken = false;
      state.teamDiscord.guildId = null;
      state.teamDiscord.loadedTeamId = null;
      state.teamDiscord.loading = false;
      hideNotice(teamDiscordStatus);
      if (teamDiscordToken) teamDiscordToken.value = '';
      if (teamDiscordGuildId && document.activeElement !== teamDiscordGuildId) {
        teamDiscordGuildId.value = '';
      }
      updateTeamDiscordUi();
      if (!canAccessAdmin) {
        if (adminPanel) adminPanel.classList.add('hidden');
        if (state.activePanel === 'admin') switchPanel('dashboard');
        resetAdminView();
      }
      return;
    }

    if (userCard) userCard.classList.remove('hidden');
    if (userCreateSection) userCreateSection.classList.toggle('hidden', !canUsers);

    if (canUsers && refreshUsers) {
      loadUsers();
    } else if (!canUsers) {
      if (userList) userList.innerHTML = '';
      closeUserDetails();
      if (userCreateSection) userCreateSection.classList.add('hidden');
      updateRoleManagerVisibility(false);
    }

    updateRoleManagerVisibility(canRoles);
    updateTeamDiscordUi();
    if (canManageDiscord && state.activeTeamId != null) {
      if (state.teamDiscord.loadedTeamId !== state.activeTeamId && !state.teamDiscord.loading) {
        loadTeamDiscord().catch(() => {});
      }
    }
    if (canAccessAdmin && refreshAdmin) {
      loadAdminOverview().catch(() => {});
    } else if (!canAccessAdmin) {
      resetAdminView();
    }
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

  function renderPasskeys() {
    if (!passkeyList) return;
    passkeyList.innerHTML = '';
    const list = Array.isArray(state.security.passkeys) ? state.security.passkeys : [];
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent = 'No passkeys added yet.';
      passkeyList.appendChild(li);
      return;
    }
    for (const passkey of list) {
      const li = document.createElement('li');
      li.className = 'passkey-row';
      const primary = document.createElement('div');
      primary.className = 'passkey-name';
      primary.textContent = passkey.name || 'Passkey';
      const meta = document.createElement('div');
      meta.className = 'passkey-meta muted small';
      const lastUsed = passkey.last_used_at
        ? new Date(passkey.last_used_at).toLocaleString()
        : 'Never used';
      meta.textContent = `Last used: ${lastUsed}`;
      const transports = Array.isArray(passkey.transports) && passkey.transports.length
        ? ` · ${passkey.transports.join(', ')}`
        : '';
      meta.textContent += transports;
      const actions = document.createElement('div');
      actions.className = 'passkey-actions';
      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'ghost danger';
      btnRemove.textContent = 'Remove';
      btnRemove.addEventListener('click', () => removePasskey(passkey.id));
      actions.appendChild(btnRemove);
      li.appendChild(primary);
      li.appendChild(meta);
      li.appendChild(actions);
      passkeyList.appendChild(li);
    }
  }

  function renderSecuritySettings() {
    const enabled = Boolean(state.security.totpEnabled);
    if (mfaStatusLabel) {
      mfaStatusLabel.textContent = enabled ? 'Enabled' : 'Disabled';
      mfaStatusLabel.classList.toggle('success', enabled);
    }
    btnEnableTotp?.classList.toggle('hidden', enabled);
    btnDisableTotp?.classList.toggle('hidden', !enabled);
    btnStartTotp?.classList.toggle('hidden', enabled);
    if (totpSetupFields) {
      if (state.security.pendingSecret) {
        totpSetupFields.classList.remove('hidden');
        if (totpSecretValue) totpSecretValue.textContent = state.security.pendingSecret.secret || '';
        if (totpUriValue) totpUriValue.textContent = state.security.pendingSecret.uri || '';
      } else {
        totpSetupFields.classList.add('hidden');
      }
    }
    if (totpCodeInput) totpCodeInput.value = '';
    renderPasskeys();
  }

  async function loadSecuritySettings() {
    if (!state.TOKEN) return;
    hideNotice(mfaStatusMessage);
    hideNotice(passkeyStatus);
    try {
      const data = await api('/me/security');
      state.security = {
        ...state.security,
        totpEnabled: Boolean(data?.totpEnabled),
        passkeys: Array.isArray(data?.passkeys) ? data.passkeys : [],
        pendingSecret: null,
        loaded: true
      };
      renderSecuritySettings();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else ui.log('Failed to load security info: ' + describeError(err));
    }
  }

  async function startTotpSetup() {
    hideNotice(mfaStatusMessage);
    try {
      const data = await api('/me/security/totp/setup', {}, 'POST');
      state.security.pendingSecret = { secret: data.secret, uri: data.uri };
      showNotice(mfaStatusMessage, 'Scan the key with your authenticator app and enter the current code.', 'success');
      renderSecuritySettings();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(mfaStatusMessage, describeError(err), 'error');
    }
  }

  async function enableTotp() {
    hideNotice(mfaStatusMessage);
    const code = totpCodeInput?.value.trim();
    if (!code) {
      showNotice(mfaStatusMessage, describeError('missing_fields'), 'error');
      return;
    }
    if (!state.security.pendingSecret?.secret) {
      await startTotpSetup();
      if (!state.security.pendingSecret?.secret) return;
    }
    try {
      await api(
        '/me/security/totp/enable',
        { code, secret: state.security.pendingSecret.secret },
        'POST'
      );
      state.security.totpEnabled = true;
      state.security.pendingSecret = null;
      renderSecuritySettings();
      showNotice(mfaStatusMessage, 'Two-factor authentication is enabled.', 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(mfaStatusMessage, describeError(err), 'error');
    }
  }

  async function disableTotp() {
    hideNotice(mfaStatusMessage);
    const password = await ui.prompt({
      title: 'Disable two-factor auth',
      message: 'Enter your current password to disable 2FA.',
      confirmText: 'Disable',
      type: 'password'
    });
    if (!password) return;
    try {
      await api('/me/security/totp/disable', { currentPassword: password }, 'POST');
      state.security.totpEnabled = false;
      state.security.pendingSecret = null;
      renderSecuritySettings();
      showNotice(mfaStatusMessage, 'Two-factor authentication has been disabled.', 'success');
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(mfaStatusMessage, describeError(err), 'error');
    }
  }

  async function registerPasskey() {
    hideNotice(passkeyStatus);
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      showNotice(passkeyStatus, 'Passkeys are not supported in this browser.', 'error');
      return;
    }
    try {
      const data = await api('/me/passkeys/options', {}, 'POST');
      const publicKey = preparePublicKeyOptions(data?.options);
      if (!publicKey) throw new Error('invalid_passkey');
      const credential = await navigator.credentials.create({ publicKey });
      const label = await ui.prompt({
        title: 'Name this passkey',
        message: 'Give this passkey a label so you can recognise it later (optional).',
        placeholder: 'Work laptop',
        allowEmpty: true
      });
      const payload = {
        response: credentialToJSON(credential),
        name: typeof label === 'string' ? label : ''
      };
      const result = await api('/me/passkeys/register', payload, 'POST');
      state.security.passkeys = Array.isArray(result?.passkeys) ? result.passkeys : [];
      showNotice(passkeyStatus, 'Passkey added.', 'success');
      renderPasskeys();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(passkeyStatus, describeError(err), 'error');
    }
  }

  async function removePasskey(id) {
    if (!Number.isFinite(Number(id))) return;
    const confirmed = await ui.confirm({
      title: 'Remove passkey',
      message: 'Remove this passkey from your account?',
      confirmText: 'Remove'
    });
    if (!confirmed) return;
    try {
      const result = await api(`/me/passkeys/${id}`, null, 'DELETE');
      state.security.passkeys = Array.isArray(result?.passkeys) ? result.passkeys : [];
      renderPasskeys();
    } catch (err) {
      if (errorCode(err) === 'unauthorized') handleUnauthorized();
      else showNotice(passkeyStatus, describeError(err), 'error');
    }
  }

  async function completeLoginSession(payload, { resume = false } = {}) {
    if (payload?.token) {
      state.TOKEN = payload.token;
      localStorage.setItem('token', state.TOKEN);
    }
    if (!state.TOKEN) throw new Error('unauthorized');
    state.currentUser = {
      id: payload.id,
      username: payload.username,
      superuser: Boolean(payload.superuser),
      role: payload.role,
      roleName: payload.roleName || payload.role,
      permissions: payload.permissions || {}
    };
    applyTeamContext(payload);
    await loadRoles();
    await loadSettings();
    await loadSecuritySettings();
    ui.setUser(state.currentUser);
    ui.showApp();
    ensureSocket();
    await refreshServers();
    moduleBus.emit('auth:login', { user: state.currentUser, resume });
    moduleBus.emit('players:refresh', { reason: resume ? 'session-resume' : 'login' });
    updateTeamAccessView({ refreshUsers: true });
    startStatusPolling();
  }

  async function attemptSessionResume() {
    if (!state.TOKEN) {
      ui.showLogin();
      return;
    }
    try {
      const me = await api('/me');
      await completeLoginSession({ ...me, token: state.TOKEN }, { resume: true });
    } catch (err) {
      if (errorCode(err) === 'unauthorized') {
        logout();
      } else {
        ui.log('Session restore failed: ' + describeError(err));
        logout();
      }
    }
  }

  function resetLoginMfa() {
    state.pendingMfa = null;
    loginMfaStep?.classList.add('hidden');
    if (loginMfaCode) loginMfaCode.value = '';
    hideNotice(loginMfaStatus);
  }

  function showMfaPrompt() {
    if (!state.pendingMfa?.ticket) return;
    hideNotice(loginError);
    hideNotice(loginMfaStatus);
    loginMfaStep?.classList.remove('hidden');
    loginMfaCode?.focus();
    if (state.pendingMfa.methods?.passkey && state.pendingMfa.passkeyOptions) {
      startPasskeyMfa(state.pendingMfa.passkeyOptions).catch((err) => {
        showNotice(loginMfaStatus, describeError(err), 'error');
      });
    }
  }

  async function submitMfaCode() {
    hideNotice(loginMfaStatus);
    if (!state.pendingMfa?.ticket) {
      showNotice(loginError, describeError('mfa_expired'), 'error');
      return;
    }
    const code = loginMfaCode?.value.trim();
    if (!code) {
      showNotice(loginMfaStatus, describeError('missing_fields'), 'error');
      return;
    }
    try {
      const data = await publicJson('/login/mfa/totp', {
        method: 'POST',
        body: { ticket: state.pendingMfa.ticket, code }
      });
      await completeLoginSession(data, { resume: false });
      resetLoginMfa();
    } catch (err) {
      const codeValue = errorCode(err);
      if (codeValue === 'mfa_expired') {
        showNotice(loginError, describeError(err), 'error');
        resetLoginMfa();
        return;
      }
      showNotice(loginMfaStatus, describeError(err), 'error');
    }
  }

  async function startPasskeyMfa(options = null) {
    hideNotice(loginMfaStatus);
    if (!state.pendingMfa?.ticket) {
      showNotice(loginError, describeError('mfa_expired'), 'error');
      return;
    }
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      showNotice(loginMfaStatus, 'Passkeys are not supported in this browser.', 'error');
      return;
    }
    try {
      const optPayload = options || (await publicJson('/login/mfa/passkey/options', {
        method: 'POST',
        body: { ticket: state.pendingMfa.ticket }
      }))?.options;
      const publicKey = preparePublicKeyOptions(optPayload);
      if (!publicKey) throw new Error('invalid_passkey');
      const assertion = await navigator.credentials.get({ publicKey });
      const payload = {
        ticket: state.pendingMfa.ticket,
        response: credentialToJSON(assertion)
      };
      const data = await publicJson('/login/mfa/passkey/verify', { method: 'POST', body: payload });
      await completeLoginSession(data, { resume: false });
      resetLoginMfa();
    } catch (err) {
      const codeValue = errorCode(err);
      if (codeValue === 'mfa_expired') {
        showNotice(loginError, describeError(err), 'error');
        resetLoginMfa();
        return;
      }
      showNotice(loginMfaStatus, describeError(err), 'error');
    }
  }

  async function handleLogin() {
    hideNotice(loginError);
    hideNotice(loginMfaStatus);
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
      await completeLoginSession(data, { resume: false });
      resetLoginMfa();
    } catch (err) {
      if (errorCode(err) === 'mfa_required') {
        state.pendingMfa = {
          ticket: err.body?.ticket || null,
          methods: err.body?.methods || {},
          passkeyOptions: err.body?.passkeyOptions || null
        };
        showMfaPrompt();
      } else {
        showNotice(loginError, describeError(err), 'error');
        if (loginPassword) loginPassword.value = '';
        loginPassword?.focus();
      }
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
    navAdmin?.addEventListener('click', () => {
      if (navAdmin.disabled) return;
      if (!state.superuserUi) {
        window.location.href = '/superuser/ui/';
        return;
      }
      hideWorkspace('nav');
      switchPanel('admin');
      closeProfileMenu();
    });
    navLinked?.addEventListener('click', () => {
      if (navLinked.disabled) return;
      hideWorkspace('nav');
      switchPanel('linked');
      closeProfileMenu();
    });
    navDiscord?.addEventListener('click', () => {
      if (navDiscord.disabled) return;
      hideWorkspace('nav');
      switchPanel('discord');
      closeProfileMenu();
    });
    navSettings?.addEventListener('click', () => {
      hideWorkspace('nav');
      loadSecuritySettings();
      switchPanel('settings');
      closeProfileMenu();
    });
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
    btnStartTotp?.addEventListener('click', (e) => { e.preventDefault(); startTotpSetup(); });
    btnEnableTotp?.addEventListener('click', (e) => { e.preventDefault(); enableTotp(); });
    btnDisableTotp?.addEventListener('click', (e) => { e.preventDefault(); disableTotp(); });
    btnRegisterPasskey?.addEventListener('click', (e) => { e.preventDefault(); registerPasskey(); });
    btnSubmitMfa?.addEventListener('click', (e) => { e.preventDefault(); submitMfaCode(); });
    btnMfaUsePasskey?.addEventListener('click', (e) => { e.preventDefault(); startPasskeyMfa(); });
    loginMfaCode?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitMfaCode();
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
    teamDiscordForm?.addEventListener('submit', handleTeamDiscordSubmit);
    btnRemoveTeamDiscord?.addEventListener('click', handleTeamDiscordRemove);
    teamDiscordToken?.addEventListener('input', () => hideNotice(teamDiscordStatus));
    teamDiscordGuildId?.addEventListener('input', () => hideNotice(teamDiscordStatus));
    teamAuthForm?.addEventListener('submit', handleTeamAuthSubmit);
    teamAuthEnabledInput?.addEventListener('change', () => {
      state.teamAuth.enabled = !!teamAuthEnabledInput.checked;
      hideNotice(teamAuthStatus);
      updateTeamAuthUi();
    });
    teamAuthRoleInput?.addEventListener('input', () => {
      const value = normalizeTeamAuthRoleId(teamAuthRoleInput.value);
      state.teamAuth.roleId = value ? value : null;
      hideNotice(teamAuthStatus);
    });
    teamAuthLogChannelInput?.addEventListener('input', () => {
      const value = normalizeTeamAuthLogChannelId(teamAuthLogChannelInput.value);
      state.teamAuth.logChannelId = value ? value : null;
      hideNotice(teamAuthStatus);
    });
    btnAdminCreateUser?.addEventListener('click', (event) => { event.preventDefault(); handleAdminCreateUser(); });
    adminUserSaveRole?.addEventListener('click', handleAdminRoleSave);
    adminUserResetPassword?.addEventListener('click', handleAdminPasswordReset);
    adminUserDelete?.addEventListener('click', handleAdminDeleteUser);
    btnAdminAssignTeam?.addEventListener('click', (event) => { event.preventDefault(); handleAdminAssignTeam(); });
    adminAssignTeam?.addEventListener('change', () => hideNotice(adminAssignStatus));
    adminAssignRole?.addEventListener('change', () => hideNotice(adminAssignStatus));
    adminUserSuperuser?.addEventListener('change', () => hideNotice(adminUserRoleStatus));
    adminUserSearch?.addEventListener('input', () => {
      adminUserFilter = adminUserSearch.value || '';
      renderAdminUsers();
    });
    adminNewUserName?.addEventListener('input', () => hideNotice(adminUserFeedback));
    adminNewUserPassword?.addEventListener('input', () => hideNotice(adminUserFeedback));
    adminNewUserRole?.addEventListener('change', () => hideNotice(adminUserFeedback));
    adminNewUserSuperuser?.addEventListener('change', () => hideNotice(adminUserFeedback));
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
