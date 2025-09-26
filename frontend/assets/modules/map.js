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
    title: 'Player Map',
    order: 20,
    setup(ctx){
      ctx.root?.classList.add('module-card','live-map-card');

      const message = document.createElement('p');
      message.className = 'module-message hidden';
      ctx.body?.appendChild(message);

      const configWrap = document.createElement('div');
      configWrap.className = 'map-config hidden';
      const configIntro = document.createElement('p');
      configIntro.className = 'map-config-intro';
      configIntro.textContent = 'Enter the world size and seed to generate a live map from RustMaps.';
      const configForm = document.createElement('form');
      configForm.className = 'map-config-form';
      const sizeInput = document.createElement('input');
      sizeInput.type = 'number';
      sizeInput.min = '100';
      sizeInput.placeholder = 'World size';
      sizeInput.required = true;
      const seedInput = document.createElement('input');
      seedInput.type = 'number';
      seedInput.placeholder = 'Seed';
      seedInput.required = true;
      const configActions = document.createElement('div');
      configActions.className = 'map-config-actions';
      const configSubmit = document.createElement('button');
      configSubmit.type = 'submit';
      configSubmit.className = 'accent small';
      configSubmit.textContent = 'Fetch map';
      configActions.appendChild(configSubmit);
      configForm.appendChild(sizeInput);
      configForm.appendChild(seedInput);
      configForm.appendChild(configActions);
      const configStatus = document.createElement('p');
      configStatus.className = 'map-config-status hidden';
      configWrap.appendChild(configIntro);
      configWrap.appendChild(configForm);
      configWrap.appendChild(configStatus);
      ctx.body?.appendChild(configWrap);

      sizeInput.addEventListener('input', () => hideConfigStatus());
      seedInput.addEventListener('input', () => hideConfigStatus());
      configForm.addEventListener('submit', handleConfigSubmit);

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
        pollTimer: null,
        requirements: null,
        pendingGeneration: false,
        status: null,
        pendingRefresh: null,
        projectionMode: null,
        horizontalAxis: null
      };

      let mapImageSource = null;
      let mapImageObjectUrl = null;
      let mapImageAbort = null;

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

      function showConfigStatus(content, variant = 'info') {
        if (!configStatus) return;
        configStatus.textContent = content;
        configStatus.className = 'map-config-status ' + (variant === 'error' ? 'error' : variant === 'success' ? 'success' : '');
      }

      function hideConfigStatus() {
        if (!configStatus) return;
        configStatus.textContent = '';
        configStatus.className = 'map-config-status hidden';
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
        const needsUpload = !!(meta && meta.custom && !hasMapImage(meta));
        if (needsUpload) {
          uploadWrap.classList.remove('hidden');
        } else {
          uploadWrap.classList.add('hidden');
          hideUploadNotice();
        }
      }

      function updateConfigPanel() {
        if (!configWrap) return;
        const needsWorld = !!(state.requirements && state.requirements.world);
        const shouldShow = needsWorld || state.pendingGeneration;
        configWrap.classList.toggle('hidden', !shouldShow);
        if (!shouldShow) {
          hideConfigStatus();
          return;
        }
        if (!sizeInput.value && Number.isFinite(state.serverInfo?.size)) sizeInput.value = state.serverInfo.size;
        if (!seedInput.value && Number.isFinite(state.serverInfo?.seed)) seedInput.value = state.serverInfo.seed;
        sizeInput.disabled = state.pendingGeneration;
        seedInput.disabled = state.pendingGeneration;
        configSubmit.disabled = state.pendingGeneration;
        if (needsWorld) {
          configIntro.textContent = 'Enter the world size and seed to generate a live map from RustMaps.';
        } else if (state.pendingGeneration) {
          configIntro.textContent = 'RustMaps is generating this map. We’ll refresh automatically.';
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
        state.pendingRefresh = setTimeout(() => {
          state.pendingRefresh = null;
          refreshData('map-pending').catch((err) => ctx.log?.('Map refresh failed: ' + (err?.message || err)));
        }, delay);
      }

      function updateStatusMessage(hasImageOverride) {
        const meta = getActiveMapMeta();
        const hasImage = typeof hasImageOverride === 'boolean' ? hasImageOverride : hasMapImage(meta);
        if (state.status === 'awaiting_world_details') {
          setMessage('Enter the world size and seed to generate a live map from RustMaps.');
        } else if (state.status === 'awaiting_upload') {
          setMessage('Upload your rendered map image to enable the live map.');
        } else if (state.status === 'rustmaps_not_found' || meta?.notFound) {
          const wrap = document.createElement('span');
          wrap.textContent = 'RustMaps has not published imagery for this seed yet. Try again shortly or upload your render below.';
          setMessage(wrap);
        } else if (state.status === 'awaiting_imagery') {
          if (state.pendingGeneration) {
            setMessage('RustMaps is generating this map. We’ll refresh automatically.');
          } else {
            setMessage('Map imagery is still being prepared. Try again shortly.');
          }
        } else if (meta?.custom && !hasImage) {
          setMessage('Upload your rendered map image to enable the live map.');
        } else if (!meta) {
          setMessage('Waiting for map metadata…');
        } else if (!hasImage) {
          setMessage('Map imagery is still being prepared. Try again shortly.');
        } else if (!mapReady()) {
          setMessage('Map metadata is incomplete. Try again shortly.');
        } else {
          clearMessage();
        }
      }

      async function handleConfigSubmit(ev) {
        ev.preventDefault();
        if (!state.serverId) {
          showConfigStatus('Connect to a server before requesting imagery.', 'error');
          return;
        }
        const size = Number(sizeInput.value);
        const seed = Number(seedInput.value);
        if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(seed)) {
          showConfigStatus('Enter a valid world size and seed.', 'error');
          return;
        }
        hideConfigStatus();
        clearPendingRefresh();
        sizeInput.disabled = true;
        seedInput.disabled = true;
        configSubmit.disabled = true;
        showConfigStatus('Requesting map from RustMaps…');
        try {
          const response = await ctx.api(`/servers/${state.serverId}/live-map/world`, { size, seed }, 'POST');
          if (response?.info) {
            state.serverInfo = { ...(state.serverInfo || {}), ...response.info };
          } else {
            state.serverInfo = { ...(state.serverInfo || {}), size, seed };
          }
          state.mapMeta = response?.map || null;
          state.mapMetaServerId = state.serverId;
          state.projectionMode = null;
          state.horizontalAxis = null;
          cancelMapImageRequest();
          clearMapImage();
          state.status = response?.status || null;
          state.requirements = response?.requirements || null;
          state.lastUpdated = response?.fetchedAt || new Date().toISOString();
          const activeMeta = getActiveMapMeta();
          const hasImage = hasMapImage(activeMeta);
          const awaitingImagery = state.status === 'awaiting_imagery' && !hasImage;
          state.pendingGeneration = state.status === 'pending' || awaitingImagery;
          if (state.pendingGeneration) {
            const text = state.status === 'pending'
              ? 'RustMaps is generating this map. We’ll check again shortly.'
              : 'Map metadata saved. Waiting for imagery from RustMaps…';
            showConfigStatus(text, 'info');
            schedulePendingRefresh();
          } else {
            hideConfigStatus();
          }
          if (!state.pendingGeneration) {
            sizeInput.disabled = false;
            seedInput.disabled = false;
            configSubmit.disabled = false;
          }
          updateConfigPanel();
          updateStatusMessage(hasImage);
          renderAll();
          if (!state.pendingGeneration) clearPendingRefresh();
        } catch (err) {
          state.pendingGeneration = false;
          const code = ctx.errorCode?.(err);
          if (code === 'unauthorized') {
            ctx.handleUnauthorized?.();
            return;
          }
          if (code === 'rustmaps_api_key_missing') {
            showConfigStatus('Add your RustMaps API key in Settings to request imagery.', 'error');
          } else if (code === 'rustmaps_unauthorized') {
            showConfigStatus('RustMaps rejected the configured API key. Update it in Settings.', 'error');
          } else if (code === 'rustmaps_not_found') {
            showConfigStatus('RustMaps has not published imagery for this seed yet. Try again shortly.', 'error');
          } else if (code === 'invalid_world_config') {
            showConfigStatus('Enter a valid world size and seed.', 'error');
          } else {
            showConfigStatus(ctx.describeError?.(err) || 'Unable to request imagery from RustMaps.', 'error');
          }
          sizeInput.disabled = false;
          seedInput.disabled = false;
          configSubmit.disabled = false;
          updateConfigPanel();
          renderAll();
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
          const activeMeta = getActiveMapMeta();
          const payload = { image: dataUrl, mapKey: activeMeta?.mapKey || null };
          const response = await ctx.api(`/servers/${state.serverId}/map-image`, payload, 'POST');
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
          else if (code === 'image_too_large') showUploadNotice('The image is too large. Please upload a file under 20 MB.');
          else showUploadNotice(ctx.describeError?.(err) || 'Uploading the map image failed.');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = previousLabel;
          if (uploadInput) uploadInput.value = '';
        }
      }

      function toNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }

      function resolveWorldSize() {
        const meta = getActiveMapMeta();
        const candidates = [
          meta?.worldSize,
          meta?.size,
          meta?.mapSize,
          meta?.dimensions?.worldSize,
          state.serverInfo?.worldSize,
          state.serverInfo?.size,
          state.serverInfo?.mapSize
        ];
        for (const candidate of candidates) {
          const numeric = toNumber(candidate);
          if (numeric != null && numeric > 0) return numeric;
        }
        return null;
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
        mapImage.removeAttribute('src');
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
          return { url: resolveImageUrl(path) };
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
        return { blob };
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
          } else if (result.url) {
            clearMapImage();
            mapImage.src = result.url;
            mapImageSource = next;
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
            mapImage.src = resolveImageUrl(next);
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

      function renderMarkers() {
        overlay.innerHTML = '';
        if (!mapReady()) return;
        const axis = resolveHorizontalAxis();
        for (const player of state.players) {
          const position = projectPosition(player.position, axis);
          if (!position) continue;
          const marker = document.createElement('div');
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
          overlay.appendChild(marker);
        }
      }

      // ---- CONFLICT-FIXED: main version of renderPlayerList ----
      function renderPlayerList() {
        listWrap.innerHTML = '';

        const hasServer = !!state.serverId;
        if (!hasServer) {
          const empty = document.createElement('p');
          empty.className = 'module-message';
          empty.textContent = 'Connect to a server to view live positions.';
          listWrap.appendChild(empty);
          return;
        }

        if (state.players.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'module-message';
          empty.textContent = 'No players online right now.';
          listWrap.appendChild(empty);
          return;
        }

        const hasSelection = selectionActive();
        const matches = state.players.filter((p) => isPlayerFocused(p));

        const table = document.createElement('table');
        table.className = 'map-player-table';

        const head = document.createElement('thead');
        head.innerHTML = '<tr><th>Player</th><th>Team</th><th>Ping</th><th>Health</th><th>Connected</th></tr>';
        table.appendChild(head);

        const body = document.createElement('tbody');
        for (const player of state.players) {
          const row = document.createElement('tr');
          row.dataset.steamid = player.steamId || '';

          const focused = isPlayerFocused(player);
          if (focused) row.classList.add('active');
          else if (hasSelection) row.classList.add('dimmed');

          const nameCell = document.createElement('td');
          nameCell.className = 'map-player-name-cell';
          const nameRow = document.createElement('div');
          nameRow.className = 'map-player-name';
          const swatch = document.createElement('span');
          swatch.className = 'map-player-color';
          swatch.style.background = colorForPlayer(player);
          nameRow.appendChild(swatch);
          const label = document.createElement('span');
          label.textContent = player.displayName || player.persona || player.steamId;
          nameRow.appendChild(label);
          nameCell.appendChild(nameRow);
          const sub = document.createElement('div');
          sub.className = 'map-player-sub';
          const details = [];
          const persona = player.persona && player.persona !== label.textContent ? player.persona : null;
          if (persona) details.push(persona);
          if (player.steamId) details.push(player.steamId);
          sub.textContent = details.join(' · ') || '—';
          nameCell.appendChild(sub);
          row.appendChild(nameCell);

          const teamCell = document.createElement('td');
          teamCell.className = 'map-player-team';
          const team = teamKey(player);
          teamCell.textContent = team > 0 ? `Team ${team}` : 'Solo';
          row.appendChild(teamCell);

          const pingCell = document.createElement('td');
          pingCell.className = 'map-player-stat';
          pingCell.textContent = formatPing(player.ping);
          row.appendChild(pingCell);

          const healthCell = document.createElement('td');
          healthCell.className = 'map-player-stat';
          const hp = formatHealth(player.health);
          healthCell.textContent = hp === '—' ? '—' : `${hp} hp`;
          row.appendChild(healthCell);

          const connectedCell = document.createElement('td');
          connectedCell.className = 'map-player-stat';
          connectedCell.textContent = formatDuration(player.connectedSeconds);
          row.appendChild(connectedCell);

          row.addEventListener('click', () => selectPlayer(player));
          body.appendChild(row);
        }
        table.appendChild(body);
        listWrap.appendChild(table);

        if (hasSelection) {
          const note = document.createElement('p');
          note.className = 'map-filter-note muted small';
          note.textContent = matches.length > 0
            ? 'Players outside your selection are dimmed.'
            : 'No players match the current selection.';
          listWrap.appendChild(note);
        }
      }
      // ---------------------------------------------------------

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
        const meta = getActiveMapMeta();
        const mapName = meta?.mapName || state.serverInfo?.mapName || state.serverInfo?.map || 'Procedural Map';
        const metaLines = [
          { label: 'Players online', value: total },
          { label: 'Teams', value: teamCounts.size },
          { label: 'Solo players', value: soloCount }
        ];
        const mapSize = resolveWorldSize();
        if (mapSize) metaLines.push({ label: 'World size', value: mapSize });
        const mapSeed = meta?.seed ?? state.serverInfo?.seed;
        if (mapSeed) metaLines.push({ label: 'Seed', value: mapSeed });
        if (meta?.cachedAt) {
          const cachedTs = new Date(meta.cachedAt);
          metaLines.push({ label: 'Cached', value: cachedTs.toLocaleString() });
        }
        if (hasMapImage(meta)) {
          const source = meta.custom ? 'Uploaded image' : meta.localImage ? 'Cached copy' : 'RustMaps';
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
        const activeMeta = getActiveMapMeta();
        updateMapImage(activeMeta);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        updateConfigPanel();
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
        renderAll();
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
        renderAll();
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
        if (reason !== 'poll' && reason !== 'map-pending') setMessage('Loading live map data…');
        try {
          const data = await ctx.api(`/servers/${state.serverId}/live-map`);
          state.players = Array.isArray(data?.players) ? data.players : [];
          const previousMeta = getActiveMapMeta();
          const previousKey = previousMeta?.mapKey ?? null;
          const previousImage = previousMeta?.imageUrl ?? null;
          const previousCached = previousMeta?.cachedAt ?? null;
          const previousLocal = previousMeta?.localImage ?? null;
          const previousRemote = previousMeta?.remoteImage ?? null;
          const previousCustom = previousMeta?.custom ?? null;
          let mapChanged = false;
          const hasMapField = data && Object.prototype.hasOwnProperty.call(data, 'map');
          if (hasMapField) {
            const nextMeta = data?.map || null;
            const nextKey = nextMeta?.mapKey ?? null;
            const nextImage = nextMeta?.imageUrl ?? null;
            const nextCached = nextMeta?.cachedAt ?? null;
            const nextLocal = nextMeta?.localImage ?? null;
            const nextRemote = nextMeta?.remoteImage ?? null;
            const nextCustom = nextMeta?.custom ?? null;
            mapChanged = !!(previousMeta || nextMeta)
              && (
                (!!previousMeta) !== (!!nextMeta)
                || previousKey !== nextKey
                || previousImage !== nextImage
                || previousCached !== nextCached
                || !!previousLocal !== !!nextLocal
                || !!previousRemote !== !!nextRemote
                || !!previousCustom !== !!nextCustom
              );
            state.mapMeta = nextMeta;
            state.mapMetaServerId = state.serverId;
          } else if (state.mapMetaServerId !== state.serverId) {
            state.mapMeta = null;
            state.mapMetaServerId = state.serverId;
            mapChanged = true;
          }
          if (mapChanged) {
            state.projectionMode = null;
            state.horizontalAxis = null;
            cancelMapImageRequest();
            clearMapImage();
          }
          state.serverInfo = data?.info || null;
          state.lastUpdated = data?.fetchedAt || new Date().toISOString();
          state.status = data?.status || null;
          state.requirements = data?.requirements || null;
          updateProjectionMode();
          broadcastPlayers();
          const activeMeta = getActiveMapMeta();
          const hasImage = hasMapImage(activeMeta);
          const awaitingImagery = state.status === 'awaiting_imagery' && !hasImage;

          if (state.status === 'awaiting_world_details') {
            // Need size/seed from user; don't poll for imagery yet
            state.pendingGeneration = false;
            clearPendingRefresh();
          } else if (state.status === 'pending' || awaitingImagery) {
            // RustMaps is generating or we're waiting for imagery
            if (!state.pendingGeneration) schedulePendingRefresh();
            state.pendingGeneration = true;
          } else {
            // Have imagery or no generation required
            if (state.pendingGeneration) clearPendingRefresh();
            state.pendingGeneration = false;
          }

          updateConfigPanel();
          updateUploadSection();
          updateStatusMessage(hasImage);
          renderAll();
        } catch (err) {
          state.status = null;
          state.requirements = null;
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
        state.requirements = null;
        state.status = null;
        state.players = [];
        state.mapMeta = null;
        state.mapMetaServerId = null;
        state.serverInfo = null;
        state.lastUpdated = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
        overlay.innerHTML = '';
        cancelMapImageRequest();
        clearMapImage();
        hideConfigStatus();
        updateConfigPanel();
        clearSelection();
        refreshData('server-connected');
        schedulePolling();
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
          state.requirements = null;
          state.status = null;
          state.projectionMode = null;
          state.horizontalAxis = null;
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
          hideConfigStatus();
          broadcastPlayers();
          setMessage('Connect to a server to load the live map.');
        }
      });

      const offLogout = ctx.on?.('auth:logout', () => {
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
        state.requirements = null;
        state.status = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
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
        hideConfigStatus();
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
      ctx.onCleanup?.(() => {
        cancelMapImageRequest();
        if (mapImageObjectUrl) {
          try { URL.revokeObjectURL(mapImageObjectUrl); }
          catch { /* ignore */ }
          mapImageObjectUrl = null;
        }
      });

      setMessage('Connect to a server to load the live map.');
    }
  });
})();
