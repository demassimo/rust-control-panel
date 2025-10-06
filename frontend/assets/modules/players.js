(function(){
  if (typeof window.registerModule !== 'function') return;

  window.registerModule({
    id: 'players-directory',
    title: 'All Players',
    order: 10,
    setup(ctx){
      const moduleId = 'players-directory';
      const sharedSearchKey = '__playerSearchQuery';
      const sharedLimitKey = '__playerDirectoryLimit';
      const limitStorageKey = 'playersDirectoryLimit';
      const defaultLimitRaw = '200';
      const limitOptions = [
        { value: '50', label: '50' },
        { value: '100', label: '100' },
        { value: '200', label: '200' },
        { value: '500', label: '500' },
        { value: '1000', label: '1000' },
        { value: 'unlimited', label: 'Unlimited' }
      ];
      const limitValueSet = new Set(limitOptions.map((option) => option.value));
      if (typeof window !== 'undefined' && typeof window[sharedSearchKey] !== 'string') {
        window[sharedSearchKey] = '';
      }
      if (typeof window !== 'undefined' && typeof window[sharedLimitKey] !== 'string') {
        window[sharedLimitKey] = defaultLimitRaw;
      }

      const regionDisplay = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['en'], { type: 'region' })
        : null;
      const countryFallbacks = { UK: 'United Kingdom', EU: 'European Union' };

      function countryNameFromCode(code) {
        if (!code) return null;
        const upper = String(code).trim().toUpperCase();
        if (!upper) return null;
        if (countryFallbacks[upper]) return countryFallbacks[upper];
        if (regionDisplay) {
          try {
            const label = regionDisplay.of(upper);
            if (label && label !== upper) return label;
          } catch {
            /* ignore */
          }
        }
        return countryFallbacks[upper] || upper;
      }

      function formatCountryDetail(name, code) {
        const label = typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
        const upper = typeof code === 'string' && code.trim().length > 0 ? code.trim().toUpperCase() : null;
        if (label && upper) return `${label} (${upper})`;
        if (label) return label;
        if (upper) return upper;
        return null;
      }

      const list = document.createElement('ul');
      list.className = 'player-directory';
      const message = document.createElement('p');
      message.className = 'module-message hidden';
      message.textContent = 'Sign in to view player directory.';
      ctx.body?.appendChild(list);
      ctx.body?.appendChild(message);

      const pagination = document.createElement('div');
      pagination.className = 'module-pagination hidden';
      const prevButton = document.createElement('button');
      prevButton.type = 'button';
      prevButton.className = 'btn ghost small';
      prevButton.textContent = 'Previous';
      prevButton.setAttribute('aria-label', 'Load previous players');
      const pageIndicator = document.createElement('span');
      pageIndicator.className = 'module-pagination-info muted small';
      pageIndicator.textContent = 'Page 1';
      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'btn ghost small';
      nextButton.textContent = 'Next';
      nextButton.setAttribute('aria-label', 'Load more players');
      pagination.appendChild(prevButton);
      pagination.appendChild(pageIndicator);
      pagination.appendChild(nextButton);
      ctx.body?.appendChild(pagination);
      const onPrevPage = () => goToPage(state.page - 1);
      const onNextPage = () => goToPage(state.page + 1);
      prevButton.addEventListener('click', onPrevPage);
      nextButton.addEventListener('click', onNextPage);

      const initialLimitRaw = readSharedLimit();
      let searchInput = null;
      let limitSelect = null;
      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const searchWrap = document.createElement('div');
        searchWrap.className = 'module-search';
        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search players, Steam ID or IP';
        searchInput.autocomplete = 'search';
        searchInput.name = 'players-search';
        searchInput.setAttribute('inputmode', 'search');
        searchInput.setAttribute('role', 'searchbox');
        searchInput.setAttribute('autocomplete', 'search');
        searchInput.setAttribute('aria-label', 'Search players by name, Steam ID, or IP address');
        searchWrap.appendChild(searchInput);
        ctx.actions.appendChild(searchWrap);

        limitSelect = document.createElement('select');
        limitSelect.className = 'module-select-control';
        limitSelect.setAttribute('aria-label', 'Number of players to display');
        for (const optionDef of limitOptions) {
          const option = document.createElement('option');
          option.value = optionDef.value;
          option.textContent = optionDef.label;
          limitSelect.appendChild(option);
        }
        limitSelect.value = initialLimitRaw;
        const limitWrap = document.createElement('div');
        limitWrap.className = 'module-select';
        limitWrap.appendChild(limitSelect);
        ctx.actions.appendChild(limitWrap);
      }

      function setMessage(text, variant = 'info') {
        if (!message) return;
        message.textContent = text;
        message.classList.remove('hidden');
        message.dataset.variant = variant;
      }

      function clearMessage() {
        message?.classList.add('hidden');
        message?.removeAttribute('data-variant');
      }

      const directoryCount = document.getElementById('player-directory-count');

      function normalizeQuery(value) {
        return String(value || '').trim().toLowerCase();
      }

      function includesQuery(value, query) {
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      }

      function readSharedQuery() {
        if (typeof window === 'undefined') return '';
        const current = window[sharedSearchKey];
        return typeof current === 'string' ? current : '';
      }

      function writeSharedQuery(value) {
        if (typeof window === 'undefined') return;
        window[sharedSearchKey] = value;
      }

      function broadcastSearch(value) {
        if (typeof window === 'undefined') return;
        const raw = typeof value === 'string' ? value : '';
        if (readSharedQuery() === raw) return;
        writeSharedQuery(raw);
        try {
          window.dispatchEvent(new CustomEvent('players:search', { detail: { query: raw, source: moduleId } }));
        } catch { /* ignore */ }
      }

      function normalizeLimitRaw(value) {
        if (typeof value !== 'string') return defaultLimitRaw;
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'unlimited') return 'unlimited';
        if (limitValueSet.has(trimmed)) return trimmed;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric) && numeric > 0) {
          const rounded = String(Math.round(numeric));
          if (limitValueSet.has(rounded)) return rounded;
        }
        return defaultLimitRaw;
      }

      function parseLimit(value) {
        const normalized = normalizeLimitRaw(value);
        if (normalized === 'unlimited') return null;
        const numeric = Number(normalized);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      }

      function readSharedLimit() {
        if (typeof window === 'undefined') return defaultLimitRaw;
        let raw = defaultLimitRaw;
        let fromStorage = false;
        try {
          const stored = window.localStorage?.getItem(limitStorageKey);
          if (stored != null) {
            raw = stored;
            fromStorage = true;
          }
        } catch { /* ignore */ }
        if (!fromStorage && typeof window[sharedLimitKey] === 'string') {
          raw = window[sharedLimitKey];
        }
        const normalized = normalizeLimitRaw(raw);
        window[sharedLimitKey] = normalized;
        return normalized;
      }

      function writeSharedLimit(value) {
        if (typeof window === 'undefined') return;
        const normalized = normalizeLimitRaw(value);
        window[sharedLimitKey] = normalized;
        try {
          const storage = window.localStorage;
          if (storage && typeof storage.setItem === 'function') {
            storage.setItem(limitStorageKey, normalized);
          }
        } catch { /* ignore */ }
      }

      function updateCount(displayed, filtered, total) {
        if (!directoryCount) return;
        if (displayed == null && filtered == null && total == null) {
          directoryCount.textContent = '(—)';
          return;
        }
        const toSafeNumber = (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric < 0) return null;
          return Math.round(numeric);
        };
        const safeDisplayed = toSafeNumber(displayed);
        const safeFiltered = toSafeNumber(filtered);
        const safeTotal = toSafeNumber(total);
        const parts = [];
        if (safeDisplayed != null) {
          parts.push(String(safeDisplayed));
        } else if (safeFiltered != null) {
          parts.push(String(safeFiltered));
        }
        if (safeFiltered != null && safeFiltered !== safeDisplayed) {
          parts.push(String(safeFiltered));
        }
        if (safeTotal != null && safeTotal !== safeFiltered) {
          parts.push(String(safeTotal));
        }
        directoryCount.textContent = parts.length ? `(${parts.join('/')})` : '(—)';
      }

      function safeCount(value, fallback = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return fallback;
        return Math.floor(numeric);
      }

      const modalState = {
        open: false,
        steamid: null,
        base: null,
        details: null,
        refreshing: false,
        updatingName: false
      };

      const modal = createPlayerModal();

      function render(payload) {
        let items = [];
        let filteredCount = 0;
        let totalCount = 0;
        let offset = 0;
        let appliedQuery = '';
        let pageFromResponse = null;
        let hasMore = false;
        if (Array.isArray(payload)) {
          items = payload;
          filteredCount = items.length;
          totalCount = items.length;
        } else if (payload && typeof payload === 'object') {
          items = Array.isArray(payload.items) ? payload.items : [];
          filteredCount = safeCount(payload.filtered, items.length);
          totalCount = safeCount(payload.total, filteredCount);
          offset = safeCount(payload.offset, state.limit ? state.page * state.limit : 0);
          appliedQuery = typeof payload.query === 'string' ? payload.query.trim() : '';
          if (payload.hasMore != null) hasMore = Boolean(payload.hasMore);
          if (payload.page != null) {
            const numericPage = Number(payload.page);
            if (Number.isFinite(numericPage) && numericPage >= 0) {
              pageFromResponse = Math.floor(numericPage);
            }
          }
        }
        state.players = items;
        state.filteredCount = filteredCount;
        state.totalCount = totalCount;
        state.offset = offset;
        state.serverSearch = appliedQuery;
        state.hasMore = hasMore;
        if (state.limit == null || !Number.isFinite(state.limit) || state.limit <= 0) {
          state.page = 0;
        } else if (pageFromResponse != null) {
          state.page = pageFromResponse;
        } else {
          state.page = Math.floor(offset / state.limit);
        }
        state.viewCounts = { displayed: items.length, filtered: filteredCount, total: totalCount };
        state.mode = 'ready';
        window.dispatchEvent?.(new CustomEvent('players:list', { detail: { players: state.players } }));
        renderList();
        if (modalState.open && modalState.steamid) {
          const updated = state.players.find((player) => String(player.steamid || '') === modalState.steamid);
          if (updated) renderModal(updated, null);
        }
      }

      function getFilteredPlayers() {
        if (!state.search) return [...state.players];
        const query = state.search;
        return state.players.filter((player) => matchesQuery(player, query));
      }

      function renderList() {
        list.innerHTML = '';
        if (state.mode !== 'ready') {
          updateCount(null, null, null);
          renderPagination();
          return;
        }
        const players = Array.isArray(state.players) ? [...state.players] : [];
        const trimmedSearch = (state.searchRaw || '').trim();
        const appliedSearch = (state.serverSearch || '').trim();
        let visible = players;
        let filteredCount = safeCount(state.filteredCount, players.length);
        if (trimmedSearch && trimmedSearch !== appliedSearch) {
          visible = getFilteredPlayers();
          filteredCount = visible.length;
        }
        const totalCount = safeCount(state.totalCount, filteredCount);
        state.viewCounts = { displayed: visible.length, filtered: filteredCount, total: totalCount };
        updateCount(visible.length, filteredCount, totalCount);
        if (totalCount === 0) {
          setMessage('No tracked players for this server yet. Import Steam profiles or let players connect to populate this list.');
          renderPagination();
          return;
        }
        if (filteredCount === 0) {
          setMessage('No players match your search.');
          renderPagination();
          return;
        }
        if (visible.length === 0) {
          setMessage('No players on this page yet.');
          renderPagination();
          return;
        }
        clearMessage();
        for (const p of visible) {
          const li = document.createElement('li');
          li.dataset.steamid = p.steamid || '';
          li.tabIndex = 0;
          li.setAttribute('role', 'button');

          const identity = document.createElement('div');
          identity.className = 'player-directory-identity';

          const avatarWrap = document.createElement('div');
          avatarWrap.className = 'player-directory-avatar';
          const avatarUrl = p.avatar || p.avatarfull || p.avatar_full || p.avatarFull || p.avatar_medium || p.avatarMedium || p.avatarUrl;
          const displayLabel = p.display_name || p.persona || p.steamid || 'Player';
          if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = `${displayLabel} avatar`;
            img.loading = 'lazy';
            avatarWrap.appendChild(img);
          } else {
            avatarWrap.classList.add('placeholder');
            avatarWrap.textContent = avatarInitial(displayLabel);
          }

          const info = document.createElement('div');
          info.className = 'player-directory-info';

          const nameRow = document.createElement('div');
          nameRow.className = 'player-directory-name';
          const strong = document.createElement('strong');
          strong.textContent = displayLabel;
          nameRow.appendChild(strong);
          if (p.forced_display_name) {
            const forcedBadge = document.createElement('span');
            forcedBadge.className = 'badge warn';
            forcedBadge.textContent = 'Forced';
            nameRow.appendChild(forcedBadge);
          }
          info.appendChild(nameRow);

          const meta = document.createElement('div');
          meta.className = 'player-directory-meta muted small';
          const lastSeen = formatTimestamp(p.last_seen);
          const parts = [];
          parts.push(p.steamid || '—');
          if (p.last_ip) {
            const endpoint = p.last_port ? `${p.last_ip}:${p.last_port}` : p.last_ip;
            parts.push(endpoint);
          }
          if (lastSeen) parts.push(`Last seen ${lastSeen}`);
          const serverPlaytime = formatServerPlaytime(p.total_playtime_seconds, p.total_playtime_minutes);
          if (serverPlaytime) parts.push(`Time on server ${serverPlaytime}`);
          meta.textContent = parts.join(' · ');
          info.appendChild(meta);

          identity.appendChild(avatarWrap);
          identity.appendChild(info);
          li.appendChild(identity);

          const right = document.createElement('div');
          right.className = 'server-actions';
          const ipCountryCode = p.ip_country_code || p.ipCountryCode || '';
          const steamCountryCode = p.country || '';
          const badgeCountryCode = ipCountryCode || steamCountryCode;
          const badgeCountryName = countryNameFromCode(badgeCountryCode);
          if (badgeCountryCode) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = badgeCountryCode;
            if (badgeCountryName && badgeCountryName !== badgeCountryCode) {
              badge.title = badgeCountryName;
            }
            right.appendChild(badge);
          }
          if (steamCountryCode && steamCountryCode !== badgeCountryCode) {
            const steamBadge = document.createElement('span');
            steamBadge.className = 'badge';
            steamBadge.textContent = steamCountryCode;
            const steamName = countryNameFromCode(steamCountryCode);
            if (steamName && steamName !== steamCountryCode) {
              steamBadge.title = `Steam: ${steamName}`;
            }
            right.appendChild(steamBadge);
          }
          if (p.vac_banned) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'VAC';
            right.appendChild(badge);
          }
          li.appendChild(right);

          const openDetails = () => openModal(p);
          li.addEventListener('click', openDetails);
          li.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              openDetails();
            }
          });
          list.appendChild(li);
        }
        renderPagination();
      }

      function renderPagination() {
        if (!pagination) return;
        if (state.mode !== 'ready') {
          pagination.classList.add('hidden');
          return;
        }
        const limit = state.limit;
        if (limit == null || !Number.isFinite(limit) || limit <= 0) {
          pagination.classList.add('hidden');
          return;
        }
        const view = state.viewCounts || {};
        const filteredCount = safeCount(view.filtered, safeCount(state.filteredCount, state.players.length));
        if (filteredCount <= limit && state.page === 0) {
          pagination.classList.add('hidden');
          return;
        }
        const totalPages = Math.max(1, Math.ceil(filteredCount / limit));
        const currentPage = Math.min(totalPages, Math.max(1, state.page + 1));
        prevButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalPages;
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
        pagination.classList.remove('hidden');
      }

      function getMaxPage() {
        const limit = state.limit;
        if (limit == null || !Number.isFinite(limit) || limit <= 0) return 0;
        const filteredCount = safeCount(state.viewCounts.filtered, safeCount(state.filteredCount, state.players.length));
        if (filteredCount <= 0) return 0;
        return Math.max(0, Math.ceil(filteredCount / limit) - 1);
      }

      function goToPage(targetPage) {
        const limit = state.limit;
        if (limit == null || !Number.isFinite(limit) || limit <= 0) return;
        const maxPage = getMaxPage();
        const clamped = Math.max(0, Math.min(targetPage, maxPage));
        if (clamped === state.page) return;
        if (state.isLoading) {
          state.page = clamped;
          state.offset = clamped * Math.floor(limit);
          queuedRefresh = { reason: 'page-change', serverId: state.serverId };
          return;
        }
        state.page = clamped;
        state.offset = clamped * Math.floor(limit);
        refresh('page-change');
      }

      function matchesQuery(player, query) {
        if (!query) return true;
        const values = [
          player?.display_name,
          player?.raw_display_name,
          player?.forced_display_name,
          player?.persona,
          player?.steamid,
          player?.last_ip,
          player?.country,
          player?.profileurl,
          player?.profile_url,
          player?.notes
        ];
        const profile = player?.steam_profile || player?.steamProfile;
        if (profile) {
          values.push(profile.persona, profile.personaName, profile.steamId, profile.country);
        }
        if (values.some((value) => includesQuery(value, query))) return true;
        if (player?.last_port != null && String(player.last_port).includes(query)) return true;
        if (player?.steamid && String(player.steamid).includes(query)) return true;
        return false;
      }

      const state = {
        serverId: null,
        isLoading: false,
        players: [],
        searchRaw: '',
        search: '',
        limitRaw: initialLimitRaw,
        limit: parseLimit(initialLimitRaw),
        mode: 'idle',
        page: 0,
        offset: 0,
        totalCount: 0,
        filteredCount: 0,
        serverSearch: '',
        hasMore: false,
        viewCounts: { displayed: 0, filtered: 0, total: 0 }
      };
      let queuedRefresh = null;

      function setSearch(value, { skipBroadcast = false } = {}) {
        const raw = typeof value === 'string' ? value : '';
        if (state.searchRaw === raw) return;
        state.searchRaw = raw;
        state.search = normalizeQuery(raw);
        state.page = 0;
        state.offset = 0;
        state.serverSearch = '';
        if (searchInput && searchInput.value !== raw) searchInput.value = raw;
        if (!skipBroadcast) broadcastSearch(raw);
        if (state.mode === 'ready') renderList();
        if (state.mode === 'ready' || state.mode === 'error') refresh('search-change');
      }

      const initialSearch = readSharedQuery();
      state.searchRaw = initialSearch;
      state.search = normalizeQuery(initialSearch);
      if (searchInput) {
        searchInput.value = state.searchRaw;
        searchInput.addEventListener('input', (ev) => setSearch(ev.target.value));
      }
      if (limitSelect) {
        if (limitSelect.value !== state.limitRaw) {
          limitSelect.value = state.limitRaw;
        }
        limitSelect.addEventListener('change', (ev) => {
          const raw = ev.target?.value;
          const normalized = normalizeLimitRaw(raw);
          if (state.limitRaw === normalized) return;
          state.limitRaw = normalized;
          state.limit = parseLimit(normalized);
          state.page = 0;
          state.offset = 0;
          writeSharedLimit(normalized);
          if (state.mode === 'ready') renderList();
          refresh('limit-change');
        });
      }

      let searchListener = null;
      let externalOpenListener = null;
      let externalCloseListener = null;
      if (typeof window !== 'undefined') {
        searchListener = (event) => {
          if (!event) return;
          const source = event.detail?.source;
          if (source === moduleId) return;
          setSearch(event.detail?.query || '', { skipBroadcast: true });
        };
        window.addEventListener('players:search', searchListener);
        externalOpenListener = (event) => {
          const detail = event?.detail || {};
          if (detail.source === moduleId) return;
          const rawId = detail.steamId ?? detail.steamid ?? detail.player?.steamid ?? detail.player?.steamId ?? '';
          const steamid = String(rawId || '').trim();
          const existing = steamid
            ? state.players.find((p) => String(p.steamid || '').trim() === steamid)
            : null;
          if (existing) {
            openModal(existing);
            return;
          }
          if (!detail.player && !steamid) return;
          const normalized = normalizeExternalPlayer(detail.player || {}, steamid);
          openModal(normalized);
        };
        externalCloseListener = (event) => {
          const detail = event?.detail || {};
          if (detail.source === moduleId) return;
          if (!modalState.open) return;
          const rawId = detail.steamId ?? detail.steamid ?? '';
          const target = String(rawId || '').trim();
          if (!target || !modalState.steamid || modalState.steamid === target) {
            closeModal();
          }
        };
        window.addEventListener('players:open-profile', externalOpenListener);
        window.addEventListener('players:close-profile', externalCloseListener);
      }

      async function refresh(reason, serverIdOverride){
        if (state.isLoading) {
          queuedRefresh = { reason, serverId: serverIdOverride };
          return;
        }
        const globalState = ctx.getState?.();
        if (!globalState?.currentUser) {
          list.innerHTML = '';
          setMessage('Sign in to view player directory.');
          state.serverId = null;
          state.players = [];
          state.mode = 'idle';
          state.page = 0;
          state.offset = 0;
          state.totalCount = 0;
          state.filteredCount = 0;
          state.viewCounts = { displayed: 0, filtered: 0, total: 0 };
          updateCount(null, null, null);
          renderPagination();
          queuedRefresh = null;
          return;
        }
        const serverId = Number(serverIdOverride ?? state.serverId ?? globalState.currentServerId);
        if (!Number.isFinite(serverId)) {
          state.serverId = null;
          list.innerHTML = '';
          setMessage('Select a server to view player directory.');
          state.players = [];
          state.mode = 'idle';
          state.page = 0;
          state.offset = 0;
          state.totalCount = 0;
          state.filteredCount = 0;
          state.viewCounts = { displayed: 0, filtered: 0, total: 0 };
          updateCount(null, null, null);
          renderPagination();
          queuedRefresh = null;
          return;
        }
        if (state.serverId !== serverId) {
          state.page = 0;
          state.offset = 0;
        }
        state.serverId = serverId;
        const limitValue = Number.isFinite(state.limit) && state.limit > 0 ? Math.floor(state.limit) : null;
        if (limitValue == null) {
          state.page = 0;
          state.offset = 0;
        } else {
          state.offset = Math.max(0, state.page * limitValue);
        }
        const offsetValue = state.offset;
        const queryParts = [];
        if (limitValue == null) {
          queryParts.push(['limit', 'unlimited']);
        } else {
          queryParts.push(['limit', String(limitValue)]);
          if (offsetValue > 0) {
            queryParts.push(['offset', String(offsetValue)]);
          }
        }
        const searchRaw = (state.searchRaw || '').trim();
        if (searchRaw) {
          queryParts.push(['q', searchRaw]);
        }
        state.isLoading = true;
        state.mode = 'loading';
        queuedRefresh = null;
        setMessage('Loading players…');
        updateCount(null, null, null);
        renderPagination();
        try {
          const query = queryParts.length
            ? `?${queryParts.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
            : '';
          const payload = await ctx.api(`/servers/${serverId}/players${query}`);
          render(payload);
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            renderPagination();
          } else {
            setMessage('Unable to load players: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'));
            ctx.log?.('Players module error: ' + (err?.message || err));
            state.mode = 'error';
            updateCount(null, null, null);
            renderPagination();
          }
        } finally {
          state.isLoading = false;
          if (queuedRefresh) {
            const next = queuedRefresh;
            queuedRefresh = null;
            refresh(next.reason || 'queued', next.serverId);
          }
        }
      }

      function formatTimestamp(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
      }

      function formatPlaytime(minutes, visibility) {
        const value = Number(minutes);
        if (!Number.isFinite(value)) {
          if (Number(visibility) === 3) return 'No recorded hours';
          return 'Profile private';
        }
        if (value <= 0) return 'No recorded hours';
        const hours = value / 60;
        if (hours >= 100) return `${Math.round(hours)} h`;
        return `${hours.toFixed(1)} h`;
      }

      function formatServerPlaytime(seconds, minutesFallback) {
        let totalSeconds = Number(seconds);
        if (!Number.isFinite(totalSeconds) && minutesFallback != null) {
          const minutes = Number(minutesFallback);
          if (Number.isFinite(minutes)) totalSeconds = minutes * 60;
        }
        if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
        if (totalSeconds < 60) return `${Math.max(1, Math.round(totalSeconds))} s`;
        const totalMinutes = totalSeconds / 60;
        if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
        const hours = totalMinutes / 60;
        if (hours >= 72) {
          const days = hours / 24;
          if (days >= 10) return `${Math.round(days)} d`;
          return `${days.toFixed(1)} d`;
        }
        if (hours >= 100) return `${Math.round(hours)} h`;
        return `${hours.toFixed(1)} h`;
      }

      function formatVisibility(visibility) {
        const value = Number(visibility);
        switch (value) {
          case 1: return 'Private';
          case 2: return 'Friends only';
          case 3: return 'Public';
          case 4: return 'Users only';
          case 5: return 'Public';
          default: return '—';
        }
      }

      function formatLastBanLabel(days) {
        const value = Number(days);
        if (!Number.isFinite(value) || value < 0) return 'Unknown';
        if (value === 0) return 'Today';
        if (value === 1) return '1 day ago';
        return `${value} days ago`;
      }

      function resolveLastBan(gameBans, lastBanDays, vacBanned = false) {
        const count = Number(gameBans);
        const hasGameBan = Number.isFinite(count) && count > 0;
        const hasVacBan = Boolean(vacBanned);
        if (!hasGameBan && !hasVacBan) return null;
        const value = Number(lastBanDays);
        if (!Number.isFinite(value) || value < 0) {
          return { label: 'Unknown', tone: 'last-ban-unknown' };
        }
        let tone = 'last-ban-green';
        if (value < 30) tone = 'last-ban-red';
        else if (value < 90) tone = 'last-ban-yellow';
        else if (value < 365) tone = 'last-ban-green';
        const label = formatLastBanLabel(value);
        return { label, tone };
      }

      function avatarInitial(name = '') {
        const trimmed = String(name || '').trim();
        if (!trimmed) return '?';
        return String.fromCodePoint(trimmed.codePointAt(0) || 63).toUpperCase();
      }

      function normalizeExternalPlayer(external, steamid) {
        const base = external ? { ...external } : {};
        const resolvedId = typeof steamid === 'string' ? steamid : String(steamid || '').trim();
        base.steamid = resolvedId;
        const candidateName = base.display_name || base.displayName || base.persona || base.personaName || resolvedId || '';
        if (!base.display_name) base.display_name = candidateName || 'Unknown player';
        if (!base.persona) base.persona = base.personaName || base.display_name || '';
        if (!base.raw_display_name) base.raw_display_name = base.rawDisplayName || base.display_name || '';
        const profileUrl = base.profileurl || base.profile_url || base.profileUrl || base.profileURL || '';
        if (profileUrl) {
          base.profileurl = profileUrl;
          base.profile_url = profileUrl;
        }
        if (!base.avatarfull) base.avatarfull = base.avatarFull || base.avatar_full || '';
        if (!base.avatar && base.avatarfull) base.avatar = base.avatarfull;
        if (base.vac_banned == null && base.vacBanned != null) base.vac_banned = base.vacBanned ? 1 : 0;
        if (base.game_bans == null && base.gameBans != null) base.game_bans = base.gameBans;
        if (base.last_ban_days == null && base.daysSinceLastBan != null) base.last_ban_days = base.daysSinceLastBan;
        const normalizedGameBans = Number(base.game_bans);
        const hasGameBan = Number.isFinite(normalizedGameBans) && normalizedGameBans > 0;
        const hasVacBan = Boolean(base.vac_banned) || Boolean(base.vacBanned);
        if (!hasGameBan && !hasVacBan) base.last_ban_days = null;
        if (base.rust_playtime_minutes == null && base.rustPlaytimeMinutes != null) base.rust_playtime_minutes = base.rustPlaytimeMinutes;
        if (base.visibility == null && base.profile_visibility != null) base.visibility = base.profile_visibility;
        if (!base.last_ip && base.lastIp) base.last_ip = base.lastIp;
        if (!base.last_port && base.lastPort != null) base.last_port = base.lastPort;
        if (!base.last_ip && base.ip) base.last_ip = base.ip;
        if (!base.last_port && base.port != null) base.last_port = base.port;
        if (!base.ip_country_code && base.ipCountryCode) base.ip_country_code = base.ipCountryCode;
        if (!base.ip_country_name && base.ipCountryName) base.ip_country_name = base.ipCountryName;
        if (!base.ip_country_code && base.ip_country) base.ip_country_code = base.ip_country;
        if (!base.first_seen && base.firstSeen) base.first_seen = base.firstSeen;
        if (!base.last_seen && base.lastSeen) base.last_seen = base.lastSeen;
        if (base.forced_display_name == null && base.forcedDisplayName != null) base.forced_display_name = base.forcedDisplayName;
        if (base.total_playtime_seconds == null && base.totalPlaytimeSeconds != null) {
          base.total_playtime_seconds = base.totalPlaytimeSeconds;
        }
        if (base.total_playtime_minutes == null && base.totalPlaytimeMinutes != null) {
          base.total_playtime_minutes = base.totalPlaytimeMinutes;
        }
        return base;
      }

      function openModal(player) {
        if (!player || !modal) return;
        const steamid = String(player.steamid || '').trim();
        modalState.open = true;
        modalState.steamid = steamid || null;
        modalState.updatingName = false;
        renderModal(player, null);
        setModalStatus('');
        setModalLoading(false);
        modal.show();
        if (steamid) {
          loadPlayerDetails(steamid, { basePlayer: player, showLoading: true });
        } else {
          setModalStatus('Steam ID is missing for this entry.', 'warn');
        }
      }

      function closeModal() {
        if (!modalState.open || !modal) return;
        modalState.open = false;
        modalState.steamid = null;
        modalState.base = null;
        modalState.details = null;
        modalState.refreshing = false;
        modalState.updatingName = false;
        setModalStatus('');
        setModalLoading(false);
        modal.hide();
      }

      function renderModal(baseOverride = null, detailsOverride = null) {
        if (!modal) return;
        if (baseOverride) modalState.base = { ...baseOverride };
        if (detailsOverride) modalState.details = { ...detailsOverride };
        const base = modalState.base || {};
        const detail = modalState.details || {};
        const combined = { ...base, ...detail };
        const forcedName = typeof combined.forced_display_name === 'string' && combined.forced_display_name
          ? combined.forced_display_name
          : null;
        const fallbackName = combined.persona || combined.steamid || 'Unknown player';
        const displayName = (combined.display_name && String(combined.display_name).trim())
          ? combined.display_name
          : fallbackName;
        const rawDisplay = combined.raw_display_name || (forcedName ? fallbackName : displayName) || '';
        const personaValue = combined.persona || '';
        const personaLabel = personaValue && personaValue !== displayName ? personaValue : '';
        const steamid = combined.steamid || '—';
        const country = combined.country || '';
        const ipCountryCode = combined.ip_country_code || combined.ipCountryCode || '';
        const ipCountryName = combined.ip_country_name || combined.ipCountryName || countryNameFromCode(ipCountryCode);
        const steamCountryCode = country || '';
        const steamCountryName = countryNameFromCode(steamCountryCode);
        const nameBadge = modal.elements.name;
        if (nameBadge) nameBadge.textContent = displayName;
        if (modal.elements.meta) modal.elements.meta.textContent = steamid;
        if (modal.elements.avatar) {
          modal.elements.avatar.innerHTML = '';
          modal.elements.avatar.classList.remove('placeholder');
          if (combined.avatar) {
            const img = document.createElement('img');
            img.src = combined.avatar;
            img.alt = `${displayName} avatar`;
            img.loading = 'lazy';
            modal.elements.avatar.appendChild(img);
          } else {
            modal.elements.avatar.classList.add('placeholder');
            modal.elements.avatar.textContent = avatarInitial(displayName);
          }
        }
        if (modal.elements.badges) {
          modal.elements.badges.innerHTML = '';
          const badgeCountryCode = ipCountryCode || steamCountryCode;
          const badgeCountryName = countryNameFromCode(badgeCountryCode);
          if (badgeCountryCode) {
            const badge = document.createElement('span');
            badge.className = 'badge country';
            badge.textContent = badgeCountryCode;
            if (badgeCountryName && badgeCountryName !== badgeCountryCode) {
              badge.title = badgeCountryName;
            }
            modal.elements.badges.appendChild(badge);
          }
          if (steamCountryCode && steamCountryCode !== badgeCountryCode) {
            const steamBadge = document.createElement('span');
            steamBadge.className = 'badge country steam';
            steamBadge.textContent = steamCountryCode;
            if (steamCountryName && steamCountryName !== steamCountryCode) {
              steamBadge.title = `Steam: ${steamCountryName}`;
            }
            modal.elements.badges.appendChild(steamBadge);
          }
          const vac = Number(combined.vac_banned) > 0;
          if (vac) {
            const badge = document.createElement('span');
            badge.className = 'badge vac';
            badge.textContent = 'VAC';
            modal.elements.badges.appendChild(badge);
          }
          const gameBans = Number(combined.game_bans || combined.gameBans || 0);
          if (gameBans > 0) {
            const badge = document.createElement('span');
            badge.className = 'badge gameban';
            badge.textContent = `${gameBans} game ban${gameBans === 1 ? '' : 's'}`;
            modal.elements.badges.appendChild(badge);
          }
          if (forcedName) {
            const forcedBadge = document.createElement('span');
            forcedBadge.className = 'badge warn';
            forcedBadge.textContent = 'Forced';
            modal.elements.badges.appendChild(forcedBadge);
          }
          const lastBanInfo = resolveLastBan(gameBans, combined.last_ban_days ?? combined.daysSinceLastBan, vac);
          if (lastBanInfo) {
            const lastBadge = document.createElement('span');
            lastBadge.className = `badge last-ban ${lastBanInfo.tone}`.trim();
            lastBadge.textContent = `Last ban: ${lastBanInfo.label}`;
            modal.elements.badges.appendChild(lastBadge);
          }
        }
        if (modal.elements.persona) modal.elements.persona.textContent = personaLabel;
        if (modal.elements.details) {
          const entries = [];
          entries.push(['Display name', displayName || '—']);
          if (forcedName) entries.push(['Forced name', forcedName]);
          if (forcedName && rawDisplay && rawDisplay !== forcedName) {
            entries.push(['Last known name', rawDisplay]);
          }
          entries.push(['Steam persona', personaValue || '—']);
          entries.push(['Steam ID', steamid]);
          const ipCountryDetail = formatCountryDetail(ipCountryName, ipCountryCode);
          const steamCountryDetail = formatCountryDetail(steamCountryName, steamCountryCode);
          entries.push(['Country', ipCountryDetail || steamCountryDetail || '—']);
          if (steamCountryDetail && steamCountryDetail !== ipCountryDetail) {
            entries.push(['Steam country', steamCountryDetail]);
          }
          entries.push(['First seen', formatTimestamp(combined.first_seen) || '—']);
          entries.push(['Last seen', formatTimestamp(combined.last_seen) || '—']);
          entries.push(['Last address', combined.last_ip ? `${combined.last_ip}${combined.last_port ? ':' + combined.last_port : ''}` : '—']);
          const serverPlaytime = formatServerPlaytime(combined.total_playtime_seconds, combined.total_playtime_minutes);
          entries.push(['Server playtime', serverPlaytime || '—']);
          entries.push(['Rust playtime', formatPlaytime(combined.rust_playtime_minutes, combined.visibility)]);
          entries.push(['Profile visibility', formatVisibility(combined.visibility)]);
          entries.push(['VAC ban', Number(combined.vac_banned) > 0 ? 'Yes' : 'No']);
          entries.push(['Game bans', `${Number(combined.game_bans || 0) || 0}`]);
          const lastBanInfo = resolveLastBan(
            combined.game_bans ?? combined.gameBans,
            combined.last_ban_days ?? combined.daysSinceLastBan,
            combined.vac_banned ?? combined.vacBanned
          );
          if (lastBanInfo) entries.push(['Last ban', lastBanInfo.label]);
          entries.push(['Profile updated', formatTimestamp(combined.updated_at) || '—']);
          entries.push(['Playtime updated', formatTimestamp(combined.playtime_updated_at) || '—']);
          modal.elements.details.innerHTML = '';
          for (const [label, value] of entries) {
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value || '—';
            modal.elements.details.appendChild(dt);
            modal.elements.details.appendChild(dd);
          }
        }
        if (modal.elements.events) {
          const events = Array.isArray(detail.events) ? detail.events : [];
          modal.elements.events.innerHTML = '';
          const listEl = modal.elements.events;
          if (events.length === 0) {
            const li = document.createElement('li');
            li.className = 'player-event-empty muted small';
            li.textContent = 'No events recorded for this player yet.';
            listEl.appendChild(li);
          } else {
            const recent = events.slice(0, 8);
            for (const event of recent) {
              const li = document.createElement('li');
              li.className = 'player-event-row';
              const title = document.createElement('strong');
              title.textContent = event.event || 'Event';
              li.appendChild(title);
              const meta = document.createElement('div');
              meta.className = 'event-meta';
              const parts = [];
              const created = formatTimestamp(event.created_at || event.createdAt);
              if (created) parts.push(created);
              if (event.server_id || event.serverId) parts.push(`Server ${event.server_id || event.serverId}`);
              if (event.note) parts.push(event.note);
              meta.textContent = parts.join(' · ');
              li.appendChild(meta);
              listEl.appendChild(li);
            }
          }
        }
        updateActions(combined);
      }

      function updateActions(combined) {
        const profileUrl = combined.profileurl || combined.profile_url || '';
        const steamid = typeof combined.steamid === 'string'
          ? combined.steamid.trim()
          : String(combined.steamid || '').trim();
        const steamProfileUrl = profileUrl || (steamid ? `https://steamcommunity.com/profiles/${encodeURIComponent(steamid)}` : '');
        const serverArmourUrl = steamid ? `https://serverarmour.com/profile/${encodeURIComponent(steamid)}` : '';
        if (modal.elements.steamProfileBtn) {
          if (steamProfileUrl) {
            modal.elements.steamProfileBtn.classList.remove('hidden');
            modal.elements.steamProfileBtn.dataset.url = steamProfileUrl;
            modal.elements.steamProfileBtn.disabled = false;
          } else {
            modal.elements.steamProfileBtn.classList.add('hidden');
            modal.elements.steamProfileBtn.dataset.url = '';
            modal.elements.steamProfileBtn.disabled = true;
          }
        }
        if (modal.elements.serverArmourBtn) {
          if (serverArmourUrl) {
            modal.elements.serverArmourBtn.classList.remove('hidden');
            modal.elements.serverArmourBtn.dataset.url = serverArmourUrl;
            modal.elements.serverArmourBtn.disabled = false;
          } else {
            modal.elements.serverArmourBtn.classList.add('hidden');
            modal.elements.serverArmourBtn.dataset.url = '';
            modal.elements.serverArmourBtn.disabled = true;
          }
        }
        if (modal.elements.refreshBtn) {
          const hasSteam = Boolean(combined.steamid);
          const busy = modalState.refreshing || modalState.updatingName;
          modal.elements.refreshBtn.disabled = busy || !hasSteam;
          modal.elements.refreshBtn.textContent = modalState.refreshing ? 'Refreshing…' : 'Force Steam Refresh';
        }
        if (modal.elements.forceNameBtn) {
          const globalState = ctx.getState?.();
          const serverId = Number(state.serverId ?? globalState?.currentServerId);
          const hasSteam = Boolean(combined.steamid);
          const busy = modalState.refreshing || modalState.updatingName;
          if (modalState.updatingName) {
            modal.elements.forceNameBtn.textContent = 'Saving…';
          } else if (combined.forced_display_name) {
            modal.elements.forceNameBtn.textContent = 'Clear forced name';
          } else {
            modal.elements.forceNameBtn.textContent = 'Force display name';
          }
          modal.elements.forceNameBtn.disabled = busy || !hasSteam || !Number.isFinite(serverId);
        }
      }

      function setModalStatus(message, variant = 'info') {
        if (!modal?.elements.status) return;
        const status = modal.elements.status;
        if (!message) {
          status.textContent = '';
          status.classList.add('hidden');
          status.removeAttribute('data-variant');
          return;
        }
        status.textContent = message;
        status.classList.remove('hidden');
        status.dataset.variant = variant;
      }

      function setModalLoading(isLoading) {
        if (!modal?.elements.loading) return;
        modal.elements.loading.classList.toggle('hidden', !isLoading);
      }

      async function loadPlayerDetails(steamid, { showLoading = false, basePlayer = null } = {}) {
        if (!steamid) return;
        const target = steamid;
        if (basePlayer) renderModal(basePlayer, null);
        if (showLoading) setModalLoading(true);
        try {
          const details = await ctx.api(`/players/${steamid}`);
          if (!modalState.open || modalState.steamid !== target) return;
          renderModal(null, details);
          setModalStatus('');
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            closeModal();
            return;
          }
          setModalStatus('Unable to load latest player details: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'), 'error');
        } finally {
          if (showLoading) setModalLoading(false);
        }
      }

      async function forceSteamRefresh() {
        if (!modalState.open || !modalState.steamid || modalState.refreshing || modalState.updatingName) return;
        modalState.refreshing = true;
        renderModal(null, null);
        setModalStatus('Requesting fresh Steam profile…');
        try {
          await ctx.api('/steam/sync', { steamids: [modalState.steamid] }, 'POST');
          setModalStatus('Steam profile refresh requested. Updating record…', 'success');
          await refresh('steam-refresh');
          const updated = state.players.find((p) => String(p.steamid || '') === modalState.steamid);
          if (updated) renderModal(updated, null);
          await loadPlayerDetails(modalState.steamid, { showLoading: true });
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            closeModal();
            return;
          }
          setModalStatus('Failed to refresh Steam profile: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'), 'error');
        } finally {
          modalState.refreshing = false;
          renderModal(null, null);
        }
      }

      async function forceDisplayName() {
        if (!modalState.open || !modalState.steamid || modalState.refreshing || modalState.updatingName) return;
        const globalState = ctx.getState?.();
        const serverId = Number(state.serverId ?? globalState?.currentServerId);
        if (!Number.isFinite(serverId)) {
          setModalStatus('Select a server to change display names.', 'warn');
          return;
        }
        const combined = { ...(modalState.base || {}), ...(modalState.details || {}) };
        const forced = typeof combined.forced_display_name === 'string' && combined.forced_display_name
          ? combined.forced_display_name
          : '';
        const raw = combined.raw_display_name || combined.display_name || combined.persona || combined.steamid || '';
        const initial = forced || raw || '';
        if (typeof ctx.prompt !== 'function') {
          setModalStatus('Display name editor unavailable in this build.', 'error');
          return;
        }
        const input = await ctx.prompt({
          title: 'Set display name',
          message: 'Enter a display name for this server. Leave blank to restore the live name.',
          confirmText: 'Save display name',
          cancelText: 'Cancel',
          placeholder: 'Display name',
          defaultValue: initial,
          maxLength: 190
        });
        if (input === null) return;
        const trimmedInput = input.trim();
        const next = trimmedInput.slice(0, 190);
        if (!next && !forced) return;
        if (next && next === forced) return;
        const clearing = next.length === 0;
        modalState.updatingName = true;
        renderModal(null, null);
        setModalStatus(clearing ? 'Clearing forced display name…' : 'Saving display name…');
        try {
          await ctx.api(`/servers/${serverId}/players/${modalState.steamid}`, { display_name: clearing ? null : next }, 'PATCH');
          setModalStatus(clearing ? 'Forced name cleared.' : 'Display name saved.', 'success');
          await refresh('display-name-change', serverId);
          const updated = state.players.find((player) => String(player.steamid || '') === modalState.steamid);
          if (updated) renderModal(updated, null);
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            closeModal();
            return;
          }
          setModalStatus('Failed to update display name: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'), 'error');
        } finally {
          modalState.updatingName = false;
          renderModal(null, null);
        }
      }

      function createPlayerModal() {
        const overlay = document.createElement('div');
        overlay.className = 'player-modal-backdrop hidden';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.dataset.modal = 'player';
        const dialog = document.createElement('article');
        dialog.className = 'player-modal';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        overlay.appendChild(dialog);

        const header = document.createElement('header');
        header.className = 'player-modal-header';
        dialog.appendChild(header);

        const titleGroup = document.createElement('div');
        titleGroup.className = 'player-modal-title';
        header.appendChild(titleGroup);

        const avatar = document.createElement('div');
        avatar.className = 'player-modal-avatar';
        titleGroup.appendChild(avatar);

        const textGroup = document.createElement('div');
        textGroup.className = 'player-modal-heading';
        titleGroup.appendChild(textGroup);

        const name = document.createElement('div');
        name.className = 'player-modal-name';
        textGroup.appendChild(name);

        const persona = document.createElement('div');
        persona.className = 'player-modal-persona muted';
        textGroup.appendChild(persona);

        const meta = document.createElement('div');
        meta.className = 'player-modal-meta';
        textGroup.appendChild(meta);

        const badges = document.createElement('div');
        badges.className = 'player-modal-badges';
        textGroup.appendChild(badges);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn ghost small player-modal-close';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close player details');
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'player-modal-body';
        dialog.appendChild(body);

        const loading = document.createElement('div');
        loading.className = 'player-modal-loading muted small hidden';
        loading.textContent = 'Loading latest profile…';
        body.appendChild(loading);

        const details = document.createElement('dl');
        details.className = 'player-modal-details';
        body.appendChild(details);

        const eventsWrap = document.createElement('section');
        eventsWrap.className = 'player-modal-events';
        const eventsTitle = document.createElement('h4');
        eventsTitle.textContent = 'Recent events';
        eventsWrap.appendChild(eventsTitle);
        const eventsList = document.createElement('ul');
        eventsList.className = 'player-event-list';
        eventsWrap.appendChild(eventsList);
        body.appendChild(eventsWrap);

        const footer = document.createElement('footer');
        footer.className = 'player-modal-footer';
        dialog.appendChild(footer);

        const status = document.createElement('div');
        status.className = 'player-modal-status hidden';
        footer.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'player-modal-actions';
        const forceNameBtn = document.createElement('button');
        forceNameBtn.type = 'button';
        forceNameBtn.className = 'btn ghost small';
        forceNameBtn.textContent = 'Force display name';
        actions.appendChild(forceNameBtn);
        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'btn small';
        refreshBtn.textContent = 'Force Steam Refresh';
        actions.appendChild(refreshBtn);
        const steamProfileBtn = document.createElement('button');
        steamProfileBtn.type = 'button';
        steamProfileBtn.className = 'btn ghost small hidden';
        steamProfileBtn.textContent = 'Open Steam Profile';
        actions.appendChild(steamProfileBtn);
        const serverArmourBtn = document.createElement('button');
        serverArmourBtn.type = 'button';
        serverArmourBtn.className = 'btn ghost small hidden';
        serverArmourBtn.textContent = 'Server Armour';
        actions.appendChild(serverArmourBtn);
        footer.appendChild(actions);

        document.body.appendChild(overlay);

        const hide = () => closeModal();
        const onBackdrop = (ev) => {
          if (ev.target === overlay) hide();
        };
        const onKeyDown = (ev) => {
          if (ev.key === 'Escape') hide();
        };

        const openSteamProfile = () => {
          const url = steamProfileBtn.dataset.url;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        };

        const openServerArmour = () => {
          const url = serverArmourBtn.dataset.url;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        };

        overlay.addEventListener('click', onBackdrop);
        dialog.addEventListener('click', (ev) => ev.stopPropagation());
        closeBtn.addEventListener('click', hide);
        refreshBtn.addEventListener('click', forceSteamRefresh);
        forceNameBtn.addEventListener('click', forceDisplayName);
        steamProfileBtn.addEventListener('click', openSteamProfile);
        serverArmourBtn.addEventListener('click', openServerArmour);

        return {
          show() {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            overlay.scrollTop = 0;
            document.addEventListener('keydown', onKeyDown);
            setTimeout(() => closeBtn.focus(), 50);
          },
          hide() {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            document.removeEventListener('keydown', onKeyDown);
          },
          elements: {
            avatar,
            name,
            persona,
            meta,
            badges,
            details,
            events: eventsList,
            status,
            refreshBtn,
            forceNameBtn,
            steamProfileBtn,
            serverArmourBtn,
            loading
          },
          overlay,
          destroy() {
            document.removeEventListener('keydown', onKeyDown);
            overlay.removeEventListener('click', onBackdrop);
            closeBtn.removeEventListener('click', hide);
            refreshBtn.removeEventListener('click', forceSteamRefresh);
            forceNameBtn.removeEventListener('click', forceDisplayName);
            steamProfileBtn.removeEventListener('click', openSteamProfile);
            serverArmourBtn.removeEventListener('click', openServerArmour);
            overlay.remove();
          }
        };
      }

      const offLogin = ctx.on?.('auth:login', () => refresh('login'));
      const offServerConnect = ctx.on?.('server:connected', ({ serverId }) => {
        refresh('server-connect', serverId);
      });
      const offServerDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId != null && Number(serverId) === Number(state.serverId)) {
          state.serverId = null;
          list.innerHTML = '';
          setMessage('Select a server to view player directory.');
          state.players = [];
          state.mode = 'idle';
          updateCount(null, null, null);
          state.page = 0;
          state.offset = 0;
          state.totalCount = 0;
          state.filteredCount = 0;
          state.serverSearch = '';
          state.viewCounts = { displayed: 0, filtered: 0, total: 0 };
          renderPagination();
        }
      });
      const offRefresh = ctx.on?.('players:refresh', (payload) => {
        const nextServer = Number(payload?.serverId ?? state.serverId);
        refresh(payload?.reason || 'manual', Number.isFinite(nextServer) ? nextServer : undefined);
      });
      const offLogout = ctx.on?.('auth:logout', () => {
        list.innerHTML = '';
        setMessage('Sign in to view player directory.');
        state.serverId = null;
        state.players = [];
        state.mode = 'idle';
        updateCount(null, null, null);
        state.page = 0;
        state.offset = 0;
        state.totalCount = 0;
        state.filteredCount = 0;
        state.serverSearch = '';
        state.viewCounts = { displayed: 0, filtered: 0, total: 0 };
        renderPagination();
      });

      ctx.onCleanup?.(() => offLogin?.());
      ctx.onCleanup?.(() => offServerConnect?.());
      ctx.onCleanup?.(() => offServerDisconnect?.());
      ctx.onCleanup?.(() => offRefresh?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => modal?.destroy?.());
      ctx.onCleanup?.(() => closeModal());
      ctx.onCleanup?.(() => {
        if (searchListener) window.removeEventListener('players:search', searchListener);
        if (externalOpenListener) window.removeEventListener('players:open-profile', externalOpenListener);
        if (externalCloseListener) window.removeEventListener('players:close-profile', externalCloseListener);
      });
      ctx.onCleanup?.(() => {
        prevButton.removeEventListener('click', onPrevPage);
        nextButton.removeEventListener('click', onNextPage);
      });

      // Initial state when module mounts
      updateCount(null, null, null);
      refresh('init');
    }
  });
})();
