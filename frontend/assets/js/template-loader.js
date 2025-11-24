(() => {
  const baseTemplates = [
    { selector: '[data-template-target="login"]', url: 'templates/login.html' },
    { selector: '[data-template-target="app"]', url: 'templates/app-shell.html' }
  ];

  const appTemplates = [
    { selector: '[data-template-target="dashboard"]', url: 'templates/dashboard.html' },
    { selector: '[data-template-target="linked"]', url: 'templates/linked.html' },
    { selector: '[data-template-target="team"]', url: 'templates/team.html' },
    { selector: '[data-template-target="discord"]', url: 'templates/discord.html' },
    { selector: '[data-template-target="admin"]', url: 'templates/admin.html' },
    { selector: '[data-template-target="dialogs"]', url: 'templates/dialogs.html' },
    { selector: '[data-template-target="workspace"]', url: 'templates/workspace.html' },
    { selector: '[data-template-target="settings"]', url: 'templates/settings.html' }
  ];

  async function injectTemplate({ selector, url }) {
    const host = document.querySelector(selector);
    if (!host) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load template: ${response.status}`);
      const html = await response.text();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const fragment = document.createDocumentFragment();
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
      host.replaceWith(fragment);
    } catch (err) {
      console.error(`Template load error for ${url}`, err);
    }
  }

  window.loadTemplatesPromise = (async () => {
    for (const template of baseTemplates) {
      await injectTemplate(template);
    }
    for (const template of appTemplates) {
      await injectTemplate(template);
    }
    document.dispatchEvent(new Event('templates:ready'));
  })();
})();
