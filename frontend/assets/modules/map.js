(function(){
  if (typeof window.registerModule !== 'function') return;

  const COLOR_PALETTE = ['#f97316','#22d3ee','#a855f7','#84cc16','#ef4444','#facc15','#14b8a6','#e11d48','#3b82f6','#8b5cf6','#10b981','#fb7185'];
  const POLL_INTERVAL = 20000;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${total % 60}s`;
  }

  function formatHealth(value) {
    if (!Number.isFinite(value)) return '—';
    return `${Math.round(value)}`;
  }

  function formatPing(value) {
    if (!Number.isFinite(value)) return '—';
    return `${Math.round(value)}ms`;
  }

  function generateColor(index) {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 55%)`;
  }

  window.registerModule({
    id: 'live-map',
    title: 'Live map',
    order: 20,
    setup(ctx){
      ctx.root?.classList.add('module-card','live-map-card');

      const message = document.createElement('p');
      message.className = 'module-message hidden';
      ctx.body?.appendChild(message);

      const layout = document.createElement('div');
      layout.className = 'map-layout';
      ctx.body?.appendChild(layout);

      const mapView = document.createElement('div');
      mapView.className = 'map-view';
      const mapImage = document.createElement('img');
      mapImage.alt = 'Rust world map';
      mapImage.loading = 'lazy';
      const overlay = document.createElement('div');
      overlay.className = 'map-overlay';
      mapView.appendChild(mapImage);
      mapView.appendChild(overlay);

      const sidebar = document.createElement('div');
      sidebar.className = 'map-sidebar';

      const summary = document.createElement('div');
      summary.className = 'map-summary';
      sidebar.appendChild(summary);

      const filterRow = document.createElement('div');
      filterRow.className = 'row';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'ghost small';
      clearBtn.textContent = 'Show everyone';
      clearBtn.disabled = true;
      filterRow.appendChild(clearBtn);
      sidebar.appendChild(filterRow);

      const listWrap = document.createElement('div');
      listWrap.className = 'map-player-list';
      sidebar.appendChild(listWrap);

      const teamInfo = document.createElement('div');
      teamInfo.className = 'map-team-info';
      sidebar.appendChild(teamInfo);

      const uploadWrap = document.createElement('div');
      uploadWrap.className = 'map-upload hidden';
      const uploadText = document.createElement('p');
      uploadText.innerHTML = 'RustMaps does not provide imagery for this world yet. Run <code>world.rendermap</code> on your server, then upload the generated image.';
      const uploadActions = document.createElement('div');
      uploadActions.className = 'map-upload-actions';
      const uploadInput = document.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = 'image/png,image/jpeg,image/webp';
      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'ghost';
      uploadBtn.textContent = 'Upload map image';
      uploadActions.appendChild(uploadInput);
      uploadActions.appendChild(uploadBtn);
      const uploadStatus = document.createElement('p');
      uploadStatus.className = 'notice hidden';
      uploadWrap.appendChild(uploadText);
      uploadWrap.appendChild(uploadActions);
      uploadWrap.appendChild(uploadStatus);
      sidebar.appendChild(uploadWrap);
      uploadInput.addEventListener('change', () => hideUploadNotice());
      uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleUpload().catch((err) => ctx.log?.('Map upload failed: ' + (err?.message || err)));
      });

      layout.appendChild(mapView);
      layout.appendChild(sidebar);

      const state = {
        serverId: null,
        players: [],
        mapMeta: null,
        serverInfo: null,
        teamColors: new Map(),
        selectedTeam: null,
        selectedSolo: null,
        lastUpdated: null,
        pollTimer: null
      };

      function showUploadNotice(message, variant = 'error') {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = 'notice ' + (variant === 'success' ? 'success' : 'error');
      }

      function hideUploadNotice() {
        if (!uploadStatus) return;
        uploadStatus.className = 'notice hidden';
        uploadStatus.textContent = '';
      }

      function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('read_failed'));
          reader.readAsDataURL(file);
        });
      }

      function setMessage(content) {
        if (!message) return;
        message.innerHTML = '';
        if (content instanceof Node) {
          message.appendChild(content);
        } else if (typeof content === 'string') {
          message.textContent = content;
        } else if (content != null) {
          message.textContent = String(content);
        }
        message.classList.remove('hidden');
      }

      function clearMessage() {
        if (!message) return;
        message.innerHTML = '';
        message.classList.add('hidden');
      }

      function stopPolling() {
        if (state.pollTimer) {
          clearInterval(state.pollTimer);
          state.pollTimer = null;
        }
      }

      function schedulePolling() {
        stopPolling();
        if (!state.serverId) return;
        state.pollTimer = setInterval(() => {
          refreshData('poll').catch((err) => ctx.log?.('Map refresh failed: ' + (err?.message || err)));
        }, POLL_INTERVAL);
      }

      function teamKey(player) {
        return Number(player?.teamId) > 0 ? Number(player.teamId) : 0;
      }

      function ensureTeamColors(players) {
        const presentTeams = new Set();
        let index = 0;
        for (const player of players) {
          const key = teamKey(player);
          if (key <= 0) continue;
          presentTeams.add(key);
          if (!state.teamColors.has(key)) {
            const color = COLOR_PALETTE[index] || generateColor(index);
            state.teamColors.set(key, color);
            index += 1;
          }
        }
        for (const key of [...state.teamColors.keys()]) {
          if (!presentTeams.has(key)) state.teamColors.delete(key);
        }
      }

      function colorForPlayer(player) {
        const key = teamKey(player);
        if (key > 0 && state.teamColors.has(key)) return state.teamColors.get(key);
        if (key > 0) {
          const fallbackIndex = state.teamColors.size;
          const color = COLOR_PALETTE[fallbackIndex] || generateColor(fallbackIndex);
          state.teamColors.set(key, color);
          return color;
        }
        const sid = player?.steamId || '';
        let hash = 0;
        for (let i = 0; i < sid.length; i++) hash = (hash * 31 + sid.charCodeAt(i)) >>> 0;
        const hue = (hash % 360);
        return `hsl(${hue}, 12%, 72%)`;
      }

      function mapReady() {
        if (!state.mapMeta || !state.mapMeta.imageUrl) return false;
        const size = Number(state.mapMeta.size ?? state.serverInfo?.size);
        return Number.isFinite(size) && size > 0;
      }

      function updateUploadSection() {
        if (!uploadWrap) return;
        const needsUpload = !!(state.mapMeta && state.mapMeta.custom && !state.mapMeta.imageUrl);
        if (needsUpload) {
          uploadWrap.classList.remove('hidden');
        } else {
          uploadWrap.classList.add('hidden');
          hideUploadNotice();
        }
      }

      async function handleUpload() {
        if (!state.serverId) {
          showUploadNotice('Connect to a server before uploading.');
          return;
        }
        const file = uploadInput?.files?.[0];
        if (!file) {
          showUploadNotice('Choose an image before uploading.');
          return;
        }
        hideUploadNotice();
        uploadBtn.disabled = true;
        const previousLabel = uploadBtn.textContent;
        uploadBtn.textContent = 'Uploading…';
        try {
          const dataUrl = await readFileAsDataURL(file);
          const payload = { image: dataUrl, mapKey: state.mapMeta?.mapKey || null };
          const response = await ctx.api(`/api/servers/${state.serverId}/map-image`, payload, 'POST');
          if (response?.map) {
            state.mapMeta = response.map;
            showUploadNotice('Map image uploaded successfully.', 'success');
            clearMessage();
            updateUploadSection();
            renderAll();
          } else {
            showUploadNotice('Map image uploaded.', 'success');
          }
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            return;
          }
          const code = ctx.errorCode?.(err);
          if (code === 'missing_image') showUploadNotice('Choose an image before uploading.');
          else if (code === 'invalid_image') showUploadNotice('The selected image could not be processed.');
          else if (code === 'image_too_large') showUploadNotice('The image is too large. Please upload a file under 20 MB.');
          else showUploadNotice(ctx.describeError?.(err) || 'Uploading the map image failed.');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = previousLabel;
          if (uploadInput) uploadInput.value = '';
        }
      }

      function projectPosition(position) {
        if (!mapReady()) return null;
        const size = Number(state.mapMeta?.size ?? state.serverInfo?.size);
        if (!Number.isFinite(size) || size <= 0) return null;
        const x = Number(position?.x) || 0;
        const z = Number(position?.z) || 0;
        const px = clamp(((x + size / 2) / size) * 100, 0, 100);
        const pz = clamp(((z + size / 2) / size) * 100, 0, 100);
        return { left: px, top: 100 - pz };
      }

      function updateMapImage(meta) {
        if (!meta?.imageUrl && !meta?.rawImageUrl) {
          mapImage.removeAttribute('src');
          return;
        }
        const next = meta.imageUrl || meta.rawImageUrl;
        if (mapImage.getAttribute('src') !== next) {
          mapImage.src = next;
        }
      }

      function shouldDisplay(player) {
        if (state.selectedSolo) return player.steamId === state.selectedSolo;
        if (state.selectedTeam) return Number(player.teamId) === state.selectedTeam;
        return true;
      }

      function renderMarkers() {
        overlay.innerHTML = '';
        if (!mapReady()) return;
        for (const player of state.players) {
          const position = projectPosition(player.position);
          if (!position) continue;
          const marker = document.createElement('div');
          marker.className = 'map-marker';
          marker.style.backgroundColor = colorForPlayer(player);
          marker.style.left = position.left + '%';
          marker.style.top = position.top + '%';
          marker.title = player.displayName || player.persona || player.steamId;
          if (!shouldDisplay(player)) marker.classList.add('dimmed');
          if (state.selectedSolo && state.selectedSolo === player.steamId) marker.classList.add('active');
          if (!state.selectedSolo && state.selectedTeam && Number(player.teamId) === state.selectedTeam) marker.classList.add('active');
          marker.addEventListener('click', (e) => {
            e.stopPropagation();
            selectPlayer(player);
          });
          overlay.appendChild(marker);
        }
      }

      function renderPlayerList() {
        listWrap.innerHTML = '';
        const players = state.players.filter((p) => shouldDisplay(p));
        if (players.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'module-message';
          empty.textContent = state.serverId ? 'No players online for this selection.' : 'Connect to a server to view live positions.';
          listWrap.appendChild(empty);
          return;
        }
        for (const player of players) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = player.displayName || player.persona || player.steamId;
          const tag = document.createElement('span');
          tag.className = 'map-player-tag';
          tag.innerHTML = `<span>${formatPing(player.ping)}</span><span>${formatHealth(player.health)} hp</span>`;
          btn.appendChild(tag);
          if (state.selectedSolo && state.selectedSolo === player.steamId) btn.classList.add('active');
          if (!state.selectedSolo && state.selectedTeam && Number(player.teamId) === state.selectedTeam) btn.classList.add('active');
          btn.style.borderLeft = `4px solid ${colorForPlayer(player)}`;
          btn.addEventListener('click', () => selectPlayer(player));
          listWrap.appendChild(btn);
        }
      }

      function renderSummary() {
        summary.innerHTML = '';
        const total = state.players.length;
        const teamCounts = new Map();
        let soloCount = 0;
        for (const p of state.players) {
          const key = teamKey(p);
          if (key > 0) teamCounts.set(key, (teamCounts.get(key) || 0) + 1);
          else soloCount += 1;
        }
        const mapName = state.serverInfo?.mapName || state.serverInfo?.map || 'Procedural Map';
        const metaLines = [
          { label: 'Players online', value: total },
          { label: 'Teams', value: teamCounts.size },
          { label: 'Solo players', value: soloCount }
        ];
        const mapSize = state.mapMeta?.size ?? state.serverInfo?.size;
        if (mapSize) metaLines.push({ label: 'World size', value: mapSize });
        const mapSeed = state.mapMeta?.seed ?? state.serverInfo?.seed;
        if (mapSeed) metaLines.push({ label: 'Seed', value: mapSeed });
        if (state.mapMeta?.cachedAt) {
          const cachedTs = new Date(state.mapMeta.cachedAt);
          metaLines.push({ label: 'Cached', value: cachedTs.toLocaleString() });
        }
        if (state.mapMeta?.imageUrl) {
          const source = state.mapMeta.custom ? 'Uploaded image' : state.mapMeta.localImage ? 'Cached copy' : 'RustMaps';
          metaLines.push({ label: 'Source', value: source });
        }
        if (state.lastUpdated) {
          const ts = new Date(state.lastUpdated);
          metaLines.push({ label: 'Updated', value: ts.toLocaleTimeString() });
        }
        const title = document.createElement('div');
        title.innerHTML = `<strong>${mapName}</strong>`;
        summary.appendChild(title);
        for (const item of metaLines) {
          const row = document.createElement('div');
          row.innerHTML = `<strong>${item.value ?? '—'}</strong> ${item.label}`;
          summary.appendChild(row);
        }
      }

      function renderTeamInfo() {
        teamInfo.innerHTML = '';
        if (!state.players.length) {
          teamInfo.innerHTML = '<strong>No live data</strong><p class="muted">Connect to a server to see team breakdowns.</p>';
          return;
        }
        if (!state.selectedTeam && !state.selectedSolo) {
          teamInfo.innerHTML = '<strong>Select a player</strong><p class="muted">Click a player or marker to focus on their team.</p>';
          return;
        }
        const collection = state.selectedSolo
          ? state.players.filter((p) => p.steamId === state.selectedSolo)
          : state.players.filter((p) => Number(p.teamId) === state.selectedTeam);
        if (collection.length === 0) {
          teamInfo.innerHTML = '<strong>No matching players</strong><p class="muted">They might have disconnected.</p>';
          return;
        }
        const color = colorForPlayer(collection[0]);
        const heading = document.createElement('div');
        heading.innerHTML = `<strong>${state.selectedSolo ? 'Solo player' : 'Team ' + state.selectedTeam}</strong>`;
        const colorChip = document.createElement('span');
        colorChip.className = 'map-color-chip';
        colorChip.style.background = color;
        heading.appendChild(document.createTextNode(' '));
        heading.appendChild(colorChip);
        teamInfo.appendChild(heading);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = state.selectedSolo ? 'Individual survivor stats' : `${collection.length} member(s)`;
        teamInfo.appendChild(detail);
        const list = document.createElement('ul');
        list.className = 'map-team-members';
        for (const player of collection) {
          const li = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = player.displayName || player.persona || player.steamId;
          const stats = document.createElement('span');
          stats.textContent = `${formatHealth(player.health)} hp · ${formatDuration(player.connectedSeconds)}`;
          li.appendChild(name);
          li.appendChild(stats);
          list.appendChild(li);
        }
        teamInfo.appendChild(list);
      }

      function renderAll() {
        ensureTeamColors(state.players);
        updateMapImage(state.mapMeta);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        clearBtn.disabled = !state.selectedSolo && !state.selectedTeam;
      }

      function clearSelection() {
        state.selectedTeam = null;
        state.selectedSolo = null;
        renderAll();
      }

      function selectPlayer(player) {
        const key = teamKey(player);
        if (key > 0) {
          state.selectedTeam = state.selectedTeam === key ? null : key;
          state.selectedSolo = null;
        } else {
          state.selectedSolo = state.selectedSolo === player.steamId ? null : player.steamId;
          state.selectedTeam = null;
        }
        renderAll();
      }

      clearBtn.addEventListener('click', () => clearSelection());
      mapView.addEventListener('click', () => clearSelection());

      async function refreshData(reason) {
        if (!state.serverId) return;
        hideUploadNotice();
        if (reason !== 'poll') setMessage('Loading live map data…');
        try {
          const data = await ctx.api(`/api/servers/${state.serverId}/live-map`);
          state.players = Array.isArray(data?.players) ? data.players : [];
          state.mapMeta = data?.map || null;
          state.serverInfo = data?.info || null;
          state.lastUpdated = data?.fetchedAt || new Date().toISOString();
          updateUploadSection();
          if (!state.mapMeta) {
            setMessage('Waiting for map metadata…');
          } else if (state.mapMeta?.notFound) {
            const wrap = document.createElement('span');
            wrap.textContent = 'RustMaps has not published imagery for this seed yet. Try again shortly or upload your render below.';
            setMessage(wrap);
          } else if (state.mapMeta?.custom && !state.mapMeta?.imageUrl) {
            setMessage('Upload your rendered map image to enable the live map.');
          } else if (!mapReady()) {
            setMessage('Map metadata is incomplete. Try again shortly.');
          } else {
            clearMessage();
          }
          renderAll();
        } catch (err) {
          const code = ctx.errorCode?.(err);
          if (code === 'unauthorized') {
            ctx.handleUnauthorized?.();
            return;
          }
          if (code === 'rustmaps_api_key_missing') {
            const wrap = document.createElement('span');
            wrap.textContent = 'Add your RustMaps API key in Settings to enable the live map. ';
            if (typeof ctx.openSettings === 'function') {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'link';
              btn.textContent = 'Open settings';
              btn.addEventListener('click', () => ctx.openSettings());
              wrap.appendChild(btn);
            }
            setMessage(wrap);
            return;
          }
          if (code === 'rustmaps_unauthorized') {
            setMessage('RustMaps rejected your API key. Update it in Settings.');
            return;
          }
          const detail = ctx.describeError?.(err) || err?.message || 'Unable to fetch live map data.';
          setMessage(detail);
          ctx.log?.('Live map error: ' + (err?.message || err));
        }
      }

      const offConnect = ctx.on?.('server:connected', ({ serverId }) => {
        if (!serverId) return;
        state.serverId = serverId;
        clearSelection();
        refreshData('server-connected');
        schedulePolling();
      });

      const offDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId && serverId === state.serverId) {
          stopPolling();
          state.serverId = null;
          state.players = [];
          state.mapMeta = null;
          state.serverInfo = null;
          state.lastUpdated = null;
          clearSelection();
          overlay.innerHTML = '';
          mapImage.removeAttribute('src');
          renderPlayerList();
          renderSummary();
          renderTeamInfo();
          updateUploadSection();
          hideUploadNotice();
          setMessage('Connect to a server to load the live map.');
        }
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        stopPolling();
        state.serverId = null;
        state.players = [];
        state.mapMeta = null;
        state.serverInfo = null;
        state.lastUpdated = null;
        clearSelection();
        overlay.innerHTML = '';
        mapImage.removeAttribute('src');
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        hideUploadNotice();
        setMessage('Sign in and connect to a server to view the live map.');
      });

      const offSettingsUpdate = ctx.on?.('settings:updated', () => {
        if (state.serverId && (!state.mapMeta || !mapReady())) {
          refreshData('settings');
        }
      });

      ctx.onCleanup?.(() => offConnect?.());
      ctx.onCleanup?.(() => offDisconnect?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => offSettingsUpdate?.());
      ctx.onCleanup?.(() => stopPolling());

      setMessage('Connect to a server to load the live map.');
    }
  });
})();
