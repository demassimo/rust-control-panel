(function(){
  if (typeof window.registerModule !== 'function') return;

  window.registerModule({
    id: 'players-directory',
    title: 'Players',
    order: 10,
    setup(ctx){
      const list = document.createElement('ul');
      list.className = 'player-directory';
      const message = document.createElement('p');
      message.className = 'module-message hidden';
      message.textContent = 'Sign in to view player directory.';
      ctx.body?.appendChild(list);
      ctx.body?.appendChild(message);

      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const syncBtn = document.createElement('button');
        syncBtn.id = 'moduleSyncPlayers';
        syncBtn.className = 'ghost small';
        syncBtn.textContent = 'Sync from Steam';
        syncBtn.addEventListener('click', async () => {
          const raw = window.prompt('Enter comma-separated Steam64 IDs to sync:');
          if (!raw) return;
          const steamids = raw.split(',').map((s) => s.trim()).filter(Boolean);
          if (steamids.length === 0) return;
          try {
            await ctx.api('/api/steam/sync', { steamids }, 'POST');
            ctx.log?.(`Requested Steam sync for ${steamids.length} player(s).`);
            await refresh('steam-sync');
          } catch (err) {
            if (ctx.errorCode?.(err) === 'unauthorized') ctx.handleUnauthorized?.();
            else ctx.log?.('Steam sync failed: ' + (ctx.describeError?.(err) || err?.message || String(err)));
          }
        });
        ctx.actions.appendChild(syncBtn);
      }

      function setMessage(text, variant = 'info') {
        if (!message) return;
        message.textContent = text;
        message.classList.remove('hidden');
        message.dataset.variant = variant;
      }

      function clearMessage() {
        message?.classList.add('hidden');
        message?.removeAttribute('data-variant');
      }

      function render(players) {
        list.innerHTML = '';
        if (!Array.isArray(players) || players.length === 0) {
          setMessage('No tracked players yet. Import Steam profiles to populate this list.');
          return;
        }
        clearMessage();
        for (const p of players) {
          const li = document.createElement('li');
          const left = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = p.persona || p.steamid;
          left.appendChild(strong);
          const meta = document.createElement('div');
          meta.className = 'muted small';
          meta.textContent = p.steamid;
          left.appendChild(meta);
          const right = document.createElement('div');
          right.className = 'server-actions';
          if (p.country) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = p.country;
            right.appendChild(badge);
          }
          if (p.vac_banned) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'VAC';
            right.appendChild(badge);
          }
          li.appendChild(left);
          li.appendChild(right);
          list.appendChild(li);
        }
      }

      let isLoading = false;
      async function refresh(reason){
        if (isLoading) return;
        const state = ctx.getState?.();
        if (!state?.currentUser) {
          list.innerHTML = '';
          setMessage('Sign in to view player directory.');
          return;
        }
        isLoading = true;
        setMessage('Loading players…');
        try {
          const players = await ctx.api('/api/players?limit=200');
          render(players);
        } catch (err) {
          if (ctx.errorCode?.(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
          } else {
            setMessage('Unable to load players: ' + (ctx.describeError?.(err) || err?.message || 'Unknown error'));
            ctx.log?.('Players module error: ' + (err?.message || err));
          }
        } finally {
          isLoading = false;
        }
      }

      const offLogin = ctx.on?.('auth:login', () => refresh('login'));
      const offRefresh = ctx.on?.('players:refresh', (payload) => refresh(payload?.reason || 'manual'));
      const offLogout = ctx.on?.('auth:logout', () => {
        list.innerHTML = '';
        setMessage('Sign in to view player directory.');
      });

      ctx.onCleanup?.(() => offLogin?.());
      ctx.onCleanup?.(() => offRefresh?.());
      ctx.onCleanup?.(() => offLogout?.());

      // Initial state when module mounts
      refresh('init');
    }
  });
})();
