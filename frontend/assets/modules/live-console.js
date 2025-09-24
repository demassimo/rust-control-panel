(function(){
  if (typeof window.registerModule !== 'function') return;

  const ANSI_COLOR_REGEX = /\u001b\[[0-9;]*m/g;
  const MAX_LINES = 400;

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function normaliseText(value){
    if (value == null) return '';
    return String(value)
      .replace(ANSI_COLOR_REGEX, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  function classifyVariant(payload, text){
    const type = String(payload?.Type ?? payload?.type ?? '').toLowerCase();
    if (type.includes('error') || type.includes('exception') || type.includes('fail')) return 'error';
    if (type.includes('warn')) return 'warn';

    const lower = text.toLowerCase();
    if (lower.includes('exception') || lower.includes('error') || lower.includes('traceback')) return 'error';
    if (lower.includes('warn') || lower.includes('warning') || lower.includes('failed')) return 'warn';
    return 'info';
  }

  function appendLine(container, text, variant = 'info', timestamp = new Date()){
    if (!text) return;
    const line = document.createElement('div');
    line.className = 'line';
    if (variant === 'warn') line.classList.add('warn');
    else if (variant === 'error') line.classList.add('error');
    else if (variant === 'system') line.classList.add('system');

    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = `[${timeFormatter.format(timestamp)}]`;
    line.appendChild(ts);

    const message = document.createElement('span');
    message.className = 'msg';
    message.textContent = ` ${text}`;
    line.appendChild(message);

    container.appendChild(line);

    while (container.childElementCount > MAX_LINES) {
      container.removeChild(container.firstElementChild);
    }

    const host = container.parentElement || container;
    host.scrollTop = host.scrollHeight;
  }

  function setSystemMessage(container, text){
    container.innerHTML = '';
    if (text) appendLine(container, text, 'system');
  }

  window.registerModule({
    id: 'live-console',
    title: 'Live console',
    order: 5,
    setup(ctx){
      const root = ctx.root;
      if (!root) return () => {};

      root.classList.add('console-module');
      root.innerHTML = '';

      const list = document.createElement('div');
      list.className = 'console-lines';
      root.appendChild(list);

      const state = {
        serverId: null
      };

      setSystemMessage(list, 'Connect to a server to view console output.');

      function handleConsoleEvent(payload){
        const message = payload?.message ?? payload;
        const rawText = typeof message === 'string'
          ? message
          : (message?.Message ?? payload?.Message ?? '');
        const text = normaliseText(rawText);
        const meta = typeof message === 'object' ? message : payload;
        if (!text) return;
        const variant = classifyVariant(meta, text);
        appendLine(list, text, variant);
      }

      const offConsole = ctx.on?.('console:message', (event) => {
        const payload = event?.message;
        const target = event?.serverId;
        if (state.serverId != null && target != null && String(target) !== state.serverId) {
          return;
        }
        handleConsoleEvent(payload || event);
      });

      const offConnect = ctx.on?.('server:connected', ({ serverId, server }) => {
        if (serverId == null) return;
        state.serverId = String(serverId);
        const label = server?.name || server?.Name || `Server #${serverId}`;
        list.innerHTML = '';
        appendLine(list, `Connected to ${label}.`, 'system');
      });

      const offDisconnect = ctx.on?.('server:disconnected', ({ serverId }) => {
        if (state.serverId != null && serverId != null && String(serverId) !== state.serverId) return;
        state.serverId = null;
        setSystemMessage(list, 'Disconnected. Connect to a server to resume streaming console output.');
      });

      const offLogout = ctx.on?.('auth:logout', () => {
        state.serverId = null;
        setSystemMessage(list, 'Sign in to stream console output.');
      });

      ctx.onCleanup?.(() => offConsole?.());
      ctx.onCleanup?.(() => offConnect?.());
      ctx.onCleanup?.(() => offDisconnect?.());
      ctx.onCleanup?.(() => offLogout?.());

      return () => {
        list.innerHTML = '';
      };
    }
  });
})();
