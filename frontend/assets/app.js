(() => {
  const $ = (sel) => document.querySelector(sel);
  const serversEl = $('#servers');
  const consoleEl = $('#console');
  const playersEl = $('#players');
  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const userBox = $('#userBox');

  let API = localStorage.getItem('apiBase') || $('#apiBase').value;
  let TOKEN = localStorage.getItem('token') || '';
  let socket = null;
  let currentServerId = null;

  const ui = {
    showLogin() { loginPanel.classList.remove('hidden'); appPanel.classList.add('hidden'); },
    showApp() { loginPanel.classList.add('hidden'); appPanel.classList.remove('hidden'); },
    log(line) {
      const time = new Date().toLocaleTimeString();
      consoleEl.textContent += `[${time}] ${line}\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    },
    setUser(u){ userBox.textContent = u ? `Signed in as ${u}` : ''; }
  };

  $('#btnLogin').onclick = async () => {
    API = $('#apiBase').value.trim().replace(/\/$/, '');
    localStorage.setItem('apiBase', API);
    const username = $('#username').value.trim();
    const password = $('#password').value;
    const r = await fetch(API + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const j = await r.json();
    if (!r.ok) { alert('Login failed: ' + (j.error||r.status)); return; }
    TOKEN = j.token; localStorage.setItem('token', TOKEN);
    ui.setUser(j.username);
    ui.showApp();
    await refreshServers();
  };

  async function api(path, body=null, method='GET') {
    const headers = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
    const r = await fetch(API + path, { method, headers, body: body?JSON.stringify(body):undefined });
    if (!r.ok) throw new Error((await r.json()).error || 'api_error');
    return await r.json();
  }

  async function refreshServers() {
    serversEl.innerHTML = '';
    const list = await api('/api/servers');
    for (const s of list) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.innerHTML = `<div>${s.name} <span class="badge">${s.host}:${s.port}${s.tls?' (wss)':''}</span></div><div class="muted small">#${s.id}</div>`;
      const right = document.createElement('div');
      const btn = document.createElement('button');
      btn.textContent = 'Connect';
      btn.onclick = () => connectServer(s.id);
      right.appendChild(btn);
      li.appendChild(left); li.appendChild(right);
      serversEl.appendChild(li);
    }
  }

  async function connectServer(id) {
    if (socket) { socket.disconnect(); socket = null; }
    currentServerId = id;
    socket = io(API, { transports: ['websocket'] });
    socket.on('connect', () => {
      socket.emit('join-server', id);
      ui.log('Joined server #' + id);
      loadPlayers();
    });
    socket.on('console', (msg) => {
      if (msg?.Message) ui.log(msg.Message.trim());
      if (/SteamID|players connected|id :/.test(msg.Message||'')) rebuildPlayers(msg.Message);
    });
    socket.on('error', (e) => ui.log('Error: ' + e));
  }

  function rebuildPlayers(text) {
    playersEl.innerHTML = '';
    const lines = (text||'').split(/\r?\n/).filter(Boolean);
    for (const ln of lines) {
      const li = document.createElement('li');
      li.textContent = ln.trim();
      playersEl.appendChild(li);
    }
  }

  async function loadPlayers() {
    try {
      const list = await api('/api/players?limit=200');
      playersEl.innerHTML = '';
      for (const p of list) {
        const li = document.createElement('li');
        li.innerHTML = `
          <div>
            <div><strong>${p.persona||p.steamid}</strong> <span class="badge">${p.country||''}</span></div>
            <div class="small muted">${p.steamid}</div>
          </div>
          <div>
            ${p.vac_banned ? '<span class="badge">VAC</span>' : ''}
          </div>`;
        playersEl.appendChild(li);
      }
    } catch (e) { ui.log('Players load failed: ' + e.message); }
  }

  const syncBtn = document.createElement('button');
  syncBtn.textContent = 'Sync From Steam (IDs)';
  syncBtn.onclick = async () => {
    const raw = prompt('Enter comma-separated Steam64 IDs to sync:');
    if (!raw) return;
    const steamids = raw.split(',').map(s=>s.trim()).filter(Boolean);
    try {
      const res = await api('/api/steam/sync', { steamids }, 'POST');
      ui.log('Synced ' + res.updated + ' players from Steam');
      await loadPlayers();
    } catch (e) { alert('Sync failed: ' + e.message); }
  };
  (() => { const card = playersEl.closest('.card'); if (card) { const h3 = card.querySelector('h3'); const span = document.createElement('span'); span.style.float='right'; span.appendChild(syncBtn); h3.appendChild(span); } })();

  if (TOKEN) {
    ui.setUser('…');
    ui.showApp();
    try { await refreshServers(); } catch { ui.showLogin(); }
  } else { ui.showLogin(); }
})();