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
        forced_display_name VARCHAR(190) NULL,
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
      await ensureColumn('ALTER TABLE server_players ADD COLUMN forced_display_name VARCHAR(190) NULL');
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
      await exec(`CREATE TABLE IF NOT EXISTS server_discord_integrations(
        server_id INT PRIMARY KEY,
        bot_token TEXT NULL,
        guild_id VARCHAR(64) NULL,
        channel_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_server_discord FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
    },
    async countUsers(){ const r = await exec('SELECT COUNT(*) c FROM users'); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async createUser(u){
      const { username, password_hash, role = 'user' } = u;
      const r = await exec('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)',[username,password_hash,role]);
      return r.insertId;
    },
    async getUser(id){ const r = await exec('SELECT * FROM users WHERE id=?',[id]); return r[0]||null; },
    async getUserByUsername(u){ const r = await exec('SELECT * FROM users WHERE username=?',[u]); return r[0]||null; },
    async listUsers(){ return await exec('SELECT id,username,role,created_at FROM users ORDER BY id ASC'); },
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
        INSERT INTO server_players(server_id, steamid, display_name, forced_display_name, first_seen, last_seen, last_ip, last_port)
        VALUES(?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          display_name=COALESCE(VALUES(display_name), server_players.display_name),
          last_seen=VALUES(last_seen),
          last_ip=COALESCE(VALUES(last_ip), server_players.last_ip),
          last_port=COALESCE(VALUES(last_port), server_players.last_port)
      `,[serverIdNum,sid,display_name,null,seen,seen,ipValue,portValue]);
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
    async listServerPlayerCounts(serverId, { since = null, until = null, limit = 5000 } = {}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const conditions = ['server_id=?'];
      const params = [serverIdNum];

      const normalise = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 19).replace('T', ' ');
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString().slice(0, 19).replace('T', ' ');
      };

      const sinceSql = normalise(since);
      const untilSql = normalise(until);
      if (sinceSql) {
        conditions.push('recorded_at >= ?');
        params.push(sinceSql);
      }
      if (untilSql) {
        conditions.push('recorded_at <= ?');
        params.push(untilSql);
      }

      let sql = `
        SELECT server_id, player_count, max_players, queued, sleepers, recorded_at
        FROM server_player_counts
        WHERE ${conditions.join(' AND ')}
        ORDER BY recorded_at ASC
      `;

      const maxRows = Number(limit);
      if (Number.isFinite(maxRows) && maxRows > 0) {
        sql += ' LIMIT ?';
        params.push(Math.floor(maxRows));
      }

      return await exec(sql, params);
    },
    async listServerPlayers(serverId,{limit=100,offset=0}={}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      return await exec(`
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
      const result = await exec(`
        UPDATE server_players
        SET forced_display_name=?
        WHERE server_id=? AND steamid=?
      `,[value,serverIdNum,sid]);
      return result.affectedRows || 0;
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
    async getServerDiscordIntegration(serverId){
      const rows = await exec('SELECT * FROM server_discord_integrations WHERE server_id=?',[serverId]);
      return rows?.[0] ?? null;
    },
    async saveServerDiscordIntegration(serverId,{ bot_token=null,guild_id=null,channel_id=null }){
      await exec(`
        INSERT INTO server_discord_integrations(server_id, bot_token, guild_id, channel_id)
        VALUES(?,?,?,?)
        ON DUPLICATE KEY UPDATE
          bot_token=VALUES(bot_token),
          guild_id=VALUES(guild_id),
          channel_id=VALUES(channel_id)
      `,[serverId, bot_token, guild_id, channel_id]);
    },
    async deleteServerDiscordIntegration(serverId){
      const result = await exec('DELETE FROM server_discord_integrations WHERE server_id=?',[serverId]);
      if (result == null) return 0;
      if (typeof result.affectedRows === 'number') return result.affectedRows;
      if (Array.isArray(result) && typeof result[0]?.affectedRows === 'number') return result[0].affectedRows;
      return 0;
    }
  };
}
