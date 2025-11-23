import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { serializeCombatLogPayload } from './combat-log.js';
import { encodeTeamDiscordConfig, parseTeamDiscordConfig } from '../discord-config.js';

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
  const previewDiscordToken = (token) => {
    if (token == null) return null;
    const text = String(token);
    if (!text.length) return null;
    if (text.length <= 4) return text;
    return `••••${text.slice(-4)}`;
  };
  const generatePreviewToken = (size = 18) => randomBytes(size).toString('hex');
  const generateUniqueTicketPreviewToken = async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generatePreviewToken(18 + attempt);
      const rows = await exec('SELECT id FROM discord_tickets WHERE preview_token=? LIMIT 1', [candidate]);
      if (!rows?.length) return candidate;
    }
    const fallback = generatePreviewToken(24);
    const exists = await exec('SELECT id FROM discord_tickets WHERE preview_token=? LIMIT 1', [fallback]);
    if (!exists?.length) return fallback;
    throw new Error('failed to allocate unique ticket preview token');
  };
  const ensureTicketPreviewTokens = async () => {
    const rows = await exec(
      "SELECT id FROM discord_tickets WHERE preview_token IS NULL OR preview_token=''"
    );
    for (const row of rows) {
      const token = await generateUniqueTicketPreviewToken();
      await exec('UPDATE discord_tickets SET preview_token=? WHERE id=?', [token, row.id]);
    }
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
        superuser TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
      try {
        await exec(`ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user'`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
      try {
        await exec(`ALTER TABLE users ADD COLUMN superuser TINYINT(1) NOT NULL DEFAULT 0`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
      await exec(`CREATE TABLE IF NOT EXISTS teams(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        owner_user_id INT NOT NULL,
        discord_token TEXT NULL,
        discord_guild_id TEXT NULL,
        discord_config_json JSON NULL,
        discord_auth_enabled TINYINT(1) NOT NULL DEFAULT 0,
        discord_auth_role_id VARCHAR(64) NULL,
        discord_auth_log_channel_id VARCHAR(64) NULL,
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
      const ensureIndex = async (sql) => {
        try { await exec(sql); }
        catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
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
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_token TEXT NULL');
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_guild_id TEXT NULL');
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_config_json JSON NULL');
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_auth_enabled TINYINT(1) NOT NULL DEFAULT 0');
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_auth_role_id VARCHAR(64) NULL');
      await ensureColumn('ALTER TABLE teams ADD COLUMN discord_auth_log_channel_id VARCHAR(64) NULL');
      await ensureColumn('ALTER TABLE servers ADD COLUMN team_id INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN queued INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN sleepers INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN joining INT NULL');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN online TINYINT DEFAULT 1');
      await ensureColumn('ALTER TABLE server_player_counts ADD COLUMN fps FLOAT NULL');
      await ensureColumn('ALTER TABLE chat_messages ADD COLUMN color VARCHAR(32) NULL');
      await ensureColumn('ALTER TABLE users ADD COLUMN mfa_secret TEXT NULL');
      await ensureColumn('ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0');
      await exec(`CREATE TABLE IF NOT EXISTS user_passkeys(
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        credential_id VARCHAR(255) UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports TEXT NULL,
        friendly_name VARCHAR(190) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX(user_id),
        CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await exec(`CREATE TABLE IF NOT EXISTS user_backup_codes(
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL,
        INDEX(user_id),
        CONSTRAINT fk_backup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
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
        command_bot_token TEXT NULL,
        guild_id VARCHAR(64) NULL,
        channel_id VARCHAR(64) NULL,
        status_message_id VARCHAR(64) NULL,
        config_json TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_server_discord FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
      await ensureColumn('ALTER TABLE server_discord_integrations ADD COLUMN command_bot_token TEXT NULL');
      await ensureColumn('ALTER TABLE server_discord_integrations ADD COLUMN status_message_id VARCHAR(64) NULL');
      await ensureColumn('ALTER TABLE server_discord_integrations ADD COLUMN config_json TEXT NULL');
      await exec(`CREATE TABLE IF NOT EXISTS discord_tickets(
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NULL,
        server_id INT NULL,
        guild_id VARCHAR(64) NULL,
        channel_id VARCHAR(64) UNIQUE,
        ticket_number INT NOT NULL,
        subject TEXT NULL,
        details TEXT NULL,
        created_by VARCHAR(64) NULL,
        created_by_tag VARCHAR(190) NULL,
        preview_token VARCHAR(64) NULL,
        status VARCHAR(32) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        closed_by VARCHAR(64) NULL,
        closed_by_tag VARCHAR(190) NULL,
        close_reason TEXT NULL,
        INDEX idx_discord_tickets_guild_number (guild_id, ticket_number),
        INDEX idx_discord_tickets_team (team_id),
        UNIQUE KEY idx_discord_tickets_preview_token (preview_token),
        CONSTRAINT fk_discord_ticket_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
        CONSTRAINT fk_discord_ticket_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;`);
      await ensureColumn('ALTER TABLE discord_tickets ADD COLUMN preview_token VARCHAR(64) NULL');
      await ensureTicketPreviewTokens();
      await ensureIndex('ALTER TABLE discord_tickets ADD UNIQUE KEY idx_discord_tickets_preview_token (preview_token)');
      await exec(`CREATE TABLE IF NOT EXISTS team_auth_profiles(
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        steamid VARCHAR(64) NOT NULL,
        discord_id VARCHAR(64) NOT NULL,
        discord_username VARCHAR(191) NULL,
        discord_display_name VARCHAR(191) NULL,
        cookie_id VARCHAR(191) NULL,
        linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_team_auth_profiles_team (team_id),
        CONSTRAINT fk_team_auth_profile_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT uq_team_auth_profile_team_steam UNIQUE(team_id, steamid),
        CONSTRAINT uq_team_auth_profile_team_discord UNIQUE(team_id, discord_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
      await exec(`CREATE TABLE IF NOT EXISTS team_auth_requests(
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        requested_by_user_id INT NULL,
        discord_id VARCHAR(64) NOT NULL,
        discord_username VARCHAR(191) NULL,
        state_token VARCHAR(191) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        completed_profile_id INT NULL,
        INDEX idx_team_auth_requests_team (team_id),
        CONSTRAINT fk_team_auth_request_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_team_auth_request_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_team_auth_request_profile FOREIGN KEY (completed_profile_id) REFERENCES team_auth_profiles(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
      await exec(`CREATE TABLE IF NOT EXISTS team_auth_cookies(
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        cookie_id VARCHAR(191) NOT NULL,
        steamid VARCHAR(64) NOT NULL,
        discord_id VARCHAR(64) NOT NULL,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_team_auth_cookies_team (team_id),
        CONSTRAINT fk_team_auth_cookie_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT uq_team_auth_cookie UNIQUE(team_id, cookie_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
      await exec(`CREATE TABLE IF NOT EXISTS team_auth_profile_alts(
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        primary_profile_id INT NOT NULL,
        alt_profile_id INT NOT NULL,
        reason VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_team_auth_profile_alts_team (team_id),
        CONSTRAINT fk_team_auth_alt_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_team_auth_alt_primary FOREIGN KEY (primary_profile_id) REFERENCES team_auth_profiles(id) ON DELETE CASCADE,
        CONSTRAINT fk_team_auth_alt_secondary FOREIGN KEY (alt_profile_id) REFERENCES team_auth_profiles(id) ON DELETE CASCADE,
        CONSTRAINT uq_team_auth_alt UNIQUE(team_id, primary_profile_id, alt_profile_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
      await exec(`CREATE TABLE IF NOT EXISTS discord_ticket_dialog_entries(
        ticket_id INT NOT NULL,
        message_id VARCHAR(64) NOT NULL,
        role VARCHAR(16) NOT NULL,
        author_id VARCHAR(64) NULL,
        author_tag VARCHAR(190) NULL,
        content TEXT NULL,
        posted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(ticket_id, message_id),
        INDEX idx_ticket_dialog_ticket_time (ticket_id, posted_at),
        CONSTRAINT fk_ticket_dialog_ticket FOREIGN KEY (ticket_id) REFERENCES discord_tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`);
    },
    async countUsers(){ const r = await exec('SELECT COUNT(*) c FROM users'); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async createUser(u){
      const { username, password_hash, role = 'user', superuser = 0 } = u;
      const r = await exec(
        'INSERT INTO users(username,password_hash,role,superuser) VALUES(?,?,?,?)',
        [username, password_hash, role, superuser ? 1 : 0]
      );
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

    async setUserMfaSecret(userId, secret, enabled = true) {
      await exec('UPDATE users SET mfa_secret=?, mfa_enabled=? WHERE id=?', [secret, enabled ? 1 : 0, userId]);
    },
    async disableUserMfa(userId) {
      await exec('UPDATE users SET mfa_secret=NULL, mfa_enabled=0 WHERE id=?', [userId]);
    },
    async replaceBackupCodes(userId, codeHashes = []) {
      await exec('DELETE FROM user_backup_codes WHERE user_id=?', [userId]);
      if (!Array.isArray(codeHashes) || !codeHashes.length) return;
      const values = codeHashes.map((hash) => [userId, hash]);
      await exec('INSERT INTO user_backup_codes(user_id, code_hash) VALUES ?', [values]);
    },
    async countUserBackupCodes(userId) {
      const rows = await exec('SELECT COUNT(*) AS c FROM user_backup_codes WHERE user_id=? AND used=0', [userId]);
      return rows?.[0]?.c || 0;
    },
    async consumeBackupCode(userId, codeHash) {
      const rows = await exec(
        'SELECT id FROM user_backup_codes WHERE user_id=? AND code_hash=? AND used=0 LIMIT 1',
        [userId, codeHash]
      );
      const id = rows?.[0]?.id;
      if (!id) return false;
      await exec('UPDATE user_backup_codes SET used=1, used_at=CURRENT_TIMESTAMP WHERE id=?', [id]);
      return true;
    },
    async deleteUserBackupCodes(userId) {
      await exec('DELETE FROM user_backup_codes WHERE user_id=?', [userId]);
    },
    async listUserPasskeys(userId) {
      return await exec(
        `SELECT id, user_id, credential_id, public_key, counter, transports, friendly_name, created_at, last_used_at
         FROM user_passkeys
         WHERE user_id=?
         ORDER BY created_at ASC`,
        [userId]
      );
    },
    async countUserPasskeys(userId) {
      const rows = await exec('SELECT COUNT(*) AS c FROM user_passkeys WHERE user_id=?', [userId]);
      return rows?.[0]?.c || 0;
    },
    async getPasskeyByCredentialId(credentialId) {
      const rows = await exec(
        `SELECT id, user_id, credential_id, public_key, counter, transports, friendly_name, created_at, last_used_at
         FROM user_passkeys
         WHERE credential_id=?
         LIMIT 1`,
        [credentialId]
      );
      return rows?.[0] || null;
    },
    async addUserPasskey(passkey) {
      const {
        userId,
        credentialId,
        publicKey,
        counter = 0,
        transports = null,
        friendlyName = null
      } = passkey;
      const result = await exec(
        'INSERT INTO user_passkeys(user_id, credential_id, public_key, counter, transports, friendly_name) VALUES(?,?,?,?,?,?)',
        [userId, credentialId, publicKey, counter, transports, friendlyName]
      );
      return result.insertId;
    },
    async updatePasskeyCounter(credentialId, counter) {
      await exec('UPDATE user_passkeys SET counter=?, last_used_at=CURRENT_TIMESTAMP WHERE credential_id=?', [counter, credentialId]);
    },
    async deleteUserPasskey(userId, id) {
      await exec('DELETE FROM user_passkeys WHERE id=? AND user_id=?', [id, userId]);
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
      return await exec('SELECT id, username, role, superuser, created_at FROM users ORDER BY id ASC');
    },
    async listAllUsersDetailed(){
      const users = await exec(
        `SELECT u.id, u.username, u.role, u.superuser, u.created_at, r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.role_key = u.role
         ORDER BY LOWER(u.username) ASC`
      );
      const teams = await exec(
        `SELECT tm.team_id, tm.user_id, tm.role, t.name AS team_name, r.name AS role_name
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         LEFT JOIN roles r ON r.role_key = tm.role
         ORDER BY LOWER(t.name) ASC`
      );
      const map = new Map();
      users.forEach((user) => {
        map.set(user.id, { ...user, teams: [] });
      });
      teams.forEach((team) => {
        const entry = map.get(team.user_id);
        if (!entry) return;
        entry.teams.push({
          id: team.team_id,
          name: team.team_name,
          role: team.role,
          roleName: team.role_name || team.role
        });
      });
      return Array.from(map.values());
    },
    async listAllTeamsWithCounts(){
      const rows = await exec(
        `SELECT t.id, t.name, t.owner_user_id, t.created_at, COUNT(tm.user_id) AS member_count
         FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id
         GROUP BY t.id
         ORDER BY LOWER(t.name) ASC`
      );
      return rows.map((row) => ({
        ...row,
        member_count: Number(row?.member_count ?? 0)
      }));
    },
    async getTeam(teamId){
      const rows = await exec('SELECT * FROM teams WHERE id=?', [teamId]);
      return rows[0] || null;
    },
    async listUserTeams(userId){
      const numeric = Number(userId);
      if (!Number.isFinite(numeric)) return [];
      return await exec(
        `SELECT t.id, t.name, t.owner_user_id, t.discord_token, t.discord_guild_id, t.created_at, tm.role, tm.joined_at
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
    async getTeamDiscordSettings(teamId){
      const rows = await exec('SELECT discord_token, discord_guild_id, discord_config_json FROM teams WHERE id=?', [teamId]);
      const row = Array.isArray(rows) && rows.length ? rows[0] : rows;
      const token = row?.discord_token != null && row.discord_token !== '' ? String(row.discord_token) : null;
      const guild = row?.discord_guild_id;
      return {
        hasToken: Boolean(token),
        guildId: guild != null && guild !== '' ? String(guild) : null,
        tokenPreview: token ? previewDiscordToken(token) : null,
        token,
        config: parseTeamDiscordConfig(row?.discord_config_json ?? null)
      };
    },
    async getTeamAuthSettings(teamId){
      const rows = await exec(
        `SELECT discord_auth_enabled, discord_auth_role_id, discord_auth_log_channel_id, discord_token, discord_guild_id
         FROM teams WHERE id=?`,
        [teamId]
      );
      const row = Array.isArray(rows) && rows.length ? rows[0] : rows || {};
      const role = row?.discord_auth_role_id;
      const guild = row?.discord_guild_id;
      const token = row?.discord_token;
      return {
        enabled: Boolean(row?.discord_auth_enabled),
        roleId: role != null && role !== '' ? String(role) : null,
        logChannelId:
          row?.discord_auth_log_channel_id != null && row.discord_auth_log_channel_id !== ''
            ? String(row.discord_auth_log_channel_id)
            : null,
        guildId: guild != null && guild !== '' ? String(guild) : null,
        token: token != null && token !== '' ? String(token) : null
      };
    },
    async setTeamAuthSettings(teamId, { enabled = null, roleId = undefined, logChannelId = undefined } = {}){
      const numericTeamId = Number(teamId);
      if (!Number.isFinite(numericTeamId)) return 0;
      const updates = [];
      const params = [];
      if (enabled != null) {
        updates.push('discord_auth_enabled=?');
        params.push(enabled ? 1 : 0);
      }
      if (roleId !== undefined) {
        const value = roleId == null ? null : String(roleId).trim();
        updates.push('discord_auth_role_id=?');
        params.push(value && value.length ? value : null);
      }
      if (logChannelId !== undefined) {
        const value = logChannelId == null ? null : String(logChannelId).trim();
        updates.push('discord_auth_log_channel_id=?');
        params.push(value && value.length ? value : null);
      }
      if (!updates.length) return 0;
      params.push(numericTeamId);
      const result = await exec(
        `UPDATE teams SET ${updates.join(', ')} WHERE id=?`,
        params
      );
      return result?.affectedRows || 0;
    },
    async setTeamDiscordToken(teamId, token, guildId){
      const value = trimOrNull(token);
      const guildValue = trimOrNull(guildId);
      const res = await exec('UPDATE teams SET discord_token=?, discord_guild_id=? WHERE id=?', [value, guildValue, teamId]);
      return res?.affectedRows || 0;
    },
    async setTeamDiscordConfig(teamId, config){
      const payload = encodeTeamDiscordConfig(config);
      const res = await exec('UPDATE teams SET discord_config_json=? WHERE id=?', [payload, teamId]);
      return res?.affectedRows || 0;
    },
    async clearTeamDiscordToken(teamId){
      return await this.setTeamDiscordToken(teamId, null, null);
    },
    async countAdmins(){ const r = await exec("SELECT COUNT(*) c FROM users WHERE role='admin'"); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async updateUserPassword(id, hash){ await exec('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async updateUserRole(id, role){ await exec('UPDATE users SET role=? WHERE id=?',[role,id]); },
    async updateUserSuperuser(id, flag){ await exec('UPDATE users SET superuser=? WHERE id=?', [flag ? 1 : 0, id]); },
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
    async createTeamAuthRequest({ team_id, requested_by_user_id = null, discord_id, discord_username = null, state_token, expires_at }) {
      const teamNumeric = Number(team_id);
      if (!Number.isFinite(teamNumeric) || teamNumeric <= 0) return null;
      const token = typeof state_token === 'string' ? state_token.trim() : '';
      const discordId = typeof discord_id === 'string' ? discord_id.trim() : '';
      const expires = normaliseDateTime(expires_at);
      if (!token || !discordId || !expires) return null;
      let requestedByValue = null;
      if (requested_by_user_id != null) {
        const requestedBy = Number(requested_by_user_id);
        if (Number.isFinite(requestedBy) && requestedBy > 0) {
          requestedByValue = Math.trunc(requestedBy);
        }
      }
      const usernameValue = typeof discord_username === 'string' ? discord_username : null;
      const refreshRequest = async (existing) => {
        if (!existing?.id) return null;
        const nextRequestedBy = requestedByValue != null ? requestedByValue : (existing.requested_by_user_id ?? null);
        const nextUsername = usernameValue != null ? usernameValue : (existing.discord_username ?? null);
        await exec(
          `UPDATE team_auth_requests
              SET requested_by_user_id=?,
                  discord_username=?,
                  state_token=?,
                  expires_at=?,
                  completed_at=NULL,
                  completed_profile_id=NULL
            WHERE id=?`,
          [nextRequestedBy, nextUsername, token, expires, existing.id]
        );
        const refreshed = await exec('SELECT * FROM team_auth_requests WHERE id=? LIMIT 1', [existing.id]);
        return Array.isArray(refreshed) && refreshed.length ? refreshed[0] : null;
      };
      const existingRows = await exec(
        `SELECT *
           FROM team_auth_requests
          WHERE team_id=?
            AND discord_id=?
            AND completed_at IS NULL
          ORDER BY id DESC
          LIMIT 1`,
        [teamNumeric, discordId]
      );
      if (Array.isArray(existingRows) && existingRows.length) {
        return await refreshRequest(existingRows[0]);
      }
      try {
        await exec(
          `INSERT INTO team_auth_requests(team_id, requested_by_user_id, discord_id, discord_username, state_token, expires_at)
           VALUES(?,?,?,?,?,?)`,
          [teamNumeric, requestedByValue, discordId, usernameValue, token, expires]
        );
        const rows = await exec('SELECT * FROM team_auth_requests WHERE state_token=?', [token]);
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') {
          const fallback = await exec(
            `SELECT *
               FROM team_auth_requests
              WHERE team_id=?
                AND discord_id=?
              ORDER BY id DESC
              LIMIT 1`,
            [teamNumeric, discordId]
          );
          if (Array.isArray(fallback) && fallback.length) {
            return await refreshRequest(fallback[0]);
          }
        }
        throw err;
      }
    },
    async getTeamAuthRequestByToken(token) {
      const trimmed = typeof token === 'string' ? token.trim() : '';
      if (!trimmed) return null;
      const rows = await exec('SELECT * FROM team_auth_requests WHERE state_token=?', [trimmed]);
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    },
    async markTeamAuthRequestCompleted(id, profileId) {
      const requestId = Number(id);
      if (!Number.isFinite(requestId)) return 0;
      const profileNumeric = Number(profileId);
      const profileValue = Number.isFinite(profileNumeric) ? Math.trunc(profileNumeric) : null;
      const now = normaliseDateTime(new Date());
      const result = await exec(
        'UPDATE team_auth_requests SET completed_at=?, completed_profile_id=? WHERE id=?',
        [now, profileValue, requestId]
      );
      return result?.affectedRows || 0;
    },
    async upsertTeamAuthProfile({ team_id, steamid, discord_id, discord_username = null, discord_display_name = null, cookie_id = null }) {
      const teamNumeric = Number(team_id);
      if (!Number.isFinite(teamNumeric)) return null;
      const steam = typeof steamid === 'string' ? steamid.trim() : '';
      const discord = typeof discord_id === 'string' ? discord_id.trim() : '';
      if (!steam || !discord) return null;
      const usernameValue = typeof discord_username === 'string' ? discord_username : null;
      const displayValue = typeof discord_display_name === 'string' ? discord_display_name : null;
      const cookieValue = typeof cookie_id === 'string' ? cookie_id : (cookie_id == null ? null : String(cookie_id));
      const now = normaliseDateTime(new Date());
      const rows = await exec(
        'SELECT * FROM team_auth_profiles WHERE team_id=? AND (steamid=? OR discord_id=?) LIMIT 1',
        [teamNumeric, steam, discord]
      );
      if (Array.isArray(rows) && rows.length) {
        const existing = rows[0];
        const nextUsername = usernameValue != null ? usernameValue : (existing.discord_username ?? null);
        const nextDisplay = displayValue != null ? displayValue : (existing.discord_display_name ?? null);
        const nextCookie = cookieValue != null ? cookieValue : (existing.cookie_id ?? null);
        await exec(
          `UPDATE team_auth_profiles
             SET steamid=?, discord_id=?, discord_username=?, discord_display_name=?, cookie_id=?, linked_at=?, updated_at=?
           WHERE id=?`,
          [steam, discord, nextUsername, nextDisplay, nextCookie, now, now, existing.id]
        );
        const updated = await exec('SELECT * FROM team_auth_profiles WHERE id=?', [existing.id]);
        return Array.isArray(updated) && updated.length ? updated[0] : null;
      }
      await exec(
        `INSERT INTO team_auth_profiles(team_id, steamid, discord_id, discord_username, discord_display_name, cookie_id, linked_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        [teamNumeric, steam, discord, usernameValue, displayValue, cookieValue, now, now]
      );
      const inserted = await exec('SELECT * FROM team_auth_profiles WHERE team_id=? AND steamid=?', [teamNumeric, steam]);
      return Array.isArray(inserted) && inserted.length ? inserted[0] : null;
    },
    async listTeamAuthProfiles(teamId) {
      const teamNumeric = Number(teamId);
      if (!Number.isFinite(teamNumeric)) return [];
      const rows = await exec(
        'SELECT * FROM team_auth_profiles WHERE team_id=? ORDER BY linked_at DESC, id DESC',
        [teamNumeric]
      );
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const altRows = await exec(
        'SELECT * FROM team_auth_profile_alts WHERE team_id=?',
        [teamNumeric]
      );
      const map = new Map();
      for (const row of rows) {
        map.set(row.id, { ...row, alts: [], is_alt: false, primary_profile_id: null });
      }
      for (const alt of Array.isArray(altRows) ? altRows : []) {
        const primary = map.get(alt.primary_profile_id);
        const altProfile = map.get(alt.alt_profile_id);
        if (!primary || !altProfile) continue;
        primary.alts.push({
          id: altProfile.id,
          steamid: altProfile.steamid,
          discord_id: altProfile.discord_id,
          discord_username: altProfile.discord_username,
          discord_display_name: altProfile.discord_display_name,
          linked_at: altProfile.linked_at,
          reason: alt.reason || null,
          created_at: alt.created_at || null
        });
        altProfile.is_alt = true;
        altProfile.primary_profile_id = primary.id;
        altProfile.alts.push({
          id: primary.id,
          steamid: primary.steamid,
          discord_id: primary.discord_id,
          discord_username: primary.discord_username,
          discord_display_name: primary.discord_display_name,
          linked_at: primary.linked_at,
          reason: alt.reason || null,
          created_at: alt.created_at || null,
          relation: 'primary'
        });
      }
      return rows.map((row) => map.get(row.id));
    },
    async getTeamAuthProfile(teamId, steamid) {
      const sid = typeof steamid === 'string' ? steamid.trim() : '';
      if (!sid) return null;
      const profiles = await this.listTeamAuthProfiles(teamId);
      return profiles.find((entry) => String(entry?.steamid || '') === sid) || null;
    },
    async getTeamAuthProfilesBySteamIds(teamId, steamids = []) {
      const teamNumeric = Number(teamId);
      if (!Number.isFinite(teamNumeric)) return [];
      if (!Array.isArray(steamids) || steamids.length === 0) return [];
      const normalized = steamids
        .map((value) => (typeof value === 'string' ? value.trim() : String(value || '')))
        .filter((value) => value.length > 0);
      if (normalized.length === 0) return [];
      const placeholders = normalized.map(() => '?').join(',');
      return await exec(
        `SELECT * FROM team_auth_profiles WHERE team_id=? AND steamid IN (${placeholders})`,
        [teamNumeric, ...normalized]
      );
    },
    async recordTeamAuthCookie({ team_id, cookie_id, steamid, discord_id }) {
      const teamNumeric = Number(team_id);
      if (!Number.isFinite(teamNumeric)) return { existing: null, updated: null };
      const cookie = typeof cookie_id === 'string' ? cookie_id.trim() : '';
      const steam = typeof steamid === 'string' ? steamid.trim() : '';
      const discord = typeof discord_id === 'string' ? discord_id.trim() : '';
      if (!cookie || !steam || !discord) return { existing: null, updated: null };
      const now = normaliseDateTime(new Date());
      const existingRows = await exec('SELECT * FROM team_auth_cookies WHERE team_id=? AND cookie_id=?', [teamNumeric, cookie]);
      if (Array.isArray(existingRows) && existingRows.length) {
        const existing = existingRows[0];
        await exec(
          'UPDATE team_auth_cookies SET steamid=?, discord_id=?, last_seen_at=? WHERE id=?',
          [steam, discord, now, existing.id]
        );
        const updatedRows = await exec('SELECT * FROM team_auth_cookies WHERE id=?', [existing.id]);
        return { existing, updated: Array.isArray(updatedRows) && updatedRows.length ? updatedRows[0] : existing };
      }
      const insert = await exec(
        'INSERT INTO team_auth_cookies(team_id, cookie_id, steamid, discord_id, last_seen_at, created_at) VALUES(?,?,?,?,?,?)',
        [teamNumeric, cookie, steam, discord, now, now]
      );
      const inserted = await exec('SELECT * FROM team_auth_cookies WHERE id=?', [insert.insertId]);
      return { existing: null, updated: Array.isArray(inserted) && inserted.length ? inserted[0] : null };
    },
    async getTeamAuthCookieHistory(teamId, cookieId) {
      const teamNumeric = Number(teamId);
      if (!Number.isFinite(teamNumeric)) return [];
      const cookie = typeof cookieId === 'string' ? cookieId.trim() : '';
      if (!cookie) return [];
      const rows = await exec(
        'SELECT * FROM team_auth_cookies WHERE team_id=? AND cookie_id=? ORDER BY last_seen_at DESC, id DESC',
        [teamNumeric, cookie]
      );
      return Array.isArray(rows) ? rows : [];
    },
    async createTeamAuthAltLink({ team_id, primary_profile_id, alt_profile_id, reason = null }) {
      const teamNumeric = Number(team_id);
      const primaryId = Number(primary_profile_id);
      const altId = Number(alt_profile_id);
      if (!Number.isFinite(teamNumeric) || !Number.isFinite(primaryId) || !Number.isFinite(altId)) return null;
      const reasonValue = reason == null ? null : String(reason);
      const now = normaliseDateTime(new Date());
      await exec(
        `INSERT IGNORE INTO team_auth_profile_alts(team_id, primary_profile_id, alt_profile_id, reason, created_at)
         VALUES(?,?,?,?,?)`,
        [teamNumeric, primaryId, altId, reasonValue, now]
      );
      const rows = await exec(
        'SELECT * FROM team_auth_profile_alts WHERE team_id=? AND primary_profile_id=? AND alt_profile_id=?',
        [teamNumeric, primaryId, altId]
      );
      return Array.isArray(rows) && rows.length ? rows[0] : null;
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
    async addPlayerNote(entry = {}) {
      const sid = String(entry?.steamid || '').trim();
      if (!sid) return null;
      const text = typeof entry?.note === 'string' ? entry.note.trim() : '';
      if (!text) return null;
      const serverIdRaw = entry?.server_id ?? entry?.serverId;
      const serverIdNum = Number(serverIdRaw);
      if (!Number.isFinite(serverIdNum)) return null;
      const serverId = Math.trunc(serverIdNum);
      const result = await exec('INSERT INTO player_events(steamid,server_id,event,note) VALUES(?,?,?,?)', [sid, serverId, 'note', text]);
      const insertedId = result?.insertId;
      if (insertedId) {
        const rows = await exec('SELECT * FROM player_events WHERE id=? LIMIT 1', [insertedId]);
        return rows?.[0] ?? null;
      }
      const rows = await exec('SELECT * FROM player_events WHERE steamid=? AND event=? AND server_id=? ORDER BY id DESC LIMIT 1', [sid, 'note', serverId]);
      return rows?.[0] ?? null;
    },
    async listPlayerEvents(steamid,{limit=100,offset=0}={}){ return await exec('SELECT * FROM player_events WHERE steamid=? ORDER BY id DESC LIMIT ? OFFSET ?',[steamid,limit,offset]); },
    async listPlayerNotes(steamid, { limit = 100, offset = 0, serverId } = {}) {
      const sid = String(steamid || '').trim();
      if (!sid) return [];
      const serverIdNum = Number(serverId);
      if (!Number.isFinite(serverIdNum)) return [];
      const safeServerId = Math.trunc(serverIdNum);
      const limitNum = Number(limit);
      const offsetNum = Number(offset);
      const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 500) : 100;
      const safeOffset = Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : 0;
      return await exec(
        'SELECT * FROM player_events WHERE steamid=? AND event=? AND server_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
        [sid, 'note', safeServerId, safeLimit, safeOffset]
      );
    },
    async deletePlayerNote(entry = {}) {
      const sid = String(entry?.steamid || '').trim();
      const idNum = Number(entry?.id ?? entry?.note_id ?? entry?.noteId);
      const serverIdNum = Number(entry?.server_id ?? entry?.serverId);
      if (!sid || !Number.isFinite(idNum) || !Number.isFinite(serverIdNum)) return 0;
      const safeId = Math.max(1, Math.trunc(idNum));
      const safeServerId = Math.trunc(serverIdNum);
      const result = await exec('DELETE FROM player_events WHERE id=? AND steamid=? AND event=? AND server_id=?', [safeId, sid, 'note', safeServerId]);
      return result?.affectedRows || 0;
    },
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
    async getF7TargetSummary(serverId, targetSteamId, { windowMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
      const serverIdNum = Number(serverId);
      const steamId = trimOrNull(targetSteamId);
      if (!Number.isFinite(serverIdNum) || !steamId) return null;
      const windowMsNum = Number(windowMs);
      const sinceIso = Number.isFinite(windowMsNum) && windowMsNum > 0
        ? normaliseDateTime(new Date(Date.now() - Math.floor(windowMsNum)))
        : null;
      const summaryRows = await exec(`
        SELECT
          COUNT(*) AS total_reports,
          SUM(CASE WHEN ? IS NOT NULL AND created_at >= ? THEN 1 ELSE 0 END) AS recent_reports,
          MIN(created_at) AS first_report_at,
          MAX(created_at) AS last_report_at,
          COUNT(DISTINCT reporter_steamid) AS reporter_count
        FROM f7_reports
        WHERE server_id=? AND target_steamid=?
      `, [sinceIso, sinceIso, serverIdNum, steamId]);
      const summaryRow = summaryRows?.[0] || {};
      const categories = await exec(`
        SELECT category, COUNT(*) AS total
        FROM f7_reports
        WHERE server_id=? AND target_steamid=? AND category IS NOT NULL AND category <> ''
        GROUP BY category
        ORDER BY total DESC, category ASC
        LIMIT 5
      `, [serverIdNum, steamId]);
      return {
        serverId: serverIdNum,
        targetSteamId: steamId,
        totalReports: Number(summaryRow.total_reports) || 0,
        recentReports: Number(summaryRow.recent_reports) || 0,
        firstReportedAt: summaryRow.first_report_at || null,
        lastReportedAt: summaryRow.last_report_at || null,
        reporterCount: Number(summaryRow.reporter_count) || 0,
        recentWindowMs: Number.isFinite(windowMsNum) && windowMsNum > 0 ? Math.floor(windowMsNum) : null,
        topCategories: Array.isArray(categories)
          ? categories.map((row) => ({
            category: trimOrNull(row.category) || 'Unspecified',
            count: Number(row.total) || 0
          }))
          : []
      };
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
      const combatPayload = entry?.combat_log ?? entry?.combatLog ?? entry?.combat_log_json ?? entry?.combatLogJson;
      const combatLogSerialized = serializeCombatLogPayload(combatPayload);
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
      const combatPayload = entry?.combat_log ?? entry?.combatLog ?? entry?.combat_log_json ?? entry?.combatLogJson;
      const combatLogSerialized = serializeCombatLogPayload(combatPayload);
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
    async saveServerDiscordIntegration(serverId,{ bot_token=null,command_bot_token=null,guild_id=null,channel_id=null,status_message_id=null,config_json=null }){
      await exec(`
        INSERT INTO server_discord_integrations(server_id, bot_token, command_bot_token, guild_id, channel_id, status_message_id, config_json)
        VALUES(?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          bot_token=VALUES(bot_token),
          command_bot_token=VALUES(command_bot_token),
          guild_id=VALUES(guild_id),
          channel_id=VALUES(channel_id),
          status_message_id=VALUES(status_message_id),
          config_json=VALUES(config_json)
      `,[serverId, bot_token, command_bot_token, guild_id, channel_id, status_message_id, config_json]);
    },
    async deleteServerDiscordIntegration(serverId){
      const result = await exec('DELETE FROM server_discord_integrations WHERE server_id=?',[serverId]);
      if (result == null) return 0;
      if (typeof result.affectedRows === 'number') return result.affectedRows;
      if (Array.isArray(result) && typeof result[0]?.affectedRows === 'number') return result[0].affectedRows;
      return 0;
    },
    async getNextDiscordTicketNumber(guildId){
      if (!guildId) return 1;
      const rows = await exec('SELECT MAX(ticket_number) AS max_number FROM discord_tickets WHERE guild_id=?', [String(guildId)]);
      const row = Array.isArray(rows) ? rows[0] : rows;
      const current = Number(row?.max_number ?? row?.MAX_NUMBER);
      return Number.isFinite(current) ? current + 1 : 1;
    },
    async createDiscordTicket({ team_id=null, server_id=null, guild_id=null, channel_id=null, ticket_number=null, subject=null, details=null, created_by=null, created_by_tag=null }){
      const guildId = guild_id ? String(guild_id) : null;
      let number = Number(ticket_number);
      if (!Number.isFinite(number) || number <= 0) {
        number = await this.getNextDiscordTicketNumber(guildId);
      }
      const previewToken = await generateUniqueTicketPreviewToken();
      const result = await exec(
        `INSERT INTO discord_tickets(team_id, server_id, guild_id, channel_id, ticket_number, subject, details, created_by, created_by_tag, preview_token, status)
         VALUES(?,?,?,?,?,?,?,?,?,?,'open')`,
        [
          team_id ?? null,
          server_id ?? null,
          guildId,
          channel_id ?? null,
          number,
          subject ?? null,
          details ?? null,
          created_by ?? null,
          created_by_tag ?? null,
          previewToken
        ]
      );
      const insertedId = typeof result?.insertId === 'number'
        ? result.insertId
        : Array.isArray(result) && typeof result[0]?.insertId === 'number'
          ? result[0].insertId
          : null;
      if (Number.isFinite(insertedId)) {
        const rows = await exec('SELECT * FROM discord_tickets WHERE id=?', [insertedId]);
        return rows[0] || null;
      }
      const fallback = await exec('SELECT * FROM discord_tickets WHERE channel_id=?', [channel_id ?? null]);
      return Array.isArray(fallback) ? fallback[0] || null : fallback || null;
    },
    async getDiscordTicketByChannel(channelId){
      if (!channelId) return null;
      const rows = await exec('SELECT * FROM discord_tickets WHERE channel_id=?', [channelId]);
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async listDiscordTicketsForServer(serverId, { status='open', limit=25 } = {}){
      const numericServerId = Number(serverId);
      if (!Number.isFinite(numericServerId)) return [];
      const where = ['server_id=?'];
      const params = [numericServerId];
      const statusValue = typeof status === 'string' && status.trim().length ? status.trim().toLowerCase() : '';
      if (statusValue && statusValue !== 'all') {
        where.push('LOWER(status)=?');
        params.push(statusValue);
      }
      const limitValue = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 25;
      params.push(limitValue);
      const sql = `SELECT * FROM discord_tickets WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`;
      const rows = await exec(sql, params);
      return Array.isArray(rows) ? rows : [];
    },
    async getDiscordTicketById(serverId, ticketId){
      const numericServerId = Number(serverId);
      const numericTicketId = Number(ticketId);
      if (!Number.isFinite(numericServerId) || !Number.isFinite(numericTicketId)) return null;
      const rows = await exec('SELECT * FROM discord_tickets WHERE server_id=? AND id=?', [numericServerId, numericTicketId]);
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async getDiscordTicketForTeam(teamId, ticketId){
      const numericTeamId = Number(teamId);
      const numericTicketId = Number(ticketId);
      if (!Number.isFinite(numericTeamId) || !Number.isFinite(numericTicketId)) return null;
      const rows = await exec('SELECT * FROM discord_tickets WHERE team_id=? AND id=?', [numericTeamId, numericTicketId]);
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async getDiscordTicketForTeamByPreviewToken(teamId, previewToken){
      const numericTeamId = Number(teamId);
      const token = typeof previewToken === 'string' ? previewToken.trim() : '';
      if (!Number.isFinite(numericTeamId) || !token) return null;
      const rows = await exec('SELECT * FROM discord_tickets WHERE team_id=? AND preview_token=?', [numericTeamId, token]);
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async closeDiscordTicket(channelId, { closed_by=null, closed_by_tag=null, close_reason=null } = {}){
      if (!channelId) return null;
      await exec(
        `UPDATE discord_tickets
         SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?, closed_by_tag=?, close_reason=?, updated_at=CURRENT_TIMESTAMP
         WHERE channel_id=?`,
        [closed_by ?? null, closed_by_tag ?? null, close_reason ?? null, channelId]
      );
      const rows = await exec('SELECT * FROM discord_tickets WHERE channel_id=?', [channelId]);
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async replaceDiscordTicketDialogEntries(ticketId, entries = []){
      const numericTicketId = Number(ticketId);
      if (!Number.isFinite(numericTicketId)) return 0;
      await exec('DELETE FROM discord_ticket_dialog_entries WHERE ticket_id=?', [numericTicketId]);
      if (!Array.isArray(entries) || entries.length === 0) return 0;
      let inserted = 0;
      for (const entry of entries) {
        if (!entry) continue;
        const messageId = typeof entry.message_id === 'string'
          ? entry.message_id.trim()
          : (typeof entry.messageId === 'string' ? entry.messageId.trim() : '');
        if (!messageId) continue;
        const role = typeof entry.role === 'string' && entry.role.trim().toLowerCase() === 'requester'
          ? 'requester'
          : 'staff';
        const authorId = typeof entry.author_id === 'string'
          ? entry.author_id
          : (typeof entry.authorId === 'string' ? entry.authorId : null);
        const authorTag = typeof entry.author_tag === 'string'
          ? entry.author_tag
          : (typeof entry.authorTag === 'string' ? entry.authorTag : null);
        const content = typeof entry.content === 'string'
          ? entry.content
          : (typeof entry.message === 'string' ? entry.message : null);
        if (!content) continue;
        const postedAtRaw = entry.posted_at ?? entry.postedAt ?? null;
        const postedAt = normaliseDateTime(postedAtRaw);
        await exec(
          `INSERT INTO discord_ticket_dialog_entries(ticket_id, message_id, role, author_id, author_tag, content, posted_at)
           VALUES(?,?,?,?,?,?,?)`,
          [numericTicketId, messageId, role, authorId ?? null, authorTag ?? null, content, postedAt]
        );
        inserted += 1;
      }
      return inserted;
    },
    async listDiscordTicketDialogEntries(ticketId){
      const numericTicketId = Number(ticketId);
      if (!Number.isFinite(numericTicketId)) return [];
      return await exec(
        `SELECT ticket_id, message_id, role, author_id, author_tag, content, posted_at
         FROM discord_ticket_dialog_entries
         WHERE ticket_id=?
         ORDER BY posted_at ASC, message_id ASC`,
        [numericTicketId]
      );
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
