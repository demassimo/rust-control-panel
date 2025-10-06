(function(){
  if (typeof window.registerModule !== 'function') return;

  const COLOR_PALETTE = ['#f97316','#22d3ee','#a855f7','#84cc16','#ef4444','#facc15','#14b8a6','#e11d48','#3b82f6','#8b5cf6','#10b981','#fb7185'];
  const CUSTOM_POLL_MIN_MS = 30000;
  const STANDARD_POLL_MIN_MS = 5000;
  const DEFAULT_POLL_INTERVAL = CUSTOM_POLL_MIN_MS;
  let effectivePollMin = CUSTOM_POLL_MIN_MS;
  let manualRefreshMinMs = CUSTOM_POLL_MIN_MS;
  const MAX_POLL_INTERVAL = 120000;
  const PLAYER_REFRESH_INTERVAL = 60000;
  const WORLD_SYNC_THROTTLE = 15000;
  const REFRESH_STORAGE_KEY = 'live-map:poll-interval';
  const STATUS_MESSAGE_STORAGE_KEY = 'live-map:last-status-message';
  const MARKER_ANIMATION_DURATION_MS = 5000;
  const REFRESH_OPTIONS = [
    { value: 5000, label: 'Every 5 seconds' },
    { value: 10000, label: 'Every 10 seconds' },
    { value: 20000, label: 'Every 20 seconds' },
    { value: 30000, label: 'Every 30 seconds' },
    { value: 60000, label: 'Every minute' },
    { value: 120000, label: 'Every 2 minutes' }
  ];

  const markerAnimationStates = new Map();

  function svgDataUri(svg) {
    const source = typeof svg === 'string' ? svg.trim() : '';
    return `url("data:image/svg+xml,${encodeURIComponent(source)}")`;
  }

  const MAP_ICON_ASSETS = {
    'map-pin': {
      id: 'map-pin',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M12 2a6 6 0 0 0-6 6c0 4.24 4.05 9.32 5.53 11.01.26.3.68.3.94 0C13.95 17.32 18 12.24 18 8a6 6 0 0 0-6-6Zm0 8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>'),
      color: '#facc15'
    },
    'oil-rig': {
      id: 'oil-rig',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2l2 6h3l-6 10-6-10h3l2-6Zm-6 18h14v2H5z"/></svg>'),
      color: '#f97316'
    },
    'sphere-tank': {
      id: 'sphere-tank',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4a8 8 0 0 1 8 8v5H4v-5a8 8 0 0 1 8-8Zm0 11a5 5 0 0 1-5-5h10a5 5 0 0 1-5 5Zm-5 3h10v2H7z"/></svg>'),
      color: '#fb923c'
    },
    lighthouse: {
      id: 'lighthouse',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 9 4.5 12 7l3-2.5L12 2Zm-2 7h4l2 11H8l2-11Zm-3 11h10v2H7z"/></svg>'),
      color: '#60a5fa'
    },
    harbor: {
      id: 'harbor',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2v3.17a2.5 2.5 0 1 1-2 0V2Zm1 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7.5 2.5H18a6 6 0 0 1-4 5.65V14h2v-2h-4v2h2v3.65A6 6 0 0 1 6 12H4.5A7.5 7.5 0 0 0 12 19.5 7.5 7.5 0 0 0 19.5 12Z"/></svg>'),
      color: '#38bdf8'
    },
    rocket: {
      id: 'rocket',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c2.84 0 5.5 1.13 7.07 3.07L14 10l-2 5-2-5-5.07-4.93A9.27 9.27 0 0 1 12 2Zm-7 13.5L9.5 12l1.5 4-3 3-3 .75.75-3ZM19 15.5 14.5 12 13 16l3 3 .75 3 .75-3Z"/></svg>'),
      color: '#f87171'
    },
    airfield: {
      id: 'airfield',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 21 9v2l-7 2v7l-2 2-2-2v-7l-7-2V9l9-7Z"/></svg>'),
      color: '#93c5fd'
    },
    'train-yard': {
      id: 'train-yard',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M7 3h10a3 3 0 0 1 3 3v6a4 4 0 0 1-4 4l2 3v1h-2l-2-3h-4l-2 3H6v-1l2-3a4 4 0 0 1-4-4V6a3 3 0 0 1 3-3Zm-1 5h4V6H6v2Zm8 0h4V6h-4v2Zm-5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>'),
      color: '#c084fc'
    },
    'train-station': {
      id: 'train-station',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 9V7l7-5 7 5v2h2v11h-4v-5H7v5H3V9h2Zm7-4-4 3h8l-4-3Zm5 7v7h2v-7h-2Zm-12 0v7h2v-7H5Zm5 3h4v6h-4v-6Z"/></svg>'),
      color: '#a855f7'
    },
    'power-plant': {
      id: 'power-plant',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 7 13h4l-2 9 7-12h-4l2-8Z"/></svg>'),
      color: '#fde047'
    },
    military: {
      id: 'military',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.5 8.74 8 11 4.5-2.26 8-6 8-11V5l-8-3Zm0 6 1.76 3.38 3.74.54-2.7 2.64.64 3.72L12 16.5l-3.44 1.78.64-3.72-2.7-2.64 3.74-.54L12 8Z"/></svg>'),
      color: '#f87171'
    },
    bandit: {
      id: 'bandit',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2v3.05A7 7 0 0 1 18.95 11H22v2h-3.05A7 7 0 0 1 13 18.95V22h-2v-3.05A7 7 0 0 1 5.05 13H2v-2h3.05A7 7 0 0 1 11 5.05V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/></svg>'),
      color: '#f97316'
    },
    satellite: {
      id: 'satellite',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 3 3 5l6 6-2 2-3-3-2 2 6 6 2-2-3-3 2-2 6 6 2-2-2-2 3-3 2 2 2-2-6-6-2 2 2 2-3 3-6-6ZM18.5 2a3.5 3.5 0 0 1 3.5 3.5h-2a1.5 1.5 0 0 0-1.5-1.5V2Zm3.5 7h-2a4.5 4.5 0 0 0-4.5-4.5V3a6.5 6.5 0 0 1 6.5 6.5Z"/></svg>'),
      color: '#22d3ee'
    },
    junkyard: {
      id: 'junkyard',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2l.4 2.4a7 7 0 0 1 2.2.9l2.1-1.2 1.4 1.4-1.2 2.1c.4.7.7 1.5.9 2.2L22 11v2l-2.4.4a7 7 0 0 1-.9 2.2l1.2 2.1-1.4 1.4-2.1-1.2a7 7 0 0 1-2.2.9L13 22h-2l-.4-2.4a7 7 0 0 1-2.2-.9l-2.1 1.2-1.4-1.4 1.2-2.1a7 7 0 0 1-.9-2.2L2 13v-2l2.4-.4a7 7 0 0 1 .9-2.2L4.1 6.3 5.5 4.9l2.1 1.2a7 7 0 0 1 2.2-.9L11 2Zm1 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>'),
      color: '#facc15'
    },
    ranch: {
      id: 'ranch',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3 5 8v11h4v-4h6v4h4V8l-7-5Zm0 3.2 4 2.8v.5H8v-.5l4-2.8Zm-2 9.8v4H8v-4h2Zm6 0v4h-2v-4h2Z"/></svg>'),
      color: '#fcd34d'
    },
    fishing: {
      id: 'fishing',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 12c2.5-3.5 6-6 10-6a6 6 0 0 1 6 6 6 6 0 0 1-6 6c-4 0-7.5-2.5-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8.5-3 2 1.5-2 1.5a11 11 0 0 1 0-3Zm14-6.5a2.5 2.5 0 0 1 0 5v-5Z"/></svg>'),
      color: '#38bdf8'
    },
    'gas-station': {
      id: 'gas-station',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h9a2 2 0 0 1 2 2v14h1a2 2 0 0 0 2-2v-5.59l.3.3a2 2 0 0 0 1.4.58H22V10h-1l-1-1V5a2 2 0 0 0-2-2h-1V1h-2v4H5v16H3V8a5 5 0 0 1 2-5Zm2 6h7V6H7v3Zm0 3h7v8H7v-8Z"/></svg>'),
      color: '#f97316'
    },
    store: {
      id: 'store',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16l1 4a3 3 0 0 1-3 3 3 3 0 0 1-2-1 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-2 1 3 3 0 0 1-3-3l1-4Zm2 12v-4a3 3 0 0 0 2 1 3 3 0 0 0 2-1 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 2 1v4h-4v4H10v-4H6Z"/></svg>'),
      color: '#facc15'
    },
    excavator: {
      id: 'excavator',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 14h2l3-6h3l2 4h3l-1.5-3H21l1 2-2 1 2 4v2h-4a3 3 0 1 1-6 0H9a3 3 0 1 1-6 0H2v-3l1-1Zm3.5 5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Zm9 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"/></svg>'),
      color: '#f97316'
    },
    'cargo-ship': {
      id: 'cargo-ship',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 10h4l2-4h6l2 4h4v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-5Zm2 2v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3h-2l-2-4h-4l-2 4H5Z"/></svg>'),
      color: '#38bdf8'
    },
    'patrol-helicopter': {
      id: 'patrol-helicopter',
      mask: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18v2h-8l3 4h5v2h-3v3a4 4 0 0 1-4 4h-2l-1 2h-2l-1-2H8a4 4 0 0 1-4-4v-3H3v-2h11l-3-4H3V4Zm5 9a2 2 0 1 0 0 4h8a2 2 0 1 0 0-4H8Z"/></svg>'),
      color: '#f87171'
    }
  };

  const MAP_ICON_ALIAS = {
    oilrig: 'oil-rig',
    oilrigs: 'oil-rig',
    harbour: 'harbor',
    dome: 'sphere-tank',
    spheretank: 'sphere-tank',
    launchsite: 'rocket',
    launchpad: 'rocket',
    airstrip: 'airfield',
    trainyard: 'train-yard',
    trainstation: 'train-station',
    powerplant: 'power-plant',
    militarytunnel: 'military',
    outpost: 'military',
    banditcamp: 'bandit',
    satellitearray: 'satellite',
    disharray: 'satellite',
    junkyard: 'junkyard',
    ranch: 'ranch',
    fishingvillage: 'fishing',
    gasstation: 'gas-station',
    supermarket: 'store',
    shop: 'store',
    excavator: 'excavator',
    cargoship: 'cargo-ship',
    'cargo-ship': 'cargo-ship',
    patrolhelicopter: 'patrol-helicopter',
    'patrol-helicopter': 'patrol-helicopter',
    pin: 'map-pin'
  };

  function applyMarkerIcon(marker, iconValue, fallbackSymbol = '📍') {
    if (!marker) return;
    const raw = typeof iconValue === 'string' ? iconValue.trim() : '';
    const normalized = raw ? raw.toLowerCase().replace(/[_\s]+/g, '-') : '';
    const cleaned = normalized.replace(/[^a-z0-9-]/g, '');
    const aliasKey = cleaned.replace(/-/g, '');
    const resolvedKey = (cleaned && MAP_ICON_ASSETS[cleaned])
      ? cleaned
      : (aliasKey && MAP_ICON_ALIAS[aliasKey]) || (cleaned && MAP_ICON_ALIAS[cleaned]) || '';
    const asset = resolvedKey ? MAP_ICON_ASSETS[resolvedKey] : null;

    if (asset) {
      marker.classList.add('map-icon-graphic');
      marker.dataset.icon = asset.id;
      marker.dataset.symbol = '';
      marker.style.setProperty('--icon-mask', asset.mask);
      if (asset.color) marker.style.setProperty('--icon-color', asset.color);
      else marker.style.removeProperty('--icon-color');
      return;
    }

    marker.classList.remove('map-icon-graphic');
    delete marker.dataset.icon;
    const symbol = raw || fallbackSymbol || '';
    marker.dataset.symbol = symbol;
    marker.style.removeProperty('--icon-mask');
    marker.style.removeProperty('--icon-color');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function parsePercent(value, fallback = 0) {
    const numeric = parseFloat(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function setMarkerPosition(marker, left, top) {
    if (!marker) return;
    marker.style.left = left + '%';
    marker.style.top = top + '%';
  }

  function scheduleMarkerFrame(state, step) {
    if (typeof requestAnimationFrame === 'function') {
      state.rafId = requestAnimationFrame(step);
      return;
    }
    state.timeoutId = setTimeout(() => step(now()), 16);
  }

  function stopMarkerAnimation(marker) {
    const state = markerAnimationStates.get(marker);
    if (!state) return;
    if (state.rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(state.rafId);
    }
    if (state.timeoutId != null) {
      clearTimeout(state.timeoutId);
    }
    markerAnimationStates.delete(marker);
  }

  function animateMarkerTo(marker, targetLeft, targetTop) {
    if (!marker) return;

    const currentTime = now();
    const existing = markerAnimationStates.get(marker);
    let startLeft;
    let startTop;

    if (existing) {
      const elapsed = currentTime - existing.startTime;
      const progress = existing.duration > 0 ? clamp(elapsed / existing.duration, 0, 1) : 1;
      startLeft = existing.startLeft + existing.deltaLeft * progress;
      startTop = existing.startTop + existing.deltaTop * progress;
    } else {
      startLeft = parsePercent(marker.style.left, targetLeft);
      startTop = parsePercent(marker.style.top, targetTop);
    }

    if (!Number.isFinite(startLeft)) startLeft = targetLeft;
    if (!Number.isFinite(startTop)) startTop = targetTop;

    const deltaLeft = targetLeft - startLeft;
    const deltaTop = targetTop - startTop;

    if (Math.abs(deltaLeft) <= 0.001 && Math.abs(deltaTop) <= 0.001) {
      stopMarkerAnimation(marker);
      setMarkerPosition(marker, targetLeft, targetTop);
      return;
    }

    const animation = {
      startLeft,
      startTop,
      targetLeft,
      targetTop,
      deltaLeft,
      deltaTop,
      startTime: currentTime,
      duration: MARKER_ANIMATION_DURATION_MS,
      rafId: null,
      timeoutId: null
    };

    stopMarkerAnimation(marker);
    markerAnimationStates.set(marker, animation);
    setMarkerPosition(marker, startLeft, startTop);

    const step = (timestamp) => {
      const frameTime = typeof timestamp === 'number' ? timestamp : now();
      const elapsed = frameTime - animation.startTime;
      const progress = animation.duration > 0 ? clamp(elapsed / animation.duration, 0, 1) : 1;
      const currentLeft = animation.startLeft + animation.deltaLeft * progress;
      const currentTop = animation.startTop + animation.deltaTop * progress;
      setMarkerPosition(marker, currentLeft, currentTop);

      if (progress < 1) {
        scheduleMarkerFrame(animation, step);
      } else {
        stopMarkerAnimation(marker);
        setMarkerPosition(marker, animation.targetLeft, animation.targetTop);
      }
    };

    scheduleMarkerFrame(animation, step);
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

  function resolveSteamId(player) {
    if (!player || typeof player !== 'object') return '';
    const candidates = [
      player.steamId,
      player.SteamID,
      player.userid,
      player.userId,
      player.UserId,
      player.id,
      player.ID,
      player.entityId,
      player.EntityId
    ];
    for (const candidate of candidates) {
      if (candidate == null) continue;
      const value = String(candidate);
      if (value) return value;
    }
    return '';
  }

  function escapeSelector(value) {
    const str = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(str);
    }
    return str.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  function resolvePlayerAvatar(player) {
    const profile = player?.steamProfile || {};
    const candidates = [
      profile.avatarMedium,
      profile.avatarmedium,
      profile.avatar,
      profile.avatarFull,
      profile.avatarfull,
      player?.avatar,
      player?.avatarMedium,
      player?.avatar_medium,
      player?.avatarFull,
      player?.avatarfull,
      player?.avatarUrl,
      player?.avatar_url
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
    return null;
  }

  function avatarInitial(name = '') {
    const trimmed = String(name).trim();
    if (!trimmed) return '?';
    const codePoint = trimmed.codePointAt(0);
    return String.fromCodePoint(codePoint).toUpperCase();
  }

  function playerDisplayName(player) {
    if (!player || typeof player !== 'object') return 'Player';
    const profile = player.steamProfile || {};
    return (
      player.displayName
      || profile.persona
      || profile.personaName
      || player.persona
      || player.DisplayName
      || resolveSteamId(player)
      || 'Player'
    );
  }

  function getMinimumPollInterval() {
    return effectivePollMin;
  }

  function getManualRefreshMinimum() {
    return manualRefreshMinMs;
  }

  function normaliseRefreshPreference(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_POLL_INTERVAL;
    return clamp(numeric, STANDARD_POLL_MIN_MS, MAX_POLL_INTERVAL);
  }

  function normaliseRefreshInterval(value) {
    const numeric = Number(value);
    const minimum = getMinimumPollInterval();
    if (!Number.isFinite(numeric) || numeric <= 0) return minimum;
    return clamp(numeric, minimum, MAX_POLL_INTERVAL);
  }

  function loadRefreshPreference() {
    if (typeof window === 'undefined') return DEFAULT_POLL_INTERVAL;
    try {
      const stored = window.localStorage?.getItem?.(REFRESH_STORAGE_KEY);
      if (stored == null) return DEFAULT_POLL_INTERVAL;
      return normaliseRefreshPreference(stored);
    } catch (err) {
      return DEFAULT_POLL_INTERVAL;
    }
  }

  function persistRefreshInterval(value) {
    if (typeof window === 'undefined') return;
    try {
      const preference = normaliseRefreshPreference(value);
      window.localStorage?.setItem?.(REFRESH_STORAGE_KEY, String(preference));
    } catch (err) {
      // Ignore storage errors
    }
  }

  function vectorFromEntry(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.position && typeof value.position === 'object') {
      const nested = vectorFromEntry(value.position);
      if (nested) return nested;
    }
    const x = toNumber(value.x ?? value.X ?? value.positionX ?? value.worldX ?? value[0]);
    const y = toNumber(value.y ?? value.Y ?? value.positionY ?? value.worldY ?? value[1]);
    const z = toNumber(value.z ?? value.Z ?? value.positionZ ?? value.worldZ ?? value[2]);
    if (x == null) return null;
    const result = { x };
    if (y != null) result.y = y;
    if (z != null) result.z = z;
    if (result.y == null && result.z == null) return null;
    return result;
  }

  function normaliseWorldEntities(payload) {
    const result = {
      fetchedAt: null,
      monuments: [],
      entities: []
    };
    if (!payload || typeof payload !== 'object') return result;
    if (payload.fetchedAt != null) {
      const stamp = String(payload.fetchedAt).trim();
      result.fetchedAt = stamp || null;
    }
    if (Array.isArray(payload.monuments)) {
      payload.monuments.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const position = vectorFromEntry(entry.position || entry.location || entry.coords || entry);
        if (!position) return;
        const id = entry.id != null ? String(entry.id) : `mon-${index}`;
        const label = entry.label || entry.name || entry.displayName || entry.shortName || 'Monument';
        const shortName = entry.shortName || entry.token || entry.name || entry.displayName || label;
        const icon = entry.icon || null;
        const category = entry.category || entry.type || entry.kind || null;
        result.monuments.push({ id, label, shortName, icon, category, position });
      });
    }
    if (Array.isArray(payload.entities)) {
      payload.entities.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const position = vectorFromEntry(entry.position || entry.coords || entry);
        if (!position) return;
        const id = entry.id != null ? String(entry.id) : `${entry.type || 'entity'}-${index}`;
        const label = entry.label || entry.name || entry.type || 'Entity';
        const icon = entry.icon || null;
        const type = entry.type || null;
        const status = entry.status || null;
        result.entities.push({ id, label, icon, type, status, position });
      });
    }
    return result;
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

      const mapStage = document.createElement('div');
      mapStage.className = 'map-stage';

      const mapCanvas = document.createElement('div');
      mapCanvas.className = 'map-canvas';
      mapCanvas.style.transformOrigin = 'center center';

      const mapImage = document.createElement('img');
      mapImage.alt = 'Rust world map';
      mapImage.loading = 'lazy';
      const overlay = document.createElement('div');
      overlay.className = 'map-overlay';
      overlay.style.setProperty('--marker-scale', '1');
      const overlayLayers = {
        monuments: document.createElement('div'),
        events: document.createElement('div'),
        players: document.createElement('div')
      };
      for (const [key, layer] of Object.entries(overlayLayers)) {
        layer.className = `map-overlay-layer map-layer-${key}`;
        overlay.appendChild(layer);
      }
      const message = document.createElement('div');
      message.className = 'map-placeholder';
      mapCanvas.appendChild(mapImage);
      mapCanvas.appendChild(overlay);
      mapStage.appendChild(mapCanvas);
      mapStage.appendChild(message);

      const interactionHint = document.createElement('div');
      interactionHint.className = 'map-interaction-hint map-interaction-hint-visible';
      const interactionHintContent = document.createElement('div');
      interactionHintContent.className = 'map-interaction-hint-content';
      interactionHintContent.textContent = 'Hold Ctrl and scroll to zoom the map.';
      interactionHint.appendChild(interactionHintContent);
      mapStage.appendChild(interactionHint);
      mapView.appendChild(mapStage);

      const markerPopup = document.createElement('div');
      markerPopup.className = 'map-marker-popup hidden';
      const markerPopupCard = document.createElement('div');
      markerPopupCard.className = 'map-marker-popup-card';
      const markerPopupArrow = document.createElement('div');
      markerPopupArrow.className = 'map-marker-popup-arrow';
      markerPopup.appendChild(markerPopupCard);
      markerPopup.appendChild(markerPopupArrow);
      mapView.appendChild(markerPopup);
      markerPopupCard.addEventListener('click', (event) => event.stopPropagation());

      const sidebar = document.createElement('div');
      sidebar.className = 'map-sidebar';

      const summary = document.createElement('div');
      summary.className = 'map-summary';
      sidebar.appendChild(summary);

      const teamInfo = document.createElement('div');
      teamInfo.className = 'map-team-info hidden';
      sidebar.appendChild(teamInfo);

      const listWrap = document.createElement('div');
      listWrap.className = 'map-player-list';
      sidebar.appendChild(listWrap);

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

      const viewportSizeCache = new WeakMap();
      let viewportSizeUpdateHandle = null;
      let viewportSizeUpdateScheduled = false;

      const parentView = ctx.root?.closest?.('[data-view]');
      let visibilityObserver = null;
      if (parentView && typeof MutationObserver === 'function') {
        try {
          visibilityObserver = new MutationObserver(() => {
            scheduleViewportSizeUpdate({ immediate: true });
          });
          visibilityObserver.observe(parentView, { attributes: true, attributeFilter: ['aria-hidden', 'class', 'style'] });
        } catch (err) {
          visibilityObserver = null;
        }
      }

      const initialPollPreference = loadRefreshPreference();

      const state = {
        serverId: null,
        players: [],
        mapMeta: null,
        mapMetaServerId: null,
        serverInfo: null,
        playerDataSources: null,
        imageWorldSize: null,
        teamColors: new Map(),
        selectedTeam: null,
        selectedSolo: null,
        activePopupSteamId: null,
        activeClusterId: null,
        activeClusterMembers: null,
        lastUpdated: null,
        pollPreference: initialPollPreference,
        pollInterval: DEFAULT_POLL_INTERVAL,
        pollTimer: null,
        playerReloadTimer: null,
        pendingGeneration: false,
        status: null,
        pendingRefresh: null,
        projectionMode: null,
        horizontalAxis: null,
        estimatedWorldSize: null,
        estimatedWorldSizeSource: null,
        customMapChecksFrozen: false,
        manualCooldownUntil: 0,
        manualCooldownMessage: null,
        worldEntities: {
          fetchedAt: null,
          monuments: [],
          entities: []
        },
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

      state.pollInterval = normaliseRefreshInterval(state.pollPreference);

      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
      }

      let mapImageSource = null;
      let mapImageObjectUrl = null;
      let mapImageAbort = null;
      let mapImageLocked = false;

      const MAP_SIZE_MIN = 260;
      const MAP_SIZE_MAX = 1600;
      const MAP_SIZE_VERTICAL_MARGIN = 96;
      const scheduleViewportAnimationFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (fn) => setTimeout(fn, 16);
      const cancelViewportAnimationFrame = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : (handle) => clearTimeout(handle);

      const mainViewport = {
        win: window,
        doc: document,
        mapView,
        mapCanvas,
        mapImage,
        overlay,
        markers: new Map(),
        layers: overlayLayers,
        message,
        summary,
        teamInfo,
        listWrap,
        refreshDisplay: null,
        zoomSlider: null,
        zoomInput: null,
        popup: {
          wrap: markerPopup,
          card: markerPopupCard,
          arrow: markerPopupArrow,
          currentClusterId: null
        }
      };

      ensureViewportLayers(mainViewport);

      const mapInteractions = {
        minScale: 1,
        maxScale: 4,
        scale: 1,
        offsetX: 0,
        offsetY: 0
      };

      scheduleViewportSizeUpdate({ immediate: true });

      const panState = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        startOffsetX: 0,
        startOffsetY: 0,
        moved: false
      };

      const zoomHintState = {
        attempts: 0,
        lastAttempt: 0,
        visible: true
      };
      const ZOOM_HINT_THRESHOLD = 3;
      const ZOOM_HINT_RESET_MS = 1200;

      let preventNextMapClick = false;

      mapImage.addEventListener('load', () => {
        mapView.classList.add('map-view-has-image');
        if (typeof console !== 'undefined' && typeof console.log === 'function') {
          const canvasRect = mapCanvas && typeof mapCanvas.getBoundingClientRect === 'function'
            ? mapCanvas.getBoundingClientRect()
            : null;
          console.log('[live-map] Map image loaded', {
            source: mapImageSource ?? mapImage.currentSrc ?? mapImage.src ?? null,
            naturalWidth: Number.isFinite(mapImage.naturalWidth) ? mapImage.naturalWidth : null,
            naturalHeight: Number.isFinite(mapImage.naturalHeight) ? mapImage.naturalHeight : null,
            renderedWidth: mapImage.clientWidth || canvasRect?.width || null,
            renderedHeight: mapImage.clientHeight || canvasRect?.height || null
          });
        }
        updateImageWorldSize();
        resetMapTransform();
        renderPlayerSections();
        scheduleViewportSizeUpdate({ immediate: true });
      });

      mapImage.addEventListener('error', () => {
        mapView.classList.remove('map-view-has-image');
        state.imageWorldSize = null;
        renderPlayerSections();
        scheduleViewportSizeUpdate({ immediate: true });
      });

      const handleResize = () => {
        scheduleViewportSizeUpdate();
        applyMapTransform();
      };

      window.addEventListener('resize', handleResize);

      mapView.addEventListener('click', (event) => {
        if (preventNextMapClick) {
          preventNextMapClick = false;
          return;
        }
        if (event.defaultPrevented) return;
        clearSelection();
      });

      mapView.addEventListener('wheel', handleWheel, { passive: false });

      mapCanvas.addEventListener('pointerdown', handleMapPointerDown);
      mapCanvas.addEventListener('pointermove', handleMapPointerMove);
      mapCanvas.addEventListener('pointerup', handleMapPointerUp);
      mapCanvas.addEventListener('pointercancel', handleMapPointerUp);

      function getActiveViewports() {
        return [mainViewport];
      }

      function scheduleViewportSizeUpdate(options = {}) {
        const { immediate = false } = options;
        if (immediate) {
          if (viewportSizeUpdateHandle != null) {
            cancelViewportAnimationFrame(viewportSizeUpdateHandle);
            viewportSizeUpdateHandle = null;
          }
          viewportSizeUpdateScheduled = false;
          applyViewportSizeUpdates();
          return;
        }
        if (viewportSizeUpdateScheduled) return;
        viewportSizeUpdateScheduled = true;
        viewportSizeUpdateHandle = scheduleViewportAnimationFrame(() => {
          viewportSizeUpdateHandle = null;
          viewportSizeUpdateScheduled = false;
          applyViewportSizeUpdates();
        });
      }

      function applyViewportSizeUpdates() {
        const viewports = getActiveViewports();
        for (const viewport of viewports) {
          applyViewportSizeToViewport(viewport);
        }
      }

      function applyViewportSizeToViewport(viewport) {
        const mapElement = viewport?.mapView;
        if (!mapElement) return;

        if (mapElement.classList.contains('map-view-has-message')) {
          viewportSizeCache.delete(mapElement);
          mapElement.classList.remove('map-view-dynamic');
          mapElement.style.removeProperty('--map-size');
          return;
        }

        const previousSize = viewportSizeCache.get(mapElement);
        const hadDynamicClass = mapElement.classList.contains('map-view-dynamic');
        const previousInlineValue = mapElement.style.getPropertyValue('--map-size');

        const containerWidth = mapElement.parentElement?.clientWidth;
        const width = Number.isFinite(containerWidth) && containerWidth > 0
          ? containerWidth
          : mapElement.offsetWidth;
        if (!width || width <= 0) {
          if (previousInlineValue) {
            mapElement.style.setProperty('--map-size', previousInlineValue);
          } else if (Number.isFinite(previousSize)) {
            mapElement.style.setProperty('--map-size', `${previousSize}px`);
          }
          if (hadDynamicClass) {
            mapElement.classList.add('map-view-dynamic');
          }
          return;
        }

        const heightLimit = computeViewportHeightLimit(width);

        let size = Math.min(width, heightLimit);
        if (width >= MAP_SIZE_MIN && heightLimit >= MAP_SIZE_MIN) {
          size = Math.max(size, MAP_SIZE_MIN);
        }
        size = Math.max(0, Math.round(size));
        if (!size) {
          viewportSizeCache.delete(mapElement);
          mapElement.classList.remove('map-view-dynamic');
          mapElement.style.removeProperty('--map-size');
          return;
        }

        viewportSizeCache.set(mapElement, size);
        mapElement.style.setProperty('--map-size', `${size}px`);
        if (!hadDynamicClass) {
          mapElement.classList.add('map-view-dynamic');
        }
      }

      function computeViewportHeightLimit(desiredWidth) {
        const viewportHeight = typeof window !== 'undefined' ? Number(window.innerHeight) : NaN;
        let limit = Number.isFinite(viewportHeight) ? viewportHeight : MAP_SIZE_MAX;
        const layoutRect = typeof layout?.getBoundingClientRect === 'function' ? layout.getBoundingClientRect() : null;
        if (layoutRect && Number.isFinite(layoutRect.top)) {
          limit -= layoutRect.top;
        }
        limit -= MAP_SIZE_VERTICAL_MARGIN;
        if (Number.isFinite(desiredWidth) && desiredWidth > 0) {
          limit = Math.max(limit, desiredWidth);
        }
        if (!Number.isFinite(limit)) {
          return MAP_SIZE_MAX;
        }
        return Math.min(MAP_SIZE_MAX, Math.max(0, limit));
      }

      function getViewportMarkerStore(viewport) {
        if (!viewport) return null;
        if (!viewport.markers || !(viewport.markers instanceof Map)) {
          viewport.markers = new Map();
        }
        return viewport.markers;
      }

      function getViewportEntityStore(viewport) {
        if (!viewport) return null;
        if (!viewport.entityMarkers || !(viewport.entityMarkers instanceof Map)) {
          viewport.entityMarkers = new Map();
        }
        return viewport.entityMarkers;
      }

      function getViewportMonumentStore(viewport) {
        if (!viewport) return null;
        if (!viewport.monumentMarkers || !(viewport.monumentMarkers instanceof Map)) {
          viewport.monumentMarkers = new Map();
        }
        return viewport.monumentMarkers;
      }

      function ensureViewportLayers(viewport) {
        if (!viewport || !viewport.overlay) return null;
        if (!viewport.layers || typeof viewport.layers !== 'object') {
          viewport.layers = {};
        }
        const container = viewport.overlay;
        const doc = viewport.doc || document;
        const keys = ['monuments', 'events', 'players'];
        for (const key of keys) {
          let layer = viewport.layers[key];
          if (!layer || layer.nodeType !== 1) {
            layer = doc.createElement('div');
            viewport.layers[key] = layer;
          }
          layer.className = `map-overlay-layer map-layer-${key}`;
          if (layer.parentNode !== container) {
            container.appendChild(layer);
          }
        }
        return viewport.layers;
      }

      function getViewportLayer(viewport, key) {
        const layers = ensureViewportLayers(viewport);
        return layers ? layers[key] || viewport.overlay : viewport.overlay;
      }

      function clearViewportMarkers(viewport) {
        if (!viewport || !viewport.overlay) return;
        const playerStore = getViewportMarkerStore(viewport);
        if (playerStore?.size) {
          for (const marker of playerStore.values()) {
            stopMarkerAnimation(marker);
          }
          playerStore.clear();
        }
        const entityStore = getViewportEntityStore(viewport);
        if (entityStore?.size) {
          for (const marker of entityStore.values()) {
            stopMarkerAnimation(marker);
          }
          entityStore.clear();
        }
        const monumentStore = getViewportMonumentStore(viewport);
        if (monumentStore?.size) {
          for (const marker of monumentStore.values()) {
            stopMarkerAnimation(marker);
          }
          monumentStore.clear();
        }
        viewport.overlay.innerHTML = '';
        const layers = ensureViewportLayers(viewport);
        if (layers) {
          for (const layer of Object.values(layers)) {
            if (layer) layer.innerHTML = '';
          }
        }
      }

      function clearAllViewportMarkers() {
        for (const viewport of getActiveViewports()) {
          clearViewportMarkers(viewport);
        }
      }

      function clampMapOffsets() {
        if (!mapView) return;
        const { scale, minScale } = mapInteractions;
        if (scale <= minScale + 0.001) {
          mapInteractions.offsetX = 0;
          mapInteractions.offsetY = 0;
          return;
        }
        const rect = mapView.getBoundingClientRect();
        const maxX = Math.max(0, (rect.width * (scale - 1)) / 2);
        const maxY = Math.max(0, (rect.height * (scale - 1)) / 2);
        mapInteractions.offsetX = clamp(mapInteractions.offsetX, -maxX, maxX);
        mapInteractions.offsetY = clamp(mapInteractions.offsetY, -maxY, maxY);
      }

      function applyMapTransform({ clamp = true } = {}) {
        if (!mapCanvas) return;
        if (clamp) clampMapOffsets();
        const { scale, offsetX, offsetY, minScale } = mapInteractions;
        mapCanvas.style.transform = `scale(${scale}) translate(${offsetX}px, ${offsetY}px)`;
        const zoomed = scale > minScale + 0.001;
        mapView.classList.toggle('map-view-zoomed', zoomed);
        updateMarkerScale();
        updateZoomControls();
        updateMarkerPopups();
      }

      function resetMapTransform() {
        mapInteractions.scale = mapInteractions.minScale;
        mapInteractions.offsetX = 0;
        mapInteractions.offsetY = 0;
        panState.active = false;
        panState.pointerId = null;
        panState.moved = false;
        mapView.classList.remove('map-view-panning');
        preventNextMapClick = false;
        applyMapTransform({ clamp: false });
      }

      function setMapScale(nextScale, options = {}) {
        if (!mapView) return;
        const { focusX, focusY } = options;
        const previous = mapInteractions.scale;
        const scale = clamp(nextScale, mapInteractions.minScale, mapInteractions.maxScale);
        if (Math.abs(scale - previous) < 0.001) {
          if (scale <= mapInteractions.minScale + 0.001) resetMapTransform();
          return;
        }
        if (typeof focusX === 'number' && typeof focusY === 'number') {
          const rect = mapView.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const screenX = focusX - centerX;
          const screenY = focusY - centerY;
          const normX = (screenX - mapInteractions.offsetX) / previous;
          const normY = (screenY - mapInteractions.offsetY) / previous;
          mapInteractions.offsetX = screenX - normX * scale;
          mapInteractions.offsetY = screenY - normY * scale;
        }
        mapInteractions.scale = scale;
        if (scale <= mapInteractions.minScale + 0.001) {
          resetMapTransform();
        } else {
          applyMapTransform();
        }
      }

      function handleWheel(event) {
        if (!mapReady()) return;
        if (event.deltaY === 0) return;
        if (!event.ctrlKey && !event.metaKey) {
          handleModifierlessWheel(event);
          return;
        }
        event.preventDefault();
        resetZoomHint();
        hideInteractionHint();
        const zoomFactor = Math.exp(-event.deltaY * 0.0015);
        setMapScale(mapInteractions.scale * zoomFactor, { focusX: event.clientX, focusY: event.clientY });
      }

      function resetZoomHint() {
        zoomHintState.attempts = 0;
        zoomHintState.lastAttempt = 0;
      }

      function handleModifierlessWheel(event) {
        if (!mapReady() || mapView.classList.contains('map-view-has-message')) return;
        const now = Date.now();
        if (now - zoomHintState.lastAttempt > ZOOM_HINT_RESET_MS) {
          zoomHintState.attempts = 0;
        }
        zoomHintState.lastAttempt = now;
        zoomHintState.attempts += 1;
        if (zoomHintState.attempts >= ZOOM_HINT_THRESHOLD) {
          zoomHintState.attempts = 0;
          showInteractionHint();
        } else if (zoomHintState.visible) {
          showInteractionHint();
        }
      }

      function hideInteractionHint() {
        if (!interactionHint) return;
        interactionHint.classList.add('map-interaction-hint-visible');
        interactionHint.removeAttribute('aria-hidden');
        zoomHintState.visible = true;
      }

      function showInteractionHint() {
        if (!interactionHint) return;
        interactionHint.classList.add('map-interaction-hint-visible');
        interactionHint.removeAttribute('aria-hidden');
        zoomHintState.visible = true;
      }

      function updateMarkerScale() {
        const scale = mapInteractions.scale;
        const markerScale = scale > 0 ? 1 / scale : 1;
        for (const viewport of getActiveViewports()) {
          if (viewport?.overlay) {
            viewport.overlay.style.setProperty('--marker-scale', markerScale.toFixed(3));
          }
        }
      }

      function updateZoomControls() {
        const scale = mapInteractions.scale;
        const formatted = scale.toFixed(2);
        for (const viewport of getActiveViewports()) {
          if (viewport?.zoomSlider && viewport.zoomSlider.value !== formatted) {
            viewport.zoomSlider.value = formatted;
          }
          if (viewport?.zoomInput && viewport.zoomInput.value !== formatted) {
            viewport.zoomInput.value = formatted;
          }
        }
      }

      function handleMapPointerDown(event) {
        if (event.button !== 0) return;
        if (!mapReady()) return;
        if (event.target.closest('.map-marker') || event.target.closest('.map-marker-popup')) return;
        if (mapInteractions.scale <= mapInteractions.minScale + 0.001) {
          preventNextMapClick = false;
          return;
        }
        if (panState.active) return;
        preventNextMapClick = false;
        panState.active = true;
        panState.pointerId = event.pointerId;
        panState.startX = event.clientX;
        panState.startY = event.clientY;
        panState.startOffsetX = mapInteractions.offsetX;
        panState.startOffsetY = mapInteractions.offsetY;
        panState.moved = false;
        try { mapCanvas.setPointerCapture(event.pointerId); }
        catch { /* ignore */ }
        mapView.classList.add('map-view-panning');
        event.preventDefault();
      }

      function handleMapPointerMove(event) {
        if (!panState.active || event.pointerId !== panState.pointerId) return;
        const dx = event.clientX - panState.startX;
        const dy = event.clientY - panState.startY;
        if (!panState.moved && Math.hypot(dx, dy) > 3) panState.moved = true;
        mapInteractions.offsetX = panState.startOffsetX + dx;
        mapInteractions.offsetY = panState.startOffsetY + dy;
        applyMapTransform();
      }

      function handleMapPointerUp(event) {
        if (!panState.active || event.pointerId !== panState.pointerId) return;
        try { mapCanvas.releasePointerCapture(event.pointerId); }
        catch { /* ignore */ }
        panState.active = false;
        panState.pointerId = null;
        const didPan = panState.moved;
        panState.moved = false;
        mapView.classList.remove('map-view-panning');
        if (didPan) {
          preventNextMapClick = true;
        }
        applyMapTransform();
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

      window.addEventListener('beforeunload', () => {
        window.removeEventListener('resize', handleResize);
      });

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
        scheduleViewportSizeUpdate({ immediate: true });
      }

      function setMessage(content, options = {}) {
        hideInteractionHint();
        const { persist = false } = options;
        if (!persist) clearPersistentStatusMessage();
        const viewports = getActiveViewports();
        viewports.forEach((viewport, index) => {
          const payload = cloneMessageContent(content, viewport, index === 0);
          applyMessageToViewport(viewport, payload);
        });
      }

      function clearMessage() {
        hideInteractionHint();
        clearPersistentStatusMessage();
        for (const viewport of getActiveViewports()) {
          if (!viewport.message || !viewport.mapView) continue;
          viewport.message.innerHTML = '';
          viewport.mapView.classList.remove('map-view-has-message');
        }
        scheduleViewportSizeUpdate({ immediate: true });
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
        const interval = normaliseRefreshInterval(state.pollPreference);
        if (interval !== state.pollInterval) {
          state.pollInterval = interval;
        }
        return state.pollInterval;
      }

      function updateRefreshDisplays() {
        const interval = getPollInterval();
        const description = describeRefreshInterval(interval);
        const detail = description === 'Custom'
          ? 'at a custom interval'
          : description.toLowerCase();
        const suffix = state.serverId ? '.' : ' when live data is available.';
        const manualMinSeconds = Math.max(1, Math.round(getManualRefreshMinimum() / 1000));
        const manualUnit = manualMinSeconds === 1 ? 'second' : 'seconds';
        const manualLimitNote = ` Manual updates are limited to every ${manualMinSeconds} ${manualUnit} due to performance thresholds.`;
        const now = Date.now();
        const cooldownActive = Number.isFinite(state.manualCooldownUntil)
          && state.manualCooldownUntil > now;
        const cooldownMessage = cooldownActive
          ? state.manualCooldownMessage
          || 'Manual live map refresh is cooling down. Cached data is shown until the cooldown expires.'
          : null;
        const remainingSeconds = cooldownActive
          ? Math.max(0, Math.ceil((state.manualCooldownUntil - now) / 1000))
          : 0;
        for (const viewport of getActiveViewports()) {
          const target = viewport.refreshDisplay;
          if (!target) continue;
          let message = `Player positions refresh ${detail}${suffix}` + manualLimitNote;
          if (cooldownMessage) {
            const countdown = remainingSeconds > 0 ? ` (${remainingSeconds}s remaining)` : '';
            message += ` ${cooldownMessage}${countdown}`;
          }
          target.textContent = message;
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

      function setMinimumPollInterval(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return false;
        }
        const nextMin = clamp(numeric, STANDARD_POLL_MIN_MS, CUSTOM_POLL_MIN_MS);
        const minChanged = nextMin !== effectivePollMin;
        effectivePollMin = nextMin;
        const applied = normaliseRefreshInterval(state.pollPreference);
        const intervalChanged = applied !== state.pollInterval;
        state.pollInterval = applied;
        return minChanged || intervalChanged;
      }

      function setManualRefreshMinimum(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return false;
        }
        const nextMin = clamp(numeric, STANDARD_POLL_MIN_MS, CUSTOM_POLL_MIN_MS);
        if (nextMin === manualRefreshMinMs) {
          return false;
        }
        manualRefreshMinMs = nextMin;
        const now = Date.now();
        if (state.manualCooldownUntil > now) {
          state.manualCooldownUntil = now + manualRefreshMinMs;
        }
        return true;
      }

      const PLAYER_DATA_SOURCE_COMMANDS = {
        playerlist: 'playerlist',
        teaminfo: 'teaminfo',
        printpos: 'printpos'
      };

      let lastLoggedPlayerDataSourcesSignature = null;

      function normalisePlayerDataSourceSignature(sources) {
        if (!sources || typeof sources !== 'object') {
          return 'null';
        }
        return JSON.stringify({
          positions: sources.positions || null,
          teams: sources.teams || null
        });
      }

      function describePlayerDataSource(kind, source) {
        if (!source) {
          return `${kind} unavailable (no command executed)`;
        }
        const command = PLAYER_DATA_SOURCE_COMMANDS[source] || source;
        return `${kind} from ${source} (command: ${command})`;
      }

      function logPlayerDataSources(sources) {
        const signature = normalisePlayerDataSourceSignature(sources);
        if (signature === lastLoggedPlayerDataSourcesSignature) {
          return;
        }
        lastLoggedPlayerDataSourcesSignature = signature;
        if (!sources || typeof sources !== 'object') {
          return;
        }
        const teamInfo = describePlayerDataSource('team data', sources.teams);
        const positionInfo = describePlayerDataSource('position data', sources.positions);
        ctx.log?.(`Live map player data sources — ${teamInfo}; ${positionInfo}.`);
      }

      function clearPlayerDataSources() {
        state.playerDataSources = null;
        logPlayerDataSources(state.playerDataSources);
      }

      function updateRefreshPolicy({ isCustomMap, playerDataSources }) {
        const usingPlayerListPositions = playerDataSources?.positions === 'playerlist';
        const usingPlayerListTeams = playerDataSources?.teams === 'playerlist';
        const usesOnlyPlayerList = usingPlayerListPositions && usingPlayerListTeams;
        const targetMin = (isCustomMap || !usesOnlyPlayerList) ? CUSTOM_POLL_MIN_MS : STANDARD_POLL_MIN_MS;
        const pollChanged = setMinimumPollInterval(targetMin);
        const manualChanged = setManualRefreshMinimum(targetMin);
        if (pollChanged) {
          schedulePolling();
        } else if (manualChanged) {
          updateRefreshDisplays();
        }
      }

      function resetRefreshPolicy() {
        clearPlayerDataSources();
        const pollChanged = setMinimumPollInterval(CUSTOM_POLL_MIN_MS);
        const manualChanged = setManualRefreshMinimum(CUSTOM_POLL_MIN_MS);
        if (pollChanged) {
          schedulePolling();
        } else if (manualChanged) {
          updateRefreshDisplays();
        }
      }

      function teamKey(player) {
        return Number(player?.teamId) > 0 ? Number(player.teamId) : 0;
      }

      function ensureTeamColors(players) {
        const presentTeams = new Set();
        let index = state.teamColors.size;
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
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 58%)`;
      }

      function hasMapImage(meta) {
        if (!meta || typeof meta !== 'object') return false;
        return !!meta.imageUrl;
      }

      function mapReady() {
        const size = resolveWorldSize();
        if (!Number.isFinite(size) || size <= 0) return false;

        const meta = getActiveMapMeta();
        const imageLoaded = hasMapImage(meta)
          || !!(mapImageSource || (mapImage && mapImage.currentSrc));
        if (imageLoaded) return true;

        const samples = collectPlayerPositions();
        return Array.isArray(samples) && samples.length > 0;
      }

      function updateUploadSection() {
        if (!uploadWrap) return;
        const meta = getActiveMapMeta();
        const hasImage = hasMapImage(meta);
        const customMap = mapIsCustom(meta, state.serverInfo);
        const awaitingUpload = state.status === 'awaiting_upload';
        const shouldShow = (customMap && !hasImage) || awaitingUpload;
        if (shouldShow) {
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
        if (size != null) {
          const sizeLabel = state.estimatedWorldSizeSource
            ? 'World size (m, estimated)'
            : 'World size (m)';
          details.push({ label: sizeLabel, value: size });
        }
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
          const fallbackCode = res.status === 413 ? 'image_too_large' : 'map_upload_failed';
          const code = payload?.error || fallbackCode;
          const err = new Error(code);
          err.status = res.status;
          if (payload?.error) err.code = payload.error;
          else if (code !== 'map_upload_failed') err.code = code;
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
            const status = typeof err.status === 'number' ? err.status : null;
            if (status === 413 && !err.code) {
              err.code = 'image_too_large';
              throw err;
            }
            const shouldFallback = !err.code && (status === 404 || status === 405);
            if (!shouldFallback) throw err;
          }
        }
        const dataUrl = await readFileAsDataURL(file);
        return ctx.api(`/servers/${state.serverId}/map-image`, { image: dataUrl, mapKey }, 'POST');
      }

      function formatFileSize(bytes) {
        if (!Number.isFinite(bytes)) return null;
        if (bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, index);
        const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return `${rounded} ${units[index]}`;
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
        const MAX_MAP_IMAGE_BYTES = 40 * 1024 * 1024;
        const attemptedBytes = typeof file.size === 'number' ? file.size : null;
        if (typeof file.size === 'number' && file.size > MAX_MAP_IMAGE_BYTES) {
          const attemptedLabel = attemptedBytes != null ? formatFileSize(attemptedBytes) : null;
          const limitLabel = formatFileSize(MAX_MAP_IMAGE_BYTES);
          showUploadNotice(
            attemptedLabel
              ? `The image is too large (${attemptedLabel}). Please upload a file under ${limitLabel}.`
              : `The image is too large. Please upload a file under ${limitLabel}.`
          );
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
            await checkMapState('upload-success');
            renderAll();
          } else {
            showUploadNotice('Map image uploaded.', 'success');
            await checkMapState('upload-success');
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
          else if (code === 'image_too_large') {
            const attemptedLabel = attemptedBytes != null ? formatFileSize(attemptedBytes) : null;
            const limitLabel = formatFileSize(MAX_MAP_IMAGE_BYTES);
            const intro = attemptedLabel
              ? `The server rejected the image as too large (${attemptedLabel}).`
              : 'The server rejected the image as too large.';
            showUploadNotice(
              `${intro} The control panel accepts files up to ${limitLabel}, but your hosting provider may enforce a smaller limit. `
                + 'Try uploading a smaller image or contact your host to raise the limit.',
              'error'
            );
          } else showUploadNotice(ctx.describeError?.(err) || 'Uploading the map image failed.');
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
        if (normalised) {
          const direct = Number(normalised);
          if (Number.isFinite(direct)) return direct;
          const dimensionMatch = normalised.match(/^(-?\d+(?:\.\d+)?)[x×](-?\d+(?:\.\d+)?)/i);
          if (dimensionMatch) {
            const primary = Number(dimensionMatch[1]);
            if (Number.isFinite(primary)) return primary;
          }
          const magnitudeMatch = normalised.match(/^(-?\d+(?:\.\d+)?)([kK])$/);
          if (magnitudeMatch) {
            const base = Number(magnitudeMatch[1]);
            if (Number.isFinite(base)) return base * 1000;
          }
        }
        const fallbackMatch = text.match(/-?\d+(?:\.\d+)?/);
        if (!fallbackMatch) return null;
        const numeric = Number(fallbackMatch[0]);
        return Number.isFinite(numeric) ? numeric : null;
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

      function deriveWorldSizeFromImage() {
        if (!mapImage) return null;
        const width = Number(mapImage.naturalWidth);
        const height = Number(mapImage.naturalHeight);
        if (!Number.isFinite(width) || width <= 0) return null;
        if (!Number.isFinite(height) || height <= 0) return null;
        const roundedWidth = Math.round(width);
        const roundedHeight = Math.round(height);
        const tolerance = Math.abs(roundedWidth - roundedHeight);
        const average = Math.round((roundedWidth + roundedHeight) / 2);
        const resolved = tolerance <= 5 ? average : Math.max(roundedWidth, roundedHeight);
        return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
      }

      function updateImageWorldSize() {
        const next = deriveWorldSizeFromImage();
        if (!Number.isFinite(next) || next <= 0) return;
        if (state.imageWorldSize === next) return;
        state.imageWorldSize = next;
        state.estimatedWorldSize = null;
        state.estimatedWorldSizeSource = null;
      }

      function resolveWorldSize(metaOverride, infoOverride, options = {}) {
        const allowEstimated = options && Object.prototype.hasOwnProperty.call(options, 'allowEstimated')
          ? !!options.allowEstimated
          : true;
        const meta = metaOverride ?? getActiveMapMeta();
        const info = infoOverride ?? state.serverInfo ?? {};
        const candidates = [];
        if (meta) candidates.push(...collectValues(meta, META_WORLD_SIZE_PATHS));
        if (info) candidates.push(...collectValues(info, INFO_WORLD_SIZE_PATHS));
        if (state.worldDetails) candidates.push(state.worldDetails.size);

        let metadataSize = null;
        for (const candidate of candidates) {
          const numeric = toNumber(candidate);
          if (numeric != null && numeric > 0) {
            metadataSize = numeric;
            break;
          }
        }

        const imageSize = Number(state.imageWorldSize);
        const hasImageSize = Number.isFinite(imageSize) && imageSize > 0;
        const preferImageForCustomMap = hasImageSize
          && meta
          && mapIsCustom(meta, info)
          && hasMapImage(meta);
        if (preferImageForCustomMap) {
          state.estimatedWorldSize = null;
          state.estimatedWorldSizeSource = null;
          return imageSize;
        }

        if (Number.isFinite(metadataSize) && metadataSize > 0) {
          state.estimatedWorldSize = null;
          state.estimatedWorldSizeSource = null;
          return metadataSize;
        }

        if (hasImageSize) {
          state.estimatedWorldSize = null;
          state.estimatedWorldSizeSource = null;
          return imageSize;
        }
        if (!allowEstimated) return null;
        const estimate = estimateWorldSizeFromSamples();
        if (Number.isFinite(estimate) && estimate > 0) {
          const previous = Number(state.estimatedWorldSize);
          const next = Number.isFinite(previous) && previous > estimate ? previous : estimate;
          state.estimatedWorldSize = next;
          state.estimatedWorldSizeSource = 'players';
          return next;
        }
        if (Number.isFinite(state.estimatedWorldSize) && state.estimatedWorldSize > 0) {
          return state.estimatedWorldSize;
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
        const isCustomMap = mapIsCustom(activeMeta, state.serverInfo);
        if (hasMapImage(activeMeta) && !isCustomMap) return;
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
        const needsSize = resolveWorldSize(activeMeta, state.serverInfo, { allowEstimated: false }) == null;
        const needsSeed = resolveWorldSeed(activeMeta, state.serverInfo) == null;
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

      function collectPositionSamples(options = {}) {
        const {
          includePlayers = true,
          includeWorldEntities = true
        } = options;
        const samples = [];
        const addSample = (entry) => {
          if (!entry) return;
          const sample = vectorFromEntry(entry);
          if (!sample) return;
          samples.push(sample);
        };

        if (includePlayers && Array.isArray(state.players) && state.players.length) {
          for (const player of state.players) {
            addSample(player?.position || player);
          }
        }

        if (includeWorldEntities && state.worldEntities) {
          const { monuments, entities } = state.worldEntities;
          if (Array.isArray(monuments) && monuments.length) {
            for (const monument of monuments) {
              addSample(monument?.position || monument);
            }
          }
          if (Array.isArray(entities) && entities.length) {
            for (const entity of entities) {
              addSample(entity?.position || entity);
            }
          }
        }

        return samples;
      }

      function collectPlayerPositions() {
        return collectPositionSamples({ includeWorldEntities: false });
      }

      function estimateWorldSizeFromSamples() {
        const samples = collectPositionSamples();
        if (!Array.isArray(samples) || samples.length === 0) return null;
        const axis = determineHorizontalAxis(samples);
        let minX = Infinity;
        let maxX = -Infinity;
        let minOther = Infinity;
        let maxOther = -Infinity;
        let count = 0;

        for (const sample of samples) {
          const x = typeof sample.x === 'number' ? sample.x : null;
          const other = axisValue(sample, axis);
          if (!Number.isFinite(x) || !Number.isFinite(other)) continue;
          count += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (other < minOther) minOther = other;
          if (other > maxOther) maxOther = other;
        }

        if (count < 2) return null;

        const spanX = maxX - minX;
        const spanOther = maxOther - minOther;
        const spans = [spanX, spanOther].filter((value) => Number.isFinite(value) && value > 0);
        const maxSpan = spans.length ? Math.max(...spans) : null;
        const maxAbs = Math.max(
          Math.abs(minX),
          Math.abs(maxX),
          Math.abs(minOther),
          Math.abs(maxOther)
        );

        let estimate = null;
        const zeroBased = minX >= 0 && minOther >= 0;
        if (zeroBased) {
          const maxCoord = Math.max(maxX, maxOther);
          if (Number.isFinite(maxCoord) && maxCoord > 0) estimate = maxCoord;
        }
        if (!Number.isFinite(estimate) || estimate <= 0) {
          if (Number.isFinite(maxAbs) && maxAbs > 0) estimate = maxAbs * 2;
        }
        if (!Number.isFinite(estimate) || estimate <= 0) {
          if (Number.isFinite(maxSpan) && maxSpan > 0) estimate = maxSpan;
        }
        if (!Number.isFinite(estimate) || estimate <= 0) return null;

        const buffered = estimate * 1.1;
        const rounded = Math.round(buffered / 50) * 50;
        const normalised = clamp(rounded, 100, 8000);
        return normalised;
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
        const list = Array.isArray(samples) ? samples : collectPositionSamples();
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
        const samples = collectPositionSamples();
        const axis = determineHorizontalAxis(samples);
        if (axis && axis !== state.horizontalAxis) state.horizontalAxis = axis;
        const mode = inferProjectionMode(samples, axis);
        if (mode && mode !== state.projectionMode) state.projectionMode = mode;
      }

      function resolveHorizontalAxis() {
        if (state.horizontalAxis) return state.horizontalAxis;
        const samples = collectPositionSamples();
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
        mapView.classList.remove('map-view-has-image');
        state.imageWorldSize = null;
        resetMapTransform();
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
            mapView.classList.remove('map-view-has-image');
            applyBlobToImage(result.blob);
            if (result.status === 200) {
              mapImageLocked = true;
            }
          } else if (result.url) {
            clearMapImage();
            mapView.classList.remove('map-view-has-image');
            mapImage.src = result.url;
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
        if (state.selectedSolo) return resolveSteamId(player) === state.selectedSolo;
        if (state.selectedTeam) return Number(player.teamId) === state.selectedTeam;
        return true;
      }

      function logMarkerDiagnostics() {
        if (typeof console === 'undefined') return;
        const logger = console;
        const players = Array.isArray(state.players) ? state.players.length : 0;
        const ready = mapReady();
        const worldSize = resolveWorldSize();
        const canvasRect = mapCanvas && typeof mapCanvas.getBoundingClientRect === 'function'
          ? mapCanvas.getBoundingClientRect()
          : null;
        const overlayRect = overlay && typeof overlay.getBoundingClientRect === 'function'
          ? overlay.getBoundingClientRect()
          : null;
        const meta = getActiveMapMeta();
        const info = {
          ready,
          players,
          worldSize: worldSize ?? null,
          worldSizeSource: state.estimatedWorldSizeSource ?? (worldSize != null ? 'metadata' : null),
          derivedWorldSize: Number.isFinite(state.imageWorldSize) ? state.imageWorldSize : null,
          estimatedWorldSize: Number.isFinite(state.estimatedWorldSize) ? state.estimatedWorldSize : null,
          canvas: canvasRect ? {
            width: Math.round(canvasRect.width),
            height: Math.round(canvasRect.height)
          } : null,
          overlay: overlayRect ? {
            width: Math.round(overlayRect.width),
            height: Math.round(overlayRect.height)
          } : null,
          image: mapImage ? {
            source: mapImageSource ?? mapImage.currentSrc ?? mapImage.src ?? null,
            naturalWidth: Number.isFinite(mapImage.naturalWidth) ? mapImage.naturalWidth : null,
            naturalHeight: Number.isFinite(mapImage.naturalHeight) ? mapImage.naturalHeight : null,
            clientWidth: mapImage.clientWidth ?? null,
            clientHeight: mapImage.clientHeight ?? null
          } : null,
          interactions: {
            scale: Number.isFinite(mapInteractions.scale) ? Number(mapInteractions.scale.toFixed(3)) : mapInteractions.scale,
            offsetX: Math.round(mapInteractions.offsetX || 0),
            offsetY: Math.round(mapInteractions.offsetY || 0)
          },
          metaSizeFields: meta ? {
            size: meta.size ?? null,
            worldSize: meta.worldSize ?? null,
            WorldSize: meta.WorldSize ?? null
          } : null
        };
        const groupLabel = `[live-map] Rendering player markers: ${players}`;
        if (typeof logger.groupCollapsed === 'function') {
          logger.groupCollapsed(groupLabel);
          logger.log('diagnostics', info);
          if (Array.isArray(state.players) && state.players.length) {
            logger.log('sample players', state.players.slice(0, 3).map((player) => ({
              id: resolveSteamId(player),
              position: player?.position ?? null
            })));
          }
          logger.groupEnd();
        } else if (typeof logger.log === 'function') {
          logger.log(groupLabel, info);
        }
      }

      function handleMarkerClick(event) {
        if (!event) return;
        event.stopPropagation();
        const marker = event.currentTarget;
        if (!marker) return;

        const clusterId = marker?.dataset?.clusterId;
        if (clusterId) {
          const steamIds = String(marker.dataset.clusterMembers || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
          const players = steamIds
            .map((id) => state.players.find((p) => resolveSteamId(p) === id))
            .filter(Boolean);
          if (players.length === 1) {
            selectPlayer(players[0], { suppressPanel: true, showPopup: true });
            return;
          }
          if (players.length === 0) return;
          state.activeClusterId = clusterId;
          state.activeClusterMembers = players.map((player) => resolveSteamId(player));
          state.activePopupSteamId = null;
          updateMarkerPopups();
          return;
        }

        const steamId = marker?.dataset?.steamid;
        if (!steamId) return;
        const player = state.players.find((p) => resolveSteamId(p) === steamId);
        if (!player) return;
        selectPlayer(player, { suppressPanel: true, showPopup: true });
      }

      function clearViewportIconLayer(layer) {
        if (!layer) return;
        while (layer.firstChild) {
          const child = layer.firstChild;
          stopMarkerAnimation(child);
          layer.removeChild(child);
        }
      }

      function renderMonumentsInViewport(viewport) {
        if (!viewport || !viewport.overlay) return;
        const layer = getViewportLayer(viewport, 'monuments');
        const store = getViewportMonumentStore(viewport);
        if (!mapReady()) {
          if (store?.size) {
            for (const marker of store.values()) {
              stopMarkerAnimation(marker);
              marker.remove();
            }
            store.clear();
          }
          if (layer) clearViewportIconLayer(layer);
          return;
        }

        const monuments = Array.isArray(state.worldEntities?.monuments)
          ? state.worldEntities.monuments
          : [];
        const axis = resolveHorizontalAxis();
        const staleIds = new Set(store.keys());

        monuments.forEach((monument, index) => {
          if (!monument) return;
          const baseId = monument.id != null ? String(monument.id) : null;
          const key = baseId || `monument-${index}`;
          const position = projectPosition(monument.position, axis);
          let marker = store.get(key);
          if (!position) {
            if (marker) {
              stopMarkerAnimation(marker);
              marker.remove();
              store.delete(key);
            }
            staleIds.delete(key);
            return;
          }

          if (!marker) {
            marker = viewport.doc.createElement('div');
            marker.className = 'map-icon map-icon-monument';
            marker.dataset.kind = 'monument';
            store.set(key, marker);
            layer.appendChild(marker);
          }

          const iconValue = typeof monument.icon === 'string' && monument.icon
            ? monument.icon
            : 'map-pin';
          applyMarkerIcon(marker, iconValue, '📍');
          marker.dataset.category = monument.category || '';
          marker.title = monument.label || monument.shortName || 'Monument';
          setMarkerPosition(marker, position.left, position.top);
          staleIds.delete(key);
        });

        for (const key of staleIds) {
          const marker = store.get(key);
          if (marker) {
            stopMarkerAnimation(marker);
            marker.remove();
          }
          store.delete(key);
        }
      }

      function renderWorldEntitiesInViewport(viewport) {
        if (!viewport || !viewport.overlay) return;
        const layer = getViewportLayer(viewport, 'events');
        const store = getViewportEntityStore(viewport);
        if (!mapReady()) {
          if (store?.size) {
            for (const marker of store.values()) {
              stopMarkerAnimation(marker);
              marker.remove();
            }
            store.clear();
          }
          if (layer) clearViewportIconLayer(layer);
          return;
        }

        const entries = Array.isArray(state.worldEntities?.entities)
          ? state.worldEntities.entities
          : [];
        const axis = resolveHorizontalAxis();
        const staleIds = new Set(store.keys());

        entries.forEach((entity, index) => {
          if (!entity) return;
          const baseId = entity.id != null ? String(entity.id) : null;
          const key = baseId || `${entity.type || 'entity'}-${index}`;
          const position = projectPosition(entity.position, axis);
          let marker = store.get(key);
          if (!position) {
            if (marker) {
              stopMarkerAnimation(marker);
              marker.remove();
              store.delete(key);
            }
            staleIds.delete(key);
            return;
          }

          if (!marker) {
            marker = viewport.doc.createElement('div');
            marker.className = 'map-icon map-icon-event';
            marker.dataset.kind = 'event';
            marker.dataset.type = entity.type || 'entity';
            store.set(key, marker);
            layer.appendChild(marker);
          }

          const fallbackIcon = (() => {
            if (entity.type === 'cargo_ship') return { key: 'cargo-ship', symbol: '🚢' };
            if (entity.type === 'patrol_helicopter' || entity.type === 'patrol-helicopter') {
              return { key: 'patrol-helicopter', symbol: '🚁' };
            }
            return { key: 'map-pin', symbol: '📍' };
          })();
          const iconValue = typeof entity.icon === 'string' && entity.icon
            ? entity.icon
            : fallbackIcon.key;
          applyMarkerIcon(marker, iconValue, fallbackIcon.symbol);
          marker.dataset.type = entity.type || 'entity';
          marker.title = entity.label || entity.type || 'Entity';
          animateMarkerTo(marker, position.left, position.top);
          staleIds.delete(key);
        });

        for (const key of staleIds) {
          const marker = store.get(key);
          if (marker) {
            stopMarkerAnimation(marker);
            marker.remove();
          }
          store.delete(key);
        }
      }

      function renderMarkersInViewport(viewport) {
        if (!viewport || !viewport.overlay) return;
        const overlayEl = getViewportLayer(viewport, 'players');
        const markerStore = getViewportMarkerStore(viewport);

        if (!mapReady()) {
          if (markerStore.size || overlayEl.childElementCount) {
            clearViewportMarkers(viewport);
          }
          return;
        }

        const axis = resolveHorizontalAxis();
        const staleIds = new Set(markerStore.keys());
        const selectionEngaged = selectionActive();

        const overlayRect = typeof overlayEl.getBoundingClientRect === 'function'
          ? overlayEl.getBoundingClientRect()
          : null;
        const overlayWidth = Number.isFinite(overlayRect?.width) && overlayRect.width > 0
          ? overlayRect.width
          : null;
        const overlayHeight = Number.isFinite(overlayRect?.height) && overlayRect.height > 0
          ? overlayRect.height
          : null;
        const usePixelDistance = Number.isFinite(overlayWidth) && Number.isFinite(overlayHeight);
        const CLUSTER_THRESHOLD_PX = 32;
        const CLUSTER_THRESHOLD_PERCENT = 2.2;
        const threshold = usePixelDistance
          ? Math.max(CLUSTER_THRESHOLD_PX, Math.min(overlayWidth, overlayHeight) * 0.04)
          : CLUSTER_THRESHOLD_PERCENT;

        const clusters = [];
        const removeKeys = [];

        for (const player of state.players) {
          const steamId = resolveSteamId(player);
          if (!steamId) continue;
          const position = projectPosition(player.position, axis);
          if (!position) {
            removeKeys.push(`player:${steamId}`);
            continue;
          }

          const metricX = usePixelDistance && overlayWidth
            ? (position.left / 100) * overlayWidth
            : position.left;
          const metricY = usePixelDistance && overlayHeight
            ? (position.top / 100) * overlayHeight
            : position.top;

          let target = null;
          for (const cluster of clusters) {
            const dx = metricX - cluster.avgMetricX;
            const dy = metricY - cluster.avgMetricY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= threshold) {
              target = cluster;
              break;
            }
          }

          if (!target) {
            target = {
              players: [],
              steamIds: [],
              count: 0,
              leftSum: 0,
              topSum: 0,
              metricXSum: 0,
              metricYSum: 0,
              avgMetricX: metricX,
              avgMetricY: metricY
            };
            clusters.push(target);
          }

          target.players.push(player);
          target.steamIds.push(steamId);
          target.count += 1;
          target.leftSum += position.left;
          target.topSum += position.top;
          target.metricXSum += metricX;
          target.metricYSum += metricY;
          target.avgMetricX = target.metricXSum / target.count;
          target.avgMetricY = target.metricYSum / target.count;
        }

        let activeClusterStillVisible = false;

        for (const key of removeKeys) {
          staleIds.delete(key);
          const marker = markerStore.get(key);
          if (marker) {
            stopMarkerAnimation(marker);
            marker.remove();
            markerStore.delete(key);
          }
        }

        for (const cluster of clusters) {
          const count = cluster.count;
          if (!count) continue;
          const left = cluster.leftSum / count;
          const top = cluster.topSum / count;
          const sortedSteamIds = [...cluster.steamIds].sort();
          const datasetKey = sortedSteamIds.join('_');
          const storeKey = count > 1 ? `cluster:${datasetKey}` : `player:${sortedSteamIds[0]}`;
          let marker = markerStore.get(storeKey);
          if (!marker) {
            marker = viewport.doc.createElement('div');
            marker.className = 'map-marker';
            marker.addEventListener('click', handleMarkerClick);
            setMarkerPosition(marker, left, top);
            overlayEl.appendChild(marker);
            markerStore.set(storeKey, marker);
          }

          animateMarkerTo(marker, left, top);

          const hasFocus = cluster.players.some((p) => isPlayerFocused(p));
          marker.classList.toggle('active', hasFocus);
          marker.classList.toggle('dimmed', selectionEngaged && !hasFocus);

          if (count > 1) {
            marker.classList.add('map-marker-cluster');
            marker.textContent = String(count);
            marker.title = `${count} players nearby`;
            marker.dataset.clusterId = datasetKey;
            marker.dataset.clusterMembers = sortedSteamIds.join(',');
            marker.dataset.clusterSize = String(count);
            delete marker.dataset.steamid;
            marker.style.removeProperty('backgroundColor');
            if (state.activeClusterId === datasetKey) {
              state.activeClusterMembers = [...sortedSteamIds];
              activeClusterStillVisible = true;
            }
          } else {
            const player = cluster.players[0];
            const steamId = sortedSteamIds[0];
            marker.classList.remove('map-marker-cluster');
            marker.textContent = '';
            marker.dataset.steamid = steamId;
            marker.title = playerDisplayName(player);
            marker.style.backgroundColor = colorForPlayer(player);
            delete marker.dataset.clusterId;
            delete marker.dataset.clusterMembers;
            delete marker.dataset.clusterSize;
            if (state.activeClusterId === datasetKey) {
              state.activeClusterId = null;
              state.activeClusterMembers = null;
            }
          }

          staleIds.delete(storeKey);
        }

        if (state.activeClusterId && !activeClusterStillVisible) {
          state.activeClusterId = null;
          state.activeClusterMembers = null;
        }

        for (const key of staleIds) {
          const marker = markerStore.get(key);
          if (marker) {
            stopMarkerAnimation(marker);
            marker.remove();
          }
          markerStore.delete(key);
        }
      }

      function renderMarkers() {
        logMarkerDiagnostics();
        if (typeof console !== 'undefined' && typeof console.log === 'function') {
          console.log('[live-map] Rendering player markers:', state.players.length);
        }
        for (const viewport of getActiveViewports()) {
          renderMonumentsInViewport(viewport);
          renderWorldEntitiesInViewport(viewport);
          renderMarkersInViewport(viewport);
        }
      }

      function createPopupStat(viewport, label, value, options = {}) {
        if (!viewport?.doc) return null;
        const stat = viewport.doc.createElement('span');
        stat.className = 'map-marker-popup-stat';
        if (options.color) {
          const swatch = viewport.doc.createElement('span');
          swatch.className = 'map-marker-popup-color';
          swatch.style.backgroundColor = options.color;
          stat.appendChild(swatch);
        }
        const strong = viewport.doc.createElement('strong');
        strong.textContent = label;
        stat.appendChild(strong);
        const valueEl = viewport.doc.createElement('span');
        valueEl.className = 'map-marker-popup-stat-value';
        valueEl.textContent = value;
        stat.appendChild(valueEl);
        return stat;
      }

      function hideMarkerPopup(viewport) {
        const popup = viewport?.popup;
        if (!popup?.wrap) return;
        popup.wrap.classList.add('hidden');
        popup.wrap.style.left = '';
        popup.wrap.style.top = '';
        popup.wrap.style.transform = '';
        popup.wrap.removeAttribute('data-position');
        if (popup.arrow) {
          popup.arrow.style.left = '';
          popup.arrow.style.top = '';
          popup.arrow.style.bottom = '';
        }
        if (popup.card) popup.card.innerHTML = '';
        popup.currentSteamId = null;
        if (popup.card) popup.card.classList.remove('map-marker-popup-cluster-mode');
        popup.currentClusterId = null;
      }

      function hideAllMarkerPopups() {
        for (const viewport of getActiveViewports()) {
          hideMarkerPopup(viewport);
        }
      }

      function positionMarkerPopup(viewport, marker) {
        const popup = viewport?.popup;
        if (!popup?.wrap || !popup.card || !viewport.mapView) return;
        const { wrap, card, arrow } = popup;
        const mapRect = viewport.mapView.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const centerX = markerRect.left + markerRect.width / 2 - mapRect.left;
        const baseTop = markerRect.top - mapRect.top;
        const margin = 12;
        const width = card.offsetWidth || wrap.offsetWidth || 0;
        const mapWidth = mapRect.width;
        const minLeft = margin;
        const maxLeft = Math.max(minLeft, mapWidth - width - margin);
        const desiredLeft = centerX - width / 2;
        const clampedLeft = Math.min(Math.max(desiredLeft, minLeft), maxLeft);
        wrap.style.left = `${clampedLeft}px`;
        const arrowCenter = centerX - clampedLeft;
        if (arrow) {
          const arrowOffset = Math.max(12, Math.min(width - 12, arrowCenter));
          arrow.style.left = `${arrowOffset}px`;
        }
        const popupHeight = card.offsetHeight || wrap.offsetHeight || 0;
        const aboveSpace = markerRect.top - mapRect.top;
        const belowSpace = mapRect.bottom - markerRect.bottom;
        const preferAbove = aboveSpace >= belowSpace;
        let position = 'above';
        if (preferAbove) {
          position = aboveSpace >= popupHeight + 28 ? 'above' : (belowSpace > aboveSpace ? 'below' : 'above');
        } else {
          position = belowSpace >= popupHeight + 28 ? 'below' : (aboveSpace > belowSpace ? 'above' : 'below');
        }
        wrap.dataset.position = position;
        wrap.style.top = `${baseTop}px`;
        if (position === 'above') {
          wrap.style.transform = 'translateY(calc(-100% - 18px))';
          if (arrow) {
            arrow.style.top = '';
            arrow.style.bottom = '-8px';
          }
        } else {
          wrap.style.transform = 'translateY(18px)';
          if (arrow) {
            arrow.style.bottom = '';
            arrow.style.top = '-8px';
          }
        }
      }

      function renderMarkerPopupForViewport(viewport, player, marker) {
        const popup = viewport?.popup;
        if (!popup?.wrap || !popup.card) return;
        const doc = viewport.doc || document;
        popup.card.innerHTML = '';
        popup.currentSteamId = resolveSteamId(player);
        popup.currentClusterId = null;
        popup.card.classList.remove('map-marker-popup-cluster-mode');

        const header = doc.createElement('div');
        header.className = 'map-marker-popup-header';

        const avatarWrap = doc.createElement('div');
        avatarWrap.className = 'map-marker-popup-avatar';
        const avatarUrl = resolvePlayerAvatar(player);
        const displayName = playerDisplayName(player);
        if (avatarUrl) {
          const img = doc.createElement('img');
          img.src = avatarUrl;
          img.alt = `${displayName} avatar`;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          avatarWrap.appendChild(img);
        } else {
          avatarWrap.classList.add('placeholder');
          avatarWrap.textContent = avatarInitial(displayName);
        }
        header.appendChild(avatarWrap);

        const body = doc.createElement('div');
        body.className = 'map-marker-popup-body';

        const nameEl = doc.createElement('div');
        nameEl.className = 'map-marker-popup-name';
        nameEl.textContent = displayName;
        body.appendChild(nameEl);

        const stats = doc.createElement('div');
        stats.className = 'map-marker-popup-stats';
        const healthValue = formatHealth(player.health ?? player.Health);
        const healthStat = createPopupStat(viewport, 'HP', healthValue === '—' ? '—' : `${healthValue} hp`);
        if (healthStat) stats.appendChild(healthStat);
        const teamId = teamKey(player);
        const teamLabel = teamId > 0 ? `Team ${teamId}` : 'Solo';
        const teamStat = createPopupStat(viewport, 'Team', teamLabel, { color: colorForPlayer(player) });
        if (teamStat) stats.appendChild(teamStat);
        const pingValue = formatPing(player.ping ?? player.Ping);
        const pingStat = createPopupStat(viewport, 'Ping', pingValue);
        if (pingStat) stats.appendChild(pingStat);
        body.appendChild(stats);

        header.appendChild(body);
        popup.card.appendChild(header);

        const wasHidden = popup.wrap.classList.contains('hidden');
        popup.wrap.classList.remove('hidden');
        popup.wrap.style.visibility = 'hidden';
        positionMarkerPopup(viewport, marker);
        if (popup.wrap.style.visibility === 'hidden') {
          popup.wrap.style.visibility = '';
        }
        if (wasHidden) {
          popup.wrap.getBoundingClientRect();
        }
      }

      function renderClusterPopupForViewport(viewport, marker, players) {
        const popup = viewport?.popup;
        if (!popup?.wrap || !popup.card) return;
        if (!Array.isArray(players) || players.length < 2) return;
        const doc = viewport.doc || document;
        popup.card.innerHTML = '';
        popup.currentSteamId = null;
        popup.currentClusterId = marker?.dataset?.clusterId || null;
        popup.card.classList.add('map-marker-popup-cluster-mode');

        const header = doc.createElement('div');
        header.className = 'map-marker-popup-header map-marker-popup-cluster-header';
        const title = doc.createElement('div');
        title.className = 'map-marker-popup-name';
        title.textContent = `${players.length} players nearby`;
        header.appendChild(title);
        popup.card.appendChild(header);

        const list = doc.createElement('div');
        list.className = 'map-marker-popup-cluster-list';

        players.forEach((player) => {
          if (!player) return;
          const steamId = resolveSteamId(player);
          const displayName = playerDisplayName(player);
          const item = doc.createElement('button');
          item.type = 'button';
          item.className = 'map-marker-popup-cluster-item';
          item.dataset.steamid = steamId;
          item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            state.activeClusterId = null;
            state.activeClusterMembers = null;
            selectPlayer(player, { showPopup: true });
          });

          const avatarWrap = doc.createElement('span');
          avatarWrap.className = 'map-marker-popup-cluster-avatar';
          const avatarUrl = resolvePlayerAvatar(player);
          if (avatarUrl) {
            const img = doc.createElement('img');
            img.src = avatarUrl;
            img.alt = `${displayName} avatar`;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            avatarWrap.appendChild(img);
          } else {
            avatarWrap.classList.add('placeholder');
            avatarWrap.textContent = avatarInitial(displayName);
          }
          item.appendChild(avatarWrap);

          const info = doc.createElement('span');
          info.className = 'map-marker-popup-cluster-info';

          const nameEl = doc.createElement('span');
          nameEl.className = 'map-marker-popup-cluster-name';
          nameEl.textContent = displayName;
          info.appendChild(nameEl);

          const meta = doc.createElement('span');
          meta.className = 'map-marker-popup-cluster-meta';

          const colorDot = doc.createElement('span');
          colorDot.className = 'map-marker-popup-cluster-dot';
          colorDot.style.backgroundColor = colorForPlayer(player);
          meta.appendChild(colorDot);

          const metaParts = [];
          const teamId = teamKey(player);
          metaParts.push(teamId > 0 ? `Team ${teamId}` : 'Solo');
          const healthValue = formatHealth(player.health ?? player.Health);
          if (healthValue !== '—') metaParts.push(`${healthValue} hp`);
          const pingValue = formatPing(player.ping ?? player.Ping);
          if (pingValue !== '—') metaParts.push(pingValue);
          if (metaParts.length > 0) {
            const metaText = doc.createElement('span');
            metaText.textContent = metaParts.join(' • ');
            meta.appendChild(metaText);
          }
          info.appendChild(meta);

          item.appendChild(info);
          list.appendChild(item);
        });

        popup.card.appendChild(list);

        const wasHidden = popup.wrap.classList.contains('hidden');
        popup.wrap.classList.remove('hidden');
        popup.wrap.style.visibility = 'hidden';
        positionMarkerPopup(viewport, marker);
        if (popup.wrap.style.visibility === 'hidden') {
          popup.wrap.style.visibility = '';
        }
        if (wasHidden) {
          popup.wrap.getBoundingClientRect();
        }

        if (Array.isArray(players)) {
          state.activeClusterMembers = players.map((player) => resolveSteamId(player)).filter(Boolean);
        }
      }

      function updateMarkerPopups() {
        if (!mapReady()) {
          hideAllMarkerPopups();
          state.activeClusterId = null;
          state.activeClusterMembers = null;
          return;
        }
        if (state.activeClusterId) {
          const selector = `[data-cluster-id="${escapeSelector(state.activeClusterId)}"]`;
          let rendered = false;
          for (const viewport of getActiveViewports()) {
            if (!viewport?.overlay) {
              hideMarkerPopup(viewport);
              continue;
            }
            const marker = viewport.overlay.querySelector(selector);
            if (!marker) {
              hideMarkerPopup(viewport);
              continue;
            }
            const steamIds = String(marker.dataset.clusterMembers || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
            const players = steamIds
              .map((id) => state.players.find((p) => resolveSteamId(p) === id))
              .filter(Boolean);
            if (players.length < 2) {
              hideMarkerPopup(viewport);
              continue;
            }
            renderClusterPopupForViewport(viewport, marker, players);
            rendered = true;
          }
          if (!rendered) {
            state.activeClusterId = null;
            state.activeClusterMembers = null;
            hideAllMarkerPopups();
          }
          return;
        }

        const activeId = state.activePopupSteamId;
        if (!activeId) {
          hideAllMarkerPopups();
          return;
        }
        const player = state.players.find((p) => resolveSteamId(p) === activeId);
        if (!player) {
          state.activePopupSteamId = null;
          hideAllMarkerPopups();
          return;
        }
        for (const viewport of getActiveViewports()) {
          if (!viewport?.overlay) {
            hideMarkerPopup(viewport);
            continue;
          }
          const selector = `[data-steamid="${escapeSelector(activeId)}"]`;
          const marker = viewport.overlay.querySelector(selector);
          if (!marker) {
            hideMarkerPopup(viewport);
            continue;
          }
          renderMarkerPopupForViewport(viewport, player, marker);
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
          row.dataset.steamid = resolveSteamId(player);

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

        const note = viewport.doc.createElement('p');
        note.className = 'map-filter-note muted small';
        if (!hasSelection) {
          note.textContent = 'Players outside your selection are dimmed.';
        } else if (matches.length === 0) {
          note.textContent = 'No players match the current selection. Players outside your selection are dimmed.';
        } else {
          note.textContent = 'Players outside your selection are dimmed.';
        }
        target.appendChild(note);
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
          const preference = normaliseRefreshPreference(nextValue);
          const applied = normaliseRefreshInterval(preference);
          const current = getPollInterval();
          const changed = preference !== state.pollPreference || applied !== current;
          state.pollPreference = preference;
          state.pollInterval = applied;
          persistRefreshInterval(preference);
          event.target.value = String(applied);
          if (changed) {
            schedulePolling();
          } else {
            updateRefreshDisplays();
          }
        });
      }

      function renderSummaryInViewport(viewport) {
        if (!viewport || !viewport.summary) return;
        const target = viewport.summary;
        target.innerHTML = '';
        viewport.refreshDisplay = null;
        viewport.zoomSlider = null;
        viewport.zoomInput = null;

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
        if (mapSize) {
          const sizeLabel = state.estimatedWorldSizeSource ? 'World size (estimated)' : 'World size';
          metaLines.push({ label: sizeLabel, value: mapSize });
        }
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
        title.className = 'map-summary-title';
        const titleText = viewport.doc.createElement('strong');
        titleText.textContent = mapName;
        title.appendChild(titleText);
        target.appendChild(title);

        const controls = viewport.doc.createElement('div');
        controls.className = 'map-summary-controls';

        const refreshLabel = viewport.doc.createElement('label');
        refreshLabel.className = 'map-refresh-control';
        refreshLabel.appendChild(viewport.doc.createTextNode('Player refresh rate '));
        const refreshSelect = viewport.doc.createElement('select');
        refreshSelect.className = 'map-refresh-select';
        let hasMatch = false;
        const minimumInterval = getMinimumPollInterval();
        const minimumSeconds = Math.max(1, Math.round(minimumInterval / 1000));
        const minimumUnit = minimumSeconds === 1 ? 'second' : 'seconds';
        for (const option of REFRESH_OPTIONS) {
          const opt = viewport.doc.createElement('option');
          opt.value = String(option.value);
          opt.textContent = option.label;
          if (option.value < minimumInterval) {
            opt.disabled = true;
            opt.title = `Intervals below ${minimumSeconds} ${minimumUnit} are disabled to protect performance.`;
          }
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
        controls.appendChild(refreshLabel);

        const zoomControl = viewport.doc.createElement('div');
        zoomControl.className = 'map-zoom-control';

        const zoomLabel = viewport.doc.createElement('span');
        zoomLabel.className = 'map-zoom-label';
        zoomLabel.textContent = 'Zoom';
        zoomControl.appendChild(zoomLabel);

        const zoomSlider = viewport.doc.createElement('input');
        zoomSlider.type = 'range';
        zoomSlider.min = String(mapInteractions.minScale);
        zoomSlider.max = String(mapInteractions.maxScale);
        zoomSlider.step = '0.01';
        zoomSlider.value = mapInteractions.scale.toFixed(2);
        zoomSlider.className = 'map-zoom-slider';
        zoomSlider.addEventListener('input', (event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          setMapScale(next);
        });
        zoomControl.appendChild(zoomSlider);

        const zoomInputWrap = viewport.doc.createElement('div');
        zoomInputWrap.className = 'map-zoom-input-wrap';

        const zoomInput = viewport.doc.createElement('input');
        zoomInput.type = 'number';
        zoomInput.min = String(mapInteractions.minScale);
        zoomInput.max = String(mapInteractions.maxScale);
        zoomInput.step = '0.1';
        zoomInput.value = mapInteractions.scale.toFixed(2);
        zoomInput.className = 'map-zoom-input';
        const commitZoomInput = () => {
          const next = Number(zoomInput.value);
          if (!Number.isFinite(next)) {
            updateZoomControls();
            return;
          }
          setMapScale(next);
        };
        zoomInput.addEventListener('change', commitZoomInput);
        zoomInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') commitZoomInput();
        });
        zoomInput.addEventListener('blur', () => updateZoomControls());
        zoomInputWrap.appendChild(zoomInput);

        const zoomUnit = viewport.doc.createElement('span');
        zoomUnit.className = 'map-zoom-unit';
        zoomUnit.textContent = '×';
        zoomInputWrap.appendChild(zoomUnit);

        zoomControl.appendChild(zoomInputWrap);
        controls.appendChild(zoomControl);
        target.appendChild(controls);
        viewport.zoomSlider = zoomSlider;
        viewport.zoomInput = zoomInput;
        const zoomReady = mapReady();
        zoomSlider.disabled = !zoomReady;
        zoomInput.disabled = !zoomReady;
        zoomControl.classList.toggle('disabled', !zoomReady);

        const note = viewport.doc.createElement('p');
        note.className = 'map-filter-note map-summary-note muted small';
        target.appendChild(note);
        viewport.refreshDisplay = note;

        const metrics = viewport.doc.createElement('div');
        metrics.className = 'map-summary-grid';
        target.appendChild(metrics);

        metaLines.forEach((item, index) => {
          const row = viewport.doc.createElement('div');
          row.className = 'map-summary-item';
          if (index === 0) row.classList.add('map-summary-item-primary');
          const valueEl = viewport.doc.createElement('span');
          valueEl.className = 'map-summary-item-value';
          valueEl.textContent = `${item.value ?? '—'}`;
          const labelEl = viewport.doc.createElement('span');
          labelEl.className = 'map-summary-item-label';
          labelEl.textContent = item.label;
          row.appendChild(valueEl);
          row.appendChild(labelEl);
          metrics.appendChild(row);
        });
      }

      function renderSummary() {
        for (const viewport of getActiveViewports()) {
          renderSummaryInViewport(viewport);
        }
        updateRefreshDisplays();
      }

      function createTeamMember(viewport, player) {
        if (!viewport?.doc) return null;
        const member = viewport.doc.createElement('div');
        member.className = 'team-member';

        const avatarWrap = viewport.doc.createElement('div');
        avatarWrap.className = 'team-member-avatar';
        const avatarUrl = resolvePlayerAvatar(player);
        const displayName = playerDisplayName(player);
        if (avatarUrl) {
          const img = viewport.doc.createElement('img');
          img.src = avatarUrl;
          img.alt = `${displayName} avatar`;
          avatarWrap.appendChild(img);
        } else {
          avatarWrap.classList.add('placeholder');
          avatarWrap.textContent = avatarInitial(displayName);
        }

        const meta = viewport.doc.createElement('div');
        meta.className = 'team-member-meta';

        const nameEl = viewport.doc.createElement('div');
        nameEl.className = 'team-member-name';
        nameEl.textContent = displayName;
        meta.appendChild(nameEl);

        const steamIdEl = viewport.doc.createElement('div');
        steamIdEl.className = 'team-member-steamid';
        steamIdEl.textContent = resolveSteamId(player) || '—';
        meta.appendChild(steamIdEl);

        member.appendChild(avatarWrap);
        member.appendChild(meta);
        return member;
      }

      function createTeamTile(viewport, options) {
        if (!viewport?.doc) return null;
        const { label, detail, members = [], color, active = false, teamId = null } = options || {};
        const tile = viewport.doc.createElement('button');
        tile.type = 'button';
        tile.className = 'team-tile';
        tile.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active) tile.classList.add('active');
        if (color) tile.style.setProperty('--team-color', color);
        if (teamId != null) tile.dataset.teamId = String(teamId);

        const header = viewport.doc.createElement('div');
        header.className = 'team-tile-header';

        const labelEl = viewport.doc.createElement('div');
        labelEl.className = 'team-label';
        if (color) {
          const swatch = viewport.doc.createElement('span');
          swatch.className = 'map-color-chip';
          swatch.style.backgroundColor = color;
          labelEl.appendChild(swatch);
        }
        const labelText = viewport.doc.createElement('span');
        labelText.textContent = label ?? '';
        labelEl.appendChild(labelText);
        header.appendChild(labelEl);

        const detailEl = viewport.doc.createElement('span');
        detailEl.className = 'team-detail';
        if (detail != null) {
          detailEl.textContent = detail;
        } else if (members.length > 0) {
          detailEl.textContent = `${members.length} player${members.length === 1 ? '' : 's'}`;
        } else {
          detailEl.textContent = 'No players';
        }
        header.appendChild(detailEl);

        tile.appendChild(header);

        if (members.length > 0) {
          const list = viewport.doc.createElement('div');
          list.className = 'team-members';
          for (const player of members) {
            const member = createTeamMember(viewport, player);
            if (member) list.appendChild(member);
          }
          tile.appendChild(list);
        }

        return tile;
      }

      function renderTeamInfoInViewport(viewport) {
        const container = viewport?.teamInfo;
        if (!container) return;
        container.innerHTML = '';
        container.classList.add('hidden');

        const players = Array.isArray(state.players) ? state.players : [];
        if (players.length === 0) return;

        if (state.selectedSolo) {
          const target = players.find((p) => resolveSteamId(p) === state.selectedSolo);
          if (!target) return;
          const tile = createTeamTile(viewport, {
            label: playerDisplayName(target),
            detail: 'Solo player',
            members: [target],
            color: colorForPlayer(target),
            active: true,
            teamId: null
          });
          if (tile) {
            tile.addEventListener('click', () => selectPlayer(target));
            container.appendChild(tile);
          }
          if (container.childElementCount > 0) {
            container.classList.remove('hidden');
          }
          return;
        }

        const teams = new Map();
        for (const player of players) {
          const key = teamKey(player);
          if (key <= 0) continue;
          if (!teams.has(key)) teams.set(key, []);
          teams.get(key).push(player);
        }

        if (teams.size === 0) return;

        const entries = [...teams.entries()].sort(([a], [b]) => a - b);
        for (const [teamId, members] of entries) {
          const color = state.teamColors.get(teamId) || colorForPlayer(members[0]);
          const sortedMembers = [...members].sort((a, b) => {
            const nameA = playerDisplayName(a) || '';
            const nameB = playerDisplayName(b) || '';
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
          });
          const tile = createTeamTile(viewport, {
            label: `Team ${teamId}`,
            members: sortedMembers,
            color,
            active: state.selectedTeam === teamId,
            teamId
          });
          if (tile) {
            tile.addEventListener('click', () => {
              const primary = sortedMembers[0];
              if (primary) selectPlayer(primary);
            });
            container.appendChild(tile);
          }
        }

        if (container.childElementCount > 0) {
          container.classList.remove('hidden');
        }
      }

      function renderTeamInfo() {
        for (const viewport of getActiveViewports()) {
          renderTeamInfoInViewport(viewport);
        }
      }

      function renderPlayerSections() {
        if (state.activePopupSteamId && !state.players.some((p) => resolveSteamId(p) === state.activePopupSteamId)) {
          state.activePopupSteamId = null;
        }
        if (state.activeClusterId) {
          const members = Array.isArray(state.activeClusterMembers) ? state.activeClusterMembers : [];
          const present = members.filter((id) => state.players.some((p) => resolveSteamId(p) === id));
          if (present.length < 2) {
            state.activeClusterId = null;
            state.activeClusterMembers = null;
          }
        }
        ensureTeamColors(state.players);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateMarkerPopups();
      }

      function renderAll() {
        if (state.activePopupSteamId && !state.players.some((p) => resolveSteamId(p) === state.activePopupSteamId)) {
          state.activePopupSteamId = null;
        }
        if (state.activeClusterId) {
          const members = Array.isArray(state.activeClusterMembers) ? state.activeClusterMembers : [];
          const present = members.filter((id) => state.players.some((p) => resolveSteamId(p) === id));
          if (present.length < 2) {
            state.activeClusterId = null;
            state.activeClusterMembers = null;
          }
        }
        ensureTeamColors(state.players);
        const activeMeta = getActiveMapMeta();
        updateMapImage(activeMeta);
        renderMarkers();
        renderPlayerList();
        renderSummary();
        renderTeamInfo();
        updateUploadSection();
        updateConfigPanel();
        updateMarkerPopups();
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
        state.activePopupSteamId = null;
        state.activeClusterId = null;
        state.activeClusterMembers = null;
        hideAllMarkerPopups();
        renderPlayerSections();
        ctx.emit?.('live-players:highlight', { steamId: null });
        window.dispatchEvent(new CustomEvent('team:clear'));
      }

      function selectPlayer(player, options = {}) {
        const { suppressPanel = false, showPopup = false } = options;
        state.activeClusterId = null;
        state.activeClusterMembers = null;
        const key = teamKey(player);
        const steamId = resolveSteamId(player);
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
            highlightSteam = steamId;
            broadcastPlayer = player;
          }
        } else {
          const samePlayer = state.selectedSolo === steamId;
          if (samePlayer) {
            state.selectedSolo = null;
            highlightSteam = null;
          } else {
            state.selectedSolo = steamId;
            state.selectedTeam = null;
            highlightSteam = steamId;
            broadcastPlayer = player;
          }
        }
        state.activePopupSteamId = showPopup ? (highlightSteam || null) : null;
        renderPlayerSections();
        ctx.emit?.('live-players:highlight', { steamId: highlightSteam });
        if (suppressPanel) {
          window.dispatchEvent(new CustomEvent('team:clear'));
        } else if (broadcastPlayer) {
          window.dispatchEvent(new CustomEvent('player:selected', { detail: { player: broadcastPlayer, teamKey: teamKey(broadcastPlayer) } }));
        } else {
          window.dispatchEvent(new CustomEvent('team:clear'));
        }
      }

      async function checkMapState(reason) {
        if (!state.serverId || typeof ctx.api !== 'function') {
          return { locked: false, custom: false, hasImage: false, map: null };
        }
        try {
          const payload = await ctx.api(`/servers/${state.serverId}/map-state`);
          const mapMeta = payload?.map || null;
          if (mapMeta) {
            state.mapMeta = mapMeta;
            state.mapMetaServerId = state.serverId;
          } else if (reason === 'server-connected') {
            state.mapMeta = null;
            state.mapMetaServerId = state.serverId;
          }
          const custom = !!(payload?.custom || mapMeta?.custom);
          const hasImage = !!(payload?.hasImage || hasMapImage(mapMeta));
          const locked = !!(payload?.locked || (custom && !hasImage));
          updateRefreshPolicy({ isCustomMap: custom, playerDataSources: state.playerDataSources });
          if (locked) {
            customMapFreezeCache.add(state.serverId);
            state.customMapChecksFrozen = true;
            state.status = 'awaiting_upload';
          } else {
            customMapFreezeCache.delete(state.serverId);
            if (state.customMapChecksFrozen && (hasImage || !custom)) {
              state.customMapChecksFrozen = false;
            }
          }
          updateUploadSection();
          updateStatusMessage(hasImage);
          return {
            locked,
            custom,
            hasImage,
            map: mapMeta,
            levelUrl: payload?.levelUrl || mapMeta?.levelUrl || null
          };
        } catch (err) {
          ctx.log?.('Map state check failed: ' + (err?.message || err));
          return { locked: false, custom: false, hasImage: false, map: null, error: err };
        }
      }

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
          let liveMapUrl = `/servers/${state.serverId}/live-map`;
          const lockedForImagery = state.customMapChecksFrozen && !hasMapImage(getActiveMapMeta());
          if (lockedForImagery) {
            liveMapUrl += liveMapUrl.includes('?') ? '&skipImagery=1' : '?skipImagery=1';
          }
          const data = await ctx.api(liveMapUrl);
          state.players = Array.isArray(data?.players) ? data.players : [];
          state.worldEntities = normaliseWorldEntities(data?.entities);
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
            state.activePopupSteamId = null;
            hideAllMarkerPopups();
            if (state.worldDetails) {
              state.worldDetails.seed = null;
              state.worldDetails.size = null;
              state.worldDetails.lastAttempt = 0;
            }
          }
          state.serverInfo = data?.info || null;
          const playerDataSources = (data?.playerDataSources && typeof data.playerDataSources === 'object')
            ? data.playerDataSources
            : null;
          if (playerDataSources) {
            state.playerDataSources = playerDataSources;
            logPlayerDataSources(state.playerDataSources);
          } else {
            clearPlayerDataSources();
          }
          state.lastUpdated = data?.fetchedAt || new Date().toISOString();
          state.status = data?.status || null;
          state.manualCooldownUntil = 0;
          state.manualCooldownMessage = null;
          updateProjectionMode();
          broadcastPlayers();
          const activeMeta = getActiveMapMeta();
          const hasImage = hasMapImage(activeMeta);
          const isCustomMap = mapIsCustom(activeMeta, state.serverInfo);
          updateRefreshPolicy({ isCustomMap, playerDataSources: state.playerDataSources });
          if (state.serverId) {
            if (isCustomMap && !hasImage) {
              customMapFreezeCache.add(state.serverId);
            } else {
              customMapFreezeCache.delete(state.serverId);
            }
          }
          if (!hasImage && state.serverId && customMapFreezeCache.has(state.serverId)) {
            state.customMapChecksFrozen = true;
          } else if (hasImage && state.customMapChecksFrozen) {
            state.customMapChecksFrozen = false;
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
          const needsWorldSize = resolveWorldSize(activeMeta, state.serverInfo, { allowEstimated: false }) == null;
          const needsWorldSeed = resolveWorldSeed(activeMeta, state.serverInfo) == null;
          const shouldUpdateWorldDetails = !skipMapChecks && (needsWorldSize || needsWorldSeed);
          if (shouldUpdateWorldDetails) {
            ensureWorldDetails('refresh')
              .catch((err) => ctx.log?.('World detail refresh failed: ' + (err?.message || err)));
            maybeSubmitWorldDetails('refresh').catch((err) => ctx.log?.('World detail sync failed: ' + (err?.message || err)));
          }
        } catch (err) {
          const code = ctx.errorCode?.(err);
          if (code === 'manual_refresh_cooldown' || err?.status === 429) {
            const description = ctx.describeError?.(err)
              || 'Manual live map refresh is cooling down. Try again in a few seconds.';
            state.manualCooldownUntil = Date.now() + getManualRefreshMinimum();
            state.manualCooldownMessage = `${description} Cached data is shown until the cooldown expires.`;
            updateConfigPanel();
            if (mapReady() || state.players.length > 0) {
              clearMessage();
            } else {
              setMessage(description);
            }
            updateRefreshDisplays();
            ctx.log?.('Manual refresh cooldown active; displaying cached live map data.');
            return;
          }
          state.status = null;
          if (state.pendingGeneration) {
            state.pendingGeneration = false;
            clearPendingRefresh();
          }
          updateConfigPanel();
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
            state.status = 'awaiting_upload';
            updateUploadSection();
            setMessage('This server is using a custom map. Upload a rendered image below or configure a Facepunch level URL to enable the live map.');
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
        state.activeClusterId = null;
        state.activeClusterMembers = null;
        state.status = null;
        state.players = [];
        state.mapMeta = null;
        state.mapMetaServerId = null;
        state.serverInfo = null;
        clearPlayerDataSources();
        state.lastUpdated = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
        state.imageWorldSize = null;
        state.estimatedWorldSize = null;
        state.estimatedWorldSizeSource = null;
        state.customMapChecksFrozen = customMapFreezeCache.has(serverId);
        state.worldEntities = {
          fetchedAt: null,
          monuments: [],
          entities: []
        };
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
        clearAllViewportMarkers();
        cancelMapImageRequest();
        clearMapImage();
        updateConfigPanel();
        clearSelection();
        const persistedStatus = loadPersistentStatusMessage();
        if (persistedStatus?.message && hasPersistentStatusForServer(serverId)) {
          setMessage(persistedStatus.message, { persist: true });
        }
        checkMapState('server-connected')
          .catch((err) => ctx.log?.('Map state check failed: ' + (err?.message || err)))
          .finally(() => {
            refreshData('server-connected');
            schedulePolling();
            ensureWorldDetails('server-connected')
              .catch((err) => ctx.log?.('World detail query failed: ' + (err?.message || err)))
              .finally(() => {
                maybeSubmitWorldDetails('server-connected').catch((err) => ctx.log?.('World detail sync failed: ' + (err?.message || err)));
              });
          });
      });

      const offDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId && serverId === state.serverId) {
          stopPolling();
          clearPendingRefresh();
          customMapFreezeCache.delete(serverId);
          state.serverId = null;
          state.players = [];
          state.mapMeta = null;
          state.mapMetaServerId = null;
          state.serverInfo = null;
          clearPlayerDataSources();
          state.lastUpdated = null;
          state.pendingGeneration = false;
          state.pendingRefresh = null;
          state.activeClusterId = null;
          state.activeClusterMembers = null;
          state.status = null;
          state.projectionMode = null;
          state.horizontalAxis = null;
          state.imageWorldSize = null;
          state.estimatedWorldSize = null;
          state.estimatedWorldSizeSource = null;
          state.customMapChecksFrozen = false;
          state.worldEntities = {
            fetchedAt: null,
            monuments: [],
            entities: []
          };
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
          clearAllViewportMarkers();
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
          resetRefreshPolicy();
        }
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        stopPolling();
        clearPendingRefresh();
        closeFullscreenWindow();
        customMapFreezeCache.clear();
        state.serverId = null;
        state.players = [];
        state.mapMeta = null;
        state.mapMetaServerId = null;
        state.serverInfo = null;
        clearPlayerDataSources();
        state.lastUpdated = null;
        state.pendingGeneration = false;
        state.pendingRefresh = null;
        state.status = null;
        state.projectionMode = null;
        state.horizontalAxis = null;
        state.imageWorldSize = null;
        state.estimatedWorldSize = null;
        state.estimatedWorldSizeSource = null;
        state.customMapChecksFrozen = false;
        state.worldEntities = {
          fetchedAt: null,
          monuments: [],
          entities: []
        };
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
        clearAllViewportMarkers();
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
        resetRefreshPolicy();
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
      ctx.onCleanup?.(() => {
        state.serverId = null;
        resetRefreshPolicy();
      });
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
      ctx.onCleanup?.(() => {
        if (viewportSizeUpdateHandle != null) {
          cancelViewportAnimationFrame(viewportSizeUpdateHandle);
          viewportSizeUpdateHandle = null;
        }
        viewportSizeUpdateScheduled = false;
        viewportSizeCache.delete(mapView);
        visibilityObserver?.disconnect?.();
        visibilityObserver = null;
        mapView.classList.remove('map-view-dynamic');
        mapView.style.removeProperty('--map-size');
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
