// Simple event bus contracts used by modules:
// window.dispatchEvent(new CustomEvent('player:selected', { detail: { player, teamKey } }))
// window.dispatchEvent(new CustomEvent('team:clear'))
// window.dispatchEvent(new CustomEvent('players:list', { detail: { players } }))

(() => {
  const infoTitle = document.getElementById('info-title');
  const infoContent = document.getElementById('info-content');
  const playerCount = document.getElementById('player-count');

  // When map or list selects a player → show Player Info panel
  window.addEventListener('player:selected', (ev) => {
    const { player } = ev.detail || {};
    if (!player) return;
    const profile = player.steamProfile || {};
    const displayName = profile.persona || player.displayName || player.DisplayName || player.steamId || player.SteamID || 'Player';
    const steamProfileUrl = profile.profileUrl;
    const steamIdValue = player.steamId || player.SteamID || '';
    const serverArmourUrl = steamIdValue ? `https://serverarmour.com/profile/${encodeURIComponent(steamIdValue)}` : '';
    const playtimeText = formatPlaytime(profile.rustPlaytimeMinutes, profile.visibility);
    const vacText = profile.vacBanned ? 'Yes' : 'No';
    const gameBanCount = Number(profile.gameBans) > 0 ? Number(profile.gameBans) : 0;
    const lastBan = Number.isFinite(Number(profile.daysSinceLastBan)) ? `${profile.daysSinceLastBan} day${profile.daysSinceLastBan === 1 ? '' : 's'} ago` : '—';
    const ipText = player.ip ? `${player.ip}${player.port ? ':' + player.port : ''}` : 'Hidden';
    const position = player.position || player.Position || {};
    const positionText = `${Math.round(position.x ?? 0)}, ${Math.round(position.z ?? 0)}`;
    const nameValue = escapeHtml(displayName);
    const actions = [];
    if (steamProfileUrl) {
      actions.push('<button type="button" class="ghost small" data-action="steam-profile">Steam profile</button>');
    }
    if (serverArmourUrl) {
      actions.push('<button type="button" class="ghost small" data-action="server-armour">Server Armour</button>');
    }
    const actionsBlock = actions.length ? `<div class="profile-actions">${actions.join('')}</div>` : '';
    infoTitle.textContent = 'Player Info';
    infoContent.innerHTML = `
      <div class="kv"><div class="k">Name:</div><div>${nameValue}</div></div>
      <div class="kv"><div class="k">Steam ID:</div><div>${escapeHtml(player.steamId || player.SteamID || '—')}</div></div>
      <div class="kv"><div class="k">Health:</div><div>${Math.round(player.health ?? player.Health ?? 0)}/100</div></div>
      <div class="kv"><div class="k">Ping:</div><div>${Math.round(player.ping ?? player.Ping ?? 0)} ms</div></div>
      <div class="kv"><div class="k">Connected:</div><div>${formatConnected(player.connectedSeconds ?? player.ConnectedSeconds)}</div></div>
      <div class="kv"><div class="k">Rust playtime:</div><div>${playtimeText}</div></div>
      <div class="kv"><div class="k">VAC ban:</div><div>${vacText}</div></div>
      <div class="kv"><div class="k">Game bans:</div><div>${gameBanCount || '0'}${gameBanCount ? ` (${lastBan})` : ''}</div></div>
      <div class="kv"><div class="k">Country:</div><div>${escapeHtml(profile.country || '—')}</div></div>
      <div class="kv"><div class="k">Address:</div><div>${escapeHtml(ipText)}</div></div>
      <div class="kv"><div class="k">Position:</div><div>(${positionText})</div></div>
      ${actionsBlock}
    `;
    const steamBtn = infoContent.querySelector('[data-action="steam-profile"]');
    if (steamBtn && steamProfileUrl) {
      steamBtn.addEventListener('click', () => {
        window.open(steamProfileUrl, '_blank', 'noopener,noreferrer');
      });
    }
    const armourBtn = infoContent.querySelector('[data-action="server-armour"]');
    if (armourBtn && serverArmourUrl) {
      armourBtn.addEventListener('click', () => {
        window.open(serverArmourUrl, '_blank', 'noopener,noreferrer');
      });
    }
  });

  // Show server info again
  function resetInfoToServer(){
    infoTitle.textContent = 'Server Info';
    infoContent.innerHTML = `<div data-module="server-info"></div>`;
    // your module-loader will hydrate it again if it observes DOM mutations;
    // otherwise call a tiny re-init here if needed.
  }

  window.addEventListener('team:clear', resetInfoToServer);

  // Update player count & wire bottom list "Show All"
  window.addEventListener('players:list', (ev) => {
    const { players } = ev.detail || {};
    if (Array.isArray(players)) playerCount.textContent = `(${players.length})`;
  });

  function escapeHtml(str = '') {
    const replacements = new Map([
      ['&', '&amp;'],
      ['<', '&lt;'],
      ['>', '&gt;'],
      ['"', '&quot;'],
      ["'", '&#39;'],
    ]);
    return str.replace(/[&<>"']/g, (s) => replacements.get(s) ?? s);
  }

  function escapeAttr(str = '') {
    return String(str).replace(/["'><]/g, (ch) => ({ '"': '&quot;', "'": '&#39;', '>': '&gt;', '<': '&lt;' }[ch] || ch));
  }

  function formatConnected(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return '—';
    const total = Math.max(0, Math.floor(value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${total % 60}s`;
  }

  function formatPlaytime(minutes, visibility) {
    const value = Number(minutes);
    if (!Number.isFinite(value)) {
      return visibility === 3 ? 'No recorded hours' : 'Profile private';
    }
    if (value <= 0) return 'No recorded hours';
    const hours = value / 60;
    if (hours >= 100) return `${Math.round(hours)} h`;
    return `${hours.toFixed(1)} h`;
  }
})();
