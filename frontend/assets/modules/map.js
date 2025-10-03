(function(){
  if (typeof window.registerModule !== 'function') return;

  const COLOR_PALETTE = ['#f97316','#22d3ee','#a855f7','#84cc16','#ef4444','#facc15','#14b8a6','#e11d48','#3b82f6','#8b5cf6','#10b981','#fb7185'];
  const DEFAULT_POLL_INTERVAL = 20000;
  const MIN_POLL_INTERVAL = 5000;
  const MAX_POLL_INTERVAL = 120000;
  const PLAYER_REFRESH_INTERVAL = 60000;
  const WORLD_SYNC_THROTTLE = 15000;
  const REFRESH_STORAGE_KEY = 'live-map:poll-interval';
  const STATUS_MESSAGE_STORAGE_KEY = 'live-map:last-status-message';
  const REFRESH_OPTIONS = [
    { value: 5000, label: 'Every 5 seconds' },
    { value: 10000, label: 'Every 10 seconds' },
    { value: 20000, label: 'Every 20 seconds' },
    { value: 30000, label: 'Every 30 seconds' },
    { value: 60000, label: 'Every minute' },
    { value: 120000, label: 'Every 2 minutes' }
  ];

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

  function normaliseRefreshInterval(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_POLL_INTERVAL;
    return clamp(numeric, MIN_POLL_INTERVAL, MAX_POLL_INTERVAL);
  }

  function loadRefreshInterval() {
    if (typeof window === 'undefined') return DEFAULT_POLL_INTERVAL;
    try {
      const stored = window.localStorage?.getItem?.(REFRESH_STORAGE_KEY);
      if (stored == null) return DEFAULT_POLL_INTERVAL;
      return normaliseRefreshInterval(stored);
    } catch (err) {
      return DEFAULT_POLL_INTERVAL;
    }
  }

  function persistRefreshInterval(value) {
    if (typeof window === 'undefined') return;
    try {
      const interval = normaliseRefreshInterval(value);
      window.localStorage?.setItem?.(REFRESH_STORAGE_KEY, String(interval));
    } catch (err) {
      // Ignore storage errors
    }
  }

  let cachedStatusMessage = null;

  function loadPersistentStatusMessage() {
    if (cachedStatusMessage) return cachedStatusMessage;
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage?.getItem?.(STATUS_MESSAGE_STORAGE_KEY);
      if (!raw) {
        cachedStatusMessage = null;
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        cachedStatusMessage = null;
        return null;
      }
      const message = typeof parsed.message === 'string' ? parsed.message : null;
      if (!message) {
        cachedStatusMessage = null;
        return null;
      }
      const serverId = parsed.serverId == null ? null : String(parsed.serverId);
      cachedStatusMessage = { message, serverId };
      return cachedStatusMessage;
    } catch (err) {
      cachedStatusMessage = null;
      return null;
    }
  }

  function savePersistentStatusMessage(message, serverId) {
    if (typeof window === 'undefined') return;
    if (!message) {
      clearPersistentStatusMessage();
      return;
    }
    const payload = { message: String(message) };
    if (serverId != null) payload.serverId = String(serverId);
    try {
      window.localStorage?.setItem?.(STATUS_MESSAGE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Ignore storage errors
    }
    cachedStatusMessage = {
      message: String(message),
      serverId: payload.serverId == null ? null : String(payload.serverId)
    };
  }

  function clearPersistentStatusMessage() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.removeItem?.(STATUS_MESSAGE_STORAGE_KEY);
    } catch (err) {
      // Ignore storage errors
    }
    cachedStatusMessage = null;
  }

  function hasPersistentStatusForServer(serverId) {
    const stored = loadPersistentStatusMessage();
    if (!stored || !stored.message) return false;
    if (stored.serverId == null || !serverId) return true;
    return String(stored.serverId) === String(serverId);
  }

  function describeRefreshInterval(interval) {
    const value = normaliseRefreshInterval(interval);
    if (value >= 60000 && value % 60000 === 0) {
      const minutes = Math.round(value / 60000);
      return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
    }
    if (value % 1000 === 0) {
      const seconds = Math.round(value / 1000);
      return seconds === 1 ? 'Every second' : `Every ${seconds} seconds`;
    }
    const seconds = value / 1000;
    return `Every ${seconds.toFixed(1)} seconds`;
  }

  function generateColor(index) {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 55%)`;
  }

  const customMapFreezeCache = new Set();

  window.registerModule({
    id: 'live-map',
    title: 'Player Map',
    order: 20,
    setup(ctx){
      ctx.root?.classList.add('module-card','live-map-card');

      const configWrap = document.createElement('div');
      configWrap.className = 'map-config hidden';
      const configIntro = document.createElement('p');
      configIntro.className = 'map-config-intro';
      configWrap.appendChild(configIntro);
      ctx.body?.appendChild(configWrap);

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
      const message = document.createElement('div');
      message.className = 'map-placeholder';
      mapView.appendChild(mapImage);
      mapView.appendChild(overlay);
      mapView.appendChild(message);

      const sidebar = document.createElement('div');
      sidebar.className = 'map-sidebar';

      const summary = document.createElement('div');
      summary.className = 'map-summary';
      sidebar.appendChild(summary);

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
        mapMetaServerId: null,
        serverInfo: null,
        teamColors: new Map(),
        selectedTeam: null,
        selectedSolo: null,
        lastUpdated: null,
        pollInterval: loadRefreshInterval(),
        pollTimer: null,
        playerReloadTimer: null,
        pendingGeneration: false,
        status: null,
        pendingRefresh: null,
        projectionMode: null,
        horizontalAxis: null,
        customMapChecksFrozen: false,
        worldDetails: {
          seed: null,
          size: null,
          pending: false,
          lastAttempt: 0,
          lastSyncAt: 0,
          lastSyncKey: null,
          lastSyncStatus: null,
          reportedKey: null,
          syncing: false,
          syncError: null
        }
      };

      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.type = 'button';
        fullscreenBtn.className = 'ghost map-fullscreen-button';
        fullscreenBtn.textContent = 'Open fullscreen';
        fullscreenBtn.setAttribute('aria-label', 'Open the live map in a new window');
        fullscreenBtn.addEventListener('click', () => openFullscreenMap());
        ctx.actions.appendChild(fullscreenBtn);
      }

      let mapImageSource = null;
      let mapImageObjectUrl = null;
      let mapImageAbort = null;
      let mapImageLocked = false;
      const FULLSCREEN_WINDOW_FEATURES = 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
      const FULLSCREEN_STYLES = `
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, rgba(30, 41, 59, 0.45), rgba(2, 6, 23, 0.95)); color: #e2e8f0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
        .map-popup { display: flex; flex-direction: column; min-height: 100vh; padding: 20px 24px 28px; gap: 18px; }
        .map-popup-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .map-popup-header h1 { margin: 0; font-size: 1.35rem; font-weight: 600; letter-spacing: -0.01em; }
        .map-popup-layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 320px); gap: 20px; flex: 1; align-items: start; }
        @media (max-width: 1200px) { .map-popup-layout { grid-template-columns: 1fr; } }
        .map-view { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid rgba(148, 163, 184, 0.28); background: rgba(8, 11, 19, 0.95); min-height: min(70vh, 720px); }
        .map-view img { display: block; width: 100%; height: auto; }
        .map-overlay { position: absolute; inset: 0; pointer-events: none; }
        .map-overlay .map-marker { position: absolute; width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(0, 0, 0, 0.45); box-shadow: 0 0 14px rgba(0, 0, 0, 0.45); transform: translate(-50%, -50%); pointer-events: auto; }
        .map-overlay .map-marker.active { box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.45); }
        .map-overlay .map-marker.dimmed { opacity: 0.38; }
        .map-placeholder { position: absolute; inset: 0; display: none; flex-direction: column; justify-content: center; align-items: center; gap: 18px; padding: 32px 28px; text-align: center; background: rgba(4, 7, 15, 0.9); color: #cbd5f5; font-size: 1rem; }
        .map-placeholder .map-status { width: min(100%, 540px); }
        .map-view.map-view-has-message > .map-placeholder { display: flex; }
        .map-view.map-view-has-message > img,
        .map-view.map-view-has-message > .map-overlay { display: none; }
        .map-sidebar { display: flex; flex-direction: column; gap: 18px; }
        .map-summary, .map-team-info { background: rgba(10, 14, 24, 0.88); border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
        .map-summary strong { font-weight: 600; }
        .map-team-info .map-team-members { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .map-team-info .map-team-members li { display: flex; justify-content: space-between; gap: 14px; font-size: 0.95rem; }
        .map-player-list { background: rgba(10, 14, 24, 0.88); border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 16px; overflow: hidden; max-height: min(52vh, 620px); display: flex; flex-direction: column; }
        .map-player-table { width: 100%; border-collapse: collapse; min-width: 420px; color: inherit; font-size: 0.92rem; }
        .map-player-table thead th { text-align: left; padding: 12px 18px; font-weight: 600; background: rgba(15, 23, 42, 0.65); position: sticky; top: 0; z-index: 1; }
        .map-player-table tbody td { padding: 12px 18px; border-bottom: 1px solid rgba(30, 41, 59, 0.65); }
        .map-player-table tbody tr { cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .map-player-table tbody tr:hover { background: rgba(30, 41, 59, 0.7); }
        .map-player-table tbody tr.active { background: rgba(225, 29, 72, 0.24); color: #fbcfe8; }
        .map-player-table tbody tr.dimmed { opacity: 0.45; }
        .map-player-name { display: flex; align-items: center; gap: 10px; font-weight: 600; }
        .map-player-name-cell { display: flex; flex-direction: column; gap: 6px; }
        .map-player-color { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.7); }
        .map-player-sub { font-size: 0.75rem; color: #94a3b8; }
        .map-player-team, .map-player-stat { font-variant-numeric: tabular-nums; text-align: right; color: #cbd5f5; }
        .map-filter-note { margin: 0 18px 18px; color: #94a3b8; }
        .map-color-chip { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(15, 23, 42, 0.7); }
        .map-status { display: flex; gap: 16px; align-items: flex-start; background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 14px; padding: 18px; text-align: left; }
        .map-status-spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid rgba(148, 163, 184, 0.35); border-top-color: #f472b6; animation: map-status-spin 1s linear infinite; margin-top: 4px; }
        .map-status-body { display: flex; flex-direction: column; gap: 10px; }
        .map-status-heading { font-weight: 600; font-size: 1rem; }
        .map-status-note { font-size: 0.88rem; color: #a5b4fc; }
        .map-status-details { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.86rem; }
        .map-status-details li strong { color: #f8fafc; margin-right: 6px; }
        button.map-popup-close { background: rgba(15, 23, 42, 0.7); color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 999px; padding: 8px 16px; font-size: 0.92rem; font-weight: 500; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
        button.map-popup-close:hover { background: rgba(30, 41, 59, 0.85); border-color: rgba(148, 163, 184, 0.8); }
        @keyframes map-status-spin { to { transform: rotate(360deg); } }
      `;

      const mainViewport = {
        win: window,
        doc: document,
        mapView,
        mapImage,
        overlay,
        message,
        summary,
        listWrap,
        teamInfo,
        refreshDisplay: null
      };

      let fullscreenViewport = null;

      function isFullscreenOpen() {
        return !!(fullscreenViewport && fullscreenViewport.win && !fullscreenViewport.win.closed);
      }

      function cleanupFullscreenViewport() {
        if (fullscreenViewport && fullscreenViewport.win && !fullscreenViewport.win.closed) {
          return;
        }
        fullscreenViewport = null;
      }

      function getActiveViewports() {
        cleanupFullscreenViewport();
        const viewports = [mainViewport];
        if (fullscreenViewport) viewports.push(fullscreenViewport);
        return viewports;
      }

      function showUploadNotice(msg, variant = 'error') {
        if (!uploadStatus) return;
        uploadStatus.textContent = msg;
        uploadStatus.className = 'notice ' + (variant === 'success' ? 'success' : 'error');
      }

      function hideUploadNotice() {
        if (!uploadStatus) return;
        uploadStatus.className = 'notice hidden';
        uploadStatus.textContent = '';
      }

      function closeFullscreenWindow() {
        if (fullscreenViewport && fullscreenViewport.win && !fullscreenViewport.win.closed) {
          try { fullscreenViewport.win.close(); }
          catch { /* ignore */ }
        }
        fullscreenViewport = null;
      }

      function syncFullscreenMessageFromPrimary() {
        if (!isFullscreenOpen() || !fullscreenViewport) return;
        if (mainViewport.mapView.classList.contains('map-view-has-message')) {
          const source = mainViewport.message.cloneNode(true);
          const clone = cloneMessageContent(source, fullscreenViewport, false);
          applyMessageToViewport(fullscreenViewport, clone);
        } else {
          fullscreenViewport.message.innerHTML = '';
          fullscreenViewport.mapView.classList.remove('map-view-has-message');
        }
      }

      function openFullscreenMap() {
        if (isFullscreenOpen()) {
          try { fullscreenViewport.win.focus(); }
          catch { /* ignore */ }
          return;
        }
        const popup = window.open('', 'live-map-fullscreen', FULLSCREEN_WINDOW_FEATURES);
        if (!popup) {
          ctx.log?.('Unable to open fullscreen map window. Check popup blockers.');
          return;
        }
        try {
          popup.document.write('<!DOCTYPE html><html lang="en"><head><title>Live Map</title></head><body></body></html>');
          popup.document.close();
        } catch (err) {
          ctx.log?.('Failed to initialise fullscreen map window: ' + (err?.message || err));
          try { popup.close(); }
          catch { /* ignore */ }
          return;
        }
        const doc = popup.document;
        const style = doc.createElement('style');
        style.textContent = FULLSCREEN_STYLES;
        doc.head.appendChild(style);

        const root = doc.createElement('div');
        root.className = 'map-popup';
        doc.body.appendChild(root);

        const header = doc.createElement('div');
        header.className = 'map-popup-header';
        root.appendChild(header);

        const title = doc.createElement('h1');
        title.textContent = 'Live Map';
        header.appendChild(title);

        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'map-popup-close';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => closeFullscreenWindow());
        header.appendChild(closeBtn);

        const layout = doc.createElement('div');
        layout.className = 'map-popup-layout';
        root.appendChild(layout);

        const mapContainer = doc.createElement('div');
        mapContainer.className = 'map-view';
        const popupImage = doc.createElement('img');
        popupImage.alt = 'Rust world map';
        const popupOverlay = doc.createElement('div');
        popupOverlay.className = 'map-overlay';
        const popupMessage = doc.createElement('div');
        popupMessage.className = 'map-placeholder';
        mapContainer.appendChild(popupImage);
        mapContainer.appendChild(popupOverlay);
        mapContainer.appendChild(popupMessage);
        mapContainer.addEventListener('click', () => clearSelection());
        layout.appendChild(mapContainer);

        const sidebar = doc.createElement('div');
        sidebar.className = 'map-sidebar';
        layout.appendChild(sidebar);

        const summary = doc.createElement('div');
        summary.className = 'map-summary';
        sidebar.appendChild(summary);

        const list = doc.createElement('div');
        list.className = 'map-player-list';
        sidebar.appendChild(list);

        const teamInfo = doc.createElement('div');
        teamInfo.className = 'map-team-info';
        sidebar.appendChild(teamInfo);

        fullscreenViewport = {
          win: popup,
          doc,
          mapView: mapContainer,
          mapImage: popupImage,
          overlay: popupOverlay,
          message: popupMessage,
          summary,
          listWrap: list,
          teamInfo,
          refreshDisplay: null
        };

        popup.addEventListener('beforeunload', () => {
          fullscreenViewport = null;
        });

        renderAll();
        syncFullscreenMessageFromPrimary();
        updateRefreshDisplays();
        if (isFullscreenOpen()) {
          const activeSrc = mainViewport.mapImage?.currentSrc || mainViewport.mapImage?.src || '';
          if (activeSrc) {
            try { fullscreenViewport.mapImage.src = activeSrc; }
            catch { /* ignore */ }
          }
          try { fullscreenViewport.win.focus(); }
          catch { /* ignore */ }
        }
      }

      window.addEventListener('beforeunload', () => closeFullscreenWindow());

      function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('read_failed'));
          reader.readAsDataURL(file);
        });
      }

      function cloneMessageContent(content, viewport, useOriginal = false) {
        if (content == null) return content;
        if (content instanceof Node) {
          if (useOriginal) return content;
          try {
            return viewport.doc?.importNode ? viewport.doc.importNode(content, true) : content.cloneNode(true);
          } catch (err) {
            return content.cloneNode(true);
          }
        }
        return content;
      }

      function applyMessageToViewport(viewport, content) {
        if (!viewport || !viewport.message || !viewport.mapView) return;
        const target = viewport.message;
        target.innerHTML = '';
        if (content instanceof Node) {
          target.appendChild(content);
        } else if (content != null) {
          const paragraph = viewport.doc.createElement('p');
          paragraph.className = 'map-placeholder-text';
          paragraph.textContent = typeof content === 'string' ? content : String(content);
          target.appendChild(paragraph);
        }
        viewport.mapView.classList.add('map-view-has-message');
      }

      function setMessage(content, options = {}) {
        const { persist = false } = options;
        if (!persist) clearPersistentStatusMessage();
        const viewports = getActiveViewports();
        viewports.forEach((viewport, index) => {
          const payload = cloneMessageContent(content, viewport, index === 0);
          applyMessageToViewport(viewport, payload);
        });
      }

      function clearMessage() {
        clearPersistentStatusMessage();
        for (const viewport of getActiveViewports()) {
          if (!viewport.message || !viewport.mapView) continue;
          viewport.message.innerHTML = '';
          viewport.mapView.classList.remove('map-view-has-message');
        }
      }

      function stopPolling() {
        if (state.pollTimer) {
          clearInterval(state.pollTimer);
          state.pollTimer = null;
        }
        if (state.playerReloadTimer) {
          clearInterval(state.playerReloadTimer);
          state.playerReloadTimer = null;
        }
      }

      function getPollInterval() {
        const interval = normaliseRefreshInterval(state.pollInterval);
        state.pollInterval = interval;
        return interval;
      }

      function updateRefreshDisplays() {
        const interval = getPollInterval();
        const description = describeRefreshInterval(interval);
        const detail = description === 'Custom'
          ? 'at a custom interval'
          : description.toLowerCase();
        const suffix = state.serverId ? '.' : ' when live data is available.';
        for (const viewport of getActiveViewports()) {
          const target = viewport.refreshDisplay;
          if (!target) continue;
          target.textContent = `Player positions refresh ${detail}${suffix}`;
        }
      }

      function schedulePolling() {
        stopPolling();
        if (!state.serverId) {
          updateRefreshDisplays();
          return;
        }
        const pollInterval = getPollInterval();
        state.pollTimer = setInterval(() => {
          refreshData('poll').catch((err) => ctx.log?.('Map refresh failed: ' + (err?.message || err)));
        }, pollInterval);
        state.playerReloadTimer = setInterval(() => {
          refreshData('player-reload').catch((err) => ctx.log?.('Map refresh failed: ' + (err?.message || err)));
        }, PLAYER_REFRESH_INTERVAL);
        updateRefreshDisplays();
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

      function getActiveMapMeta() {
        if (!state.mapMeta) return null;
        if (state.mapMetaServerId && state.mapMetaServerId !== state.serverId) return null;
        return state.mapMeta;
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

      function hasMapImage(meta) {
        if (!meta || typeof meta !== 'object') return false;
        return !!meta.imageUrl;
      }

      function mapReady() {
        const meta = getActiveMapMeta();
        if (!meta || !hasMapImage(meta)) return false;
        const size = resolveWorldSize();
        return Number.isFinite(size) && size > 0;
      }

      function updateUploadSection() {
        if (!uploadWrap) return;
        const meta = getActiveMapMeta();
        const needsUpload = !!(meta && mapIsCustom(meta) && !hasMapImage(meta));
        if (needsUpload) {
          uploadWrap.classList.remove('hidden');
        } else {
          uploadWrap.classList.add('hidden');
          hideUploadNotice();
        }
      }

      function updateConfigPanel() {
        if (!configWrap) return;
        const shouldShow = state.pendingGeneration;
        configWrap.classList.toggle('hidden', !shouldShow);
        if (!shouldShow) {
          configIntro.textContent = '';
          return;
        }
        if (state.status === 'pending') {
          configIntro.textContent = 'RustMaps is generating this map. High demand (like wipe day) can slow this down, but we’ll refresh automatically when it is ready.';
        } else {
          configIntro.textContent = 'Waiting for RustMaps imagery. We will refresh when it becomes available.';
        }
      }

      function clearPendingRefresh() {
        if (state.pendingRefresh) {
          clearTimeout(state.pendingRefresh);
          state.pendingRefresh = null;
        }
      }

      function schedulePendingRefresh(delay = 7000) {
        clearPendingRefresh();
        if (!state.serverId) return;
        if (state.customMapChecksFrozen) return;
        state.pendingRefresh = setTimeout(() => {
          state.pendingRefresh = null;
          refreshData('map-pending').catch((err) => ctx.log?.('Map refresh failed: ' + (err?.message || err)));
        }, delay);
      }

      function describeMapStatus(code) {
        switch (code) {
          case 'awaiting_server_info':
            return 'Awaiting server information';
          case 'awaiting_upload':
            return 'Awaiting custom map upload';
          case 'awaiting_imagery':
            return 'Awaiting map imagery';
          case 'rustmaps_not_found':
            return 'RustMaps imagery unavailable';
          case 'pending':
            return 'Generating map imagery';
          case 'ready':
            return 'Ready';
          default:
            return null;
        }
      }

      function combineStatusCodes(...codes) {
        const unique = [];
        for (const code of codes) {
          if (!code || typeof code !== 'string') continue;
          if (!unique.includes(code)) unique.push(code);
        }
        return unique;
      }

      function formatDetailValue(value) {
        if (value == null) return null;
        if (typeof value === 'number') {
          if (!Number.isFinite(value)) return null;
          return `${value}`;
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return null;
          const normalised = trimmed.replace(/[\s,]/g, '');
          if (/^-?\d+(?:\.\d+)?$/.test(normalised)) {
            const numeric = Number(normalised);
            if (Number.isFinite(numeric)) return `${numeric}`;
          }
          return trimmed;
        }
        return String(value);
      }

      function mapStatusDetails() {
        const meta = getActiveMapMeta();
        const info = state.serverInfo || {};
        const details = [];
        const size = resolveWorldSize();
        if (size != null) details.push({ label: 'World size (m)', value: size });
        const seed = resolveWorldSeed();

        if (seed != null) details.push({ label: 'Seed', value: seed });
        const mapKey = meta?.mapKey || info?.mapKey;
        if (mapKey != null) details.push({ label: 'Map key', value: mapKey });
        const mapName = meta?.mapName || info.mapName || info.map;
        if (mapName && details.length > 0) details.push({ label: 'Map', value: mapName });
        return details;
      }

      function showStatusMessage(primary, options = {}) {
        if (!primary) return;
        const { spinner = false, details = null, note = null, statusCodes = null, persist = false } = options;
        const container = document.createElement('div');
        container.className = 'map-status';
        if (spinner) {
          const spinnerEl = document.createElement('span');
          spinnerEl.className = 'map-status-spinner';
          container.appendChild(spinnerEl);
        }
        const body = document.createElement('div');
        body.className = 'map-status-body';
        const heading = document.createElement('div');
        heading.className = 'map-status-heading';
        heading.textContent = primary;
        body.appendChild(heading);
        const notes = [];
        const codes = Array.isArray(statusCodes) ? statusCodes : statusCodes ? [statusCodes] : [];
        for (const code of codes) {
          const label = describeMapStatus(code);
          if (label) notes.push(`Status: ${label}`);
        }
        if (note) {
          if (Array.isArray(note)) {
            for (const entry of note) {
              if (entry) notes.push(entry);
            }
          } else {
            notes.push(note);
          }
        }
        for (const entry of notes) {
          const noteLine = document.createElement('div');
          noteLine.className = 'map-status-note';
          noteLine.textContent = entry;
          body.appendChild(noteLine);
        }
        const detailList = Array.isArray(details) ? details.filter((item) => item && item.label && item.value != null) : [];
        if (detailList.length > 0) {
          const list = document.createElement('ul');
          list.className = 'map-status-details';
          for (const item of detailList) {
            const value = formatDetailValue(item.value);
            if (value == null) continue;
            const row = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = value;
            row.appendChild(strong);
            row.appendChild(document.createTextNode(' ' + item.label));
            list.appendChild(row);
          }
          if (list.childNodes.length > 0) {
            const detailHeading = document.createElement('div');
            detailHeading.className = 'map-status-note map-status-details-label';
            detailHeading.textContent = 'Detected map details';
            body.appendChild(detailHeading);
            body.appendChild(list);
          }
        }
        container.appendChild(body);
        setMessage(container, { persist });
        if (persist) {
          savePersistentStatusMessage(primary, state.serverId);
        }
      }

      function updateStatusMessage(hasImageOverride) {
        const meta = getActiveMapMeta();
        const hasImage = typeof hasImageOverride === 'boolean' ? hasImageOverride : hasMapImage(meta);
        const details = mapStatusDetails();
        const awaitingImagery = state.status === 'awaiting_imagery';
        const awaitingUpload = state.status === 'awaiting_upload';
        const awaitingServerInfo = state.status === 'awaiting_server_info';
        const rustmapsMissing = state.status === 'rustmaps_not_found' || meta?.notFound;
        const isCustom = mapIsCustom(meta);
        const customNotes = [];
        if (isCustom) {
          customNotes.push('This server is using a custom map. Use RustMaps, RustEdit, or run the render commands on the server to generate a map image.');
          if (state.customMapChecksFrozen) {
            customNotes.push('Automatic RustMaps checks are paused for custom maps until you reload the page.');
          }
        }

        const noteWithCustomMap = (note) => {
          if (customNotes.length === 0) return note;
          if (!note) return customNotes.length === 1 ? customNotes[0] : [...customNotes];
          if (Array.isArray(note)) return [...note, ...customNotes];
          return [note, ...customNotes];
        };
        const ready = hasImage && mapReady();

        if (ready) {
          clearMessage();
          return;
        }
        if (awaitingServerInfo) {
          showStatusMessage('Waiting for RustMaps to generate the map…', {
            spinner: true,
            details,
            note: noteWithCustomMap('We’ll try again automatically.'),
            statusCodes: combineStatusCodes(state.status, state.pendingGeneration ? 'pending' : null),
            persist: true
          });
        } else if (awaitingUpload && !hasImage) {
          showStatusMessage('Upload your rendered map image to enable the live map.', {
            details,
            note: noteWithCustomMap(null),
            statusCodes: combineStatusCodes(state.status)
          });
        } else if (rustmapsMissing && !hasImage) {
          showStatusMessage('RustMaps has not published imagery for this seed yet.', {
            details,
            note: noteWithCustomMap('Try again shortly or upload your render below.'),
            statusCodes: combineStatusCodes(state.status || (meta?.notFound ? 'rustmaps_not_found' : null))
          });
        } else if (awaitingImagery && !hasImage) {
          const generating = state.pendingGeneration;
          showStatusMessage(generating ? 'RustMaps is generating this map…' : 'Waiting for RustMaps imagery…', {
            spinner: true,
            details,
            note: noteWithCustomMap(generating
              ? 'Generation can take several minutes during busy periods (like wipe day), but we’ll refresh automatically when it is ready.'
              : 'We’ll check back periodically.'),
            statusCodes: combineStatusCodes(state.status, generating ? 'pending' : null)
          });
        } else if (isCustom && !hasImage) {
          showStatusMessage('Upload your rendered map image to enable the live map.', {
            details,
            note: noteWithCustomMap(null),
            statusCodes: combineStatusCodes(state.status, 'awaiting_upload')
          });
        } else if (!meta) {
          showStatusMessage('Waiting for map metadata…', {
            spinner: true,
            details,
            note: noteWithCustomMap(null),
            statusCodes: combineStatusCodes(state.status, state.pendingGeneration ? 'pending' : null)
          });
        } else if (!hasImage) {
          showStatusMessage('Map imagery is still being prepared…', {
            spinner: true,
            details,
            note: noteWithCustomMap(null),
            statusCodes: combineStatusCodes(state.status, state.pendingGeneration ? 'pending' : null)
          });
        } else if (!mapReady()) {
          showStatusMessage('Map metadata is incomplete. Try again shortly.', {
            details,
            note: noteWithCustomMap(null),
            statusCodes: combineStatusCodes(state.status)
          });
        } else {
          clearMessage();
        }
      }

      async function uploadMapFormData(file, mapKey) {
        if (!ctx.authorizedFetch) throw new Error('unsupported');
        const formData = new FormData();
        formData.append('image', file);
        if (mapKey) formData.append('mapKey', mapKey);
        const res = await ctx.authorizedFetch(`/servers/${state.serverId}/map-image/upload`, {
          method: 'POST',
          body: formData
        });
        const contentType = res?.headers?.get?.('content-type') || '';
        let payload = null;
        if (contentType.includes('application/json')) {
          try { payload = await res.json(); }
          catch { payload = null; }
        }
        if (!res.ok) {
          const err = new Error(payload?.error || 'map_upload_failed');
          err.status = res.status;
          if (payload?.error) err.code = payload.error;
          throw err;
        }
        return payload;
      }

      async function uploadMapImageFile(file) {
        const activeMeta = getActiveMapMeta();
        const mapKey = activeMeta?.mapKey || null;
        if (ctx.authorizedFetch) {
          try {
            return await uploadMapFormData(file, mapKey);
          } catch (err) {
            if (!err) throw err;
            const shouldFallback = !err.code && (err.status === 404 || err.status === 405);
            if (!shouldFallback) throw err;
          }
        }
        const dataUrl = await readFileAsDataURL(file);
        return ctx.api(`/servers/${state.serverId}/map-image`, { image: dataUrl, mapKey }, 'POST');
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
          const response = await uploadMapImageFile(file);
          if (response?.map) {
            state.mapMeta = response.map;
            state.mapMetaServerId = state.serverId;
            state.projectionMode = null;
            state.horizontalAxis = null;
            cancelMapImageRequest();
            clearMapImage();
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
          else if (code === 'unsupported_image_type') showUploadNotice('Only PNG, JPEG, or WebP images are supported.');
          else if (code === 'image_too_large') showUploadNotice('The image is too large. Please upload a file under 20 MB.');
          else showUploadNotice(ctx.describeError?.(err) || 'Uploading the map image failed.');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = previousLabel;
          if (uploadInput) uploadInput.value = '';
        }
      }

      function toNumber(value) {
        if (value == null) return null;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'boolean') return value ? 1 : 0;
        const text = String(value).trim();
        if (!text) return null;
        const normalised = text.replace(/[_\s,]/g, '');
        if (!normalised) return null;
        const num = Number(normalised);
        return Number.isFinite(num) ? num : null;
      }

      function worldDetailKey(size, seed) {
        if (!Number.isFinite(size) || size <= 0) return null;
        if (!Number.isFinite(seed)) return null;
        return `${seed}_${size}`;
      }

      const FACEPUNCH_LEVEL_HOST_PATTERN = /^https?:\/\/files\.facepunch\.com/i;
      const LEVEL_URL_PATTERN = /^https?:\/\/\S+/i;

      const META_WORLD_SIZE_PATHS = [
        ['worldSize'],
        ['WorldSize'],
        ['world_size'],
        ['size'],
        ['Size'],
        ['mapSize'],
        ['MapSize'],
        ['dimensions', 'worldSize'],
        ['dimensions', 'WorldSize'],
        ['Dimensions', 'worldSize'],
        ['Dimensions', 'WorldSize'],
        ['world', 'size'],
        ['World', 'Size']
      ];

      const INFO_WORLD_SIZE_PATHS = [
        ['worldSize'],
        ['WorldSize'],
        ['world_size'],
        ['World_Size'],
        ['worldsize'],
        ['Worldsize'],
        ['size'],
        ['Size'],
        ['mapSize'],
        ['MapSize'],
        ['map_size'],
        ['mapsize'],
        ['World', 'Size'],
        ['world', 'size'],
        ['Map', 'Size'],
        ['map', 'size'],
        ['Level', 'WorldSize'],
        ['level', 'worldSize'],
        ['Level', 'Worldsize'],
        ['level', 'worldsize'],
        ['World Size'],
        ['world size'],
        ['Map Size'],
        ['map size']
      ];

      const META_WORLD_SEED_PATHS = [
        ['seed'],
        ['Seed'],
        ['worldSeed'],
        ['WorldSeed'],
        ['world_seed'],
        ['world', 'seed'],
        ['World', 'Seed']
      ];

      const INFO_WORLD_SEED_PATHS = [
        ['seed'],
        ['Seed'],
        ['worldSeed'],
        ['WorldSeed'],
        ['world_seed'],
        ['World_Seed'],
        ['worldseed'],
        ['Worldseed'],
        ['world', 'seed'],
        ['World', 'Seed'],
        ['Map', 'Seed'],
        ['map', 'seed'],
        ['World Seed'],
        ['world seed'],
        ['Map Seed'],
        ['map seed']
      ];

      const META_LEVEL_URL_PATHS = [
        ['levelUrl'],
        ['levelURL'],
        ['LevelUrl'],
        ['LevelURL'],
        ['level', 'url'],
        ['Level', 'Url']
      ];

      const INFO_LEVEL_URL_PATHS = [
        ['levelUrl'],
        ['levelURL'],
        ['LevelUrl'],
        ['LevelURL'],
        ['Levelurl'],
        ['levelurl'],
        ['level', 'url'],
        ['Level', 'Url'],
        ['Level Url'],
        ['Level URL'],
        ['level url']
      ];

      function readValue(source, path) {
        if (!source || typeof source !== 'object') return undefined;
        if (Array.isArray(path)) {
          let current = source;
          for (const segment of path) {
            if (current == null || typeof current !== 'object') return undefined;
            current = readValue(current, segment);
            if (current === undefined) return undefined;
          }
          return current;
        }
        if (typeof path !== 'string') return undefined;
        if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
        const normalized = path.toLowerCase();
        for (const key of Object.keys(source)) {
          if (typeof key === 'string' && key.toLowerCase() === normalized) {
            return source[key];
          }
        }
        return undefined;
      }

      function collectValues(source, paths) {
        if (!source || typeof source !== 'object') return [];
        const values = [];
        for (const path of paths) {
          const value = readValue(source, path);
          if (value !== undefined) values.push(value);
        }
        return values;
      }

      function resolveWorldSize(metaOverride, infoOverride) {
        const meta = metaOverride ?? getActiveMapMeta();
        const info = infoOverride ?? state.serverInfo ?? {};
        const candidates = [];
        if (meta) candidates.push(...collectValues(meta, META_WORLD_SIZE_PATHS));
        if (info) candidates.push(...collectValues(info, INFO_WORLD_SIZE_PATHS));
        if (state.worldDetails) candidates.push(state.worldDetails.size);
        for (const candidate of candidates) {
          const numeric = toNumber(candidate);
          if (numeric != null && numeric > 0) return numeric;
        }
        return null;
      }

      function resolveWorldSeed(metaOverride, infoOverride) {
        const meta = metaOverride ?? getActiveMapMeta();
        const info = infoOverride ?? state.serverInfo ?? {};
        const candidates = [];
        if (meta) candidates.push(...collectValues(meta, META_WORLD_SEED_PATHS));
        if (info) candidates.push(...collectValues(info, INFO_WORLD_SEED_PATHS));
        if (state.worldDetails) candidates.push(state.worldDetails.seed);
        for (const candidate of candidates) {
          const numeric = toNumber(candidate);
          if (numeric != null && numeric !== 0) return numeric;
        }
        return null;
      }

      function isLikelyLevelUrl(url) {
        if (typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed) return false;
        return LEVEL_URL_PATTERN.test(trimmed);
      }

      function isFacepunchLevelUrl(url) {
        if (!isLikelyLevelUrl(url)) return false;
        return FACEPUNCH_LEVEL_HOST_PATTERN.test(url.trim());
      }

      function isCustomLevelUrl(url) {
        return isLikelyLevelUrl(url) && !isFacepunchLevelUrl(url);
      }

      function resolveLevelUrl(metaOverride, infoOverride) {
        const meta = metaOverride ?? getActiveMapMeta();
        const info = infoOverride ?? state.serverInfo ?? {};
        const candidates = [];
        if (meta) candidates.push(...collectValues(meta, META_LEVEL_URL_PATHS));
        if (info) candidates.push(...collectValues(info, INFO_LEVEL_URL_PATHS));
        for (const candidate of candidates) {
          if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed && isLikelyLevelUrl(trimmed)) return trimmed;
          }
        }
        return null;
      }

      function mapIsCustom(metaOverride, infoOverride) {
        const meta = metaOverride ?? getActiveMapMeta();
        const info = infoOverride ?? state.serverInfo ?? {};
        if (!meta && !info) return false;
        const metaCustomFlag = meta?.custom ?? meta?.isCustomMap;
        if (metaCustomFlag === true) return true;
        const levelUrl = resolveLevelUrl(meta, info);
        if (!levelUrl) return metaCustomFlag === true;
        if (isFacepunchLevelUrl(levelUrl)) return false;
        if (metaCustomFlag === false) return false;
        if (isCustomLevelUrl(levelUrl)) return true;
        return false;
      }

      async function syncWorldDetailsWithServer({ size, seed, key, reason }) {
        if (!state.serverId || typeof ctx.api !== 'function') return;
        const infoState = state.worldDetails;
        if (!infoState) return;
        infoState.syncing = true;
        infoState.lastSyncKey = key;
        infoState.lastSyncAt = Date.now();
        infoState.lastSyncStatus = 'pending';
        try {
          const result = await ctx.api(`/servers/${state.serverId}/live-map/world`, { size, seed }, 'POST');
          infoState.lastSyncStatus = 'success';
          infoState.reportedKey = key;
          infoState.syncError = null;
          const pendingError = result?.error === 'rustmaps_generation_pending';
          const nextStatus = result?.status
            || (pendingError ? 'pending' : null);
          if (result?.info) {
            state.serverInfo = result.info;
          }
          if (result?.map) {
            state.mapMeta = result.map;
            state.mapMetaServerId = state.serverId;
          }
          if (nextStatus) {
            state.status = nextStatus;
          }
          const hasImage = hasMapImage(result?.map || getActiveMapMeta());
          if (nextStatus === 'pending' || nextStatus === 'awaiting_imagery' || pendingError || !hasImage) {
            schedulePendingRefresh();
            state.pendingGeneration = true;
          }
        } catch (err) {
          const code = ctx.errorCode?.(err) || err?.message || 'error';
          infoState.lastSyncStatus = code;
          infoState.syncError = code;
          ctx.log?.(`Failed to sync world details (${reason}): ${err?.message || err}`);
        } finally {
          infoState.syncing = false;
          updateUploadSection();
          updateConfigPanel();
          updateStatusMessage();
          renderSummary();
          if (reason === 'player-reload') {
            renderPlayerSections();
          } else {
            renderAll();
          }
        }
      }

      async function maybeSubmitWorldDetails(reason = 'auto') {
        if (!state.serverId || typeof ctx.api !== 'function') return;
        if (state.customMapChecksFrozen) return;
        const infoState = state.worldDetails;
        if (!infoState) return;
        const activeMeta = getActiveMapMeta();
        if (hasMapImage(activeMeta)) return;
        const size = toNumber(infoState.size);
        const seed = toNumber(infoState.seed);
        if (!Number.isFinite(size) || size <= 0) return;
        if (!Number.isFinite(seed) || seed === 0) return;
        const key = worldDetailKey(size, seed);
        if (!key) return;
        if (infoState.syncing) return;
        const awaitingServerInfo = state.status === 'awaiting_server_info';
        const syncedSuccessfully = infoState.lastSyncKey === key && infoState.lastSyncStatus === 'success';
        const alreadyReported = infoState.reportedKey === key;
        if (syncedSuccessfully && alreadyReported && !awaitingServerInfo) return;
        const now = Date.now();
        if (infoState.lastSyncKey === key && infoState.lastSyncAt && now - infoState.lastSyncAt < WORLD_SYNC_THROTTLE) return;
        await syncWorldDetailsWithServer({ size, seed, key, reason });
      }

      function normalizeCommandReply(reply) {
        if (reply == null) return '';
        if (typeof reply === 'string') return reply;
        if (typeof reply.Message === 'string') return reply.Message;
        if (typeof reply.message === 'string') return reply.message;
        if (Array.isArray(reply)) return reply.map((entry) => normalizeCommandReply(entry)).join(' ');
        return '';
      }

      const WORLD_SIZE_PATTERNS = [
        /\bworld\s*size\s*(?:[:=]\s*|is\s+)?["']?(\d[\d_,\s]*)/i,
        /\bmap\s*size\s*(?:[:=]\s*|is\s+)?["']?(\d[\d_,\s]*)/i,
        /\bserver\.worldsize\s*(?:[:=]\s*|is\s+)?["']?(\d[\d_,\s]*)/i,
        /\bworldsize\s*(?:[:=]\s*|is\s+)?["']?(\d[\d_,\s]*)/i,
        /\bsize\s*(?:[:=]\s*|is\s+)?["']?(\d[\d_,\s]*)/i
      ];

      const WORLD_SEED_PATTERNS = [
        /\bworld\s*seed\s*(?:[:=]\s*|is\s+)?["']?(-?\d[\d_,\s]*)/i,
        /\bmap\s*seed\s*(?:[:=]\s*|is\s+)?["']?(-?\d[\d_,\s]*)/i,
        /\bserver\.seed\s*(?:[:=]\s*|is\s+)?["']?(-?\d[\d_,\s]*)/i,
        /\bseed\s*(?:[:=]\s*|is\s+)?["']?(-?\d[\d_,\s]*)/i
      ];

      function extractWorldDetailNumber(text, key) {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!trimmed) return null;
        const normalized = String(key || '').toLowerCase();
        const patterns = normalized === 'size' ? WORLD_SIZE_PATTERNS
          : normalized === 'seed' ? WORLD_SEED_PATTERNS
          : [];
        for (const pattern of patterns) {
          const match = trimmed.match(pattern);
          if (!match) continue;
          const numeric = toNumber(match[1]);
          if (numeric != null) return numeric;
        }
        const numericValue = toNumber(trimmed);
        if (numericValue != null) {
          return numericValue;
        }
        return null;
      }

      async function ensureWorldDetails(reason = 'unknown') {
        if (!state.serverId) return;
        if (typeof ctx.runCommand !== 'function') return;
        if (state.customMapChecksFrozen) return;
        const activeMeta = getActiveMapMeta();
        if (hasMapImage(activeMeta)) return;
        const needsSize = resolveWorldSize() == null;
        const needsSeed = resolveWorldSeed() == null;
        if (!needsSize && !needsSeed) return;
        const infoState = state.worldDetails;
        if (!infoState) return;
        if (infoState.pending) return;
        const now = Date.now();
        if (infoState.lastAttempt && now - infoState.lastAttempt < 30000) return;
        infoState.pending = true;
        infoState.lastAttempt = now;
        const handleResult = () => {
          updateStatusMessage();
          renderSummary();
          maybeSubmitWorldDetails('rcon').catch((err) => ctx.log?.('World detail sync failed: ' + (err?.message || err)));
        };
        const requestDetail = async (commands, key) => {
          const list = Array.isArray(commands) ? commands : [commands];
          for (const command of list) {
            if (!command) continue;
            try {
              const response = await ctx.runCommand(command);
              const text = normalizeCommandReply(response).trim();
              const numeric = extractWorldDetailNumber(text, key);
              if (numeric == null) continue;
              if (key === 'size') {
                if (numeric > 0) {
                  const previous = toNumber(infoState.size);
                  if (previous !== numeric) {
                    infoState.size = numeric;
                    infoState.syncError = null;
                    const candidateSeed = toNumber(infoState.seed);
                    const nextKey = worldDetailKey(numeric, candidateSeed);
                    if (nextKey && infoState.reportedKey && infoState.reportedKey !== nextKey) {
                      infoState.reportedKey = null;
                      infoState.lastSyncStatus = null;
                      infoState.lastSyncKey = null;
                    }
                  }
                  handleResult();
                  return;
                }
              } else if (key === 'seed') {
                if (numeric !== 0) {
                  const previous = toNumber(infoState.seed);
                  if (previous !== numeric) {
                    infoState.seed = numeric;
                    infoState.syncError = null;
                    const candidateSize = toNumber(infoState.size);
                    const nextKey = worldDetailKey(candidateSize, numeric);
                    if (nextKey && infoState.reportedKey && infoState.reportedKey !== nextKey) {
                      infoState.reportedKey = null;
                      infoState.lastSyncStatus = null;
                      infoState.lastSyncKey = null;
                    }
                  }
                  handleResult();
                  return;
                }
              }
            } catch (err) {
              ctx.log?.(`Failed to query ${key} via ${command} (${reason}): ${err?.message || err}`);
            }
          }
        };
        try {
          if (needsSize) await requestDetail(['server.worldsize', 'serverinfo'], 'size');
          if (needsSeed) await requestDetail(['server.seed', 'serverinfo'], 'seed');
        } finally {
          infoState.pending = false;
        }
      }

      function collectPlayerPositions() {
        if (!Array.isArray(state.players) || state.players.length === 0) return [];
        const positions = [];
        for (const player of state.players) {
          const pos = player?.position;
          const x = toNumber(pos?.x);
          const y = toNumber(pos?.y);
          const z = toNumber(pos?.z);
          if (x == null) continue;
          const sample = { x };
          if (y != null) sample.y = y;
          if (z != null) sample.z = z;
          if (sample.y == null && sample.z == null) continue;
          positions.push(sample);
        }
        return positions;
      }

      function axisValue(sample, axis) {
        if (!sample) return null;
        if (axis === 'y') return typeof sample.y === 'number' ? sample.y : null;
        return typeof sample.z === 'number' ? sample.z : null;
      }

      function determineHorizontalAxis(samples) {
        if (!Array.isArray(samples) || samples.length === 0) return state.horizontalAxis || 'z';
        const stats = {
          y: { min: Infinity, max: -Infinity, count: 0 },
          z: { min: Infinity, max: -Infinity, count: 0 }
        };
        for (const sample of samples) {
          if (typeof sample.y === 'number') {
            stats.y.count += 1;
            if (sample.y < stats.y.min) stats.y.min = sample.y;
            if (sample.y > stats.y.max) stats.y.max = sample.y;
          }
          if (typeof sample.z === 'number') {
            stats.z.count += 1;
            if (sample.z < stats.z.min) stats.z.min = sample.z;
            if (sample.z > stats.z.max) stats.z.max = sample.z;
          }
        }
        const range = {
          y: stats.y.count > 0 ? stats.y.max - stats.y.min : null,
          z: stats.z.count > 0 ? stats.z.max - stats.z.min : null
        };
        const MIN_RANGE = 100;
        const zValid = range.z != null && range.z >= MIN_RANGE;
        const yValid = range.y != null && range.y >= MIN_RANGE;
        if (zValid && yValid) {
          return range.y > range.z * 1.5 ? 'y' : 'z';
        }
        if (zValid) return 'z';
        if (yValid) return 'y';
        if (range.z != null) return 'z';
        if (range.y != null) return 'y';
        return state.horizontalAxis || 'z';
      }

      function inferProjectionMode(samples, axis) {
        const size = resolveWorldSize();
        if (!Number.isFinite(size) || size <= 0) return state.projectionMode || 'centered';
        const list = Array.isArray(samples) ? samples : collectPlayerPositions();
        if (list.length === 0) return state.projectionMode || 'centered';
        const chosenAxis = axis || determineHorizontalAxis(list);

        const usable = [];
        for (const sample of list) {
          const x = typeof sample.x === 'number' ? sample.x : null;
          const other = axisValue(sample, chosenAxis);
          if (x == null || other == null) continue;
          usable.push({ x, other });
        }
        if (usable.length === 0) return state.projectionMode || 'centered';

        const half = size / 2;
        const tolerance = Math.max(size * 0.02, 16);
        let centeredOut = 0;
        let zeroOut = 0;
        let minX = Infinity;
        let minOther = Infinity;
        let maxX = -Infinity;
        let maxOther = -Infinity;

        for (const { x, other } of usable) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (other < minOther) minOther = other;
          if (other > maxOther) maxOther = other;

          if (x < -half - tolerance || x > half + tolerance) centeredOut++;
          if (other < -half - tolerance || other > half + tolerance) centeredOut++;
          if (x < -tolerance || x > size + tolerance) zeroOut++;
          if (other < -tolerance || other > size + tolerance) zeroOut++;
        }

        const total = usable.length * 2;
        const centeredRatio = total > 0 ? centeredOut / total : 1;
        const zeroRatio = total > 0 ? zeroOut / total : 1;
        const margin = 0.05;

        if (centeredRatio <= margin && zeroRatio > centeredRatio + margin) return 'centered';
        if (zeroRatio <= margin && centeredRatio > zeroRatio + margin) return 'zero_based';
        if (centeredRatio < zeroRatio) return 'centered';
        if (zeroRatio < centeredRatio) return 'zero_based';

        if (state.projectionMode) return state.projectionMode;
        if (minX >= -tolerance && minOther >= -tolerance) return 'zero_based';
        if (
          maxX <= half + tolerance &&
          maxOther <= half + tolerance &&
          minX >= -half - tolerance &&
          minOther >= -half - tolerance
        ) {
          return 'centered';
        }
        return 'centered';
      }

      function updateProjectionMode() {
        const samples = collectPlayerPositions();
        const axis = determineHorizontalAxis(samples);
        if (axis && axis !== state.horizontalAxis) state.horizontalAxis = axis;
        const mode = inferProjectionMode(samples, axis);
        if (mode && mode !== state.projectionMode) state.projectionMode = mode;
      }

      function resolveHorizontalAxis() {
        if (state.horizontalAxis) return state.horizontalAxis;
        const samples = collectPlayerPositions();
        const axis = determineHorizontalAxis(samples);
        if (axis) state.horizontalAxis = axis;
        return state.horizontalAxis || 'z';
      }

      function projectPosition(position, axisOverride) {
        if (!mapReady()) return null;
        const size = resolveWorldSize();
        if (!Number.isFinite(size) || size <= 0) return null;
        const x = toNumber(position?.x);
        const axis = axisOverride || resolveHorizontalAxis();
        const z = axis === 'y' ? toNumber(position?.y) : toNumber(position?.z);
        if (x == null || z == null) return null;

        const half = size / 2;
        const mode = state.projectionMode || inferProjectionMode();
        let normalizedX;
        let normalizedZ;

        if (mode === 'zero_based') {
          normalizedX = x / size;
          normalizedZ = z / size;
        } else {
          normalizedX = (x + half) / size;
          normalizedZ = (z + half) / size;
        }

        const px = clamp(normalizedX * 100, 0, 100);
        const pz = clamp(normalizedZ * 100, 0, 100);
        return { left: px, top: 100 - pz };
      }

      function clearMapImage() {
        if (mapImageObjectUrl) {
          try { URL.revokeObjectURL(mapImageObjectUrl); }
          catch { /* ignore */ }
        }
        mapImageObjectUrl = null;
        mapImageSource = null;
        mapImageLocked = false;
        mapImage.removeAttribute('src');
        if (isFullscreenOpen() && fullscreenViewport?.mapImage) {
          fullscreenViewport.mapImage.removeAttribute('src');
        }
      }

      function cancelMapImageRequest() {
        if (mapImageAbort) {
          try { mapImageAbort.abort(); }
          catch { /* ignore */ }
        }
        mapImageAbort = null;
      }

      function resolveImageUrl(value) {
        if (!value) return '';
        if (/^https?:\/\//i.test(value)) return value;
        const apiState = typeof ctx.getState === 'function' ? ctx.getState() : null;
        if (apiState?.API) return apiState.API + value;
        return value;
      }

      async function fetchAuthorizedImage(path, controller) {
        if (typeof ctx.authorizedFetch !== 'function') {
          return { url: resolveImageUrl(path), status: 200 };
        }
        const res = await ctx.authorizedFetch(path, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'include'
        });
        if (!res.ok) {
          const error = new Error('map_image_unavailable');
          error.status = res.status;
          throw error;
        }
        const blob = await res.blob();
        return { blob, status: res.status };
      }

      function applyBlobToImage(blob) {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        if (mapImageObjectUrl) {
          try { URL.revokeObjectURL(mapImageObjectUrl); }
          catch { /* ignore */ }
        }
        mapImageObjectUrl = objectUrl;
        mapImage.src = objectUrl;
        if (isFullscreenOpen() && fullscreenViewport?.mapImage) {
          fullscreenViewport.mapImage.src = objectUrl;
        }
      }

      async function updateMapImage(meta) {
        if (!meta || state.mapMetaServerId && state.mapMetaServerId !== state.serverId) {
          cancelMapImageRequest();
          clearMapImage();
          return;
        }
        if (!hasMapImage(meta)) {
          cancelMapImageRequest();
          clearMapImage();
          return;
        }
        if (mapImageLocked) return;
        const next = meta.imageUrl;
        if (!next) {
          cancelMapImageRequest();
          clearMapImage();
          return;
        }
        if (mapImageSource === next) return;
        const previousSource = mapImageSource;
        mapImageSource = next;
        cancelMapImageRequest();

        const controller = new AbortController();
        mapImageAbort = controller;

        try {
          const result = await fetchAuthorizedImage(next, controller);
          if (mapImageAbort !== controller) return;
          if (result.blob) {
            applyBlobToImage(result.blob);
            if (result.status === 200) {
              mapImageLocked = true;
            }
          } else if (result.url) {
            clearMapImage();
            mapImage.src = result.url;
            if (isFullscreenOpen() && fullscreenViewport?.mapImage) {
              fullscreenViewport.mapImage.src = result.url;
            }
            mapImageSource = next;
            if (result.status === 200) {
              mapImageLocked = true;
            }
          }
        } catch (err) {
          if (mapImageAbort !== controller) return;
          if (err?.name === 'AbortError') return;
          if (err?.status === 401 || ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            return;
          }
          ctx.log?.('Failed to load map image: ' + (err?.message || err));
          if (typeof ctx.authorizedFetch !== 'function') {
            clearMapImage();
            const resolved = resolveImageUrl(next);
            mapImage.src = resolved;
            if (isFullscreenOpen() && fullscreenViewport?.mapImage) {
              fullscreenViewport.mapImage.src = resolved;
            }
            mapImageSource = next;
          } else {
            mapImageSource = previousSource;
          }
        } finally {
          if (mapImageAbort === controller) mapImageAbort = null;
        }
      }

      function selectionActive() {
        return !!(state.selectedSolo || state.selectedTeam);
      }

      function isPlayerFocused(player) {
        if (state.selectedSolo) return player.steamId === state.selectedSolo;
        if (state.selectedTeam) return Number(player.teamId) === state.selectedTeam;
        return true;
      }

      function renderMarkersInViewport(viewport) {
        if (!viewport || !viewport.overlay) return;
        viewport.overlay.innerHTML = '';
        if (!mapReady()) return;
        const axis = resolveHorizontalAxis();
        for (const player of state.players) {
          const position = projectPosition(player.position, axis);
          if (!position) continue;
          const marker = viewport.doc.createElement('div');
          marker.className = 'map-marker';
          marker.style.backgroundColor = colorForPlayer(player);
          marker.style.left = position.left + '%';
          marker.style.top = position.top + '%';
          marker.title = player.displayName || player.persona || player.steamId;
          const focused = isPlayerFocused(player);
          if (selectionActive() && !focused) marker.classList.add('dimmed');
          if (focused) marker.classList.add('active');
          marker.addEventListener('click', (e) => {
            e.stopPropagation();
            selectPlayer(player);
          });
          viewport.overlay.appendChild(marker);
        }
      }

      function renderMarkers() {
        for (const viewport of getActiveViewports()) {
          renderMarkersInViewport(viewport);
        }
      }

      // ---- CONFLICT-FIXED: main version of renderPlayerList ----

      function renderPlayerListInViewport(viewport) {
        if (!viewport || !viewport.listWrap) return;
        const target = viewport.listWrap;
        target.innerHTML = '';

        const hasServer = !!state.serverId;
        if (!hasServer) {
          const empty = viewport.doc.createElement('p');
          empty.className = 'module-message';
          empty.textContent = 'Connect to a server to view live positions.';
          target.appendChild(empty);
          return;
        }

        if (state.players.length === 0) {
          const empty = viewport.doc.createElement('p');
          empty.className = 'module-message';
          empty.textContent = 'No players online right now.';
          target.appendChild(empty);
          return;
        }

        const hasSelection = selectionActive();
        const matches = state.players.filter((p) => isPlayerFocused(p));

        const table = viewport.doc.createElement('table');
        table.className = 'map-player-table';

        const head = viewport.doc.createElement('thead');
        head.innerHTML = '<tr><th>Player</th><th>Team</th><th>Ping</th><th>Health</th><th>Connected</th></tr>';
        table.appendChild(head);

        const body = viewport.doc.createElement('tbody');
        for (const player of state.players) {
          const row = viewport.doc.createElement('tr');
          row.dataset.steamid = player.steamId || '';

          const focused = isPlayerFocused(player);
          if (focused) row.classList.add('active');
          else if (hasSelection) row.classList.add('dimmed');

          const nameCell = viewport.doc.createElement('td');
          nameCell.className = 'map-player-name-cell';
          const nameRow = viewport.doc.createElement('div');
          nameRow.className = 'map-player-name';
          const swatch = viewport.doc.createElement('span');
          swatch.className = 'map-player-color';
          swatch.style.background = colorForPlayer(player);
          nameRow.appendChild(swatch);
          const label = viewport.doc.createElement('span');
          label.textContent = player.displayName || player.persona || player.steamId;
          nameRow.appendChild(label);
          nameCell.appendChild(nameRow);
          const sub = viewport.doc.createElement('div');
          sub.className = 'map-player-sub';
          const details = [];
          const persona = player.persona && player.persona !== label.textContent ? player.persona : null;
          if (persona) details.push(persona);
          if (player.steamId) details.push(player.steamId);
          sub.textContent = details.join(' · ') || '—';
          nameCell.appendChild(sub);
          row.appendChild(nameCell);

          const teamCell = viewport.doc.createElement('td');
          teamCell.className = 'map-player-team';
          const team = teamKey(player);
          teamCell.textContent = team > 0 ? `Team ${team}` : 'Solo';
          row.appendChild(teamCell);

          const pingCell = viewport.doc.createElement('td');
          pingCell.className = 'map-player-stat';
          pingCell.textContent = formatPing(player.ping);
          row.appendChild(pingCell);

          const healthCell = viewport.doc.createElement('td');
          healthCell.className = 'map-player-stat';
          const hp = formatHealth(player.health);
          healthCell.textContent = hp === '—' ? '—' : `${hp} hp`;
          row.appendChild(healthCell);

          const connectedCell = viewport.doc.createElement('td');
          connectedCell.className = 'map-player-stat';
          connectedCell.textContent = formatDuration(player.connectedSeconds);
          row.appendChild(connectedCell);

          row.addEventListener('click', () => selectPlayer(player));
          body.appendChild(row);
        }
        table.appendChild(body);
        target.appendChild(table);

        if (hasSelection) {
          const note = viewport.doc.createElement('p');
          note.className = 'map-filter-note muted small';
          note.textContent = matches.length > 0
            ? 'Players outside your selection are dimmed.'
            : 'No players match the current selection.';
          target.appendChild(note);
        }
      }

      function renderPlayerList() {
        for (const viewport of getActiveViewports()) {
          renderPlayerListInViewport(viewport);
        }
      }

      function bindRefreshSelect(select) {
        if (!select) return;
        select.addEventListener('change', (event) => {
          const nextValue = Number(event.target.value);
          if (!Number.isFinite(nextValue)) {
            event.target.value = String(getPollInterval());
            return;
          }
          const normalised = normaliseRefreshInterval(nextValue);
          const current = getPollInterval();
          if (normalised === current) {
            event.target.value = String(current);
            updateRefreshDisplays();
            return;
          }
          state.pollInterval = normalised;
          persistRefreshInterval(normalised);
          event.target.value = String(normalised);
          schedulePolling();
          updateRefreshDisplays();
        });
      }

      function renderSummaryInViewport(viewport) {
        if (!viewport || !viewport.summary) return;
        const target = viewport.summary;
        target.innerHTML = '';
        viewport.refreshDisplay = null;

        const pollInterval = getPollInterval();
        const total = state.players.length;
        const teamCounts = new Map();
        let soloCount = 0;
        for (const p of state.players) {
          const key = teamKey(p);
          if (key > 0) teamCounts.set(key, (teamCounts.get(key) || 0) + 1);
          else soloCount += 1;
        }
        const meta = getActiveMapMeta();
        const mapName = meta?.mapName || state.serverInfo?.mapName || state.serverInfo?.map || 'Procedural Map';
        const metaLines = [
          { label: 'Players online', value: total },
          { label: 'Teams', value: teamCounts.size },
          { label: 'Solo players', value: soloCount }
        ];
        const mapSize = resolveWorldSize();
        if (mapSize) metaLines.push({ label: 'World size', value: mapSize });
        const mapSeed = resolveWorldSeed();
        if (mapSeed) metaLines.push({ label: 'Seed', value: mapSeed });
        if (meta?.cachedAt) {
          const cachedTs = new Date(meta.cachedAt);
          metaLines.push({ label: 'Cached', value: cachedTs.toLocaleString() });
        }
        if (hasMapImage(meta)) {
          const source = mapIsCustom(meta) ? 'Uploaded image' : meta.localImage ? 'Cached copy' : 'RustMaps';
          metaLines.push({ label: 'Source', value: source });
        }
        if (state.lastUpdated) {
          const ts = new Date(state.lastUpdated);
          metaLines.push({ label: 'Updated', value: ts.toLocaleTimeString() });
        }

        const title = viewport.doc.createElement('div');
        title.innerHTML = `<strong>${mapName}</strong>`;
        target.appendChild(title);

        const refreshLabel = viewport.doc.createElement('label');
        refreshLabel.className = 'map-refresh-control';
        refreshLabel.appendChild(viewport.doc.createTextNode('Player refresh rate '));
        const refreshSelect = viewport.doc.createElement('select');
        refreshSelect.className = 'map-refresh-select';
        let hasMatch = false;
        for (const option of REFRESH_OPTIONS) {
          const opt = viewport.doc.createElement('option');
          opt.value = String(option.value);
          opt.textContent = option.label;
          if (!hasMatch && option.value === pollInterval) {
            opt.selected = true;
            hasMatch = true;
          }
          refreshSelect.appendChild(opt);
        }
        if (!hasMatch) {
          const customOption = viewport.doc.createElement('option');
          customOption.value = String(pollInterval);
          customOption.textContent = describeRefreshInterval(pollInterval);
          customOption.selected = true;
          refreshSelect.appendChild(customOption);
        }
        bindRefreshSelect(refreshSelect);
        refreshLabel.appendChild(refreshSelect);
        target.appendChild(refreshLabel);

        const note = viewport.doc.createElement('p');
        note.className = 'map-filter-note muted small';
        target.appendChild(note);
        viewport.refreshDisplay = note;

        for (const item of metaLines) {
          const row = viewport.doc.createElement('div');
          row.innerHTML = `<strong>${item.value ?? '—'}</strong> ${item.label}`;
          target.appendChild(row);
        }
      }

      function renderSummary() {
        for (const viewport of getActiveViewports()) {
          renderSummaryInViewport(viewport);
        }
        updateRefreshDisplays();
      }

      function renderTeamInfoInViewport(viewport) {
        if (!viewport || !viewport.teamInfo) return;
        const target = viewport.teamInfo;
        target.innerHTML = '';
        if (!state.players.length) {
          target.innerHTML = '<strong>No live data</strong><p class="muted">Connect to a server to see team breakdowns.</p>';
          return;
        }
        if (!selectionActive()) {
          target.innerHTML = '<strong>Select a team or player</strong><p class="muted">Choose from the table to inspect team members.</p>';
          return;
        }
        const collection = state.selectedSolo
          ? state.players.filter((p) => p.steamId === state.selectedSolo)
          : state.players.filter((p) => Number(p.teamId) === state.selectedTeam);
        if (!collection.length) {
          target.innerHTML = '<strong>No matching players</strong><p class="muted">They might have disconnected.</p>';
          return;
        }
        const color = colorForPlayer(collection[0]);
        const heading = viewport.doc.createElement('div');
        heading.innerHTML = `<strong>${state.selectedSolo ? 'Solo player' : 'Team ' + state.selectedTeam}</strong>`;
        const colorChip = viewport.doc.createElement('span');
        colorChip.className = 'map-color-chip';
        colorChip.style.background = color;
        heading.appendChild(viewport.doc.createTextNode(' '));
        heading.appendChild(colorChip);
        target.appendChild(heading);
        const detail = viewport.doc.createElement('p');
        detail.className = 'muted';
        detail.textContent = state.selectedSolo ? 'Individual survivor stats' : `${collection.length} member(s)`;
        target.appendChild(detail);
        const list = viewport.doc.createElement('ul');
        list.className = 'map-team-members';
        for (const player of collection) {
          const li = viewport.doc.createElement('li');
          const name = viewport.doc.createElement('span');
          name.textContent = player.displayName || player.persona || player.steamId;
          const stats = viewport.doc.createElement('span');
          stats.textContent = `${formatHealth(player.health)} hp · ${formatDuration(player.connectedSeconds)}`;
          li.appendChild(name);
          li.appendChild(stats);
          list.appendChild(li);
        }
        target.appendChild(list);
      }

      function renderTeamInfo() {
        for (const viewport of getActiveViewports()) {
          renderTeamInfoInViewport(viewport);
        }
      }
      function renderPlayerSections() {
        ensureTeamColors(state.players);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        if (isFullscreenOpen()) syncFullscreenMessageFromPrimary();
      }

      function renderAll() {
        ensureTeamColors(state.players);
        const activeMeta = getActiveMapMeta();
        updateMapImage(activeMeta);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        updateConfigPanel();
        if (isFullscreenOpen()) syncFullscreenMessageFromPrimary();
      }

      function broadcastPlayers() {
        const payload = { players: [...state.players], serverId: state.serverId };
        ctx.emit?.('live-players:data', payload);
        ctx.emit?.('players:list', { players: [...state.players] });
        window.dispatchEvent(new CustomEvent('players:list', { detail: { players: [...state.players] } }));
      }

      function clearSelection() {
        state.selectedTeam = null;
        state.selectedSolo = null;
        renderPlayerSections();
        ctx.emit?.('live-players:highlight', { steamId: null });
        window.dispatchEvent(new CustomEvent('team:clear'));
      }

      function selectPlayer(player) {
        const key = teamKey(player);
        let highlightSteam = null;
        let broadcastPlayer = null;
        if (key > 0) {
          const sameTeam = !state.selectedSolo && state.selectedTeam === key;
          if (sameTeam) {
            state.selectedTeam = null;
            highlightSteam = null;
          } else {
            state.selectedTeam = key;
            state.selectedSolo = null;
            highlightSteam = player.steamId;
            broadcastPlayer = player;
          }
        } else {
          const samePlayer = state.selectedSolo === player.steamId;
          if (samePlayer) {
            state.selectedSolo = null;
            highlightSteam = null;
          } else {
            state.selectedSolo = player.steamId;
            state.selectedTeam = null;
            highlightSteam = player.steamId;
            broadcastPlayer = player;
          }
        }
        renderPlayerSections();
        ctx.emit?.('live-players:highlight', { steamId: highlightSteam });
        if (broadcastPlayer) {
          window.dispatchEvent(new CustomEvent('player:selected', { detail: { player: broadcastPlayer, teamKey: teamKey(broadcastPlayer) } }));
        } else {
          window.dispatchEvent(new CustomEvent('team:clear'));
        }
      }

      mapView.addEventListener('click', () => clearSelection());

      async function refreshData(reason) {
        if (!state.serverId) return;
        hideUploadNotice();
        const skipLoadingMessage = hasPersistentStatusForServer(state.serverId);
        if (!skipLoadingMessage && reason !== 'poll' && reason !== 'map-pending' && reason !== 'player-reload') {
          showStatusMessage('Loading live map data…', {
            spinner: true,
            details: mapStatusDetails(),
            statusCodes: combineStatusCodes(state.status)
          });
        }
        try {
          const data = await ctx.api(`/servers/${state.serverId}/live-map`);
          state.players = Array.isArray(data?.players) ? data.players : [];
          const previousMeta = getActiveMapMeta();
          const previousKey = previousMeta?.mapKey ?? null;
          const previousImage = previousMeta?.imageUrl ?? null;
          const previousLocal = previousMeta?.localImage ?? null;
          const previousRemote = previousMeta?.remoteImage ?? null;
          const previousCustom = previousMeta?.custom ?? null;
          let mapChanged = false;
          const allowMapRefresh = reason !== 'player-reload' && reason !== 'poll';
          const hasMapField = data && Object.prototype.hasOwnProperty.call(data, 'map');
          if (hasMapField) {
            const nextMeta = data?.map || null;
            const nextKey = nextMeta?.mapKey ?? null;
            const nextImage = nextMeta?.imageUrl ?? null;
            const nextLocal = nextMeta?.localImage ?? null;
            const nextRemote = nextMeta?.remoteImage ?? null;
            const nextCustom = nextMeta?.custom ?? null;
            if (allowMapRefresh) {
              mapChanged = !!(previousMeta || nextMeta)
                && (
                  (!!previousMeta) !== (!!nextMeta)
                  || previousKey !== nextKey
                  || previousImage !== nextImage
                  || !!previousLocal !== !!nextLocal
                  || !!previousRemote !== !!nextRemote
                  || !!previousCustom !== !!nextCustom
                );
              state.mapMeta = nextMeta;
              state.mapMetaServerId = state.serverId;
            } else if (!state.mapMeta && nextMeta) {
              // Ensure initial metadata is stored even if we're only refreshing players
              state.mapMeta = nextMeta;
              state.mapMetaServerId = state.serverId;
            }
          } else if (allowMapRefresh && state.mapMetaServerId !== state.serverId) {
            state.mapMeta = null;
            state.mapMetaServerId = state.serverId;
            mapChanged = true;
          }
          if (mapChanged) {
            state.projectionMode = null;
            state.horizontalAxis = null;
            cancelMapImageRequest();
            clearMapImage();
            if (state.worldDetails) {
              state.worldDetails.seed = null;
              state.worldDetails.size = null;
              state.worldDetails.lastAttempt = 0;
            }
          }
          state.serverInfo = data?.info || null;
          state.lastUpdated = data?.fetchedAt || new Date().toISOString();
          state.status = data?.status || null;
          updateProjectionMode();
          broadcastPlayers();
          const activeMeta = getActiveMapMeta();
          const hasImage = hasMapImage(activeMeta);
          const isCustomMap = mapIsCustom(activeMeta, state.serverInfo);
          if (isCustomMap && state.serverId) {
            customMapFreezeCache.add(state.serverId);
          }
          if (!state.customMapChecksFrozen && state.serverId && customMapFreezeCache.has(state.serverId)) {
            state.customMapChecksFrozen = true;
          }
          const skipMapChecks = state.customMapChecksFrozen;
          const awaitingImagery = !skipMapChecks && state.status === 'awaiting_imagery' && !hasImage;

          if (skipMapChecks) {
            if (state.pendingGeneration) state.pendingGeneration = false;
            clearPendingRefresh();
          } else if (state.status === 'awaiting_server_info') {
            // Need size/seed from user; don't poll for imagery yet
            state.pendingGeneration = false;
            clearPendingRefresh();
          } else if (state.status === 'pending' || awaitingImagery) {
            // RustMaps is generating or we're waiting for imagery
            if (!state.pendingRefresh) schedulePendingRefresh();
            state.pendingGeneration = true;
          } else {
            // Have imagery or no generation required
            if (state.pendingGeneration) clearPendingRefresh();
            state.pendingGeneration = false;
          }

          updateConfigPanel();
          updateUploadSection();
          updateStatusMessage(hasImage);
          if (reason === 'player-reload' || reason === 'poll') {
            renderPlayerSections();
          } else {
            renderAll();
          }
          const shouldUpdateWorldDetails = !hasImage && !skipMapChecks;
          if (shouldUpdateWorldDetails) {
            ensureWorldDetails('refresh')
              .catch((err) => ctx.log?.('World detail refresh failed: ' + (err?.message || err)));
            maybeSubmitWorldDetails('refresh').catch((err) => ctx.log?.('World detail sync failed: ' + (err?.message || err)));
          }
        } catch (err) {
          state.status = null;
          if (state.pendingGeneration) {
            state.pendingGeneration = false;
            clearPendingRefresh();
          }
          updateConfigPanel();
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
          if (code === 'custom_level_url') {
            setMessage('This server is using a custom map. Upload a rendered image or configure a Facepunch level URL to enable the live map.');
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
        clearPendingRefresh();
        state.pendingGeneration = false;
        state.pendingRefresh = null;
        state.status = null;
        state.players = [];
        state.mapMeta = null;
        state.mapMetaServerId = null;
        state.serverInfo = null;
        state.lastUpdated = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
        state.customMapChecksFrozen = customMapFreezeCache.has(serverId);
        if (state.worldDetails) {
          state.worldDetails.seed = null;
          state.worldDetails.size = null;
          state.worldDetails.pending = false;
          state.worldDetails.lastAttempt = 0;
          state.worldDetails.lastSyncAt = 0;
          state.worldDetails.lastSyncKey = null;
          state.worldDetails.lastSyncStatus = null;
          state.worldDetails.reportedKey = null;
          state.worldDetails.syncing = false;
          state.worldDetails.syncError = null;
        }
        overlay.innerHTML = '';
        cancelMapImageRequest();
        clearMapImage();
        updateConfigPanel();
        clearSelection();
        const persistedStatus = loadPersistentStatusMessage();
        if (persistedStatus?.message && hasPersistentStatusForServer(serverId)) {
          setMessage(persistedStatus.message, { persist: true });
        }
        refreshData('server-connected');
        schedulePolling();
        ensureWorldDetails('server-connected')
          .catch((err) => ctx.log?.('World detail query failed: ' + (err?.message || err)))
          .finally(() => {
            maybeSubmitWorldDetails('server-connected').catch((err) => ctx.log?.('World detail sync failed: ' + (err?.message || err)));
          });
      });

      const offDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId && serverId === state.serverId) {
          stopPolling();
          clearPendingRefresh();
          state.serverId = null;
          state.players = [];
          state.mapMeta = null;
          state.mapMetaServerId = null;
          state.serverInfo = null;
          state.lastUpdated = null;
          state.pendingGeneration = false;
          state.pendingRefresh = null;
          state.status = null;
          state.projectionMode = null;
          state.horizontalAxis = null;
          state.customMapChecksFrozen = false;
          if (state.worldDetails) {
            state.worldDetails.seed = null;
            state.worldDetails.size = null;
            state.worldDetails.pending = false;
            state.worldDetails.lastAttempt = 0;
            state.worldDetails.lastSyncAt = 0;
            state.worldDetails.lastSyncKey = null;
            state.worldDetails.lastSyncStatus = null;
            state.worldDetails.reportedKey = null;
            state.worldDetails.syncing = false;
            state.worldDetails.syncError = null;
          }
          clearSelection();
          overlay.innerHTML = '';
          cancelMapImageRequest();
          clearMapImage();
          renderPlayerList();
          renderSummary();
          renderTeamInfo();
          updateUploadSection();
          updateConfigPanel();
          hideUploadNotice();
          broadcastPlayers();
          setMessage('Connect to a server to load the live map.');
        }
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        stopPolling();
        clearPendingRefresh();
        closeFullscreenWindow();
        state.serverId = null;
        state.players = [];
        state.mapMeta = null;
        state.mapMetaServerId = null;
        state.serverInfo = null;
        state.lastUpdated = null;
        state.pendingGeneration = false;
        state.pendingRefresh = null;
        state.status = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
        state.customMapChecksFrozen = false;
        if (state.worldDetails) {
          state.worldDetails.seed = null;
          state.worldDetails.size = null;
          state.worldDetails.pending = false;
          state.worldDetails.lastAttempt = 0;
          state.worldDetails.lastSyncAt = 0;
          state.worldDetails.lastSyncKey = null;
          state.worldDetails.lastSyncStatus = null;
          state.worldDetails.reportedKey = null;
          state.worldDetails.syncing = false;
          state.worldDetails.syncError = null;
        }
        clearSelection();
        overlay.innerHTML = '';
        cancelMapImageRequest();
        clearMapImage();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        updateConfigPanel();
        hideUploadNotice();
        broadcastPlayers();
        setMessage('Sign in and connect to a server to view the live map.');
      });

      const offFocus = ctx.on?.('live-players:focus', ({ steamId }) => {
        if (!steamId) {
          clearSelection();
          return;
        }
        const target = state.players.find((p) => p.steamId === steamId);
        if (!target) return;
        state.selectedSolo = steamId;
        state.selectedTeam = Number(target.teamId) > 0 ? Number(target.teamId) : null;
        renderAll();
        ctx.emit?.('live-players:highlight', { steamId });
        window.dispatchEvent(new CustomEvent('player:selected', { detail: { player: target, teamKey: teamKey(target) } }));
      });

      const offSettingsUpdate = ctx.on?.('settings:updated', () => {
        if (state.serverId && (!getActiveMapMeta() || !mapReady())) {
          refreshData('settings');
        }
      });

      ctx.onCleanup?.(() => offConnect?.());
      ctx.onCleanup?.(() => offDisconnect?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => offSettingsUpdate?.());
      ctx.onCleanup?.(() => offFocus?.());
      ctx.onCleanup?.(() => stopPolling());
      ctx.onCleanup?.(() => clearPendingRefresh());
      ctx.onCleanup?.(() => closeFullscreenWindow());
      ctx.onCleanup?.(() => {
        cancelMapImageRequest();
        if (mapImageObjectUrl) {
          try { URL.revokeObjectURL(mapImageObjectUrl); }
          catch { /* ignore */ }
          mapImageObjectUrl = null;
        }
      });

      const initialStatus = loadPersistentStatusMessage();
      if (initialStatus?.message) {
        setMessage(initialStatus.message, { persist: true });
      } else {
        setMessage('Connect to a server to load the live map.');
      }
    }
  });
})();
