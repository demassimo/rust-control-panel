const SERVER_CAPABILITIES = ['view', 'console', 'commands', 'liveMap', 'players', 'manage', 'discord'];
const GLOBAL_PERMISSIONS = ['manageUsers', 'manageServers', 'manageRoles'];

const DEFAULT_TEMPLATE = {
  servers: {
    allowed: ['*'],
    capabilities: Object.fromEntries(SERVER_CAPABILITIES.map((cap) => [cap, true]))
  },
  global: {
    manageUsers: false,
    manageServers: true,
    manageRoles: false
  }
};

const ADMIN_TEMPLATE = {
  servers: {
    allowed: ['*'],
    capabilities: Object.fromEntries(SERVER_CAPABILITIES.map((cap) => [cap, true]))
  },
  global: Object.fromEntries(GLOBAL_PERMISSIONS.map((perm) => [perm, true]))
};

const ROLE_TEMPLATES = {
  admin: ADMIN_TEMPLATE,
  user: DEFAULT_TEMPLATE,
  default: DEFAULT_TEMPLATE
};

function cloneTemplate(key) {
  const template = ROLE_TEMPLATES[key] || ROLE_TEMPLATES.default;
  return {
    servers: {
      allowed: [...(template.servers?.allowed || ['*'])],
      capabilities: { ...(template.servers?.capabilities || {}) }
    },
    global: { ...(template.global || {}) }
  };
}

function parsePermissions(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

function normaliseAllowed(input, fallback = ['*']) {
  if (input === '*' || input === 'all') return ['*'];
  if (Array.isArray(input)) {
    const out = [];
    for (const item of input) {
      if (item === '*' || item === 'all') {
        return ['*'];
      }
      const numeric = Number(item);
      if (Number.isFinite(numeric)) {
        out.push(String(Math.trunc(numeric)));
      } else if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
      }
    }
    return out.length ? Array.from(new Set(out)) : [...fallback];
  }
  if (input && typeof input === 'object' && Array.isArray(input.allowed)) {
    return normaliseAllowed(input.allowed, fallback);
  }
  return [...fallback];
}

function normaliseCapabilities(input = {}, fallback = {}) {
  const out = { ...fallback };
  for (const cap of SERVER_CAPABILITIES) {
    if (typeof input[cap] === 'boolean') out[cap] = input[cap];
  }
  return out;
}

function normaliseGlobal(input = {}, fallback = {}) {
  const out = { ...fallback };
  for (const perm of GLOBAL_PERMISSIONS) {
    if (typeof input[perm] === 'boolean') out[perm] = input[perm];
  }
  return out;
}

export function normaliseRolePermissions(raw, roleKey = 'default') {
  const parsed = parsePermissions(raw);
  const base = cloneTemplate(roleKey);
  const serversInput = parsed.servers || parsed.server || {};
  base.servers.allowed = normaliseAllowed(serversInput.allowed ?? serversInput, base.servers.allowed);
  base.servers.capabilities = normaliseCapabilities(serversInput.capabilities || parsed.capabilities || {}, base.servers.capabilities);
  base.global = normaliseGlobal(parsed.global || {}, base.global);
  return base;
}

export function serialiseRolePermissions(permissions, roleKey = 'default') {
  const normalised = normaliseRolePermissions(permissions, roleKey);
  return JSON.stringify(normalised);
}

export function hasGlobalPermission(context, permission) {
  if (!permission) return true;
  if (context?.superuser) return true;
  return !!context?.permissions?.global?.[permission];
}

function isAllowedServer(allowed, serverId) {
  if (!Array.isArray(allowed) || !allowed.length) return false;
  if (allowed.includes('*')) return true;
  const idNum = Number(serverId);
  const idStr = String(serverId);
  return allowed.some((value) => {
    if (value === '*') return true;
    if (String(value) === idStr) return true;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric === idNum;
  });
}

export function canAccessServer(context, serverId, capability = 'view') {
  if (!context?.permissions) return false;
  const allowed = context.permissions.servers?.allowed;
  if (!isAllowedServer(allowed, serverId)) return false;
  if (!capability) return true;
  const caps = context.permissions.servers?.capabilities;
  if (!caps) return false;
  if (caps['*']) return true;
  return !!caps[capability];
}

export function filterServersByPermission(servers = [], context, capability = 'view') {
  if (!Array.isArray(servers)) return [];
  return servers.filter((server) => canAccessServer(context, server?.id ?? server?.server_id ?? server?.serverId, capability));
}

export function filterStatusMapByPermission(statusMap = {}, context, capability = 'view') {
  const result = {};
  if (!statusMap || typeof statusMap !== 'object') return result;
  for (const [key, value] of Object.entries(statusMap)) {
    if (canAccessServer(context, key, capability)) {
      result[key] = value;
    }
  }
  return result;
}

export function describeRoleTemplates() {
  return {
    serverCapabilities: [...SERVER_CAPABILITIES],
    globalPermissions: [...GLOBAL_PERMISSIONS]
  };
}
