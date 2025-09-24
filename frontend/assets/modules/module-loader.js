(() => {
  const registry = [];
  const active = new Map();

  function normalizeModule(definition) {
    if (!definition || typeof definition !== 'object') throw new Error('Module definition must be an object');
    if (!definition.id) throw new Error('Module must declare an id');
    return {
      order: typeof definition.order === 'number' ? definition.order : 0,
      ...definition
    };
  }

  function registerModule(definition) {
    const normalized = normalizeModule(definition);
    if (registry.some((mod) => mod.id === normalized.id)) {
      console.warn(`Module with id "${normalized.id}" already registered. Skipping duplicate.`);
      return;
    }
    registry.push(normalized);
  }

  function initModules(hostContext) {
    if (!hostContext || typeof hostContext.createCard !== 'function') {
      throw new Error('Module host context requires a createCard function');
    }
    const modules = [...registry].sort((a, b) => a.order - b.order);
    for (const mod of modules) {
      const view = hostContext.createCard({ id: mod.id, title: mod.title || mod.id, icon: mod.icon });
      const cleanup = [];
      const moduleContext = {
        ...hostContext,
        module: mod,
        root: view?.card || null,
        body: view?.body || null,
        header: view?.header || null,
        actions: view?.actions || null,
        setTitle: view?.setTitle || (() => {}),
        removeCard: view?.remove || (() => {}),
        onCleanup(fn) {
          if (typeof fn === 'function') cleanup.push(fn);
        }
      };
      try {
        const result = typeof mod.setup === 'function' ? mod.setup(moduleContext) : null;
        if (typeof result === 'function') cleanup.push(result);
      } catch (err) {
        console.error(`Failed to initialise module ${mod.id}:`, err);
      }
      active.set(mod.id, { definition: mod, view, cleanup });
    }
  }

  function destroyModule(id) {
    const entry = active.get(id);
    if (!entry) return;
    for (const fn of entry.cleanup || []) {
      try { fn(); } catch (err) { console.error(`Cleanup failed for module ${id}:`, err); }
    }
    active.delete(id);
    entry.view?.remove?.();
  }

  function listModules() {
    return [...registry];
  }

  window.ModuleLoader = {
    register: registerModule,
    init: initModules,
    destroy: destroyModule,
    list: listModules,
    get(id) { return active.get(id) || null; }
  };
  window.registerModule = registerModule;
})();
