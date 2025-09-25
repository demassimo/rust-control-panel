(function(){
  if (typeof window.registerModule !== 'function') return;

  window.registerModule({
    id: 'players-directory',
    title: 'All Players',
    order: 10,
    setup(ctx){
      const list = document.createElement('ul');
      list.className = 'player-directory';
      const message = document.createElement('p');
      message.className = 'module-message hidden';
      message.textContent = 'Sign in to view player directory.';
      ctx.body?.appendChild(list);
      ctx.body?.appendChild(message);

      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
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

      const modalState = {
        open: false,
        steamid: null,
        base: null,
        details: null,
        refreshing: false,
        updatingName: false
      };

      const modal = createPlayerModal();

      function highlightActiveRow() {
        const activeId = modalState.open ? modalState.steamid : null;
        const rows = list.querySelectorAll('li[data-steamid]');
        rows.forEach((row) => {
          const rowId = row.dataset.steamid || '';
          row.classList.toggle('active', !!activeId && rowId === activeId);
        });
      }

      function getCombinedPlayer() {
        return { ...(modalState.base || {}), ...(modalState.details || {}) };
      }

      function render(players) {
        list.innerHTML = '';
        state.players = Array.isArray(players) ? players : [];
        window.dispatchEvent?.(new CustomEvent('players:list', { detail: { players: state.players } }));
        if (!Array.isArray(players) || players.length === 0) {
          setMessage('No tracked players for this server yet. Import Steam profiles or let players connect to populate this list.');
          return;
        }
        clearMessage();
        for (const p of players) {
          const li = document.createElement('li');
          li.className = 'player-directory-row';
          li.dataset.steamid = p.steamid || '';
          li.tabIndex = 0;
          li.setAttribute('role', 'button');
          const left = document.createElement('div');
          const nameRow = document.createElement('div');
          nameRow.className = 'player-name-row';
          const strong = document.createElement('strong');
          const displayLabel = p.display_name || p.persona || p.steamid;
          strong.textContent = displayLabel;
          nameRow.appendChild(strong);
          if (p.forced_display_name) {
            const forcedBadge = document.createElement('span');
            forcedBadge.className = 'badge warn';
            forcedBadge.textContent = 'Forced';
            nameRow.appendChild(forcedBadge);
          }
          left.appendChild(nameRow);
          const meta = document.createElement('div');
          meta.className = 'muted small';
          const lastSeen = formatTimestamp(p.last_seen);
          const parts = [];
          parts.push(p.steamid || '—');
          if (p.last_ip) {
            const endpoint = p.last_port ? `${p.last_ip}:${p.last_port}` : p.last_ip;
            parts.push(endpoint);
          }
          if (lastSeen) parts.push(`Last seen ${lastSeen}`);
          meta.textContent = parts.join(' · ');
          left.appendChild(meta);
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
          const openDetails = () => openModal(p);
          li.addEventListener('click', openDetails);
          li.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              openDetails();
            }
          });
          if (modalState.open && modalState.steamid && modalState.steamid === String(p.steamid || '')) {
            li.classList.add('active');
          }
          list.appendChild(li);
        }
        highlightActiveRow();
        if (modalState.open && modalState.steamid) {
          const updated = state.players.find((player) => String(player.steamid || '') === modalState.steamid);
          if (updated) renderModal(updated, null);
        }
      }

      const state = {
        serverId: null,
        isLoading: false,
        players: []
      };

      async function refresh(reason, serverIdOverride){
        if (state.isLoading) return;
        const globalState = ctx.getState?.();
        if (!globalState?.currentUser) {
          list.innerHTML = '';
          setMessage('Sign in to view player directory.');
          return;
        }
        const serverId = Number(serverIdOverride ?? state.serverId ?? globalState.currentServerId);
        if (!Number.isFinite(serverId)) {
          state.serverId = null;
          list.innerHTML = '';
          setMessage('Select a server to view player directory.');
          return;
        }
        state.serverId = serverId;
        state.isLoading = true;
        setMessage('Loading players…');
        try {
          const players = await ctx.api(`/api/servers/${serverId}/players?limit=200`);
          render(players);
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
          } else {
            setMessage('Unable to load players: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'));
            ctx.log?.('Players module error: ' + (err?.message || err));
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
        highlightActiveRow();
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
        highlightActiveRow();
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
          const forced = typeof combined.forced_display_name === 'string' && combined.forced_display_name;
          const persona = (combined.persona || '').trim();
          if (modalState.updatingName) {
            modal.elements.forceNameBtn.textContent = 'Saving…';
          } else if (forced) {
            modal.elements.forceNameBtn.textContent = 'Clear forced name';
          } else {
            modal.elements.forceNameBtn.textContent = persona ? 'Force Steam persona' : 'Force display name';
          }
          modal.elements.forceNameBtn.disabled = busy || !hasSteam || !Number.isFinite(serverId) || (!forced && !persona);
        }
        if (modal.elements.nicknameBtn) {
          const globalState = ctx.getState?.();
          const serverId = Number(state.serverId ?? globalState?.currentServerId);
          const hasSteam = Boolean(combined.steamid);
          const busy = modalState.refreshing || modalState.updatingName;
          const forced = typeof combined.forced_display_name === 'string' && combined.forced_display_name;
          modal.elements.nicknameBtn.textContent = forced ? 'Edit nickname' : 'Add nickname';
          modal.elements.nicknameBtn.disabled = busy || !hasSteam || !Number.isFinite(serverId);
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

      async function updateForcedName(nextValue, { startMessage, successMessage, successVariant = 'success' }) {
        const globalState = ctx.getState?.();
        const serverId = Number(state.serverId ?? globalState?.currentServerId);
        if (!Number.isFinite(serverId)) {
          setModalStatus('Select a server to change display names.', 'warn');
          return;
        }
        const trimming = typeof nextValue === 'string' ? nextValue.trim().slice(0, 190) : '';
        const next = trimming.length > 0 ? trimming : '';
        const clearing = !next;
        if (!modalState.open || !modalState.steamid || modalState.refreshing || modalState.updatingName) return;
        modalState.updatingName = true;
        renderModal(null, null);
        if (startMessage) setModalStatus(startMessage);
        try {
          await ctx.api(`/api/servers/${serverId}/players/${modalState.steamid}`, { display_name: clearing ? null : next }, 'PATCH');
          if (successMessage) setModalStatus(successMessage, successVariant);
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

      async function forceDisplayName() {
        if (!modalState.open || !modalState.steamid || modalState.refreshing || modalState.updatingName) return;
        const combined = getCombinedPlayer();
        const persona = (combined.persona || '').trim();
        const fallback = combined.display_name || combined.raw_display_name || combined.steamid || '';
        const forced = typeof combined.forced_display_name === 'string' && combined.forced_display_name
          ? combined.forced_display_name
          : '';
        if (forced) {
          if (persona && persona !== forced) {
            await updateForcedName(persona, { startMessage: 'Forcing Steam persona…', successMessage: 'Steam persona forced for this server.' });
          } else {
            await updateForcedName('', { startMessage: 'Clearing forced display name…', successMessage: 'Forced name cleared.' });
          }
          return;
        }
        const target = persona || fallback;
        if (!target) {
          setModalStatus('Steam persona is not available for this player.', 'warn');
          return;
        }
        await updateForcedName(target, { startMessage: 'Forcing Steam persona…', successMessage: 'Steam persona forced for this server.' });
      }

      async function promptNickname() {
        if (!modalState.open || !modalState.steamid || modalState.refreshing || modalState.updatingName) return;
        const combined = getCombinedPlayer();
        const forced = typeof combined.forced_display_name === 'string' && combined.forced_display_name
          ? combined.forced_display_name
          : '';
        const seed = forced || combined.raw_display_name || combined.display_name || combined.persona || combined.steamid || '';
        const input = window.prompt('Enter a nickname for this player. Leave blank to clear the forced name.', seed);
        if (input === null) return;
        const trimmed = input.trim();
        if (!trimmed) {
          if (!forced) {
            setModalStatus('No nickname entered.', 'warn');
            return;
          }
          await updateForcedName('', { startMessage: 'Clearing forced display name…', successMessage: 'Forced name cleared.' });
          return;
        }
        if (trimmed === forced) return;
        const message = forced ? 'Updating nickname…' : 'Saving nickname…';
        const success = forced ? 'Nickname updated.' : 'Nickname saved.';
        await updateForcedName(trimmed, { startMessage: message, successMessage: success });
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
        forceNameBtn.textContent = 'Force Steam persona';
        actions.appendChild(forceNameBtn);
        const nicknameBtn = document.createElement('button');
        nicknameBtn.type = 'button';
        nicknameBtn.className = 'btn ghost small';
        nicknameBtn.textContent = 'Add nickname';
        actions.appendChild(nicknameBtn);
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
        nicknameBtn.addEventListener('click', promptNickname);

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
            nicknameBtn,
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
            nicknameBtn.removeEventListener('click', promptNickname);
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
      });

      ctx.onCleanup?.(() => offLogin?.());
      ctx.onCleanup?.(() => offServerConnect?.());
      ctx.onCleanup?.(() => offServerDisconnect?.());
      ctx.onCleanup?.(() => offRefresh?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => modal?.destroy?.());
      ctx.onCleanup?.(() => closeModal());

      // Initial state when module mounts
      refresh('init');
    }
  });
})();
