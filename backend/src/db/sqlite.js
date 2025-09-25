import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export default {
  async connect({ file }) {
    const dbh = await open({ filename: file, driver: sqlite3.Database });
    await dbh.exec('PRAGMA foreign_keys = ON;');
    return createApi(dbh, 'sqlite');
  }
};

function createApi(dbh, dialect) {
  async function runInTransaction(fn) {
    await dbh.exec('BEGIN');
    try {
      const result = await fn();
      await dbh.exec('COMMIT');
      return result;
    } catch (err) {
      try { await dbh.exec('ROLLBACK'); }
      catch { /* ignore */ }
      throw err;
    }
  }

  function normaliseRoleIds(roleIds = []) {
    const out = [];
    const seen = new Set();
    for (const value of roleIds) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      const id = Math.trunc(numeric);
      const token = String(id);
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(id);
    }
    return out;
  }

  function normalisePermissionEntries(entries = []) {
    const out = [];
    const seen = new Set();
    for (const entry of entries) {
      const perm = String(entry?.permission || entry?.key || '').trim();
      if (!perm) continue;
      let serverId = null;
      if (entry && Object.prototype.hasOwnProperty.call(entry, 'serverId')) {
        const numeric = Number(entry.serverId);
        if (Number.isFinite(numeric)) serverId = Math.trunc(numeric);
      } else if (entry && Object.prototype.hasOwnProperty.call(entry, 'server_id')) {
        const numeric = Number(entry.server_id);
        if (Number.isFinite(numeric)) serverId = Math.trunc(numeric);
      }
      const token = `${perm.toLowerCase()}:${serverId ?? 'global'}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push({ permission: perm.toLowerCase(), serverId });
    }
    return out;
  }

  async function setUserRolesInternal(userId, roleIds) {
    const numericId = Number(userId);
    if (!Number.isFinite(numericId)) return;
    const ids = normaliseRoleIds(roleIds);
    await runInTransaction(async () => {
      await dbh.run('DELETE FROM user_roles WHERE user_id=?', [numericId]);
      for (const roleId of ids) {
        await dbh.run('INSERT INTO user_roles(user_id, role_id) VALUES(?, ?)', [numericId, roleId]);
      }
    });
  }

  async function setRolePermissionsInternal(roleId, permissions) {
    const numericId = Number(roleId);
    if (!Number.isFinite(numericId)) return;
    const prepared = normalisePermissionEntries(Array.isArray(permissions) ? permissions : []);
    await runInTransaction(async () => {
      await dbh.run('DELETE FROM role_permissions WHERE role_id=?', [numericId]);
      for (const entry of prepared) {
        await dbh.run('INSERT INTO role_permissions(role_id, permission, server_id) VALUES(?,?,?)', [
          numericId,
          entry.permission,
          entry.serverId != null ? entry.serverId : null
        ]);
      }
    });
  }

  return {
    dialect,
    async init() {
      await dbh.exec(`
      CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS servers(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        password TEXT NOT NULL,
        tls INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS players(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steamid TEXT UNIQUE NOT NULL,
        persona TEXT,
        avatar TEXT,
        country TEXT,
        profileurl TEXT,
        vac_banned INTEGER DEFAULT 0,
        game_bans INTEGER DEFAULT 0,
        last_ban_days INTEGER,
        visibility INTEGER,
        rust_playtime_minutes INTEGER,
        playtime_updated_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS server_players(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        steamid TEXT NOT NULL,
        display_name TEXT,
        first_seen TEXT DEFAULT (datetime('now')),
        last_seen TEXT DEFAULT (datetime('now')),
        last_ip TEXT,
        last_port INTEGER,
        UNIQUE(server_id, steamid),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_server_players_server ON server_players(server_id);
      CREATE TABLE IF NOT EXISTS player_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steamid TEXT NOT NULL,
        server_id INTEGER,
        event TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS server_player_counts(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        player_count INTEGER NOT NULL,
        max_players INTEGER,
        queued INTEGER,
        sleepers INTEGER,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_player_counts_server ON server_player_counts(server_id, recorded_at);
      CREATE TABLE IF NOT EXISTS user_settings(
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(user_id, key),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS server_maps(
        server_id INTEGER PRIMARY KEY,
        map_key TEXT,
        data TEXT,
        image_path TEXT,
        custom INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS roles(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS role_permissions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER NOT NULL,
        permission TEXT NOT NULL,
        server_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(role_id, permission, server_id),
        FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS user_roles(
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(user_id, role_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
      );
      `);
      const userCols = await dbh.all("PRAGMA table_info('users')");
      if (!userCols.some((c) => c.name === 'role')) {
        await dbh.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      }
      const playerCols = await dbh.all("PRAGMA table_info('players')");
      const ensureColumn = async (name, definition) => {
        if (!playerCols.some((c) => c.name === name)) {
          await dbh.run(`ALTER TABLE players ADD COLUMN ${definition}`);
        }
      };
      await ensureColumn('game_bans', 'game_bans INTEGER DEFAULT 0');
      await ensureColumn('last_ban_days', 'last_ban_days INTEGER');
      await ensureColumn('visibility', 'visibility INTEGER');
      await ensureColumn('rust_playtime_minutes', 'rust_playtime_minutes INTEGER');
      await ensureColumn('playtime_updated_at', 'playtime_updated_at TEXT');
      const serverPlayerCols = await dbh.all("PRAGMA table_info('server_players')");
      const ensureServerPlayerColumn = async (name, definition) => {
        if (!serverPlayerCols.some((c) => c.name === name)) {
          await dbh.run(`ALTER TABLE server_players ADD COLUMN ${definition}`);
        }
      };
      await ensureServerPlayerColumn('last_ip', 'last_ip TEXT');
      await ensureServerPlayerColumn('last_port', 'last_port INTEGER');
    },
    async countUsers(){ const r = await dbh.get('SELECT COUNT(*) c FROM users'); return r.c; },
    async createUser(u){
      const { username, password_hash, role = 'user', roles = [] } = u;
      const r = await dbh.run('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)',[username,password_hash,role]);
      const userId = r.lastID;
      if (Array.isArray(roles) && roles.length) {
        await setUserRolesInternal(userId, roles);
      }
      return userId;
    },
    async getUser(id){ return await dbh.get('SELECT * FROM users WHERE id=?',[id]); },
    async getUserByUsername(u){ return await dbh.get('SELECT * FROM users WHERE username=?',[u]); },
    async listUsers(){
      const rows = await dbh.all(`
        SELECT u.id, u.username, u.role, u.created_at,
               r.id AS role_id, r.name AS role_name, r.description AS role_description
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        ORDER BY u.id ASC, r.name ASC
      `);
      const map = new Map();
      for (const row of rows) {
        if (!map.has(row.id)) {
          map.set(row.id, { id: row.id, username: row.username, role: row.role, created_at: row.created_at, roles: [] });
        }
        if (row.role_id) {
          map.get(row.id).roles.push({ id: row.role_id, name: row.role_name, description: row.role_description });
        }
      }
      return Array.from(map.values());
    },
    async countAdmins(){ const r = await dbh.get("SELECT COUNT(*) c FROM users WHERE role='admin'"); return r.c; },
    async updateUserPassword(id, hash){ await dbh.run('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async updateUserRole(id, role){ await dbh.run('UPDATE users SET role=? WHERE id=?',[role,id]); },
    async deleteUser(id){ const r = await dbh.run('DELETE FROM users WHERE id=?',[id]); return r.changes; },
    async listServers(){ return await dbh.all('SELECT id,name,host,port,tls,created_at FROM servers ORDER BY id DESC'); },
    async listServersWithSecrets(){
      return await dbh.all('SELECT id,name,host,port,password,tls,created_at FROM servers ORDER BY id DESC');
    },
    async getServer(id){ return await dbh.get('SELECT * FROM servers WHERE id=?',[id]); },
    async createServer(s){ const r = await dbh.run('INSERT INTO servers(name,host,port,password,tls) VALUES(?,?,?,?,?)',[s.name,s.host,s.port,s.password,s.tls?1:0]); return r.lastID; },
    async updateServer(id,s){
      const cur = await dbh.get('SELECT * FROM servers WHERE id=?',[id]); if (!cur) return 0;
      const next = { ...cur, ...s };
      const r = await dbh.run('UPDATE servers SET name=?,host=?,port=?,password=?,tls=? WHERE id=?',[next.name,next.host,next.port,next.password,next.tls?1:0,id]);
      return r.changes;
    },
    async deleteServer(id){ const r = await dbh.run('DELETE FROM servers WHERE id=?',[id]); return r.changes; },
    async upsertPlayer(p){
      const now = new Date().toISOString();
      const existing = await dbh.get('SELECT * FROM players WHERE steamid=?',[p.steamid]);
      const next = {
        persona: p.persona ?? existing?.persona ?? null,
        avatar: p.avatar ?? existing?.avatar ?? null,
        country: p.country ?? existing?.country ?? null,
        profileurl: p.profileurl ?? existing?.profileurl ?? null,
        vac_banned: p.vac_banned ?? existing?.vac_banned ?? 0,
        game_bans: p.game_bans ?? existing?.game_bans ?? 0,
        last_ban_days: p.last_ban_days ?? existing?.last_ban_days ?? null,
        visibility: p.visibility ?? existing?.visibility ?? null,
        rust_playtime_minutes: p.rust_playtime_minutes ?? existing?.rust_playtime_minutes ?? null,
        playtime_updated_at: p.playtime_updated_at ?? existing?.playtime_updated_at ?? null
      };
      if (existing) {
        await dbh.run(`UPDATE players SET persona=?,avatar=?,country=?,profileurl=?,vac_banned=?,game_bans=?,last_ban_days=?,visibility=?,rust_playtime_minutes=?,playtime_updated_at=?,updated_at=? WHERE steamid=?`,
          [next.persona,next.avatar,next.country,next.profileurl,next.vac_banned?1:0,next.game_bans??0,next.last_ban_days??null,next.visibility??null,next.rust_playtime_minutes??null,next.playtime_updated_at??null,now,p.steamid]);
        return existing.id;
      } else {
        const r = await dbh.run(`INSERT INTO players(steamid,persona,avatar,country,profileurl,vac_banned,game_bans,last_ban_days,visibility,rust_playtime_minutes,playtime_updated_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.steamid,next.persona,next.avatar,next.country,next.profileurl,next.vac_banned?1:0,next.game_bans??0,next.last_ban_days??null,next.visibility??null,next.rust_playtime_minutes??null,next.playtime_updated_at??null,now]);
        return r.lastID;
      }
    },
    async getPlayer(steamid){ return await dbh.get('SELECT * FROM players WHERE steamid=?',[steamid]); },
    async getPlayersBySteamIds(steamids=[]){
      if (!Array.isArray(steamids) || steamids.length === 0) return [];
      const placeholders = steamids.map(() => '?').join(',');
      return await dbh.all(`SELECT * FROM players WHERE steamid IN (${placeholders})`, steamids);
    },
    async listPlayers({limit=100,offset=0}={}){ return await dbh.all('SELECT * FROM players ORDER BY updated_at DESC LIMIT ? OFFSET ?',[limit,offset]); },
    async recordServerPlayer({ server_id, steamid, display_name = null, seen_at = null, ip = null, port = null }){
      const serverIdNum = Number(server_id);
      if (!Number.isFinite(serverIdNum)) return;
      const sid = String(steamid || '').trim();
      if (!sid) return;
      const seen = seen_at || new Date().toISOString();
      const ipValue = typeof ip === 'string' && ip ? ip : null;
      const portNum = Number(port);
      const portValue = Number.isFinite(portNum) ? portNum : null;
      await dbh.run(`
        INSERT INTO server_players(server_id, steamid, display_name, first_seen, last_seen, last_ip, last_port)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(server_id, steamid) DO UPDATE SET
          display_name=COALESCE(excluded.display_name, server_players.display_name),
          last_seen=excluded.last_seen,
          last_ip=COALESCE(excluded.last_ip, server_players.last_ip),
          last_port=COALESCE(excluded.last_port, server_players.last_port)
      `,[serverIdNum,sid,display_name,seen,seen,ipValue,portValue]);
    },
    async recordServerPlayerCount({ server_id, player_count, max_players = null, queued = null, sleepers = null, recorded_at = null }){
      const serverIdNum = Number(server_id);
      const playerCountNum = Number(player_count);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(playerCountNum)) return;
      const maxPlayersNum = Number(max_players);
      const queuedNum = Number(queued);
      const sleepersNum = Number(sleepers);
      let timestamp = null;
      if (recorded_at) {
        const parsed = recorded_at instanceof Date ? recorded_at : new Date(recorded_at);
        if (!Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
      }
      if (!timestamp) timestamp = new Date().toISOString();
      await dbh.run(`
        INSERT INTO server_player_counts(server_id, player_count, max_players, queued, sleepers, recorded_at)
        VALUES(?,?,?,?,?,?)
      `,[
        serverIdNum,
        Math.max(0, Math.trunc(playerCountNum)),
        Number.isFinite(maxPlayersNum) ? Math.max(0, Math.trunc(maxPlayersNum)) : null,
        Number.isFinite(queuedNum) ? Math.max(0, Math.trunc(queuedNum)) : null,
        Number.isFinite(sleepersNum) ? Math.max(0, Math.trunc(sleepersNum)) : null,
        timestamp
      ]);
    },
    async listServerPlayers(serverId,{limit=100,offset=0}={}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      return await dbh.all(`
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.first_seen, sp.last_seen,
               sp.last_ip, sp.last_port,
               p.persona, p.avatar, p.country, p.profileurl, p.vac_banned, p.game_bans,
               p.last_ban_days, p.visibility, p.rust_playtime_minutes, p.playtime_updated_at, p.updated_at
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=?
        ORDER BY sp.last_seen DESC
        LIMIT ? OFFSET ?
      `,[serverIdNum,limit,offset]);
    },
    async addPlayerEvent(ev){ await dbh.run('INSERT INTO player_events(steamid,server_id,event,note) VALUES(?,?,?,?)',[ev.steamid, ev.server_id||null, ev.event, ev.note||null]); },
    async listPlayerEvents(steamid,{limit=100,offset=0}={}){ return await dbh.all('SELECT * FROM player_events WHERE steamid=? ORDER BY id DESC LIMIT ? OFFSET ?',[steamid,limit,offset]); },
    async getUserSettings(userId){
      const rows = await dbh.all('SELECT key,value FROM user_settings WHERE user_id=?',[userId]);
      const out = {};
      for (const row of rows) out[row.key] = row.value;
      return out;
    },
    async getUserSetting(userId,key){
      const row = await dbh.get('SELECT value FROM user_settings WHERE user_id=? AND key=?',[userId,key]);
      return row ? row.value : null;
    },
    async setUserSetting(userId,key,value){
      await dbh.run("INSERT INTO user_settings(user_id,key,value,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",[userId,key,value]);
    },
    async deleteUserSetting(userId,key){ await dbh.run('DELETE FROM user_settings WHERE user_id=? AND key=?',[userId,key]); },
    async getServerMap(serverId){ return await dbh.get('SELECT * FROM server_maps WHERE server_id=?',[serverId]); },
    async listServerMaps(){ return await dbh.all('SELECT * FROM server_maps'); },
    async saveServerMap(serverId,{ map_key=null,data=null,image_path=null,custom=0 }){
      await dbh.run("INSERT INTO server_maps(server_id,map_key,data,image_path,custom,created_at,updated_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(server_id) DO UPDATE SET map_key=excluded.map_key, data=excluded.data, image_path=excluded.image_path, custom=excluded.custom, updated_at=excluded.updated_at",[serverId,map_key,data,image_path,custom?1:0]);
    },
    async deleteServerMap(serverId){ await dbh.run('DELETE FROM server_maps WHERE server_id=?',[serverId]); },
    async countServerMapsByImagePath(imagePath, excludeServerId=null){
      if (!imagePath) return 0;
      if (Number.isFinite(excludeServerId)) {
        const row = await dbh.get('SELECT COUNT(*) c FROM server_maps WHERE image_path=? AND server_id!=?', [imagePath, excludeServerId]);
        return row?.c ? Number(row.c) : 0;
      }
      const row = await dbh.get('SELECT COUNT(*) c FROM server_maps WHERE image_path=?', [imagePath]);
      return row?.c ? Number(row.c) : 0;
    },
    async listRoles(){
      return await dbh.all('SELECT id, name, description, created_at FROM roles ORDER BY name ASC');
    },
    async getRole(id){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return null;
      return await dbh.get('SELECT id, name, description, created_at FROM roles WHERE id=?',[numericId]);
    },
    async createRole({ name, description = null }){
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('invalid_role_name');
      const desc = description != null ? String(description).trim() : null;
      const r = await dbh.run('INSERT INTO roles(name, description) VALUES(?, ?)', [trimmedName, desc || null]);
      return r.lastID;
    },
    async updateRole(id, data = {}){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return 0;
      const current = await dbh.get('SELECT id, name, description FROM roles WHERE id=?',[numericId]);
      if (!current) return 0;
      const nextName = Object.prototype.hasOwnProperty.call(data, 'name') ? String(data.name || '').trim() || current.name : current.name;
      const nextDescription = Object.prototype.hasOwnProperty.call(data, 'description')
        ? (String(data.description || '').trim() || null)
        : (current.description || null);
      const res = await dbh.run('UPDATE roles SET name=?, description=? WHERE id=?',[nextName, nextDescription, numericId]);
      return res.changes || 0;
    },
    async deleteRole(id){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return 0;
      const res = await dbh.run('DELETE FROM roles WHERE id=?',[numericId]);
      return res.changes || 0;
    },
    async listRolePermissions(roleId){
      const numericId = Number(roleId);
      if (!Number.isFinite(numericId)) return [];
      return await dbh.all('SELECT id, permission, server_id FROM role_permissions WHERE role_id=? ORDER BY permission ASC, server_id ASC',[numericId]);
    },
    async setRolePermissions(roleId, permissions = []){
      await setRolePermissionsInternal(roleId, permissions);
    },
    async listRolesWithPermissions(){
      const rows = await dbh.all(`
        SELECT r.id, r.name, r.description,
               rp.permission, rp.server_id
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        ORDER BY r.name ASC, rp.permission ASC
      `);
      const map = new Map();
      for (const row of rows) {
        if (!map.has(row.id)) {
          map.set(row.id, { id: row.id, name: row.name, description: row.description, permissions: [] });
        }
        if (row.permission) {
          map.get(row.id).permissions.push({ permission: row.permission, serverId: row.server_id });
        }
      }
      return Array.from(map.values());
    },
    async getUserRoles(userId){
      const numericId = Number(userId);
      if (!Number.isFinite(numericId)) return [];
      return await dbh.all(`
        SELECT r.id, r.name, r.description
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id=?
        ORDER BY r.name ASC
      `,[numericId]);
    },
    async setUserRoles(userId, roleIds = []){
      await setUserRolesInternal(userId, roleIds);
    },
    async getUserAccessProfile(userId){
      const numericId = Number(userId);
      if (!Number.isFinite(numericId)) return null;
      const user = await dbh.get('SELECT id, username, role FROM users WHERE id=?',[numericId]);
      if (!user) return null;
      const roles = await dbh.all(`
        SELECT r.id, r.name, r.description
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id=?
        ORDER BY r.name ASC
      `,[numericId]);
      const permissions = await dbh.all(`
        SELECT DISTINCT rp.permission, rp.server_id
        FROM role_permissions rp
        INNER JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id=?
      `,[numericId]);
      return { user, roles, permissions };
    }
  };
}
