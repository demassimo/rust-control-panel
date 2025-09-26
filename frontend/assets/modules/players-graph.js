(function(){
  if (typeof window.registerModule !== 'function') return;

  const RANGE_OPTIONS = [
    { id: '6h', label: 'Last 6 hours', range: '6h', interval: '15m', rangeMs: 6 * 60 * 60 * 1000 },
    { id: '12h', label: 'Last 12 hours', range: '12h', interval: '30m', rangeMs: 12 * 60 * 60 * 1000 },
    { id: '24h', label: 'Last 24 hours', range: '24h', interval: '1h', rangeMs: 24 * 60 * 60 * 1000 },
    { id: '3d', label: 'Last 3 days', range: '3d', interval: '3h', rangeMs: 3 * 24 * 60 * 60 * 1000 },
    { id: '7d', label: 'Last 7 days', range: '7d', interval: '6h', rangeMs: 7 * 24 * 60 * 60 * 1000 },
    { id: '30d', label: 'Last 30 days', range: '30d', interval: '1d', rangeMs: 30 * 24 * 60 * 60 * 1000 }
  ];

  const DEFAULT_OPTION = RANGE_OPTIONS.find((opt) => opt.id === '24h') || RANGE_OPTIONS[0];
  const MIN_REFRESH_INTERVAL = 60 * 1000; // 1 minute

  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const dayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  function optionByKey(key) {
    return RANGE_OPTIONS.find((opt) => opt.id === key || opt.range === key) || DEFAULT_OPTION;
  }

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function formatXAxisLabel(timestamp, rangeMs) {
    const date = new Date(timestamp);
    if (!Number.isFinite(rangeMs) || rangeMs <= 24 * 60 * 60 * 1000) {
      return timeFormatter.format(date);
    }
    if (rangeMs <= 3 * 24 * 60 * 60 * 1000) {
      return `${weekdayFormatter.format(date)} ${timeFormatter.format(date)}`;
    }
    if (rangeMs <= 7 * 24 * 60 * 60 * 1000) {
      return `${weekdayFormatter.format(date)} ${timeFormatter.format(date)}`;
    }
    return dayFormatter.format(date);
  }

  function formatPlayerCount(value) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value - Math.round(value)) < 0.05) {
      return Math.round(value).toLocaleString();
    }
    return value.toFixed(1);
  }

  async function defaultApi(path) {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    return await response.json();
  }

  window.registerModule({
    id: 'players-graph',
    title: 'Player history',
    order: 20,
    setup(ctx){
      const root = ctx.root || ctx.body || document.createElement('div');
      root.classList.add('players-graph-container');
      if (ctx.root && ctx.root.classList) ctx.root.classList.add('players-graph-card');
      if (ctx.body && ctx.body.classList) ctx.body.classList.add('players-graph-body');

      const container = document.createElement('div');
      container.className = 'players-graph';
      ctx.body?.appendChild(container);

      const controls = document.createElement('div');
      controls.className = 'players-graph-controls';
      container.appendChild(controls);

      const controlGroup = document.createElement('div');
      controlGroup.className = 'control-group';
      controls.appendChild(controlGroup);

      const rangeLabel = document.createElement('label');
      rangeLabel.textContent = 'Range';
      rangeLabel.htmlFor = `players-graph-range-${Math.random().toString(36).slice(2, 8)}`;
      controlGroup.appendChild(rangeLabel);

      const rangeSelect = document.createElement('select');
      rangeSelect.className = 'players-graph-select';
      rangeSelect.id = rangeLabel.htmlFor;
      for (const opt of RANGE_OPTIONS) {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        rangeSelect.appendChild(option);
      }
      rangeSelect.value = DEFAULT_OPTION.id;
      controlGroup.appendChild(rangeSelect);

      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'btn ghost small';
      refreshBtn.textContent = 'Refresh';
      controls.appendChild(refreshBtn);

      const legend = document.createElement('div');
      legend.className = 'players-graph-legend';
      legend.innerHTML = '<span><span class="swatch"></span>Players online</span>';
      controls.appendChild(legend);

      const chartWrap = document.createElement('div');
      chartWrap.className = 'players-graph-chart';
      container.appendChild(chartWrap);

      const canvas = document.createElement('canvas');
      canvas.className = 'players-graph-canvas';
      chartWrap.appendChild(canvas);

      const summary = document.createElement('div');
      summary.className = 'players-graph-summary';
      container.appendChild(summary);

      const message = document.createElement('p');
      message.className = 'module-message hidden';
      container.appendChild(message);

      const state = {
        serverId: null,
        rangeKey: DEFAULT_OPTION.id,
        rangeParam: DEFAULT_OPTION.range,
        intervalParam: DEFAULT_OPTION.interval,
        rangeMs: DEFAULT_OPTION.rangeMs,
        buckets: [],
        summary: null,
        intervalSeconds: null,
        isLoading: false,
        lastFetch: 0,
        lastError: null
      };

      function setMessage(text, variant = 'info') {
        if (!message) return;
        if (!text) {
          message.textContent = '';
          message.classList.add('hidden');
          message.removeAttribute('data-variant');
          return;
        }
        message.textContent = text;
        message.classList.remove('hidden');
        message.dataset.variant = variant;
      }

      function updateSummary() {
        if (!summary) return;
        const parts = [];
        const option = optionByKey(state.rangeKey);
        if (option) parts.push(option.label);
        if (state.summary?.peakPlayers != null) {
          parts.push(`Peak ${state.summary.peakPlayers}`);
        }
        if (state.summary?.averagePlayers != null) {
          parts.push(`Avg ${formatPlayerCount(state.summary.averagePlayers)}`);
        }
        if (state.summary?.latest?.playerCount != null && state.summary?.latest?.timestamp) {
          const when = new Date(state.summary.latest.timestamp);
          parts.push(`Latest ${state.summary.latest.playerCount} @ ${dateTimeFormatter.format(when)}`);
        }
        summary.textContent = parts.length ? parts.join(' · ') : 'No player history recorded yet.';
      }

      function renderChart() {
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;
        const width = Math.max(chartWrap.clientWidth || container.clientWidth || 600, 200);
        const height = 260;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx2d.save();
        ctx2d.scale(dpr, dpr);
        ctx2d.clearRect(0, 0, width, height);

        const padding = { left: 56, right: 20, top: 18, bottom: 40 };
        const chartWidth = Math.max(width - padding.left - padding.right, 50);
        const chartHeight = Math.max(height - padding.top - padding.bottom, 50);
        const originX = padding.left;
        const originY = padding.top + chartHeight;

        ctx2d.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx2d.lineWidth = 1;
        const backdropX = padding.left - 24;
        const backdropY = padding.top - 16;
        const backdropW = chartWidth + 48;
        const backdropH = chartHeight + 32;
        if (typeof ctx2d.roundRect === 'function') {
          ctx2d.beginPath();
          ctx2d.roundRect(backdropX, backdropY, backdropW, backdropH, 12);
          ctx2d.fill();
          ctx2d.stroke();
        } else {
          ctx2d.fillRect(backdropX, backdropY, backdropW, backdropH);
          ctx2d.strokeRect(backdropX, backdropY, backdropW, backdropH);
        }

        const values = [];
        const maxPlayersValues = [];
        state.buckets.forEach((bucket, index) => {
          const value = safeNumber(bucket?.playerCount);
          if (value != null) values.push({ index, value });
          const mp = safeNumber(bucket?.maxPlayers);
          if (mp != null) maxPlayersValues.push(mp);
        });

        const hasData = values.length > 0;
        const baseMax = values.reduce((max, point) => Math.max(max, point.value), 0);
        const maxPlayers = maxPlayersValues.reduce((max, val) => Math.max(max, val), 0);
        const upperBound = Math.max(baseMax, maxPlayers, 10);

        const yScale = chartHeight / (upperBound || 1);
        const xForIndex = (index) => {
          if (state.buckets.length <= 1) return originX + chartWidth / 2;
          return originX + (index / (state.buckets.length - 1)) * chartWidth;
        };
        const yForValue = (value) => originY - value * yScale;

        // Grid lines
        ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx2d.fillStyle = 'rgba(148, 163, 184, 0.65)';
        ctx2d.font = '12px "Inter", "Segoe UI", sans-serif';
        ctx2d.textAlign = 'right';
        ctx2d.textBaseline = 'middle';
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i += 1) {
          const fraction = i / gridLines;
          const value = upperBound * fraction;
          const y = yForValue(value);
          ctx2d.beginPath();
          ctx2d.moveTo(originX, y);
          ctx2d.lineTo(originX + chartWidth, y);
          ctx2d.stroke();
          ctx2d.fillText(Math.round(value).toLocaleString(), originX - 8, y);
        }

        // X-axis labels
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'top';
        const rangeMs = optionByKey(state.rangeKey)?.rangeMs || DEFAULT_OPTION.rangeMs;
        if (state.buckets.length) {
          const steps = Math.min(5, state.buckets.length);
          const labelIndices = new Set();
          if (steps === 1) {
            labelIndices.add(0);
          } else {
            for (let s = 0; s < steps; s += 1) {
              const ratio = s / (steps - 1);
              const idx = Math.round(ratio * (state.buckets.length - 1));
              labelIndices.add(idx);
            }
          }
          ctx2d.fillStyle = 'rgba(148, 163, 184, 0.85)';
          ctx2d.font = '12px "Inter", "Segoe UI", sans-serif';
          labelIndices.forEach((idx) => {
            const bucket = state.buckets[idx];
            if (!bucket) return;
            const label = formatXAxisLabel(bucket.timestamp, rangeMs);
            const x = xForIndex(idx);
            ctx2d.fillText(label, x, originY + 8);
          });
        }

        if (hasData) {
          ctx2d.lineWidth = 2;
          ctx2d.strokeStyle = '#38bdf8';
          ctx2d.fillStyle = 'rgba(56, 189, 248, 0.18)';

          ctx2d.beginPath();
          let drawing = false;
          state.buckets.forEach((bucket, idx) => {
            const value = safeNumber(bucket?.playerCount);
            if (value == null) {
              drawing = false;
              return;
            }
            const x = xForIndex(idx);
            const y = yForValue(value);
            if (!drawing) {
              ctx2d.moveTo(x, y);
              drawing = true;
            } else {
              ctx2d.lineTo(x, y);
            }
          });
          ctx2d.stroke();

          // Fill under line
          ctx2d.beginPath();
          drawing = false;
          state.buckets.forEach((bucket, idx) => {
            const value = safeNumber(bucket?.playerCount);
            if (value == null) {
              if (drawing) {
                const x = xForIndex(idx - 1);
                ctx2d.lineTo(x, originY);
                ctx2d.closePath();
                ctx2d.fill();
                drawing = false;
                ctx2d.beginPath();
              }
              return;
            }
            const x = xForIndex(idx);
            const y = yForValue(value);
            if (!drawing) {
              ctx2d.moveTo(x, originY);
              ctx2d.lineTo(x, y);
              drawing = true;
            } else {
              ctx2d.lineTo(x, y);
            }
          });
          if (drawing) {
            const lastX = xForIndex(state.buckets.length - 1);
            ctx2d.lineTo(lastX, originY);
            ctx2d.closePath();
            ctx2d.fill();
          }

          // Highlight latest point
          if (state.summary?.latest?.playerCount != null) {
            const latestIndex = [...state.buckets].reverse().findIndex((bucket) => safeNumber(bucket?.playerCount) != null);
            if (latestIndex >= 0) {
              const idx = state.buckets.length - 1 - latestIndex;
              const value = safeNumber(state.buckets[idx]?.playerCount);
              if (value != null) {
                const x = xForIndex(idx);
                const y = yForValue(value);
                ctx2d.fillStyle = '#38bdf8';
                ctx2d.beginPath();
                ctx2d.arc(x, y, 4, 0, Math.PI * 2);
                ctx2d.fill();
              }
            }
          }
        } else {
          ctx2d.fillStyle = 'rgba(148, 163, 184, 0.65)';
          ctx2d.font = '13px "Inter", "Segoe UI", sans-serif';
          ctx2d.textAlign = 'center';
          ctx2d.textBaseline = 'middle';
          const text = state.serverId
            ? 'No player data recorded for this period.'
            : 'Select a server to view player history.';
          ctx2d.fillText(text, originX + chartWidth / 2, padding.top + chartHeight / 2);
        }

        ctx2d.restore();
      }

      function shouldThrottle() {
        return Date.now() - state.lastFetch < MIN_REFRESH_INTERVAL;
      }

      async function fetchHistory(reason = 'manual') {
        if (state.isLoading) return;
        if (!Number.isFinite(state.serverId)) {
          state.buckets = [];
          state.summary = null;
          setMessage('Select a server to view player history.');
          renderChart();
          updateSummary();
          return;
        }
        state.isLoading = true;
        state.lastError = null;
        rangeSelect.disabled = true;
        refreshBtn.disabled = true;
        setMessage('Loading player history…');
        try {
          const params = new URLSearchParams({ range: state.rangeParam, interval: state.intervalParam });
          const result = await (typeof ctx.api === 'function' ? ctx.api(`/servers/${state.serverId}/player-counts?${params}`) : defaultApi(`/servers/${state.serverId}/player-counts?${params}`));
          state.buckets = Array.isArray(result?.buckets) ? result.buckets : [];
          state.summary = result?.summary || null;
          state.intervalSeconds = safeNumber(result?.intervalSeconds);
          state.lastFetch = Date.now();
          if (!state.buckets.some((bucket) => safeNumber(bucket?.playerCount) != null)) {
            setMessage('No player data recorded for this range yet.');
          } else {
            setMessage('');
          }
          renderChart();
        } catch (err) {
          state.lastError = err;
          const description = ctx.describeError?.(err) || err?.message || 'Unknown error';
          setMessage(`Unable to load player history: ${description}`, 'error');
          state.buckets = [];
          state.summary = null;
          ctx.log?.(`players-graph error (${reason}): ${description}`);
          renderChart();
        } finally {
          state.isLoading = false;
          rangeSelect.disabled = false;
          refreshBtn.disabled = false;
          updateSummary();
        }
      }

      function requestRefresh(reason = 'auto') {
        if (shouldThrottle()) return;
        fetchHistory(reason);
      }

      rangeSelect.addEventListener('change', () => {
        const nextOption = optionByKey(rangeSelect.value);
        state.rangeKey = nextOption.id;
        state.rangeParam = nextOption.range;
        state.intervalParam = nextOption.interval;
        state.rangeMs = nextOption.rangeMs;
        fetchHistory('range-change');
      });

      refreshBtn.addEventListener('click', () => fetchHistory('manual'));

      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => renderChart())
        : null;
      if (resizeObserver) resizeObserver.observe(chartWrap);
      else window.addEventListener('resize', renderChart);

      ctx.onCleanup?.(() => {
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', renderChart);
      });

      const offServerConnect = ctx.on?.('server:connected', ({ serverId }) => {
        if (!Number.isFinite(Number(serverId))) return;
        state.serverId = Number(serverId);
        fetchHistory('server-connect');
      });

      const offServerDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (!Number.isFinite(Number(serverId)) || Number(serverId) !== state.serverId) return;
        state.serverId = null;
        state.buckets = [];
        state.summary = null;
        setMessage('Connect to a server to view player history.');
        renderChart();
        updateSummary();
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        state.serverId = null;
        state.buckets = [];
        state.summary = null;
        setMessage('Sign in to view player history.');
        renderChart();
        updateSummary();
      });

      const offPlayersRefresh = ctx.on?.('players:refresh', ({ serverId }) => {
        if (Number.isFinite(Number(serverId)) && Number(serverId) !== state.serverId) return;
        requestRefresh('players-refresh');
      });

      ctx.onCleanup?.(() => offServerConnect?.());
      ctx.onCleanup?.(() => offServerDisconnect?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => offPlayersRefresh?.());

      const initialState = ctx.getState?.();
      const initialServer = Number(initialState?.currentServerId);
      if (Number.isFinite(initialServer)) {
        state.serverId = initialServer;
        fetchHistory('init');
      } else {
        setMessage('Select a server to view player history.');
        renderChart();
        updateSummary();
      }

      // Initial draw to ensure canvas has base styling even before data loads
      renderChart();
    }
  });
})();
