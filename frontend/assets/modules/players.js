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
        refreshing: false
      };

      const modal = createPlayerModal();

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
          li.dataset.steamid = p.steamid || '';
          li.tabIndex = 0;
          li.setAttribute('role', 'button');
          const left = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = p.display_name || p.persona || p.steamid;
          left.appendChild(strong);
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
          list.appendChild(li);
        }
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
        const displayName = combined.display_name || combined.persona || combined.steamid || 'Unknown player';
        const persona = combined.persona || '—';
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
        }
        if (modal.elements.persona) modal.elements.persona.textContent = persona && persona !== displayName ? persona : '';
        if (modal.elements.details) {
          const entries = [
            ['Display name', combined.display_name || '—'],
            ['Persona', persona],
            ['Steam ID', steamid],
            ['Country', country || '—'],
            ['First seen', formatTimestamp(combined.first_seen) || '—'],
            ['Last seen', formatTimestamp(combined.last_seen) || '—'],
            ['Last address', combined.last_ip ? `${combined.last_ip}${combined.last_port ? ':' + combined.last_port : ''}` : '—'],
            ['Rust playtime', formatPlaytime(combined.rust_playtime_minutes, combined.visibility)],
            ['Profile visibility', formatVisibility(combined.visibility)],
            ['VAC ban', Number(combined.vac_banned) > 0 ? 'Yes' : 'No'],
            ['Game bans', `${Number(combined.game_bans || 0) || 0}`],
            ['Last ban', formatLastBan(combined.last_ban_days)],
            ['Profile updated', formatTimestamp(combined.updated_at) || '—'],
            ['Playtime updated', formatTimestamp(combined.playtime_updated_at) || '—']
          ];
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
          modal.elements.refreshBtn.disabled = modalState.refreshing || !hasSteam;
          modal.elements.refreshBtn.textContent = modalState.refreshing ? 'Refreshing…' : 'Force Steam Refresh';
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
        if (!modalState.open || !modalState.steamid || modalState.refreshing) return;
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

        return {
          show() {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
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
            profileLink,
            loading
          },
          overlay,
          destroy() {
            document.removeEventListener('keydown', onKeyDown);
            overlay.removeEventListener('click', onBackdrop);
            closeBtn.removeEventListener('click', hide);
            refreshBtn.removeEventListener('click', forceSteamRefresh);
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
