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
  const escapeLike = (value) => String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
  const trimOrNull = (value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
  };
  const normaliseDateTime = (value) => {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  };
  const normaliseChannelForStore = (value) => {
    const text = trimOrNull(value);
    if (!text) return 'global';
    const lower = text.toLowerCase();
    return lower === 'team' ? 'team' : 'global';
  };
  const normaliseChannelFilter = (value) => {
    const text = trimOrNull(value);
    if (!text) return null;
    const lower = text.toLowerCase();
    return lower === 'team' || lower === 'global' ? lower : null;
  };
  return {
    dialect,
    async init() {
      await exec(`CREATE TABLE IF NOT EXISTS roles(
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_key VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(190) NOT NULL,
        description TEXT NULL,
        permissions JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
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
      await exec(`CREATE TABLE IF NOT EXISTS teams(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        owner_user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(owner_user_id),
        CONSTRAINT fk_team_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS team_members(
        team_id INT NOT NULL,
        user_id INT NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(team_id, user_id),
        INDEX(user_id),
        INDEX(role),
        CONSTRAINT fk_member_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS servers(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        host VARCHAR(190) NOT NULL,
        port INT NOT NULL,
        password VARCHAR(255) NOT NULL,
        tls TINYINT DEFAULT 0,
        team_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(team_id),
        CONSTRAINT fk_server_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
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
        total_playtime_seconds BIGINT NULL,
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
      await ensureColumn('ALTER TABLE server_players ADD COLUMN total_playtime_seconds BIGINT NULL');
      await ensureColumn('ALTER TABLE servers ADD COLUMN team_id INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN queued INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN sleepers INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN joining INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN online TINYINT DEFAULT 1');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN fps FLOAT NULL');
      await ensureColumn('ALTER TABLE chat_messages ADD COLUMN color VARCHAR(32) NULL');
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
        joining INT NULL,
        fps FLOAT NULL,
        online TINYINT DEFAULT 1,
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
      await exec(`CREATE TABLE IF NOT EXISTS chat_messages(
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        channel VARCHAR(16) NOT NULL DEFAULT 'global',
        steamid VARCHAR(32) NULL,
        username VARCHAR(190) NULL,
        message TEXT NOT NULL,
        raw TEXT NULL,
        color VARCHAR(32) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_server_time (server_id, created_at),
        INDEX idx_chat_server_channel (server_id, channel),
        CONSTRAINT fk_chat_messages_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS f7_reports(
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        report_id VARCHAR(64) NULL,
        reporter_steamid VARCHAR(32) NULL,
        reporter_name VARCHAR(190) NULL,
        target_steamid VARCHAR(32) NULL,
        target_name VARCHAR(190) NULL,
        category VARCHAR(190) NULL,
        message TEXT NULL,
        raw TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_f7_report (server_id, report_id),
        INDEX idx_f7_server_time (server_id, created_at),
        INDEX idx_f7_target (server_id, target_steamid, created_at),
        CONSTRAINT fk_f7_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS kill_events(
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        killer_steamid VARCHAR(32) NULL,
        killer_name VARCHAR(190) NULL,
        killer_clan VARCHAR(120) NULL,
        victim_steamid VARCHAR(32) NULL,
        victim_name VARCHAR(190) NULL,
        victim_clan VARCHAR(120) NULL,
        weapon VARCHAR(190) NULL,
        distance DOUBLE NULL,
        pos_x DOUBLE NULL,
        pos_y DOUBLE NULL,
        pos_z DOUBLE NULL,
        raw TEXT NULL,
        combat_log TEXT NULL,
        combat_log_error VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_kill_events_server_time (server_id, occurred_at),
        CONSTRAINT fk_kill_events_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS server_discord_integrations(
        server_id INT PRIMARY KEY,
        bot_token TEXT NULL,
        guild_id VARCHAR(64) NULL,
        channel_id VARCHAR(64) NULL,
        status_message_id VARCHAR(64) NULL,
        config_json TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_server_discord FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await ensureColumn('ALTER TABLE server_discord_integrations ADD COLUMN status_message_id VARCHAR(64) NULL');
      await ensureColumn('ALTER TABLE server_discord_integrations ADD COLUMN config_json TEXT NULL');
    },
    async countUsers(){ const r = await exec('SELECT COUNT(*) c FROM users'); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async createUser(u){
      const { username, password_hash, role = 'user' } = u;
      const r = await exec('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)',[username,password_hash,role]);
      return r.insertId;
    },
    async getUser(id){
      const rows = await exec(`SELECT u.*, r.name AS role_name, r.permissions AS role_permissions FROM users u LEFT JOIN roles r ON r.role_key = u.role WHERE u.id=?`, [id]);
      return rows[0] || null;
    },
    async getUserByUsername(u){
      const rows = await exec(`SELECT u.*, r.name AS role_name, r.permissions AS role_permissions FROM users u LEFT JOIN roles r ON r.role_key = u.role WHERE u.username=?`, [u]);
      return rows[0] || null;
    },
    async getUserByUsernameInsensitive(u){
      const rows = await exec(`SELECT u.*, r.name AS role_name, r.permissions AS role_permissions FROM users u LEFT JOIN roles r ON r.role_key = u.role WHERE LOWER(u.username)=LOWER(?)`, [u]);
      return rows[0] || null;
    },

    async listUsers(teamId){
      const numeric = Number(teamId);
      if (!Number.isFinite(numeric)) return [];
      return await exec(
        `SELECT u.id, u.username, tm.role, tm.joined_at, u.created_at, r.name AS role_name
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         LEFT JOIN roles r ON r.role_key = tm.role
         WHERE tm.team_id=?
         ORDER BY LOWER(u.username) ASC`,
        [numeric]
      );
    },
    async listTeamMembers(teamId){
      return await this.listUsers(teamId);
    },
    async listAllUsersBasic(){
      return await exec('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
    },
    async getTeam(teamId){
      const rows = await exec('SELECT * FROM teams WHERE id=?', [teamId]);
      return rows[0] || null;
    },
    async listUserTeams(userId){
      const numeric = Number(userId);
      if (!Number.isFinite(numeric)) return [];
      return await exec(
        `SELECT t.id, t.name, t.owner_user_id, t.created_at, tm.role, tm.joined_at
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id=?
         ORDER BY t.created_at ASC`,
        [numeric]
      );
    },
    async createTeam({ name, owner_user_id }){
      const res = await exec('INSERT INTO teams(name, owner_user_id) VALUES(?,?)', [name, owner_user_id]);
      return res.insertId;
    },
    async addTeamMember({ team_id, user_id, role = 'user' }){
      await exec(
        `INSERT INTO team_members(team_id, user_id, role, joined_at)
         VALUES(?,?,?,CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE role=VALUES(role), joined_at=VALUES(joined_at)`,
        [team_id, user_id, role]
      );
    },
    async updateTeamMemberRole(teamId, userId, role){
      const res = await exec('UPDATE team_members SET role=? WHERE team_id=? AND user_id=?', [role, teamId, userId]);
      return res.affectedRows || 0;
    },
    async removeTeamMember(teamId, userId){
      const res = await exec('DELETE FROM team_members WHERE team_id=? AND user_id=?', [teamId, userId]);
      return res.affectedRows || 0;
    },
    async getTeamMember(teamId, userId){
      const rows = await exec('SELECT * FROM team_members WHERE team_id=? AND user_id=?', [teamId, userId]);
      return rows[0] || null;
    },
    async listTeamServerIds(teamId){
      const numeric = Number(teamId);
      if (!Number.isFinite(numeric)) return [];
      const rows = await exec('SELECT id FROM servers WHERE team_id=? ORDER BY id ASC', [numeric]);
      return rows
        .map((row) => Number(row?.id))
        .filter((id) => Number.isFinite(id));
    },
    async countTeams(){
      const rows = await exec('SELECT COUNT(*) AS c FROM teams');
      const row = Array.isArray(rows) ? rows[0] : rows;
      return Number(row?.c || row?.['COUNT(*)'] || 0);
    },
    async getUserActiveTeam(userId){
      const rows = await exec(`SELECT value FROM user_settings WHERE user_id=? AND key='active_team'`, [userId]);
      if (!rows.length) return null;
      const value = Number(rows[0].value);
      return Number.isFinite(value) ? value : null;
    },
    async setUserActiveTeam(userId, teamId){
      if (teamId == null) {
        await exec(`DELETE FROM user_settings WHERE user_id=? AND key='active_team'`, [userId]);
        return;
      }
      await exec(
        `INSERT INTO user_settings(user_id, key, value, updated_at)
         VALUES(?,?,?,CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)`,
        [userId, 'active_team', String(teamId)]
      );
    },
    async countAdmins(){ const r = await exec("SELECT COUNT(*) c FROM users WHERE role='admin'"); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async updateUserPassword(id, hash){ await exec('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async updateUserRole(id, role){ await exec('UPDATE users SET role=? WHERE id=?',[role,id]); },
    async deleteUser(id){ const r = await exec('DELETE FROM users WHERE id=?',[id]); return r.affectedRows||0; },
    async listServers(teamId){
      if (typeof teamId === 'undefined' || teamId === null) {
        return await exec('SELECT id,name,host,port,tls,team_id,created_at FROM servers ORDER BY id DESC');
      }
      return await exec('SELECT id,name,host,port,tls,team_id,created_at FROM servers WHERE team_id=? ORDER BY id DESC', [teamId]);
    },
    async listServersWithSecrets(teamId){
      if (typeof teamId === 'undefined' || teamId === null) {
        return await exec('SELECT id,name,host,port,password,tls,team_id,created_at FROM servers ORDER BY id DESC');
      }
      return await exec('SELECT id,name,host,port,password,tls,team_id,created_at FROM servers WHERE team_id=? ORDER BY id DESC', [teamId]);
    },
    async getServer(id){ const r = await exec('SELECT * FROM servers WHERE id=?',[id]); return r[0]||null; },
    async createServer(s){ const r = await exec('INSERT INTO servers(name,host,port,password,tls,team_id) VALUES(?,?,?,?,?,?)',[s.name,s.host,s.port,s.password,s.tls?1:0,s.team_id ?? null]); return r.insertId; },
    async updateServer(id,s){
      const cur = await this.getServer(id); if (!cur) return 0;
      const next = { ...cur, ...s };
      const r = await exec('UPDATE servers SET name=?,host=?,port=?,password=?,tls=?,team_id=? WHERE id=?',[next.name,next.host,next.port,next.password,next.tls?1:0,next.team_id ?? cur.team_id ?? null,id]);
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
    async listPlayers({ limit = 100, offset = 0, search = '' } = {}) {
      let sql = `
        SELECT *
        FROM players
      `;
      const params = [];
      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        const likeTerm = `%${escapeLike(term)}%`;
        sql += `
        WHERE steamid = ?
          OR steamid LIKE ? ESCAPE '\\'
          OR persona LIKE ? ESCAPE '\\'
          OR profileurl LIKE ? ESCAPE '\\'
          OR country LIKE ? ESCAPE '\\'
        `;
        params.push(term, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      sql += `
        ORDER BY updated_at DESC
      `;
      const limitNum = Number(limit);
      const offsetNum = Number(offset);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        const safeLimit = Math.floor(limitNum);
        const safeOffset = Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(safeLimit, safeOffset);
      } else if (Number.isFinite(offsetNum) && offsetNum > 0) {
        sql += ' LIMIT 18446744073709551615 OFFSET ?';
        params.push(Math.floor(offsetNum));
      }
      return await exec(sql, params);
    },
    async countPlayers({ search = '' } = {}) {
      let sql = 'SELECT COUNT(*) as total FROM players';
      const params = [];
      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        const likeTerm = `%${escapeLike(term)}%`;
        sql += `
        WHERE steamid = ?
          OR steamid LIKE ? ESCAPE '\\'
          OR persona LIKE ? ESCAPE '\\'
          OR profileurl LIKE ? ESCAPE '\\'
          OR country LIKE ? ESCAPE '\\'
      `;
        params.push(term, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      const rows = await exec(sql, params);
      const total = Array.isArray(rows) && rows.length ? Number(rows[0].total) : 0;
      return Number.isFinite(total) && total >= 0 ? total : 0;
    },
    async recordServerPlayer({ server_id, steamid, display_name=null, seen_at=null, ip=null, port=null }){
      const serverIdNum = Number(server_id);
      if (!Number.isFinite(serverIdNum)) return;
      const sid = String(steamid || '').trim();
      if (!sid) return;
      let seenDate = null;
      if (seen_at instanceof Date) {
        seenDate = Number.isNaN(seen_at.getTime()) ? null : seen_at;
      } else if (typeof seen_at === 'string') {
        const parsed = new Date(seen_at);
        seenDate = Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      if (!seenDate) seenDate = new Date();
      const seen = seenDate.toISOString().slice(0, 19).replace('T', ' ');
      const ipValue = typeof ip === 'string' && ip ? ip : null;
      const portNum = Number(port);
      const portValue = Number.isFinite(portNum) ? Math.max(0, Math.trunc(portNum)) : null;
      const parseStoredDate = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value;
        }
        if (typeof value === 'string') {
          let normalized = value.trim();
          if (!normalized) return null;
          if (!normalized.includes('T') && normalized.includes(' ')) {
            normalized = normalized.replace(' ', 'T');
          }
          if (!/[zZ]$/.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
            normalized += 'Z';
          }
          const parsed = new Date(normalized);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        const fallback = new Date(value);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
      };
      const rows = await exec(
        'SELECT last_seen, total_playtime_seconds FROM server_players WHERE server_id=? AND steamid=? LIMIT 1',
        [serverIdNum, sid]
      );
      const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      let totalSeconds = Number.isFinite(Number(existing?.total_playtime_seconds))
        ? Number(existing.total_playtime_seconds)
        : 0;
      const prevDate = parseStoredDate(existing?.last_seen);
      const nextMs = Number.isNaN(seenDate.getTime()) ? null : seenDate.getTime();
      if (prevDate && nextMs != null && nextMs > prevDate.getTime()) {
        const prevMs = prevDate.getTime();
        const deltaSeconds = Math.floor((nextMs - prevMs) / 1000);
        const MAX_SESSION_GAP_SECONDS = 10 * 60;
        if (deltaSeconds > 0) {
          if (deltaSeconds <= MAX_SESSION_GAP_SECONDS) {
            totalSeconds += deltaSeconds;
          } else if (deltaSeconds <= MAX_SESSION_GAP_SECONDS * 6) {
            totalSeconds += MAX_SESSION_GAP_SECONDS;
          }
        }
      }
      totalSeconds = Math.max(0, Math.round(totalSeconds));
      await exec(`
        INSERT INTO server_players(server_id, steamid, display_name, forced_display_name, first_seen, last_seen, last_ip, last_port, total_playtime_seconds)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          display_name=COALESCE(VALUES(display_name), server_players.display_name),
          last_seen=VALUES(last_seen),
          last_ip=COALESCE(VALUES(last_ip), server_players.last_ip),
          last_port=COALESCE(VALUES(last_port), server_players.last_port),
          total_playtime_seconds=VALUES(total_playtime_seconds)
      `,[serverIdNum,sid,display_name,null,seen,seen,ipValue,portValue,totalSeconds]);
    },
    async recordServerPlayerCount({ server_id, player_count, max_players=null, queued=null, sleepers=null, joining=null, fps=null, online=1, recorded_at=null }){
      const serverIdNum = Number(server_id);
      const playerCountNum = Number(player_count);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(playerCountNum)) return;
      const maxPlayersNum = Number(max_players);
      const queuedNum = Number(queued);
      const sleepersNum = Number(sleepers);
      const joiningNum = Number(joining);
      const fpsNum = Number(fps);
      const onlineNum = typeof online === 'boolean' ? (online ? 1 : 0) : Number(online);
      let timestampDate = null;
      if (recorded_at) {
        const parsed = recorded_at instanceof Date ? recorded_at : new Date(recorded_at);
        if (!Number.isNaN(parsed.getTime())) timestampDate = parsed;
      }
      if (!timestampDate) timestampDate = new Date();
      const timestamp = timestampDate.toISOString().slice(0, 19).replace('T', ' ');
      await exec(`
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

      return await exec(sql, params);
    },
    async listServerPlayers(serverId, { limit = 100, offset = 0, search = '' } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const limitNum = Number(limit);
      const offsetNum = Number(offset);
      let sql = `
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.forced_display_name, sp.first_seen, sp.last_seen,
                sp.last_ip, sp.last_port, sp.total_playtime_seconds,
                p.persona, p.avatar, p.country, p.profileurl, p.vac_banned, p.game_bans,
                p.last_ban_days, p.visibility, p.rust_playtime_minutes, p.playtime_updated_at, p.updated_at
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=?
      `;
      const params = [serverIdNum];
      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        const likeTerm = `%${escapeLike(term)}%`;
        sql += `
        AND (
          sp.steamid = ?
          OR sp.steamid LIKE ? ESCAPE '\\'
          OR sp.display_name LIKE ? ESCAPE '\\'
          OR sp.forced_display_name LIKE ? ESCAPE '\\'
          OR sp.last_ip LIKE ? ESCAPE '\\'
          OR CAST(sp.last_port AS CHAR) LIKE ? ESCAPE '\\'
          OR p.persona LIKE ? ESCAPE '\\'
          OR p.profileurl LIKE ? ESCAPE '\\'
          OR p.country LIKE ? ESCAPE '\\'
        )
      `;
        params.push(term, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      sql += `
        ORDER BY sp.last_seen DESC
      `;
      if (Number.isFinite(limitNum) && limitNum > 0) {
        const safeLimit = Math.floor(limitNum);
        const safeOffset = Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(safeLimit, safeOffset);
      } else if (Number.isFinite(offsetNum) && offsetNum > 0) {
        sql += ' LIMIT 18446744073709551615 OFFSET ?';
        params.push(Math.floor(offsetNum));
      }
      return await exec(sql, params);
    },
    async searchServerPlayers(serverId, query, { limit = 10 } = {}){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const term = typeof query === 'string' ? query.trim() : '';
      if (!term) return [];
      const likeTerm = `%${escapeLike(term)}%`;
      const limitValue = Number(limit);
      const limitNum = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 25) : 10;
      return await exec(`
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.forced_display_name, sp.first_seen, sp.last_seen,
               sp.last_ip, sp.last_port,
               p.persona, p.avatar, p.country, p.profileurl, p.vac_banned, p.game_bans,
               p.last_ban_days, p.visibility, p.rust_playtime_minutes, p.playtime_updated_at, p.updated_at
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=?
          AND (
            sp.steamid = ? OR
            sp.steamid LIKE ? ESCAPE '\\' OR
            sp.display_name LIKE ? ESCAPE '\\' OR
            sp.forced_display_name LIKE ? ESCAPE '\\' OR
            sp.last_ip LIKE ? ESCAPE '\\' OR
            CAST(sp.last_port AS CHAR) LIKE ? ESCAPE '\\' OR
            p.persona LIKE ? ESCAPE '\\' OR
            p.profileurl LIKE ? ESCAPE '\\' OR
            p.country LIKE ? ESCAPE '\\'
          )
        ORDER BY sp.last_seen DESC
        LIMIT ?
      `,[serverIdNum, term, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, limitNum]);
    },
    async countServerPlayers(serverId, { search = '' } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return 0;
      let sql = `
        SELECT COUNT(*) as total
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=?
      `;
      const params = [serverIdNum];
      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        const likeTerm = `%${escapeLike(term)}%`;
        sql += ` AND (
          sp.steamid = ?
          OR sp.steamid LIKE ? ESCAPE '\\'
          OR sp.display_name LIKE ? ESCAPE '\\'
          OR sp.forced_display_name LIKE ? ESCAPE '\\'
          OR sp.last_ip LIKE ? ESCAPE '\\'
          OR CAST(sp.last_port AS CHAR) LIKE ? ESCAPE '\\'
          OR p.persona LIKE ? ESCAPE '\\'
          OR p.profileurl LIKE ? ESCAPE '\\'
          OR p.country LIKE ? ESCAPE '\\'
        )`;
        params.push(term, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      const rows = await exec(sql, params);
      const total = Array.isArray(rows) && rows.length ? Number(rows[0].total) : 0;
      return Number.isFinite(total) && total >= 0 ? total : 0;
    },
    async getServerPlayer(serverId, steamid){
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const sid = typeof steamid === 'string' ? steamid.trim() : '';
      if (!sid) return null;
      const rows = await exec(`
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.forced_display_name, sp.first_seen, sp.last_seen,
               sp.last_ip, sp.last_port,
               p.persona, p.avatar, p.country, p.profileurl, p.vac_banned, p.game_bans,
               p.last_ban_days, p.visibility, p.rust_playtime_minutes, p.playtime_updated_at, p.updated_at
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=? AND sp.steamid=?
        LIMIT 1
      `,[serverIdNum, sid]);
      return rows?.[0] ?? null;
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
    async recordChatMessage(entry = {}) {
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const messageText = trimOrNull(entry?.message);
      if (!messageText) return null;
      const truncated = messageText.length > 4000 ? messageText.slice(0, 4000) : messageText;
      const channel = normaliseChannelForStore(entry?.channel);
      const steamId = trimOrNull(entry?.steamid ?? entry?.steamId);
      const usernameRaw = trimOrNull(entry?.username ?? entry?.name);
      const username = usernameRaw ? usernameRaw.slice(0, 190) : null;
      const raw = trimOrNull(entry?.raw);
      const colorRaw = trimOrNull(entry?.color);
      const color = colorRaw ? colorRaw.slice(0, 32) : null;
      const createdAt = normaliseDateTime(entry?.created_at);
      const columns = ['server_id', 'channel', 'steamid', 'username', 'message', 'raw', 'color'];
      const params = [serverIdNum, channel, steamId || null, username, truncated, raw, color];
      if (createdAt) {
        columns.push('created_at');
        params.push(createdAt);
      }
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO chat_messages(${columns.join(', ')}) VALUES(${placeholders})`;
      const result = await exec(sql, params);
      const insertedId = result.insertId || null;
      if (insertedId) {
        const rows = await exec('SELECT id, server_id, channel, steamid, username, message, raw, color, created_at FROM chat_messages WHERE id=?', [insertedId]);
        if (rows && rows.length) return rows[0];
      }
      return {
        id: insertedId,
        server_id: serverIdNum,
        channel,
        steamid: steamId || null,
        username,
        message: truncated,
        raw,
        color,
        created_at: createdAt || null
      };
    },
    async listChatMessages(serverId, { limit = 200, channel = null } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const conditions = ['server_id=?'];
      const params = [serverIdNum];
      const channelFilter = normaliseChannelFilter(channel);
      if (channelFilter) {
        conditions.push('channel=?');
        params.push(channelFilter);
      }
      let sql = `SELECT id, server_id, channel, steamid, username, message, raw, color, created_at FROM chat_messages WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
      const limitNum = Number(limit);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        sql += ' LIMIT ?';
        params.push(Math.min(Math.floor(limitNum), 500));
      }
      return await exec(sql, params);
    },
    async purgeChatMessages({ before, server_id } = {}) {
      const cutoff = normaliseDateTime(before);
      if (!cutoff) return 0;
      const params = [cutoff];
      let sql = 'DELETE FROM chat_messages WHERE created_at < ?';
      const serverIdNum = Number(server_id);
      if (Number.isFinite(serverIdNum)) {
        sql += ' AND server_id=?';
        params.push(serverIdNum);
      }
      const result = await exec(sql, params);
      return result.affectedRows || 0;
    },
    async recordF7Report(entry = {}) {
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const raw = trimOrNull(entry?.raw);
      if (!raw) return null;
      const now = new Date();
      const createdAt = normaliseDateTime(entry?.created_at) || normaliseDateTime(now);
      const updatedAt = normaliseDateTime(entry?.updated_at) || normaliseDateTime(now);
      const reportId = trimOrNull(entry?.report_id ?? entry?.reportId);
      const reporterSteam = trimOrNull(entry?.reporter_steamid ?? entry?.reporterSteamId);
      const targetSteam = trimOrNull(entry?.target_steamid ?? entry?.targetSteamId);
      const reporterNameRaw = trimOrNull(entry?.reporter_name ?? entry?.reporterName);
      const targetNameRaw = trimOrNull(entry?.target_name ?? entry?.targetName);
      const categoryRaw = trimOrNull(entry?.category);
      const messageRaw = trimOrNull(entry?.message);
      const reporterName = reporterNameRaw ? reporterNameRaw.slice(0, 190) : null;
      const targetName = targetNameRaw ? targetNameRaw.slice(0, 190) : null;
      const category = categoryRaw ? categoryRaw.slice(0, 190) : null;
      const message = messageRaw && messageRaw.length > 4000 ? messageRaw.slice(0, 4000) : messageRaw;
      const sql = `
        INSERT INTO f7_reports(
          server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          reporter_steamid = COALESCE(VALUES(reporter_steamid), reporter_steamid),
          reporter_name = COALESCE(VALUES(reporter_name), reporter_name),
          target_steamid = COALESCE(VALUES(target_steamid), target_steamid),
          target_name = COALESCE(VALUES(target_name), target_name),
          category = COALESCE(VALUES(category), category),
          message = COALESCE(VALUES(message), message),
          raw = VALUES(raw),
          created_at = LEAST(created_at, VALUES(created_at)),
          updated_at = VALUES(updated_at)
      `;
      const params = [
        serverIdNum,
        reportId || null,
        reporterSteam || null,
        reporterName,
        targetSteam || null,
        targetName,
        category,
        message || null,
        raw,
        createdAt,
        updatedAt
      ];
      const result = await exec(sql, params);

      let row = null;
      if (reportId) {
        const rows = await exec(`
          SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
          FROM f7_reports
          WHERE server_id=? AND report_id=?
        `, [serverIdNum, reportId]);
        row = rows?.[0] ?? null;
      }
      if (!row) {
        const insertedId = result.insertId || null;
        if (insertedId) {
          const rows = await exec(`
            SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
            FROM f7_reports
            WHERE id=?
          `, [insertedId]);
          row = rows?.[0] ?? null;
        }
      }
      if (!row) {
        const rows = await exec(`
          SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
          FROM f7_reports
          WHERE server_id=?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `, [serverIdNum]);
        row = rows?.[0] ?? null;
      }
      return row;
    },
    async listF7Reports(serverId, { since = null, limit = 50 } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const conditions = ['server_id=?'];
      const params = [serverIdNum];
      const sinceValue = normaliseDateTime(since);
      if (sinceValue) {
        conditions.push('created_at >= ?');
        params.push(sinceValue);
      }
      let sql = `
        SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
        FROM f7_reports
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC, id DESC
      `;
      const limitNum = Number(limit);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        sql += ' LIMIT ?';
        params.push(Math.min(Math.floor(limitNum), 200));
      }
      return await exec(sql, params);
    },
    async getF7ReportById(serverId, id) {
      const serverIdNum = Number(serverId);
      const numericId = Number(id);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(numericId)) return null;
      const rows = await exec(`
        SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
        FROM f7_reports
        WHERE server_id=? AND id=?
      `, [serverIdNum, numericId]);
      return rows?.[0] ?? null;
    },
    async listF7ReportsForTarget(serverId, targetSteamId, { limit = 5, excludeId = null } = {}) {
      const serverIdNum = Number(serverId);
      const steamId = trimOrNull(targetSteamId);
      if (!Number.isFinite(serverIdNum) || !steamId) return [];
      const params = [serverIdNum, steamId];
      let sql = `
        SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
        FROM f7_reports
        WHERE server_id=? AND target_steamid=?
      `;
      const excludeNumeric = Number(excludeId);
      if (Number.isFinite(excludeNumeric)) {
        sql += ' AND id != ?';
        params.push(excludeNumeric);
      }
      sql += ' ORDER BY created_at DESC, id DESC';
      const limitNum = Number(limit);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        sql += ' LIMIT ?';
        params.push(Math.min(Math.floor(limitNum), 50));
      }
      return await exec(sql, params);
    },
    async recordKillEvent(entry = {}) {
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const occurredAt = normaliseDateTime(entry?.occurred_at ?? entry?.occurredAt) || normaliseDateTime(new Date());
      const killerSteamId = trimOrNull(entry?.killer_steamid ?? entry?.killerSteamId);
      const victimSteamId = trimOrNull(entry?.victim_steamid ?? entry?.victimSteamId);
      const killerNameRaw = trimOrNull(entry?.killer_name ?? entry?.killerName);
      const victimNameRaw = trimOrNull(entry?.victim_name ?? entry?.victimName);
      const killerName = killerNameRaw ? killerNameRaw.slice(0, 190) : null;
      const victimName = victimNameRaw ? victimNameRaw.slice(0, 190) : null;
      const killerClanRaw = trimOrNull(entry?.killer_clan ?? entry?.killerClan);
      const victimClanRaw = trimOrNull(entry?.victim_clan ?? entry?.victimClan);
      const killerClan = killerClanRaw ? killerClanRaw.slice(0, 120) : null;
      const victimClan = victimClanRaw ? victimClanRaw.slice(0, 120) : null;
      const weaponRaw = trimOrNull(entry?.weapon);
      const weapon = weaponRaw ? weaponRaw.slice(0, 190) : null;
      const distanceRaw = Number(entry?.distance);
      const distance = Number.isFinite(distanceRaw) ? distanceRaw : null;
      const posXRaw = Number(entry?.pos_x ?? entry?.posX ?? entry?.position_x ?? entry?.positionX);
      const posYRaw = Number(entry?.pos_y ?? entry?.posY ?? entry?.position_y ?? entry?.positionY);
      const posZRaw = Number(entry?.pos_z ?? entry?.posZ ?? entry?.position_z ?? entry?.positionZ);
      const posX = Number.isFinite(posXRaw) ? posXRaw : null;
      const posY = Number.isFinite(posYRaw) ? posYRaw : null;
      const posZ = Number.isFinite(posZRaw) ? posZRaw : null;
      const rawLine = trimOrNull(entry?.raw);
      let combatLogSerialized = null;
      const combatPayload = entry?.combat_log ?? entry?.combatLog ?? entry?.combat_log_json ?? entry?.combatLogJson;
      if (combatPayload != null) {
        if (typeof combatPayload === 'string') {
          combatLogSerialized = combatPayload.length > 8000 ? combatPayload.slice(0, 8000) : combatPayload;
        } else {
          try {
            const json = JSON.stringify(combatPayload);
            combatLogSerialized = json.length > 8000 ? json.slice(0, 8000) : json;
          } catch {
            combatLogSerialized = null;
          }
        }
      }
      const combatErrorRaw = trimOrNull(entry?.combat_log_error ?? entry?.combatLogError);
      const combatLogError = combatErrorRaw ? combatErrorRaw.slice(0, 500) : null;
      const createdAt = normaliseDateTime(entry?.created_at ?? entry?.createdAt) || normaliseDateTime(new Date());

      const result = await exec(
        `INSERT INTO kill_events(
          server_id, occurred_at, killer_steamid, killer_name, killer_clan,
          victim_steamid, victim_name, victim_clan, weapon, distance,
          pos_x, pos_y, pos_z, raw, combat_log, combat_log_error, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          serverIdNum,
          occurredAt,
          killerSteamId || null,
          killerName,
          killerClan,
          victimSteamId || null,
          victimName,
          victimClan,
          weapon,
          distance,
          posX,
          posY,
          posZ,
          rawLine,
          combatLogSerialized,
          combatLogError,
          createdAt
        ]
      );

      return {
        id: result?.insertId ?? null,
        server_id: serverIdNum,
        occurred_at: occurredAt,
        killer_steamid: killerSteamId || null,
        killer_name: killerName,
        killer_clan: killerClan,
        victim_steamid: victimSteamId || null,
        victim_name: victimName,
        victim_clan: victimClan,
        weapon,
        distance,
        pos_x: posX,
        pos_y: posY,
        pos_z: posZ,
        raw: rawLine,
        combat_log: combatLogSerialized,
        combat_log_error: combatLogError,
        created_at: createdAt
      };
    },
    async updateKillEventCombatLog(entry = {}) {
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      const eventId = Number(entry?.id ?? entry?.eventId);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(eventId)) return 0;
      let combatLogSerialized = null;
      const combatPayload = entry?.combat_log ?? entry?.combatLog ?? entry?.combat_log_json ?? entry?.combatLogJson;
      if (combatPayload != null) {
        if (typeof combatPayload === 'string') {
          combatLogSerialized = combatPayload.length > 8000 ? combatPayload.slice(0, 8000) : combatPayload;
        } else {
          try {
            const json = JSON.stringify(combatPayload);
            combatLogSerialized = json.length > 8000 ? json.slice(0, 8000) : json;
          } catch {
            combatLogSerialized = null;
          }
        }
      }
      const combatErrorRaw = trimOrNull(entry?.combat_log_error ?? entry?.combatLogError);
      const combatLogError = combatErrorRaw ? combatErrorRaw.slice(0, 500) : null;
      const result = await exec(
        'UPDATE kill_events SET combat_log = ?, combat_log_error = ? WHERE server_id = ? AND id = ?',
        [combatLogSerialized, combatLogError, serverIdNum, eventId]
      );
      return result?.affectedRows ?? 0;
    },
    async listKillEvents(serverId, { limit = 200, since = null } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const params = [serverIdNum];
      const conditions = ['server_id=?'];
      const sinceDt = normaliseDateTime(since);
      if (sinceDt) {
        conditions.push('occurred_at >= ?');
        params.push(sinceDt);
      }
      let sql = `SELECT id, server_id, occurred_at, killer_steamid, killer_name, killer_clan,
                        victim_steamid, victim_name, victim_clan, weapon, distance,
                        pos_x, pos_y, pos_z, raw, combat_log, combat_log_error, created_at
                 FROM kill_events
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY occurred_at DESC, id DESC`;
      const limitNum = Number(limit);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        sql += ' LIMIT ?';
        params.push(Math.min(Math.floor(limitNum), 500));
      }
      return await exec(sql, params);
    },
    async purgeKillEvents({ before, server_id } = {}) {
      const cutoff = normaliseDateTime(before);
      if (!cutoff) return 0;
      const params = [cutoff];
      let sql = 'DELETE FROM kill_events WHERE occurred_at < ?';
      const serverIdNum = Number(server_id);
      if (Number.isFinite(serverIdNum)) {
        sql += ' AND server_id=?';
        params.push(serverIdNum);
      }
      const result = await exec(sql, params);
      return result.affectedRows || 0;
    },
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
    async listServerDiscordIntegrations(){
      return await exec('SELECT * FROM server_discord_integrations ORDER BY server_id ASC');
    },
    async getLatestServerPlayerCount(serverId){
      const rows = await exec(
        'SELECT server_id, player_count, max_players, queued, sleepers, joining, fps, online, recorded_at FROM server_player_counts WHERE server_id=? ORDER BY recorded_at DESC LIMIT 1',
        [serverId]
      );
      return rows?.[0] ?? null;
    },
    async saveServerDiscordIntegration(serverId,{ bot_token=null,guild_id=null,channel_id=null,status_message_id=null,config_json=null }){
      await exec(`
        INSERT INTO server_discord_integrations(server_id, bot_token, guild_id, channel_id, status_message_id, config_json)
        VALUES(?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          bot_token=VALUES(bot_token),
          guild_id=VALUES(guild_id),
          channel_id=VALUES(channel_id),
          status_message_id=VALUES(status_message_id),
          config_json=VALUES(config_json)
      `,[serverId, bot_token, guild_id, channel_id, status_message_id, config_json]);
    },
    async deleteServerDiscordIntegration(serverId){
      const result = await exec('DELETE FROM server_discord_integrations WHERE server_id=?',[serverId]);
      if (result == null) return 0;
      if (typeof result.affectedRows === 'number') return result.affectedRows;
      if (Array.isArray(result) && typeof result[0]?.affectedRows === 'number') return result[0].affectedRows;
      return 0;
    },
    async listRoles(){
      const rows = await exec('SELECT role_key, name, description, permissions, created_at, updated_at FROM roles ORDER BY name ASC');
      return rows.map((row) => ({
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: typeof row.permissions === 'string' ? row.permissions : JSON.stringify(row.permissions ?? {}),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    },
    async getRole(key){
      const rows = await exec('SELECT role_key, name, description, permissions, created_at, updated_at FROM roles WHERE role_key=?', [key]);
      const row = rows[0];
      if (!row) return null;
      return {
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: typeof row.permissions === 'string' ? row.permissions : JSON.stringify(row.permissions ?? {}),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    },
    async createRole(role){
      await exec('INSERT INTO roles(role_key, name, description, permissions) VALUES(?,?,?,?)', [role.key, role.name, role.description ?? null, role.permissions ?? '{}']);
    },
    async updateRole(key, payload){
      const existing = await this.getRole(key);
      if (!existing) return 0;
      const next = {
        name: typeof payload.name === 'undefined' ? existing.name : payload.name,
        description: typeof payload.description === 'undefined' ? existing.description : payload.description,
        permissions: typeof payload.permissions === 'undefined' ? existing.permissions : payload.permissions
      };
      const res = await exec('UPDATE roles SET name=?, description=?, permissions=? WHERE role_key=?', [next.name, next.description ?? null, next.permissions ?? '{}', key]);
      return res.affectedRows || 0;
    },
    async deleteRole(key){
      const res = await exec('DELETE FROM roles WHERE role_key=?', [key]);
      return res.affectedRows || 0;
    },
    async countUsersByRole(roleKey){
      const rows = await exec('SELECT COUNT(*) AS c FROM users WHERE role=?', [roleKey]);
      const row = rows[0];
      return row ? Number(row.c ?? row.COUNT) : 0;
    }
  };
}
