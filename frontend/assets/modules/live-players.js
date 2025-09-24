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
      ctx.root?.classList.add('module-card', 'live-players-card');

      const message = document.createElement('p');
      message.className = 'module-message hidden';
      ctx.body?.appendChild(message);

      const list = document.createElement('div');
      list.className = 'live-players-list';
      ctx.body?.appendChild(list);

      let clearBtn = null;
      let clearHandler = null;

      function bindClearButton() {
        clearBtn = document.getElementById('show-all');
        if (!clearBtn) return;
        if (clearHandler) clearBtn.removeEventListener('click', clearHandler);
        clearHandler = () => {
          ctx.emit?.('live-players:focus', { steamId: null });
        };
        clearBtn.addEventListener('click', clearHandler);
      }

      bindClearButton();

      const state = {
        serverId: null,
        players: [],
        selected: null
      };

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

      function updateCount() {
        const badge = document.getElementById('player-count');
        if (!badge) return;
        badge.textContent = `(${state.players.length})`;
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
        updateCount();
        list.innerHTML = '';
        if (!state.serverId) {
          setMessage('Connect to a server to view connected players.');
          return;
        }
        if (state.players.length === 0) {
          setMessage('No players connected right now.');
          return;
        }
        clearMessage();
        for (const player of state.players) {
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
          if (profile.country) {
            const badge = document.createElement('span');
            badge.className = 'badge country';
            badge.textContent = profile.country;
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
          if (Number.isFinite(profile.daysSinceLastBan)) {
            const last = document.createElement('span');
            last.className = 'badge warn';
            last.textContent = `${profile.daysSinceLastBan}d since last ban`;
            badges.appendChild(last);
          }
          if (badges.childElementCount > 0) details.appendChild(badges);

          row.appendChild(details);

          row.addEventListener('click', () => {
            state.selected = player.steamId || null;
            highlightRows();
            ctx.emit?.('live-players:focus', { steamId: player.steamId, player });
            window.dispatchEvent(new CustomEvent('player:selected', { detail: { player } }));
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
      ctx.onCleanup?.(() => {
        if (clearBtn && clearHandler) clearBtn.removeEventListener('click', clearHandler);
      });
      ctx.onCleanup?.(() => window.removeEventListener('team:clear', onTeamClear));

      setMessage('Connect to a server to view connected players.');
    }
  });
})();
