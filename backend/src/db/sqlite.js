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
  return {
    dialect,
    async init() {
      await dbh.exec(`
      CREATE TABLE IF NOT EXISTS roles(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        permissions TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(role) REFERENCES roles(role_key) ON UPDATE CASCADE
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
        forced_display_name TEXT,
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
        joining INTEGER,
        fps REAL,
        online INTEGER DEFAULT 1,
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
      CREATE TABLE IF NOT EXISTS server_discord_integrations(
        server_id INTEGER PRIMARY KEY,
        bot_token TEXT,
        guild_id TEXT,
        channel_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
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
      await ensureServerPlayerColumn('forced_display_name', 'forced_display_name TEXT');
      const countCols = await dbh.all("PRAGMA table_info('server_player_counts')");
      const ensureCountColumn = async (name, definition) => {
        if (!countCols.some((c) => c.name === name)) {
          await dbh.run(`ALTER TABLE server_player_counts ADD COLUMN ${definition}`);
        }
      };
      await ensureCountColumn('queued', 'queued INTEGER');
      await ensureCountColumn('sleepers', 'sleepers INTEGER');
      await ensureCountColumn('joining', 'joining INTEGER');
      await ensureCountColumn('fps', 'fps REAL');
      await ensureCountColumn('online', 'online INTEGER DEFAULT 1');
    },
    async countUsers(){ const r = await dbh.get('SELECT COUNT(*) c FROM users'); return r.c; },
    async createUser(u){
      const { username, password_hash, role = 'user' } = u;
      const normalizedRole = role || 'user';
      const r = await dbh.run('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)',[username,password_hash,normalizedRole]);
      return r.lastID;
    },
    async getUser(id){
      return await dbh.get(
        `SELECT u.*, r.name AS role_name, r.permissions AS role_permissions
         FROM users u
         LEFT JOIN roles r ON r.role_key = u.role
         WHERE u.id=?`,
        [id]
      );
    },
    async getUserByUsername(u){
      return await dbh.get(
        `SELECT u.*, r.name AS role_name, r.permissions AS role_permissions
         FROM users u
         LEFT JOIN roles r ON r.role_key = u.role
         WHERE u.username=?`,
        [u]
      );
    },
    async getUserByUsernameInsensitive(u){
      return await dbh.get(
        `SELECT u.*, r.name AS role_name, r.permissions AS role_permissions
         FROM users u
         LEFT JOIN roles r ON r.role_key = u.role
         WHERE LOWER(u.username)=LOWER(?)`,
        [u]
      );
    },
    async listUsers(){
      return await dbh.all(
        `SELECT u.id, u.username, u.role, u.created_at, r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.role_key = u.role
         ORDER BY u.id ASC`
      );
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
        INSERT INTO server_players(server_id, steamid, display_name, forced_display_name, first_seen, last_seen, last_ip, last_port)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(server_id, steamid) DO UPDATE SET
          display_name=COALESCE(excluded.display_name, server_players.display_name),
          last_seen=excluded.last_seen,
          last_ip=COALESCE(excluded.last_ip, server_players.last_ip),
          last_port=COALESCE(excluded.last_port, server_players.last_port)
      `,[serverIdNum,sid,display_name,null,seen,seen,ipValue,portValue]);
    },
    async recordServerPlayerCount({ server_id, player_count, max_players = null, queued = null, sleepers = null, joining = null, fps = null, online = 1, recorded_at = null }){
      const serverIdNum = Number(server_id);
      const playerCountNum = Number(player_count);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(playerCountNum)) return;
      const maxPlayersNum = Number(max_players);
      const queuedNum = Number(queued);
      const sleepersNum = Number(sleepers);
      const joiningNum = Number(joining);
      const fpsNum = Number(fps);
      const onlineNum = typeof online === 'boolean' ? (online ? 1 : 0) : Number(online);
      let timestamp = null;
      if (recorded_at) {
        const parsed = recorded_at instanceof Date ? recorded_at : new Date(recorded_at);
        if (!Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
      }
      if (!timestamp) timestamp = new Date().toISOString();
      await dbh.run(`
        INSERT INTO server_player_counts(server_id, player_count, max_players, queued, sleepers, joining, fps, online, recorded_at)
        VALUES(?,?,?,?,?,?,?,?,?)
      `,[
        serverIdNum,
        Math.max(0, Math.trunc(playerCountNum)),
        Number.isFinite(maxPlayersNum) ? Math.max(0, Math.trunc(maxPlayersNum)) : null,
        Number.isFinite(queuedNum) ? Math.max(0, Math.trunc(queuedNum)) : null,
        Number.isFinite(sleepersNum) ? Math.max(0, Math.trunc(sleepersNum)) : null,
        Number.isFinite(joiningNum) ? Math.max(0, Math.trunc(joiningNum)) : null,
        Number.isFinite(fpsNum) ? Math.max(0, fpsNum) : null,
        Number.isFinite(onlineNum) ? (onlineNum !== 0 ? 1 : 0) : 1,
        timestamp
      ]);
    },
    async listServerPlayerCounts(serverId, { since = null, until = null, limit = 5000 } = {}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const conditions = ['server_id=?'];
      const params = [serverIdNum];

      const normalise = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value.toISOString();
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      };

      const sinceIso = normalise(since);
      const untilIso = normalise(until);
      if (sinceIso) {
        conditions.push('recorded_at >= ?');
        params.push(sinceIso);
      }
      if (untilIso) {
        conditions.push('recorded_at <= ?');
        params.push(untilIso);
      }

      let sql = `
        SELECT server_id, player_count, max_players, queued, sleepers, joining, fps, online, recorded_at
        FROM server_player_counts
        WHERE ${conditions.join(' AND ')}
        ORDER BY recorded_at ASC
      `;

      const maxRows = Number(limit);
      if (Number.isFinite(maxRows) && maxRows > 0) {
        sql += ' LIMIT ?';
        params.push(Math.floor(maxRows));
      }

      return await dbh.all(sql, params);
    },
    async listServerPlayers(serverId,{limit=100,offset=0}={}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      return await dbh.all(`
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.forced_display_name, sp.first_seen, sp.last_seen,
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
    async setServerPlayerDisplayName({ server_id, steamid, display_name = null }){
      const serverIdNum = Number(server_id);
      if (!Number.isFinite(serverIdNum)) return 0;
      const sid = String(steamid || '').trim();
      if (!sid) return 0;
      const value = typeof display_name === 'string' && display_name.trim()
        ? display_name.trim().slice(0, 190)
        : null;
      const result = await dbh.run('UPDATE server_players SET forced_display_name=? WHERE server_id=? AND steamid=?',[value,serverIdNum,sid]);
      return result.changes || 0;
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
    async getServerDiscordIntegration(serverId){
      return await dbh.get('SELECT * FROM server_discord_integrations WHERE server_id=?',[serverId]);
    },
    async listServerDiscordIntegrations(){
      return await dbh.all('SELECT * FROM server_discord_integrations ORDER BY server_id ASC');
    },
    async getLatestServerPlayerCount(serverId){
      return await dbh.get(
        'SELECT server_id, player_count, max_players, queued, sleepers, joining, fps, online, recorded_at FROM server_player_counts WHERE server_id=? ORDER BY recorded_at DESC LIMIT 1',
        [serverId]
      );
    },
    async saveServerDiscordIntegration(serverId,{ bot_token=null,guild_id=null,channel_id=null }){
      await dbh.run(
        "INSERT INTO server_discord_integrations(server_id,bot_token,guild_id,channel_id,created_at,updated_at) VALUES(?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(server_id) DO UPDATE SET bot_token=excluded.bot_token, guild_id=excluded.guild_id, channel_id=excluded.channel_id, updated_at=excluded.updated_at",
        [serverId, bot_token, guild_id, channel_id]
      );
    },
    async deleteServerDiscordIntegration(serverId){
      const result = await dbh.run('DELETE FROM server_discord_integrations WHERE server_id=?',[serverId]);
      return result?.changes ? Number(result.changes) : 0;
    },
    async listRoles(){
      const rows = await dbh.all(`SELECT role_key, name, description, permissions, created_at, updated_at FROM roles ORDER BY name ASC`);
      return rows.map((row) => ({
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: row.permissions,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    },
    async getRole(key){
      const row = await dbh.get(`SELECT role_key, name, description, permissions, created_at, updated_at FROM roles WHERE role_key=?`, [key]);
      if (!row) return null;
      return {
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: row.permissions,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    },
    async createRole(role){
      const now = new Date().toISOString();
      await dbh.run(
        `INSERT INTO roles(role_key,name,description,permissions,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
        [role.key, role.name, role.description ?? null, role.permissions ?? '{}', now, now]
      );
    },
    async updateRole(key, payload){
      const existing = await this.getRole(key);
      if (!existing) return 0;
      const next = {
        name: typeof payload.name === 'undefined' ? existing.name : payload.name,
        description: typeof payload.description === 'undefined' ? existing.description : payload.description,
        permissions: typeof payload.permissions === 'undefined' ? existing.permissions : payload.permissions
      };
      const now = new Date().toISOString();
      const res = await dbh.run(
        `UPDATE roles SET name=?, description=?, permissions=?, updated_at=? WHERE role_key=?`,
        [next.name, next.description ?? null, next.permissions ?? '{}', now, key]
      );
      return res.changes || 0;
    },
    async deleteRole(key){
      const res = await dbh.run('DELETE FROM roles WHERE role_key=?', [key]);
      return res.changes || 0;
    },
    async countUsersByRole(roleKey){
      const row = await dbh.get('SELECT COUNT(*) c FROM users WHERE role=?', [roleKey]);
      return row?.c ? Number(row.c) : 0;
    }
  };
}
