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
      CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS player_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steamid TEXT NOT NULL,
        server_id INTEGER,
        event TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE SET NULL
      );
      `);
    },
    async countUsers(){ const r = await dbh.get('SELECT COUNT(*) c FROM users'); return r.c; },
    async createUser(u, hash){ await dbh.run('INSERT INTO users(username,password_hash) VALUES(?,?)',[u,hash]); },
    async getUserByUsername(u){ return await dbh.get('SELECT * FROM users WHERE username=?',[u]); },
    async updateUserPassword(id, hash){ await dbh.run('UPDATE users SET password_hash=? WHERE id=?',[hash,id]); },
    async listServers(){ return await dbh.all('SELECT id,name,host,port,tls,created_at FROM servers ORDER BY id DESC'); },
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
      const row = await dbh.get('SELECT id FROM players WHERE steamid=?',[p.steamid]);
      if (row) {
        await dbh.run('UPDATE players SET persona=?,avatar=?,country=?,profileurl=?,vac_banned=?,updated_at=? WHERE steamid=?',
          [p.persona,p.avatar,p.country,p.profileurl,p.vac_banned?1:0,now,p.steamid]);
        return row.id;
      } else {
        const r = await dbh.run('INSERT INTO players(steamid,persona,avatar,country,profileurl,vac_banned,updated_at) VALUES(?,?,?,?,?,?,?)',
          [p.steamid,p.persona,p.avatar,p.country,p.profileurl,p.vac_banned?1:0,now]);
        return r.lastID;
      }
    },
    async getPlayer(steamid){ return await dbh.get('SELECT * FROM players WHERE steamid=?',[steamid]); },
    async listPlayers({limit=100,offset=0}={}){ return await dbh.all('SELECT * FROM players ORDER BY updated_at DESC LIMIT ? OFFSET ?',[limit,offset]); },
    async addPlayerEvent(ev){ await dbh.run('INSERT INTO player_events(steamid,server_id,event,note) VALUES(?,?,?,?)',[ev.steamid, ev.server_id||null, ev.event, ev.note||null]); },
    async listPlayerEvents(steamid,{limit=100,offset=0}={}){ return await dbh.all('SELECT * FROM player_events WHERE steamid=? ORDER BY id DESC LIMIT ? OFFSET ?',[steamid,limit,offset]); },
  };
}
