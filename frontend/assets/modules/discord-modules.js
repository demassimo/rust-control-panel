(() => {
  if (typeof window === 'undefined') return;
  const loader = window.ModuleLoader || null;
  if (!loader || typeof loader.register !== 'function') return;

  // Placeholder extension point for optional Discord-related widgets.
  // Keeping this file ensures the script reference in index.html never 404s
  // even when no Discord modules are registered yet.
})();
