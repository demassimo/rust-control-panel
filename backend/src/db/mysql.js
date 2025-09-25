import mysql from 'mysql2/promise';

export default {
  async connect(cfg) {
    const pool = await mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 5 });
    return createApi(pool, 'mysql');
  }
};

function createApi(pool, dialect) {
  async function exec(sql, params=[]) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async function runInTransaction(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); }
      catch { /* ignore */ }
      throw err;
    } finally {
      conn.release();
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
    await runInTransaction(async (conn) => {
      await conn.query('DELETE FROM user_roles WHERE user_id=?', [numericId]);
      for (const roleId of ids) {
        await conn.query('INSERT INTO user_roles(user_id, role_id) VALUES(?, ?)', [numericId, roleId]);
      }
    });
  }

  async function setRolePermissionsInternal(roleId, permissions) {
    const numericId = Number(roleId);
    if (!Number.isFinite(numericId)) return;
    const prepared = normalisePermissionEntries(Array.isArray(permissions) ? permissions : []);
    await runInTransaction(async (conn) => {
      await conn.query('DELETE FROM role_permissions WHERE role_id=?', [numericId]);
      for (const entry of prepared) {
        await conn.query('INSERT INTO role_permissions(role_id, permission, server_id) VALUES(?,?,?)', [
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
      await exec(`CREATE TABLE IF NOT EXISTS users(
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(190) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
      try {
        await exec(`ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user'`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
      await exec(`CREATE TABLE IF NOT EXISTS servers(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        host VARCHAR(190) NOT NULL,
        port INT NOT NULL,
        password VARCHAR(255) NOT NULL,
        tls TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS players(
        id INT AUTO_INCREMENT PRIMARY KEY,
        steamid VARCHAR(32) UNIQUE NOT NULL,
        persona VARCHAR(190),
        avatar TEXT,
        country VARCHAR(8),
        profileurl TEXT,
        vac_banned TINYINT DEFAULT 0,
        game_bans INT DEFAULT 0,
        last_ban_days INT NULL,
        visibility INT NULL,
        rust_playtime_minutes INT NULL,
        playtime_updated_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS server_players(
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        steamid VARCHAR(32) NOT NULL,
        display_name VARCHAR(190) NULL,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_ip VARCHAR(128) NULL,
        last_port INT NULL,
        UNIQUE KEY server_steam (server_id, steamid),
        INDEX idx_server_players_server (server_id),
        CONSTRAINT fk_server_players_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      const ensureColumn = async (sql) => {
        try { await exec(sql); }
        catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
      };
      await ensureColumn('ALTER TABLE players ADD COLUMN game_bans INT DEFAULT 0');
      await ensureColumn('ALTER TABLE players ADD COLUMN last_ban_days INT NULL');
      await ensureColumn('ALTER TABLE players ADD COLUMN visibility INT NULL');
      await ensureColumn('ALTER TABLE players ADD COLUMN rust_playtime_minutes INT NULL');
      await ensureColumn('ALTER TABLE players ADD COLUMN playtime_updated_at TIMESTAMP NULL');
      await ensureColumn('ALTER TABLE server_players ADD COLUMN last_ip VARCHAR(128) NULL');
      await ensureColumn('ALTER TABLE server_players ADD COLUMN last_port INT NULL');
      await exec(`CREATE TABLE IF NOT EXISTS player_events(
        id INT AUTO_INCREMENT PRIMARY KEY,
        steamid VARCHAR(32) NOT NULL,
        server_id INT NULL,
        event VARCHAR(32) NOT NULL,
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(steamid),
        CONSTRAINT fk_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS server_player_counts(
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        player_count INT NOT NULL,
        max_players INT NULL,
        queued INT NULL,
        sleepers INT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_player_counts_server (server_id, recorded_at),
        CONSTRAINT fk_player_counts_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS user_settings(
        user_id INT NOT NULL,
        \`key\` VARCHAR(64) NOT NULL,
        value TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, \`key\`),
        CONSTRAINT fk_user_settings FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS server_maps(
        server_id INT PRIMARY KEY,
        map_key VARCHAR(190) NULL,
        data TEXT NULL,
        image_path TEXT NULL,
        custom TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_server_maps FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS roles(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) UNIQUE NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS role_permissions(
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_id INT NOT NULL,
        permission VARCHAR(190) NOT NULL,
        server_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_role_permission (role_id, permission, server_id),
        CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_role_permissions_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS user_roles(
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, role_id),
        CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
    },
    async countUsers(){ const r = await exec('SELECT COUNT(*) c FROM users'); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async createUser(u){
      const { username, password_hash, role = 'user', roles = [] } = u;
      const r = await exec('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)',[username,password_hash,role]);
      const userId = r.insertId;
      if (Array.isArray(roles) && roles.length) {
        await setUserRolesInternal(userId, roles);
      }
      return userId;
    },
    async getUser(id){ const r = await exec('SELECT * FROM users WHERE id=?',[id]); return r[0]||null; },
    async getUserByUsername(u){ const r = await exec('SELECT * FROM users WHERE username=?',[u]); return r[0]||null; },
    async listUsers(){
      const rows = await exec(`
        SELECT u.id, u.username, u.role, u.created_at,
               r.id AS role_id, r.name AS role_name, r.description AS role_description
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        ORDER BY u.id ASC, r.name ASC
      `);
      const map = new Map();
      for (const row of rows) {
        const id = row.id;
        if (!map.has(id)) {
          map.set(id, { id, username: row.username, role: row.role, created_at: row.created_at, roles: [] });
        }
        if (row.role_id) {
          map.get(id).roles.push({ id: row.role_id, name: row.role_name, description: row.role_description });
        }
      }
      return Array.from(map.values());
    },
    async countAdmins(){ const r = await exec("SELECT COUNT(*) c FROM users WHERE role='admin'"); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async updateUserPassword(id, hash){ await exec('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async updateUserRole(id, role){ await exec('UPDATE users SET role=? WHERE id=?',[role,id]); },
    async deleteUser(id){ const r = await exec('DELETE FROM users WHERE id=?',[id]); return r.affectedRows||0; },
    async listServers(){ return await exec('SELECT id,name,host,port,tls,created_at FROM servers ORDER BY id DESC'); },
    async listServersWithSecrets(){
      return await exec('SELECT id,name,host,port,password,tls,created_at FROM servers ORDER BY id DESC');
    },
    async getServer(id){ const r = await exec('SELECT * FROM servers WHERE id=?',[id]); return r[0]||null; },
    async createServer(s){ const r = await exec('INSERT INTO servers(name,host,port,password,tls) VALUES(?,?,?,?,?)',[s.name,s.host,s.port,s.password,s.tls?1:0]); return r.insertId; },
    async updateServer(id,s){
      const cur = await this.getServer(id); if (!cur) return 0;
      const next = { ...cur, ...s };
      const r = await exec('UPDATE servers SET name=?,host=?,port=?,password=?,tls=? WHERE id=?',[next.name,next.host,next.port,next.password,next.tls?1:0,id]);
      return r.affectedRows||0;
    },
    async deleteServer(id){ const r = await exec('DELETE FROM servers WHERE id=?',[id]); return r.affectedRows||0; },
    async upsertPlayer(p){
      await exec(`INSERT INTO players(steamid,persona,avatar,country,profileurl,vac_banned,game_bans,last_ban_days,visibility,rust_playtime_minutes,playtime_updated_at)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE persona=VALUES(persona), avatar=VALUES(avatar),
                    country=VALUES(country), profileurl=VALUES(profileurl), vac_banned=VALUES(vac_banned),
                    game_bans=VALUES(game_bans), last_ban_days=VALUES(last_ban_days), visibility=VALUES(visibility),
                    rust_playtime_minutes=VALUES(rust_playtime_minutes), playtime_updated_at=VALUES(playtime_updated_at)`,
                  [p.steamid,p.persona,p.avatar,p.country,p.profileurl,p.vac_banned?1:0,p.game_bans??0,p.last_ban_days??null,p.visibility??null,p.rust_playtime_minutes??null,p.playtime_updated_at??null]);
    },
    async getPlayer(steamid){ const r = await exec('SELECT * FROM players WHERE steamid=?',[steamid]); return r[0]||null; },
    async getPlayersBySteamIds(steamids=[]){ if (!Array.isArray(steamids) || steamids.length === 0) return []; const placeholders = steamids.map(()=>'?' ).join(','); return await exec(`SELECT * FROM players WHERE steamid IN (${placeholders})`, steamids); },
    async listPlayers({limit=100,offset=0}={}){ return await exec('SELECT * FROM players ORDER BY updated_at DESC LIMIT ? OFFSET ?',[limit,offset]); },
    async recordServerPlayer({ server_id, steamid, display_name=null, seen_at=null, ip=null, port=null }){
      const serverIdNum = Number(server_id);
      if (!Number.isFinite(serverIdNum)) return;
      const sid = String(steamid || '').trim();
      if (!sid) return;
      const seen = seen_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const ipValue = typeof ip === 'string' && ip ? ip : null;
      const portNum = Number(port);
      const portValue = Number.isFinite(portNum) ? Math.max(0, Math.trunc(portNum)) : null;
      await exec(`
        INSERT INTO server_players(server_id, steamid, display_name, first_seen, last_seen, last_ip, last_port)
        VALUES(?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          display_name=COALESCE(VALUES(display_name), server_players.display_name),
          last_seen=VALUES(last_seen),
          last_ip=COALESCE(VALUES(last_ip), server_players.last_ip),
          last_port=COALESCE(VALUES(last_port), server_players.last_port)
      `,[serverIdNum,sid,display_name,seen,seen,ipValue,portValue]);
    },
    async recordServerPlayerCount({ server_id, player_count, max_players=null, queued=null, sleepers=null, recorded_at=null }){
      const serverIdNum = Number(server_id);
      const playerCountNum = Number(player_count);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(playerCountNum)) return;
      const maxPlayersNum = Number(max_players);
      const queuedNum = Number(queued);
      const sleepersNum = Number(sleepers);
      let timestampDate = null;
      if (recorded_at) {
        const parsed = recorded_at instanceof Date ? recorded_at : new Date(recorded_at);
        if (!Number.isNaN(parsed.getTime())) timestampDate = parsed;
      }
      if (!timestampDate) timestampDate = new Date();
      const timestamp = timestampDate.toISOString().slice(0, 19).replace('T', ' ');
      await exec(`
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
      return await exec(`
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
    async addPlayerEvent(ev){ await exec('INSERT INTO player_events(steamid,server_id,event,note) VALUES(?,?,?,?)',[ev.steamid, ev.server_id||null, ev.event, ev.note||null]); },
    async listPlayerEvents(steamid,{limit=100,offset=0}={}){ return await exec('SELECT * FROM player_events WHERE steamid=? ORDER BY id DESC LIMIT ? OFFSET ?',[steamid,limit,offset]); },
    async getUserSettings(userId){
      const rows = await exec('SELECT `key`,value FROM user_settings WHERE user_id=?',[userId]);
      const out = {};
      for (const row of rows) out[row.key] = row.value;
      return out;
    },
    async getUserSetting(userId,key){
      const rows = await exec('SELECT value FROM user_settings WHERE user_id=? AND `key`=?',[userId,key]);
      return rows[0]?.value ?? null;
    },
    async setUserSetting(userId,key,value){
      await exec('INSERT INTO user_settings(user_id,`key`,value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=CURRENT_TIMESTAMP',[userId,key,value]);
    },
    async deleteUserSetting(userId,key){ await exec('DELETE FROM user_settings WHERE user_id=? AND `key`=?',[userId,key]); },
    async getServerMap(serverId){ const rows = await exec('SELECT * FROM server_maps WHERE server_id=?',[serverId]); return rows[0]||null; },
    async listServerMaps(){ return await exec('SELECT * FROM server_maps'); },
    async saveServerMap(serverId,{ map_key=null,data=null,image_path=null,custom=0 }){
      await exec('INSERT INTO server_maps(server_id,map_key,data,image_path,custom) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE map_key=VALUES(map_key), data=VALUES(data), image_path=VALUES(image_path), custom=VALUES(custom), updated_at=CURRENT_TIMESTAMP',[serverId,map_key,data,image_path,custom?1:0]);
    },
    async deleteServerMap(serverId){ await exec('DELETE FROM server_maps WHERE server_id=?',[serverId]); },
    async countServerMapsByImagePath(imagePath, excludeServerId=null){
      if (!imagePath) return 0;
      if (Number.isFinite(excludeServerId)){
        const rows = await exec('SELECT COUNT(*) c FROM server_maps WHERE image_path=? AND server_id!=?', [imagePath, excludeServerId]);
        return rows?.[0]?.c ? Number(rows[0].c) : 0;
      }
      const rows = await exec('SELECT COUNT(*) c FROM server_maps WHERE image_path=?', [imagePath]);
      return rows?.[0]?.c ? Number(rows[0].c) : 0;
    },
    async listRoles(){
      return await exec('SELECT id, name, description, created_at FROM roles ORDER BY name ASC');
    },
    async getRole(id){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return null;
      const rows = await exec('SELECT id, name, description, created_at FROM roles WHERE id=?',[numericId]);
      return rows[0] || null;
    },
    async createRole({ name, description = null }){
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('invalid_role_name');
      const desc = description != null ? String(description).trim() : null;
      const res = await exec('INSERT INTO roles(name, description) VALUES(?, ?)', [trimmedName, desc || null]);
      return res.insertId;
    },
    async updateRole(id, data = {}){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return 0;
      const rows = await exec('SELECT id, name, description FROM roles WHERE id=?',[numericId]);
      const current = rows[0];
      if (!current) return 0;
      const nextName = Object.prototype.hasOwnProperty.call(data, 'name') ? String(data.name || '').trim() || current.name : current.name;
      const nextDescription = Object.prototype.hasOwnProperty.call(data, 'description')
        ? (String(data.description || '').trim() || null)
        : (current.description || null);
      const res = await exec('UPDATE roles SET name=?, description=? WHERE id=?',[nextName, nextDescription, numericId]);
      return res.affectedRows || 0;
    },
    async deleteRole(id){
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return 0;
      const res = await exec('DELETE FROM roles WHERE id=?',[numericId]);
      return res.affectedRows || 0;
    },
    async listRolePermissions(roleId){
      const numericId = Number(roleId);
      if (!Number.isFinite(numericId)) return [];
      return await exec('SELECT id, permission, server_id FROM role_permissions WHERE role_id=? ORDER BY permission ASC, server_id ASC',[numericId]);
    },
    async setRolePermissions(roleId, permissions = []){
      await setRolePermissionsInternal(roleId, permissions);
    },
    async listRolesWithPermissions(){
      const rows = await exec(`
        SELECT r.id, r.name, r.description,
               rp.permission, rp.server_id
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        ORDER BY r.name ASC, rp.permission ASC
      `);
      const map = new Map();
      for (const row of rows) {
        const id = row.id;
        if (!map.has(id)) {
          map.set(id, { id, name: row.name, description: row.description, permissions: [] });
        }
        if (row.permission) {
          map.get(id).permissions.push({ permission: row.permission, serverId: row.server_id });
        }
      }
      return Array.from(map.values());
    },
    async getUserRoles(userId){
      const numericId = Number(userId);
      if (!Number.isFinite(numericId)) return [];
      return await exec(`
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
      const userRows = await exec('SELECT id, username, role FROM users WHERE id=?',[numericId]);
      const user = userRows[0] || null;
      if (!user) return null;
      const roles = await exec(`
        SELECT r.id, r.name, r.description
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id=?
        ORDER BY r.name ASC
      `,[numericId]);
      const permissions = await exec(`
        SELECT DISTINCT rp.permission, rp.server_id
        FROM role_permissions rp
        INNER JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id=?
      `,[numericId]);
      return { user, roles, permissions };
    }
  };
}
