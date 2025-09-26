import fs from 'fs';
import path from 'path';
import sqlite from './sqlite.js';
import mysql from './mysql.js';
import { normaliseRolePermissions, serialiseRolePermissions } from '../permissions.js';

const client = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
let db;
if (client === 'mysql') {
  db = await mysql.connect({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'rustadmin'
  });
} else {
  const file = process.env.SQLITE_FILE || './data/panel.sqlite';
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = await sqlite.connect({ file });
}
export { db };

export async function initDb() {
  await db.init();
  await ensureDefaultRoles();
  const bcrypt = await import('bcrypt');
  const count = await db.countUsers();
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.createUser({ username: 'admin', password_hash: hash, role: 'admin' });
    console.log('Created default admin: admin / admin123');
  }
}

const DEFAULT_ROLES = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Full access to every server and control panel feature.',
    permissions: serialiseRolePermissions({
      servers: { allowed: ['*'] },
      global: { manageUsers: true, manageServers: true, manageRoles: true }
    }, 'admin')
  },
  {
    key: 'user',
    name: 'Operator',
    description: 'Access to all servers without team management privileges.',
    permissions: serialiseRolePermissions({
      servers: { allowed: ['*'] },
      global: { manageUsers: false, manageServers: true, manageRoles: false }
    }, 'user')
  }
];

async function ensureDefaultRoles() {
  if (typeof db.listRoles !== 'function') return;
  for (const role of DEFAULT_ROLES) {
    const existing = await db.getRole(role.key);
    if (!existing) {
      await db.createRole(role);
      continue;
    }
    const desired = normaliseRolePermissions(role.permissions, role.key);
    const current = normaliseRolePermissions(existing.permissions, role.key);
    const updates = {};
    if (existing.name !== role.name) updates.name = role.name;
    if ((existing.description || '') !== (role.description || '')) updates.description = role.description;
    if (JSON.stringify(current) !== JSON.stringify(desired)) updates.permissions = role.permissions;
    if (Object.keys(updates).length) {
      await db.updateRole(role.key, updates);
    }
  }
}
