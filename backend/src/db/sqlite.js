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
  const escapeLike = (value) => String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
  const trimOrNull = (value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
  };
  const normaliseIso = (value) => {
    if (value == null) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
      CREATE TABLE IF NOT EXISTS teams(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS team_members(
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(team_id, user_id),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS servers(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        password TEXT NOT NULL,
        tls INTEGER DEFAULT 0,
        team_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL
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
        total_playtime_seconds INTEGER,
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
      CREATE TABLE IF NOT EXISTS chat_messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        channel TEXT NOT NULL DEFAULT 'global',
        steamid TEXT,
        username TEXT,
        message TEXT NOT NULL,
        raw TEXT,
        color TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_server_time ON chat_messages(server_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(server_id, channel, created_at);
      CREATE TABLE IF NOT EXISTS f7_reports(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        report_id TEXT,
        reporter_steamid TEXT,
        reporter_name TEXT,
        target_steamid TEXT,
        target_name TEXT,
        category TEXT,
        message TEXT,
        raw TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
        UNIQUE(server_id, report_id)
      );
      CREATE INDEX IF NOT EXISTS idx_f7_reports_server_time ON f7_reports(server_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_f7_reports_target ON f7_reports(server_id, target_steamid, created_at);
      CREATE TABLE IF NOT EXISTS server_discord_integrations(
        server_id INTEGER PRIMARY KEY,
        bot_token TEXT,
        guild_id TEXT,
        channel_id TEXT,
        status_message_id TEXT,
        config_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
      `);
      const discordCols = await dbh.all("PRAGMA table_info('server_discord_integrations')");
      if (!discordCols.some((c) => c.name === 'status_message_id')) {
        await dbh.run("ALTER TABLE server_discord_integrations ADD COLUMN status_message_id TEXT");
      }
      if (!discordCols.some((c) => c.name === 'config_json')) {
        await dbh.run("ALTER TABLE server_discord_integrations ADD COLUMN config_json TEXT");
      }
      const userCols = await dbh.all("PRAGMA table_info('users')");
      if (!userCols.some((c) => c.name === 'role')) {
        await dbh.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      }
      const chatCols = await dbh.all("PRAGMA table_info('chat_messages')");
      if (!chatCols.some((c) => c.name === 'color')) {
        await dbh.run("ALTER TABLE chat_messages ADD COLUMN color TEXT");
      }
      await dbh.exec(`
        CREATE TABLE IF NOT EXISTS f7_reports(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          report_id TEXT,
          reporter_steamid TEXT,
          reporter_name TEXT,
          target_steamid TEXT,
          target_name TEXT,
          category TEXT,
          message TEXT,
          raw TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
          UNIQUE(server_id, report_id)
        );
        CREATE INDEX IF NOT EXISTS idx_f7_reports_server_time ON f7_reports(server_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_f7_reports_target ON f7_reports(server_id, target_steamid, created_at);
      `);
      const serverCols = await dbh.all("PRAGMA table_info('servers')");
      if (!serverCols.some((c) => c.name === 'team_id')) {
        await dbh.run('ALTER TABLE servers ADD COLUMN team_id INTEGER');
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
      await ensureServerPlayerColumn('total_playtime_seconds', 'total_playtime_seconds INTEGER');
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
    async listUsers(teamId){
      const teamNumeric = Number(teamId);
      if (!Number.isFinite(teamNumeric)) return [];
      return await dbh.all(
        `SELECT u.id, u.username, tm.role, tm.joined_at, u.created_at, r.name AS role_name
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         LEFT JOIN roles r ON r.role_key = tm.role
         WHERE tm.team_id=?
         ORDER BY LOWER(u.username) ASC`
        ,[teamNumeric]
      );
    },
    async listTeamMembers(teamId){
      return await this.listUsers(teamId);
    },
    async listAllUsersBasic(){
      return await dbh.all(
        `SELECT u.id, u.username, u.role, u.created_at
         FROM users u
         ORDER BY u.id ASC`
      );
    },
    async getTeam(teamId){
      const numeric = Number(teamId);
      if (!Number.isFinite(numeric)) return null;
      return await dbh.get(`SELECT * FROM teams WHERE id=?`, [numeric]);
    },
    async listUserTeams(userId){
      const numeric = Number(userId);
      if (!Number.isFinite(numeric)) return [];
      return await dbh.all(
        `SELECT t.id, t.name, t.owner_user_id, t.created_at, tm.role, tm.joined_at
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id=?
         ORDER BY t.created_at ASC`
        ,[numeric]
      );
    },
    async createTeam({ name, owner_user_id }){
      const now = new Date().toISOString();
      const res = await dbh.run(
        `INSERT INTO teams(name, owner_user_id, created_at) VALUES(?,?,?)`,
        [name, owner_user_id, now]
      );
      return res.lastID;
    },
    async addTeamMember({ team_id, user_id, role = 'user' }){
      const now = new Date().toISOString();
      await dbh.run(
        `INSERT INTO team_members(team_id, user_id, role, joined_at) VALUES(?,?,?,?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role=excluded.role, joined_at=excluded.joined_at`,
        [team_id, user_id, role, now]
      );
    },
    async updateTeamMemberRole(teamId, userId, role){
      const result = await dbh.run(
        `UPDATE team_members SET role=? WHERE team_id=? AND user_id=?`,
        [role, teamId, userId]
      );
      return result?.changes ? Number(result.changes) : 0;
    },
    async removeTeamMember(teamId, userId){
      const result = await dbh.run(`DELETE FROM team_members WHERE team_id=? AND user_id=?`, [teamId, userId]);
      return result?.changes ? Number(result.changes) : 0;
    },
    async getTeamMember(teamId, userId){
      const teamNumeric = Number(teamId);
      const userNumeric = Number(userId);
      if (!Number.isFinite(teamNumeric) || !Number.isFinite(userNumeric)) return null;
      return await dbh.get(`SELECT * FROM team_members WHERE team_id=? AND user_id=?`, [teamNumeric, userNumeric]);
    },
    async listTeamServerIds(teamId){
      const numeric = Number(teamId);
      if (!Number.isFinite(numeric)) return [];
      const rows = await dbh.all(`SELECT id FROM servers WHERE team_id=? ORDER BY id ASC`, [numeric]);
      return rows
        .map((row) => Number(row?.id))
        .filter((id) => Number.isFinite(id));
    },
    async countTeams(){
      const row = await dbh.get('SELECT COUNT(*) AS c FROM teams');
      return Number(row?.c || 0);
    },
    async getUserActiveTeam(userId){
      const numeric = Number(userId);
      if (!Number.isFinite(numeric)) return null;
      const row = await dbh.get(
        `SELECT value FROM user_settings WHERE user_id=? AND key='active_team'`,
        [numeric]
      );
      const value = Number(row?.value);
      return Number.isFinite(value) ? value : null;
    },
    async setUserActiveTeam(userId, teamId){
      const numericUser = Number(userId);
      if (!Number.isFinite(numericUser)) return;
      if (teamId == null) {
        await dbh.run(`DELETE FROM user_settings WHERE user_id=? AND key='active_team'`, [numericUser]);
        return;
      }
      const numericTeam = Number(teamId);
      if (!Number.isFinite(numericTeam)) return;
      const now = new Date().toISOString();
      await dbh.run(
        `INSERT INTO user_settings(user_id, key, value, updated_at) VALUES(?,?,?,?)
         ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        [numericUser, 'active_team', String(numericTeam), now]
      );
    },
    async countAdmins(){ const r = await dbh.get("SELECT COUNT(*) c FROM users WHERE role='admin'"); return r.c; },
    async updateUserPassword(id, hash){ await dbh.run('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async updateUserRole(id, role){ await dbh.run('UPDATE users SET role=? WHERE id=?',[role,id]); },
    async deleteUser(id){ const r = await dbh.run('DELETE FROM users WHERE id=?',[id]); return r.changes; },
    async listServers(teamId){
      if (typeof teamId === 'undefined' || teamId === null) {
        return await dbh.all('SELECT id,name,host,port,tls,team_id,created_at FROM servers ORDER BY id DESC');
      }
      return await dbh.all(
        'SELECT id,name,host,port,tls,team_id,created_at FROM servers WHERE team_id=? ORDER BY id DESC',
        [teamId]
      );
    },
    async listServersWithSecrets(teamId){
      if (typeof teamId === 'undefined' || teamId === null) {
        return await dbh.all('SELECT id,name,host,port,password,tls,team_id,created_at FROM servers ORDER BY id DESC');
      }
      return await dbh.all(
        'SELECT id,name,host,port,password,tls,team_id,created_at FROM servers WHERE team_id=? ORDER BY id DESC',
        [teamId]
      );
    },
    async getServer(id){ return await dbh.get('SELECT * FROM servers WHERE id=?',[id]); },
    async createServer(s){ const r = await dbh.run('INSERT INTO servers(name,host,port,password,tls,team_id) VALUES(?,?,?,?,?,?)',[s.name,s.host,s.port,s.password,s.tls?1:0,s.team_id ?? null]); return r.lastID; },
    async updateServer(id,s){
      const cur = await dbh.get('SELECT * FROM servers WHERE id=?',[id]); if (!cur) return 0;
      const next = { ...cur, ...s };
      const r = await dbh.run('UPDATE servers SET name=?,host=?,port=?,password=?,tls=?,team_id=? WHERE id=?',[next.name,next.host,next.port,next.password,next.tls?1:0,next.team_id ?? cur.team_id ?? null,id]);
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
        sql += ' LIMIT ? OFFSET ?';
        const safeLimit = Math.floor(limitNum);
        const safeOffset = Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : 0;
        params.push(safeLimit, safeOffset);
      } else if (Number.isFinite(offsetNum) && offsetNum > 0) {
        sql += ' LIMIT -1 OFFSET ?';
        params.push(Math.floor(offsetNum));
      }
      return await dbh.all(sql, params);
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
      const row = await dbh.get(sql, params);
      const numeric = Number(row?.total);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
    },
    async recordServerPlayer({ server_id, steamid, display_name = null, seen_at = null, ip = null, port = null }){
      const serverIdNum = Number(server_id);
      if (!Number.isFinite(serverIdNum)) return;
      const sid = String(steamid || '').trim();
      if (!sid) return;
      let seen = seen_at;
      if (seen instanceof Date) {
        seen = Number.isNaN(seen.getTime()) ? null : seen.toISOString();
      } else if (typeof seen === 'string') {
        const parsed = new Date(seen);
        seen = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      if (!seen) seen = new Date().toISOString();
      const ipValue = typeof ip === 'string' && ip ? ip : null;
      const portNum = Number(port);
      const portValue = Number.isFinite(portNum) ? portNum : null;
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
          if (!/[zZ]$/.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += 'Z';
          const parsed = new Date(normalized);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        const fallback = new Date(value);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
      };
      const existing = await dbh.get(
        'SELECT last_seen, total_playtime_seconds FROM server_players WHERE server_id=? AND steamid=?',
        [serverIdNum, sid]
      );
      let totalSeconds = Number.isFinite(Number(existing?.total_playtime_seconds))
        ? Number(existing.total_playtime_seconds)
        : 0;
      const prev = parseStoredDate(existing?.last_seen);
      const next = parseStoredDate(seen);
      if (prev && next) {
        const prevMs = prev.getTime();
        const nextMs = next.getTime();
        if (prevMs != null && nextMs != null && nextMs > prevMs) {
          const deltaSeconds = Math.floor((nextMs - prevMs) / 1000);
          const MAX_SESSION_GAP_SECONDS = 10 * 60; // ignore large gaps to prevent offline accumulation
          if (deltaSeconds > 0) {
            if (deltaSeconds <= MAX_SESSION_GAP_SECONDS) {
              totalSeconds += deltaSeconds;
            } else if (deltaSeconds <= MAX_SESSION_GAP_SECONDS * 6) {
              totalSeconds += MAX_SESSION_GAP_SECONDS; // clamp unusually large single gaps
            }
          }
        }
      }
      totalSeconds = Math.max(0, Math.round(totalSeconds));
      await dbh.run(`
        INSERT INTO server_players(server_id, steamid, display_name, forced_display_name, first_seen, last_seen, last_ip, last_port, total_playtime_seconds)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(server_id, steamid) DO UPDATE SET
          display_name=COALESCE(excluded.display_name, server_players.display_name),
          last_seen=excluded.last_seen,
          last_ip=COALESCE(excluded.last_ip, server_players.last_ip),
          last_port=COALESCE(excluded.last_port, server_players.last_port),
          total_playtime_seconds=excluded.total_playtime_seconds
      `,[serverIdNum,sid,display_name,null,seen,seen,ipValue,portValue,totalSeconds]);
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
          OR CAST(sp.last_port AS TEXT) LIKE ? ESCAPE '\\'
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
        sql += ' LIMIT -1 OFFSET ?';
        params.push(Math.floor(offsetNum));
      }
      return await dbh.all(sql, params);
    },
    async searchServerPlayers(serverId, query, { limit = 10 } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const term = typeof query === 'string' ? query.trim() : '';
      if (!term) return [];
      const likeTerm = `%${escapeLike(term)}%`;
      const limitValue = Number(limit);
      const limitNum = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 25) : 10;
      return await dbh.all(`
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
            CAST(sp.last_port AS TEXT) LIKE ? ESCAPE '\\' OR
            p.persona LIKE ? ESCAPE '\\' OR
            p.profileurl LIKE ? ESCAPE '\\' OR
            p.country LIKE ? ESCAPE '\\'
          )
        ORDER BY sp.last_seen DESC
        LIMIT ?
      `, [serverIdNum, term, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, limitNum]);
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
          OR CAST(sp.last_port AS TEXT) LIKE ? ESCAPE '\\'
          OR p.persona LIKE ? ESCAPE '\\'
          OR p.profileurl LIKE ? ESCAPE '\\'
          OR p.country LIKE ? ESCAPE '\\'
        )`;
        params.push(term, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      const row = await dbh.get(sql, params);
      const numeric = Number(row?.total);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
    },
    async getServerPlayer(serverId, steamid) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const sid = typeof steamid === 'string' ? steamid.trim() : '';
      if (!sid) return null;
      return await dbh.get(`
        SELECT sp.server_id, sp.steamid, sp.display_name, sp.forced_display_name, sp.first_seen, sp.last_seen,
               sp.last_ip, sp.last_port,
               p.persona, p.avatar, p.country, p.profileurl, p.vac_banned, p.game_bans,
               p.last_ban_days, p.visibility, p.rust_playtime_minutes, p.playtime_updated_at, p.updated_at
        FROM server_players sp
        LEFT JOIN players p ON p.steamid = sp.steamid
        WHERE sp.server_id=? AND sp.steamid=?
        LIMIT 1
      `, [serverIdNum, sid]);
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
      const createdAt = normaliseIso(entry?.created_at) || new Date().toISOString();
      const result = await dbh.run(
        'INSERT INTO chat_messages(server_id, channel, steamid, username, message, raw, color, created_at) VALUES(?,?,?,?,?,?,?,?)',
        [serverIdNum, channel, steamId || null, username, truncated, raw, color, createdAt]
      );
      return {
        id: result.lastID,
        server_id: serverIdNum,
        channel,
        steamid: steamId || null,
        username,
        message: truncated,
        raw,
        color,
        created_at: createdAt
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
      let sql = `
        SELECT id, server_id, channel, steamid, username, message, raw, color, created_at
        FROM chat_messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at ASC
      `;
      const limitNum = Number(limit);
      if (Number.isFinite(limitNum) && limitNum > 0) {
        sql += ' LIMIT ?';
        params.push(Math.min(Math.floor(limitNum), 500));
      }
      return await dbh.all(sql, params);
    },
    async purgeChatMessages({ before, server_id } = {}) {
      const cutoff = normaliseIso(before);
      if (!cutoff) return 0;
      let sql = 'DELETE FROM chat_messages WHERE created_at < ?';
      const params = [cutoff];
      const serverIdNum = Number(server_id);
      if (Number.isFinite(serverIdNum)) {
        sql += ' AND server_id=?';
        params.push(serverIdNum);
      }
      const result = await dbh.run(sql, params);
      return result.changes || 0;
    },
    async recordF7Report(entry = {}) {
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      if (!Number.isFinite(serverIdNum)) return null;
      const raw = trimOrNull(entry?.raw);
      if (!raw) return null;
      const nowIso = new Date().toISOString();
      const createdAt = normaliseIso(entry?.created_at) || nowIso;
      const updatedAt = normaliseIso(entry?.updated_at) || nowIso;
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
        ON CONFLICT(server_id, report_id) DO UPDATE SET
          reporter_steamid = COALESCE(excluded.reporter_steamid, reporter_steamid),
          reporter_name = COALESCE(excluded.reporter_name, reporter_name),
          target_steamid = COALESCE(excluded.target_steamid, target_steamid),
          target_name = COALESCE(excluded.target_name, target_name),
          category = COALESCE(excluded.category, category),
          message = COALESCE(excluded.message, message),
          raw = excluded.raw,
          created_at = CASE
            WHEN report_id IS NULL OR excluded.created_at < created_at THEN excluded.created_at
            ELSE created_at
          END,
          updated_at = excluded.updated_at
      `;
      await dbh.run(sql, [
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
      ]);

      let row = null;
      if (reportId) {
        row = await dbh.get(`
          SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
          FROM f7_reports
          WHERE server_id=? AND report_id=?
        `, [serverIdNum, reportId]);
      }
      if (!row) {
        const latest = await dbh.get('SELECT last_insert_rowid() AS id');
        if (latest?.id) {
          row = await dbh.get(`
            SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
            FROM f7_reports
            WHERE id=?
          `, [latest.id]);
        }
      }
      if (!row) {
        row = await dbh.get(`
          SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
          FROM f7_reports
          WHERE server_id=?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `, [serverIdNum]);
      }
      return row;
    },
    async listF7Reports(serverId, { since = null, limit = 50 } = {}) {
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const conditions = ['server_id=?'];
      const params = [serverIdNum];
      const sinceIso = normaliseIso(since);
      if (sinceIso) {
        conditions.push('created_at >= ?');
        params.push(sinceIso);
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
      return await dbh.all(sql, params);
    },
    async getF7ReportById(serverId, id) {
      const serverIdNum = Number(serverId);
      const numericId = Number(id);
      if (!Number.isFinite(serverIdNum) || !Number.isFinite(numericId)) return null;
      return await dbh.get(`
        SELECT id, server_id, report_id, reporter_steamid, reporter_name, target_steamid, target_name, category, message, raw, created_at, updated_at
        FROM f7_reports
        WHERE server_id=? AND id=?
      `, [serverIdNum, numericId]);
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
      return await dbh.all(sql, params);
    },
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
    async saveServerDiscordIntegration(serverId,{ bot_token=null,guild_id=null,channel_id=null,status_message_id=null,config_json=null }){
      await dbh.run(
        "INSERT INTO server_discord_integrations(server_id,bot_token,guild_id,channel_id,status_message_id,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(server_id) DO UPDATE SET bot_token=excluded.bot_token, guild_id=excluded.guild_id, channel_id=excluded.channel_id, status_message_id=excluded.status_message_id, config_json=excluded.config_json, updated_at=excluded.updated_at",
        [serverId, bot_token, guild_id, channel_id, status_message_id, config_json]
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
