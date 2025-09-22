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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`);
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
    },
    async countUsers(){ const r = await exec('SELECT COUNT(*) c FROM users'); const row = Array.isArray(r)?r[0]:r; return row.c ?? row['COUNT(*)']; },
    async createUser(u, hash){ await exec('INSERT INTO users(username,password_hash) VALUES(?,?)',[u,hash]); },
    async getUserByUsername(u){ const r = await exec('SELECT * FROM users WHERE username=?',[u]); return r[0]||null; },
    async updateUserPassword(id, hash){ await exec('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async listServers(){ return await exec('SELECT id,name,host,port,tls,created_at FROM servers ORDER BY id DESC'); },
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
      await exec(`INSERT INTO players(steamid,persona,avatar,country,profileurl,vac_banned)
                  VALUES(?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE persona=VALUES(persona), avatar=VALUES(avatar),
                    country=VALUES(country), profileurl=VALUES(profileurl), vac_banned=VALUES(vac_banned)`,
                  [p.steamid,p.persona,p.avatar,p.country,p.profileurl,p.vac_banned?1:0]);
    },
    async getPlayer(steamid){ const r = await exec('SELECT * FROM players WHERE steamid=?',[steamid]); return r[0]||null; },
    async listPlayers({limit=100,offset=0}={}){ return await exec('SELECT * FROM players ORDER BY updated_at DESC LIMIT ? OFFSET ?',[limit,offset]); },
    async addPlayerEvent(ev){ await exec('INSERT INTO player_events(steamid,server_id,event,note) VALUES(?,?,?,?)',[ev.steamid, ev.server_id||null, ev.event, ev.note||null]); },
    async listPlayerEvents(steamid,{limit=100,offset=0}={}){ return await exec('SELECT * FROM player_events WHERE steamid=? ORDER BY id DESC LIMIT ? OFFSET ?',[steamid,limit,offset]); },
  };
}
