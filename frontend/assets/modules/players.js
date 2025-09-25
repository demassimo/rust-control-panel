(function(){
  if (typeof window.registerModule !== 'function') return;

  window.registerModule({
    id: 'players-directory',
    title: 'All Players',
    order: 10,
    setup(ctx){
      const moduleId = 'players-directory';
      const sharedSearchKey = '__playerSearchQuery';
      if (typeof window !== 'undefined' && typeof window[sharedSearchKey] !== 'string') {
        window[sharedSearchKey] = '';
      }

      const list = document.createElement('ul');
      list.className = 'player-directory';
      const message = document.createElement('p');
      message.className = 'module-message hidden';
      message.textContent = 'Sign in to view player directory.';
      ctx.body?.appendChild(list);
      ctx.body?.appendChild(message);

      let searchInput = null;
      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const searchWrap = document.createElement('div');
        searchWrap.className = 'module-search';
        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search players';
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('aria-label', 'Search players');
        searchWrap.appendChild(searchInput);
        ctx.actions.appendChild(searchWrap);
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

      function updateCount(filtered, total) {
        if (!directoryCount) return;
        if (filtered == null && total == null) {
          directoryCount.textContent = '(—)';
          return;
        }
        const filteredNumber = Number(filtered);
        const totalNumber = Number(total);
        const safeFiltered = Number.isFinite(filteredNumber) ? Math.max(0, Math.round(filteredNumber)) : 0;
        if (Number.isFinite(totalNumber) && totalNumber >= 0) {
          const safeTotal = Math.max(0, Math.round(totalNumber));
          directoryCount.textContent = safeTotal !== safeFiltered
            ? `(${safeFiltered}/${safeTotal})`
            : `(${safeFiltered})`;
          return;
        }
        directoryCount.textContent = `(${safeFiltered})`;
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

      function render(players) {
        state.players = Array.isArray(players) ? players : [];
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
        if (state.mode !== 'ready') return;
        list.innerHTML = '';
        const total = state.players.length;
        const filtered = getFilteredPlayers();
        updateCount(filtered.length, total);
        if (total === 0) {
          setMessage('No tracked players for this server yet. Import Steam profiles or let players connect to populate this list.');
          return;
        }
        if (filtered.length === 0) {
          setMessage('No players match your search.');
          return;
        }
        clearMessage();
        for (const p of filtered) {
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
          meta.textContent = parts.join(' · ');
          info.appendChild(meta);

          identity.appendChild(avatarWrap);
          identity.appendChild(info);
          li.appendChild(identity);

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
        mode: 'idle'
      };

      function setSearch(value, { skipBroadcast = false } = {}) {
        const raw = typeof value === 'string' ? value : '';
        if (state.searchRaw === raw) return;
        state.searchRaw = raw;
        state.search = normalizeQuery(raw);
        if (searchInput && searchInput.value !== raw) searchInput.value = raw;
        if (!skipBroadcast) broadcastSearch(raw);
        if (state.mode === 'ready') renderList();
      }

      const initialSearch = readSharedQuery();
      state.searchRaw = initialSearch;
      state.search = normalizeQuery(initialSearch);
      if (searchInput) {
        searchInput.value = state.searchRaw;
        searchInput.addEventListener('input', (ev) => setSearch(ev.target.value));
      }

      let searchListener = null;
      if (typeof window !== 'undefined') {
        searchListener = (event) => {
          if (!event) return;
          const source = event.detail?.source;
          if (source === moduleId) return;
          setSearch(event.detail?.query || '', { skipBroadcast: true });
        };
        window.addEventListener('players:search', searchListener);
      }

      async function refresh(reason, serverIdOverride){
        if (state.isLoading) return;
        const globalState = ctx.getState?.();
        if (!globalState?.currentUser) {
          list.innerHTML = '';
          setMessage('Sign in to view player directory.');
          state.players = [];
          state.mode = 'idle';
          updateCount(null, null);
          return;
        }
        const serverId = Number(serverIdOverride ?? state.serverId ?? globalState.currentServerId);
        if (!Number.isFinite(serverId)) {
          state.serverId = null;
          list.innerHTML = '';
          setMessage('Select a server to view player directory.');
          state.players = [];
          state.mode = 'idle';
          updateCount(null, null);
          return;
        }
        state.serverId = serverId;
        state.isLoading = true;
        state.mode = 'loading';
        setMessage('Loading players…');
        updateCount(null, null);
        try {
          const players = await ctx.api(`/api/servers/${serverId}/players?limit=200`);
          render(players);
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
          } else {
            setMessage('Unable to load players: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'));
            ctx.log?.('Players module error: ' + (err?.message || err));
            if (!state.players.length) {
              state.mode = 'error';
              updateCount(null, null);
            }
          }
        } finally {
          state.isLoading = false;
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

      function formatLastBan(days) {
        const value = Number(days);
        if (!Number.isFinite(value) || value < 0) return '—';
        if (value === 0) return 'Today';
        if (value === 1) return '1 day ago';
        return `${value} days ago`;
      }

      function avatarInitial(name = '') {
        const trimmed = String(name || '').trim();
        if (!trimmed) return '?';
        return String.fromCodePoint(trimmed.codePointAt(0) || 63).toUpperCase();
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
          if (country) {
            const badge = document.createElement('span');
            badge.className = 'badge country';
            badge.textContent = country;
            modal.elements.badges.appendChild(badge);
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
          entries.push(['Country', country || '—']);
          entries.push(['First seen', formatTimestamp(combined.first_seen) || '—']);
          entries.push(['Last seen', formatTimestamp(combined.last_seen) || '—']);
          entries.push(['Last address', combined.last_ip ? `${combined.last_ip}${combined.last_port ? ':' + combined.last_port : ''}` : '—']);
          entries.push(['Rust playtime', formatPlaytime(combined.rust_playtime_minutes, combined.visibility)]);
          entries.push(['Profile visibility', formatVisibility(combined.visibility)]);
          entries.push(['VAC ban', Number(combined.vac_banned) > 0 ? 'Yes' : 'No']);
          entries.push(['Game bans', `${Number(combined.game_bans || 0) || 0}`]);
          entries.push(['Last ban', formatLastBan(combined.last_ban_days)]);
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
        if (modal.elements.profileLink) {
          if (profileUrl) {
            modal.elements.profileLink.classList.remove('hidden');
            modal.elements.profileLink.href = profileUrl;
          } else {
            modal.elements.profileLink.classList.add('hidden');
            modal.elements.profileLink.removeAttribute('href');
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
          const details = await ctx.api(`/api/players/${steamid}`);
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
          await ctx.api('/api/steam/sync', { steamids: [modalState.steamid] }, 'POST');
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
        const input = window.prompt('Enter a display name for this server. Leave blank to restore the live name.', initial);
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
          await ctx.api(`/api/servers/${serverId}/players/${modalState.steamid}`, { display_name: clearing ? null : next }, 'PATCH');
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
        const profileLink = document.createElement('a');
        profileLink.className = 'btn ghost small hidden';
        profileLink.textContent = 'Open Steam Profile';
        profileLink.target = '_blank';
        profileLink.rel = 'noreferrer';
        actions.appendChild(profileLink);
        footer.appendChild(actions);

        document.body.appendChild(overlay);

        const hide = () => closeModal();
        const onBackdrop = (ev) => {
          if (ev.target === overlay) hide();
        };
        const onKeyDown = (ev) => {
          if (ev.key === 'Escape') hide();
        };

        overlay.addEventListener('click', onBackdrop);
        dialog.addEventListener('click', (ev) => ev.stopPropagation());
        closeBtn.addEventListener('click', hide);
        refreshBtn.addEventListener('click', forceSteamRefresh);
        forceNameBtn.addEventListener('click', forceDisplayName);

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
            profileLink,
            loading
          },
          overlay,
          destroy() {
            document.removeEventListener('keydown', onKeyDown);
            overlay.removeEventListener('click', onBackdrop);
            closeBtn.removeEventListener('click', hide);
            refreshBtn.removeEventListener('click', forceSteamRefresh);
            forceNameBtn.removeEventListener('click', forceDisplayName);
            overlay.remove();
          }
        };
      }

      const offLogin = ctx.on?.('auth:login', () => refresh('login'));
      const offServerConnect = ctx.on?.('server:connected', ({ serverId }) => {
        state.serverId = Number(serverId);
        refresh('server-connect', serverId);
      });
      const offServerDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId != null && Number(serverId) === Number(state.serverId)) {
          state.serverId = null;
          list.innerHTML = '';
          setMessage('Select a server to view player directory.');
          state.players = [];
          state.mode = 'idle';
          updateCount(null, null);
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
        updateCount(null, null);
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
      });

      // Initial state when module mounts
      updateCount(null, null);
      refresh('init');
    }
  });
})();
