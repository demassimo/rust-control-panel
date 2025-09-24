// Simple event bus contracts used by modules:
// window.dispatchEvent(new CustomEvent('player:selected', { detail: { player, teamKey } }))
// window.dispatchEvent(new CustomEvent('team:clear'))
// window.dispatchEvent(new CustomEvent('players:list', { detail: { players } }))

(() => {
  const infoTitle = document.getElementById('info-title');
  const infoContent = document.getElementById('info-content');
  const playerCount = document.getElementById('player-count');
  const showAllBtn = document.getElementById('show-all');

  // When map or list selects a player → show Player Info panel
  window.addEventListener('player:selected', (ev) => {
    const { player } = ev.detail || {};
    if (!player) return;
    infoTitle.textContent = 'Player Info';
    infoContent.innerHTML = `
      <div class="kv"><div class="k">Name:</div><div>${escapeHtml(player.displayName || player.DisplayName)}</div></div>
      <div class="kv"><div class="k">Steam ID:</div><div>${player.steamId || player.SteamID}</div></div>
      <div class="kv"><div class="k">Health:</div><div>${Math.round(player.health ?? player.Health)}/100</div></div>
      <div class="kv"><div class="k">Ping:</div><div>${player.ping ?? player.Ping} ms</div></div>
      <div class="kv"><div class="k">Position:</div><div>(${Math.round(player.position?.x ?? player.Position?.x)}, ${Math.round(player.position?.z ?? player.Position?.z)})</div></div>
    `;
    // Optionally inject Kick/Ban controls here...
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

  showAllBtn?.addEventListener('click', () => {
    // notify map/list modules to clear filters
    window.dispatchEvent(new CustomEvent('team:clear'));
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
})();
