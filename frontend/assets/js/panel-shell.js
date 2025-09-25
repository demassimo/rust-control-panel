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
    const playtimeText = formatPlaytime(profile.rustPlaytimeMinutes, profile.visibility);
    const vacText = profile.vacBanned ? 'Yes' : 'No';
    const gameBanCount = Number(profile.gameBans) > 0 ? Number(profile.gameBans) : 0;
    const rawDaysSinceBan = Number(profile.daysSinceLastBan);
    const hasBanAge = Number.isFinite(rawDaysSinceBan) && rawDaysSinceBan >= 0;
    const lastBan = hasBanAge
      ? rawDaysSinceBan === 0
        ? 'Today'
        : `${rawDaysSinceBan} day${rawDaysSinceBan === 1 ? '' : 's'} ago`
      : '—';
    const ipText = player.ip ? `${player.ip}${player.port ? ':' + player.port : ''}` : 'Hidden';
    const position = player.position || player.Position || {};
    const positionText = `${Math.round(position.x ?? 0)}, ${Math.round(position.z ?? 0)}`;
    const nameValue = profile.profileUrl
      ? `<a href="${escapeAttr(profile.profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(displayName)}</a>`
      : escapeHtml(displayName);
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
    `;
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
