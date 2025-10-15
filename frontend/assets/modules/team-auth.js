(function(){
  if (typeof window.registerModule !== 'function') return;

  const DISPLAY_DATE = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
    ? new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  function formatTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (DISPLAY_DATE) {
      try {
        return DISPLAY_DATE.format(date);
      } catch {
        /* ignore */
      }
    }
    return date.toLocaleString();
  }

  function normaliseId(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function includesQuery(value, query) {
    if (!query) return true;
    if (value == null) return false;
    return String(value).toLowerCase().includes(query);
  }

  window.registerModule({
    id: 'team-auth-profiles',
    title: 'Linked Accounts',
    order: 15,
    icon: 'link',
    setup(ctx){
      const state = {
        loading: false,
        profiles: [],
        filter: '',
        error: null
      };
      let requestId = 0;

      const cardBody = ctx.body || document.createElement('div');
      const list = document.createElement('ul');
      list.className = 'team-auth-list';
      const message = document.createElement('p');
      message.className = 'module-message hidden';
      cardBody.appendChild(list);
      cardBody.appendChild(message);

      let searchInput = null;
      let refreshBtn = null;

      if (ctx.actions) {
        ctx.actions.classList.add('module-header-actions');
        const form = document.createElement('form');
        form.className = 'module-search';
        form.setAttribute('role', 'search');
        form.setAttribute('autocomplete', 'off');
        form.addEventListener('submit', (event) => event.preventDefault());

        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search Discord or Steam IDs';
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('aria-label', 'Search linked accounts by Discord or Steam identifier');
        form.appendChild(searchInput);
        ctx.actions.appendChild(form);

        refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'btn ghost small';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.addEventListener('click', () => loadProfiles({ force: true, indicateLoading: true }));
        ctx.actions.appendChild(refreshBtn);
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

      function updateTitle() {
        if (typeof ctx.setTitle !== 'function') return;
        const total = state.profiles.length;
        const suffix = total > 0 ? ` (${total})` : '';
        ctx.setTitle(`Linked Accounts${suffix}`);
      }

      function openPlayerProfile(steamId) {
        const id = normaliseId(steamId);
        if (!id) return;
        try {
          window.dispatchEvent(new CustomEvent('players:open-profile', { detail: { steamid: id } }));
        } catch {
          /* ignore */
        }
      }

      function buildMetaLine(profile) {
        const parts = [];
        const discordLabel = profile.discordDisplayName || profile.discordUsername || null;
        if (profile.discordId || discordLabel) {
          const label = discordLabel ? `${discordLabel}` : `${profile.discordId}`;
          if (profile.discordId) {
            parts.push(`Discord ${label} (${profile.discordId})`);
          } else {
            parts.push(`Discord ${label}`);
          }
        }
        if (profile.steamId) {
          parts.push(`Steam ${profile.steamId}`);
        }
        return parts.join(' · ');
      }

      function renderProfiles() {
        list.innerHTML = '';
        const query = state.filter.trim().toLowerCase();
        const matches = state.profiles.filter((profile) => {
          if (!query) return true;
          const fields = [
            profile.profileId,
            profile.discordId,
            profile.discordUsername,
            profile.discordDisplayName,
            profile.steamId
          ];
          if (Array.isArray(profile.alts)) {
            for (const alt of profile.alts) {
              fields.push(alt?.steamId, alt?.discordId, alt?.discordDisplayName, alt?.discordUsername);
            }
          }
          return fields.some((field) => includesQuery(field, query));
        });

        if (state.loading) {
          setMessage('Loading linked accounts…');
          return;
        }
        if (state.error) {
          setMessage(state.error, 'error');
          return;
        }
        if (matches.length === 0) {
          if (state.profiles.length === 0) {
            setMessage('No Discord links have been created for this team yet.');
          } else {
            setMessage('No linked accounts match your search.');
          }
          return;
        }
        clearMessage();

        for (const profile of matches) {
          const li = document.createElement('li');
          li.className = 'team-auth-entry';
          li.tabIndex = 0;

          const head = document.createElement('div');
          head.className = 'team-auth-entry-head';
          const title = document.createElement('strong');
          title.textContent =
            profile.discordDisplayName || profile.discordUsername || profile.steamId || 'Linked account';
          head.appendChild(title);
          if (profile.isAlt) {
            const badge = document.createElement('span');
            badge.className = 'badge warn';
            badge.textContent = 'Alt';
            head.appendChild(badge);
          }
          li.appendChild(head);

          const meta = buildMetaLine(profile);
          if (meta) {
            const metaLine = document.createElement('div');
            metaLine.className = 'team-auth-entry-meta muted small';
            metaLine.textContent = meta;
            li.appendChild(metaLine);
          }

          const timeline = [];
          const linkedAt = formatTimestamp(profile.linkedAt);
          if (linkedAt) timeline.push(`Linked ${linkedAt}`);
          const updatedAt = formatTimestamp(profile.updatedAt);
          if (updatedAt && updatedAt !== linkedAt) timeline.push(`Updated ${updatedAt}`);
          if (timeline.length) {
            const timeLine = document.createElement('div');
            timeLine.className = 'team-auth-entry-time muted small';
            timeLine.textContent = timeline.join(' · ');
            li.appendChild(timeLine);
          }

          if (Array.isArray(profile.alts) && profile.alts.length) {
            const altList = document.createElement('ul');
            altList.className = 'team-auth-alt-list';
            for (const alt of profile.alts) {
              if (!alt) continue;
              const altItem = document.createElement('li');
              const bits = [];
              if (alt.relation && alt.relation.toLowerCase() !== 'primary') {
                bits.push(alt.relation.charAt(0).toUpperCase() + alt.relation.slice(1));
              }
              if (alt.steamId) bits.push(`Steam ${alt.steamId}`);
              if (alt.discordId) bits.push(`Discord ${alt.discordId}`);
              altItem.textContent = bits.join(' · ') || 'Linked profile';
              altItem.dataset.steamid = alt.steamId || '';
              altItem.tabIndex = 0;
              altItem.addEventListener('click', () => openPlayerProfile(alt.steamId));
              altItem.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openPlayerProfile(alt.steamId);
                }
              });
              altList.appendChild(altItem);
            }
            if (altList.childElementCount > 0) {
              const altHeading = document.createElement('p');
              altHeading.className = 'team-auth-alt-heading muted small';
              altHeading.textContent = 'Linked profiles';
              li.appendChild(altHeading);
              li.appendChild(altList);
            }
          }

          if (profile.steamId) {
            const actions = document.createElement('div');
            actions.className = 'team-auth-entry-actions';
            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'btn ghost small';
            openBtn.textContent = 'Open player record';
            openBtn.addEventListener('click', () => openPlayerProfile(profile.steamId));
            actions.appendChild(openBtn);
            li.appendChild(actions);
          }

          li.addEventListener('click', (event) => {
            if (event.target?.tagName === 'BUTTON') return;
            openPlayerProfile(profile.steamId);
          });
          li.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPlayerProfile(profile.steamId);
            }
          });

          list.appendChild(li);
        }
      }

      async function loadProfiles({ force = false, indicateLoading = false } = {}) {
        if (!ctx || typeof ctx.api !== 'function') return;
        const fetchId = ++requestId;
        state.loading = true;
        state.error = null;
        if (indicateLoading) setMessage('Loading linked accounts…');
        if (refreshBtn) refreshBtn.disabled = true;
        renderProfiles();
        try {
          const data = await ctx.api('/team/auth/profiles');
          if (fetchId !== requestId) return;
          state.profiles = Array.isArray(data?.profiles) ? data.profiles.map((entry) => ({
            profileId: entry?.profileId ?? entry?.id ?? null,
            steamId: entry?.steamId ?? entry?.steamid ?? null,
            discordId: entry?.discordId ?? entry?.discord_id ?? null,
            discordUsername: entry?.discordUsername ?? entry?.discord_username ?? null,
            discordDisplayName: entry?.discordDisplayName ?? entry?.discord_display_name ?? null,
            linkedAt: entry?.linkedAt ?? entry?.linked_at ?? null,
            updatedAt: entry?.updatedAt ?? entry?.updated_at ?? null,
            isAlt: Boolean(entry?.isAlt || entry?.is_alt),
            primaryProfileId: entry?.primaryProfileId ?? entry?.primary_profile_id ?? null,
            alts: Array.isArray(entry?.alts) ? entry.alts : []
          })) : [];
          state.loading = false;
          updateTitle();
          renderProfiles();
        } catch (err) {
          if (fetchId !== requestId) return;
          state.loading = false;
          state.profiles = [];
          if (typeof ctx.errorCode === 'function' && ctx.errorCode(err) === 'unauthorized') {
            ctx.handleUnauthorized?.();
            state.error = 'Sign in to view linked accounts.';
          } else if (err?.code === 'forbidden') {
            state.error = 'You do not have permission to view linked accounts.';
          } else if (err?.code === 'not_supported') {
            state.error = 'Account linking is not enabled for this team yet.';
          } else {
            state.error = ctx.describeError ? ctx.describeError(err) : 'Failed to load linked accounts.';
          }
          updateTitle();
          renderProfiles();
        } finally {
          if (fetchId === requestId && refreshBtn) {
            refreshBtn.disabled = false;
          }
        }
      }

      if (searchInput) {
        const onInput = () => {
          state.filter = searchInput.value || '';
          renderProfiles();
        };
        searchInput.addEventListener('input', onInput);
        ctx.onCleanup?.(() => searchInput.removeEventListener('input', onInput));
      }

      const offLogin = ctx.on?.('auth:login', () => loadProfiles({ force: true }));
      const offLogout = ctx.on?.('auth:logout', () => {
        state.profiles = [];
        state.error = 'Sign in to view linked accounts.';
        state.loading = false;
        updateTitle();
        renderProfiles();
      });
      const offRefresh = ctx.on?.('players:refresh', (payload = {}) => {
        if (payload.reason === 'team-switch' || payload.reason === 'login') {
          loadProfiles({ force: true });
        }
      });

      ctx.onCleanup?.(() => offLogin?.());
      ctx.onCleanup?.(() => offLogout?.());
      ctx.onCleanup?.(() => offRefresh?.());
      ctx.onCleanup?.(() => {
        state.profiles = [];
      });

      loadProfiles({ indicateLoading: true });
    }
  });
})();
