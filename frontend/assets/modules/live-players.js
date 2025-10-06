(function(){
  if (typeof window.registerModule !== 'function') return;

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${total % 60}s`;
  }

  function formatPlaytime(minutes) {
    if (!Number.isFinite(minutes)) return 'Profile private';
    if (minutes <= 0) return 'No recorded hours';
    const hours = minutes / 60;
    if (hours >= 100) return `${Math.round(hours)} h`;
    return `${hours.toFixed(1)} h`;
  }

  function formatLastBanLabel(days) {
    const value = Number(days);
    if (!Number.isFinite(value) || value < 0) return 'Unknown';
    if (value === 0) return 'Today';
    if (value === 1) return '1 day ago';
    return `${value} days ago`;
  }

  function resolveLastBanBadge(gameBans, lastBanDays, vacBanned = false) {
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

  function mapPlayerForDirectory(player) {
    if (!player) return null;
    const profile = player.steamProfile || {};
    const steamId = player.steamId || player.steamid || player.SteamID || profile.steamId || profile.steamid || '';
    const steamid = String(steamId || '').trim();
    const displayName = player.displayName || profile.persona || profile.personaName || steamid || 'Unknown player';
    const profileUrl = profile.profileUrl || profile.profileurl || '';
    const avatarFull = profile.avatarFull || profile.avatarfull || profile.avatar || '';
    const rustMinutes = profile.rustPlaytimeMinutes;
    const lastBanDays = profile.daysSinceLastBan;
    const gameBans = Number(profile.gameBans || 0) || 0;
    const hasBanRecord = gameBans > 0 || Boolean(profile.vacBanned);
    const lastBanValue = Number.isFinite(Number(lastBanDays)) && Number(lastBanDays) >= 0 && hasBanRecord
      ? Number(lastBanDays)
      : null;
    const payload = {
      steamid,
      display_name: displayName,
      raw_display_name: player.displayName || profile.persona || '',
      persona: profile.persona || profile.personaName || '',
      profileurl: profileUrl,
      profile_url: profileUrl,
      avatar: profile.avatar || '',
      avatarfull: avatarFull,
      country: profile.country || '',
      vac_banned: profile.vacBanned ? 1 : 0,
      game_bans: gameBans,
      last_ban_days: lastBanValue,
      rust_playtime_minutes: Number.isFinite(Number(rustMinutes)) ? Number(rustMinutes) : null,
      visibility: profile.visibility ?? null,
      last_ip: player.ip || null,
      last_port: Number.isFinite(Number(player.port)) ? Number(player.port) : null,
      first_seen: player.firstSeen ?? player.first_seen ?? null,
      last_seen: player.lastSeen ?? player.last_seen ?? null,
    };
    if (player.ip_country_code || player.ipCountryCode) {
      payload.ip_country_code = player.ip_country_code || player.ipCountryCode;
    }
    if (player.ip_country_name || player.ipCountryName) {
      payload.ip_country_name = player.ip_country_name || player.ipCountryName;
    }
    return payload;
  }

  function avatarInitial(name = '') {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const codePoint = trimmed.codePointAt(0);
    return String.fromCodePoint(codePoint).toUpperCase();
  }

  window.registerModule({
    id: 'live-players',
    title: 'Connected Players',
    order: 30,
    setup(ctx){
      const moduleId = 'live-players';
      const sharedSearchKey = '__playerSearchQuery';
      if (typeof window !== 'undefined' && typeof window[sharedSearchKey] !== 'string') {
        window[sharedSearchKey] = '';
      }

      ctx.root?.classList.add('module-card', 'live-players-card');

      const message = document.createElement('p');
      message.className = 'module-message hidden';
      ctx.body?.appendChild(message);

      const list = document.createElement('div');
      list.className = 'live-players-list';
      ctx.body?.appendChild(list);

      let searchInput = null;
      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const searchWrap = document.createElement('div');
        searchWrap.className = 'module-search';
        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search players, Steam ID or IP';
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('inputmode', 'search');
        searchInput.setAttribute('role', 'searchbox');
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.setAttribute('aria-label', 'Search connected players by name, Steam ID, or IP address');
        searchWrap.appendChild(searchInput);
        ctx.actions.appendChild(searchWrap);
      }

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

      const state = {
        serverId: null,
        players: [],
        selected: null,
        rawQuery: '',
        query: ''
      };

      function getFilteredPlayers() {
        if (!state.query) return [...state.players];
        const query = state.query;
        return state.players.filter((player) => matchesQuery(player, query));
      }

      function matchesQuery(player, query) {
        if (!query) return true;
        const profile = player?.steamProfile || {};
        const values = [
          player?.displayName,
          profile.persona,
          profile.personaName,
          profile.realName,
          player?.steamId,
          profile.steamId,
          player?.ip,
          player?.clanTag,
          player?.teamName,
          profile.country
        ];
        if (values.some((value) => includesQuery(value, query))) return true;
        if (player?.port != null && String(player.port).includes(query)) return true;
        return false;
      }

      function setMessage(text, variant = 'info') {
        if (!message) return;
        message.textContent = text;
        message.dataset.variant = variant;
        message.classList.remove('hidden');
      }

      function clearMessage() {
        if (!message) return;
        message.textContent = '';
        message.classList.add('hidden');
        message.removeAttribute('data-variant');
      }

      function updateCount(filtered = null, total = null) {
        const badge = document.getElementById('player-count');
        if (!badge) return;
        const totalCount = Number.isFinite(Number(total)) ? Math.max(0, Math.round(Number(total))) : state.players.length;
        const filteredCount = Number.isFinite(Number(filtered))
          ? Math.max(0, Math.round(Number(filtered)))
          : (state.query ? getFilteredPlayers().length : totalCount);
        if (state.query && filteredCount !== totalCount) {
          badge.textContent = `(${filteredCount}/${totalCount})`;
        } else {
          badge.textContent = `(${filteredCount})`;
        }
      }

      function setSearch(value, { skipBroadcast = false } = {}) {
        const raw = typeof value === 'string' ? value : '';
        if (state.rawQuery === raw) return;
        state.rawQuery = raw;
        state.query = normalizeQuery(raw);
        if (searchInput && searchInput.value !== raw) searchInput.value = raw;
        if (!skipBroadcast) broadcastSearch(raw);
        if (state.serverId || state.players.length) {
          render();
        } else {
          updateCount(0, 0);
        }
      }

      const initialSearch = readSharedQuery();
      state.rawQuery = initialSearch;
      state.query = normalizeQuery(initialSearch);
      if (searchInput) {
        searchInput.value = state.rawQuery;
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

      function highlightRows() {
        const rows = list.querySelectorAll('.live-player-row');
        rows.forEach((row) => {
          if (!state.selected) {
            row.classList.remove('active');
            return;
          }
          if (row.dataset.steamid === state.selected) row.classList.add('active');
          else row.classList.remove('active');
        });
      }

      function render() {
        const total = state.players.length;
        const filtered = getFilteredPlayers();
        updateCount(filtered.length, total);
        list.innerHTML = '';
        if (!state.serverId) {
          setMessage('Connect to a server to view connected players.');
          return;
        }
        if (total === 0) {
          setMessage('No players connected right now.');
          return;
        }
        if (filtered.length === 0) {
          setMessage('No players match your search.');
          return;
        }
        clearMessage();
        if (state.selected && !state.players.some((p) => (p.steamId || '') === state.selected)) {
          state.selected = null;
          ctx.emit?.('live-players:focus', { steamId: null });
          window.dispatchEvent(new CustomEvent('team:clear'));
        }
        for (const player of filtered) {
          const row = document.createElement('article');
          row.className = 'live-player-row';
          row.dataset.steamid = player.steamId || '';

          const identity = document.createElement('div');
          identity.className = 'live-player-identity';

          const avatarWrap = document.createElement('div');
          avatarWrap.className = 'live-player-avatar';
          const profile = player.steamProfile || {};
          if (profile.avatar) {
            const img = document.createElement('img');
            img.src = profile.avatar;
            img.alt = `${player.displayName || profile.persona || player.steamId || 'Player'} avatar`;
            img.loading = 'lazy';
            avatarWrap.appendChild(img);
          } else {
            avatarWrap.classList.add('placeholder');
            avatarWrap.textContent = avatarInitial(player.displayName || profile.persona || player.steamId || '');
          }

          const meta = document.createElement('div');
          meta.className = 'live-player-meta';
          const nameRow = document.createElement('div');
          nameRow.className = 'live-player-name';
          const displayName = player.displayName || profile.persona || player.steamId || 'Unknown player';
          if (profile.profileUrl) {
            const link = document.createElement('a');
            link.href = profile.profileUrl;
            link.target = '_blank';
            link.rel = 'noreferrer';
            link.textContent = displayName;
            nameRow.appendChild(link);
          } else {
            nameRow.textContent = displayName;
          }
          const ipCountryCode = player.ip_country_code || player.ipCountryCode || '';
          const ipCountryName = player.ip_country_name || player.ipCountryName || '';
          const steamCountryCode = profile.country || '';
          const badgeCountryCode = ipCountryCode || steamCountryCode;
          if (badgeCountryCode) {
            const badge = document.createElement('span');
            badge.className = 'badge country';
            badge.textContent = badgeCountryCode;
            const badgeTitle = ipCountryCode
              ? (ipCountryName && ipCountryName !== badgeCountryCode ? ipCountryName : '')
              : '';
            if (badgeTitle) badge.title = badgeTitle;
            nameRow.appendChild(badge);
          }
          meta.appendChild(nameRow);

          const steamIdLine = document.createElement('div');
          steamIdLine.className = 'live-player-sub';
          steamIdLine.textContent = player.steamId || '—';
          meta.appendChild(steamIdLine);

          const ipLine = document.createElement('div');
          ipLine.className = 'live-player-sub';
          ipLine.textContent = player.ip ? `${player.ip}${player.port ? ':' + player.port : ''}` : 'IP hidden';
          meta.appendChild(ipLine);

          const connectedLine = document.createElement('div');
          connectedLine.className = 'live-player-sub';
          connectedLine.textContent = `Connected ${formatDuration(player.connectedSeconds)}`;
          meta.appendChild(connectedLine);

          const playtimeLine = document.createElement('div');
          playtimeLine.className = 'live-player-sub live-player-hours';
          playtimeLine.textContent = `Rust playtime · ${formatPlaytime(profile.rustPlaytimeMinutes)}`;
          meta.appendChild(playtimeLine);

          identity.appendChild(avatarWrap);
          identity.appendChild(meta);
          row.appendChild(identity);

          const details = document.createElement('div');
          details.className = 'live-player-details';

          const stats = document.createElement('div');
          stats.className = 'live-player-stats';
          const health = document.createElement('span');
          health.className = 'stat health';
          health.textContent = `${Math.round(player.health ?? 0)} hp`;
          stats.appendChild(health);
          const ping = document.createElement('span');
          ping.className = 'stat ping';
          ping.textContent = `${Math.round(player.ping ?? 0)} ms`;
          stats.appendChild(ping);
          const violation = Number(player.violationLevel ?? player.ViolationLevel ?? 0);
          if (violation > 0) {
            const vio = document.createElement('span');
            vio.className = 'stat violation';
            vio.textContent = `Violation ${violation}`;
            stats.appendChild(vio);
          }
          details.appendChild(stats);

          const badges = document.createElement('div');
          badges.className = 'live-player-badges';
          if (profile.vacBanned) {
            const vac = document.createElement('span');
            vac.className = 'badge vac';
            vac.textContent = 'VAC ban';
            badges.appendChild(vac);
          }
          if (Number(profile.gameBans) > 0) {
            const gameBan = document.createElement('span');
            gameBan.className = 'badge gameban';
            gameBan.textContent = `${profile.gameBans} game ban${profile.gameBans > 1 ? 's' : ''}`;
            badges.appendChild(gameBan);
          }
          const lastBanInfo = resolveLastBanBadge(profile.gameBans, profile.daysSinceLastBan, profile.vacBanned);
          if (lastBanInfo) {
            const last = document.createElement('span');
            last.className = `badge last-ban ${lastBanInfo.tone}`.trim();
            last.textContent = `Last ban: ${lastBanInfo.label}`;
            badges.appendChild(last);
          }
          if (badges.childElementCount > 0) details.appendChild(badges);

          row.appendChild(details);

          row.addEventListener('click', () => {
            const rawSteamId = player.steamId || player.steamid || player.SteamID || null;
            const steamId = rawSteamId ? String(rawSteamId) : null;
            const sameSelection = state.selected && steamId && state.selected === steamId;
            state.selected = sameSelection ? null : steamId;
            highlightRows();
            if (state.selected) {
              ctx.emit?.('live-players:focus', { steamId: player.steamId, player });
              window.dispatchEvent(new CustomEvent('player:selected', { detail: { player } }));
              const payload = mapPlayerForDirectory(player);
              window.dispatchEvent(new CustomEvent('players:open-profile', {
                detail: {
                  steamId: steamId || payload?.steamid || '',
                  player: payload,
                  source: moduleId
                }
              }));
            } else {
              ctx.emit?.('live-players:focus', { steamId: null });
              window.dispatchEvent(new CustomEvent('team:clear'));
              window.dispatchEvent(new CustomEvent('players:close-profile', {
                detail: {
                  steamId: steamId || '',
                  source: moduleId
                }
              }));
            }
          });

          list.appendChild(row);
        }
        highlightRows();
      }

      const offConnect = ctx.on?.('server:connected', ({ serverId }) => {
        state.serverId = serverId;
        setMessage('Loading players…');
      });

      const offDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId && serverId === state.serverId) {
          state.serverId = null;
          state.players = [];
          state.selected = null;
          list.innerHTML = '';
          setMessage('Connect to a server to view connected players.');
          updateCount();
        }
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        state.serverId = null;
        state.players = [];
        state.selected = null;
        list.innerHTML = '';
        setMessage('Sign in to view connected players.');
        updateCount();
      });

      const offData = ctx.on?.('live-players:data', ({ players, serverId }) => {
        if (Number.isFinite(Number(serverId)) && state.serverId && Number(serverId) !== Number(state.serverId)) return;
        state.players = Array.isArray(players) ? players : [];
        render();
      });

      const offHighlight = ctx.on?.('live-players:highlight', ({ steamId }) => {
        state.selected = steamId || null;
        highlightRows();
      });

      const onTeamClear = () => {
        state.selected = null;
        highlightRows();
      };
      window.addEventListener('team:clear', onTeamClear);

      ctx.onCleanup?.(() => offConnect?.());
      ctx.onCleanup?.(() => offDisconnect?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => offData?.());
      ctx.onCleanup?.(() => offHighlight?.());
      ctx.onCleanup?.(() => window.removeEventListener('team:clear', onTeamClear));
      ctx.onCleanup?.(() => {
        if (searchListener) window.removeEventListener('players:search', searchListener);
      });

      setMessage('Connect to a server to view connected players.');
    }
  });
})();
