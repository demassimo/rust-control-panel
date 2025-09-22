import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import bcrypt from 'bcrypt';
import { db, initDb } from './db/index.js';
import { authMiddleware, signToken } from './auth.js';
import { RustWebRcon } from './rcon.js';

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' } });

const PORT = parseInt(process.env.PORT || '8787', 10);
const BIND = process.env.BIND || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

await initDb();

const rconMap = new Map();
function getOrCreateRcon(row) {
  if (rconMap.has(row.id)) return rconMap.get(row.id);
  const client = new RustWebRcon({ host: row.host, port: row.port, password: row.password, tls: !!row.tls });
  client.on('message', (msg) => io.to(`srv:${row.id}`).emit('console', msg));
  client.on('error', (e) => io.to(`srv:${row.id}`).emit('error', e.message || String(e)));
  rconMap.set(row.id, client);
  return client;
}

// --- Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  db.getUserByUsername(username).then(async (row) => {
    if (!row) return res.status(401).json({ error: 'invalid_login' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_login' });
    const token = signToken(row.id, process.env.JWT_SECRET || 'dev');
    res.json({ token, username: row.username });
  }).catch(()=>res.status(500).json({ error: 'db_error' }));
});

app.post('/api/password', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'weak_password' });
  const hash = bcrypt.hashSync(newPassword, 10);
  try {
    await db.updateUserPassword(req.user.uid, hash);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'db_error' }); }
});

// --- Servers CRUD
app.get('/api/servers', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  try { res.json(await db.listServers()); } catch { res.status(500).json({ error: 'db_error' }); }
});
app.post('/api/servers', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  const { name, host, port, password, tls } = req.body || {};
  if (!name || !host || !port || !password) return res.status(400).json({ error: 'missing_fields' });
  try { const id = await db.createServer({name,host,port:parseInt(port,10),password,tls:tls?1:0}); res.json({ id }); }
  catch { res.status(500).json({ error: 'db_error' }); }
});
app.patch('/api/servers/:id', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  try { const n = await db.updateServer(req.params.id, req.body||{}); res.json({ updated: n }); }
  catch { res.status(500).json({ error: 'db_error' }); }
});
app.delete('/api/servers/:id', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  try { const n = await db.deleteServer(req.params.id); res.json({ deleted: n }); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

// --- RCON
app.post('/api/rcon/:id', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req, res) => {
  const { id } = req.params;
  const { cmd } = req.body || {};
  if (!cmd) return res.status(400).json({ error: 'missing_cmd' });
  try {
    const row = await db.getServer(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const client = getOrCreateRcon(row);
    const reply = await client.command(cmd);
    res.json(reply);
  } catch (e) {
    res.status(500).json({ error: e.message || 'rcon_error' });
  }
});

// --- Players & Steam sync
app.get('/api/players', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req,res) => {
  const limit = Math.min(parseInt(req.query.limit||'100',10), 500);
  const offset = parseInt(req.query.offset||'0',10);
  const rows = await db.listPlayers({limit,offset});
  res.json(rows);
});
app.get('/api/players/:steamid', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req,res) => {
  const p = await db.getPlayer(req.params.steamid);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const events = await db.listPlayerEvents(req.params.steamid, {limit:50,offset:0});
  res.json({ ...p, events });
});
app.post('/api/players/:steamid/event', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req,res) => {
  const { steamid } = req.params;
  const { server_id, event, note } = req.body || {};
  if (!event) return res.status(400).json({ error: 'missing_event' });
  await db.addPlayerEvent({ steamid, server_id, event, note });
  res.json({ ok: true });
});

async function fetchSteamProfiles(steamids, key) {
  const ids = steamids.slice(0, 100).join(',');
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('steam_api_error');
  const j = await r.json();
  const players = j?.response?.players || [];
  const bansUrl = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids)}`;
  const rb = await fetch(bansUrl);
  let bans = {};
  if (rb.ok) {
    const jb = await rb.json();
    for (const b of (jb?.players||[])) bans[b.SteamId] = b.VACBanned ? 1 : 0;
  }
  for (const p of players) p.vac_banned = bans[p.steamid] || 0;
  return players;
}

app.post('/api/steam/sync', authMiddleware(process.env.JWT_SECRET || 'dev'), async (req,res) => {
  const { steamids } = req.body || {};
  if (!Array.isArray(steamids) || steamids.length === 0) return res.status(400).json({ error: 'missing_steamids' });
  if (!process.env.STEAM_API_KEY) return res.status(400).json({ error: 'no_steam_api_key' });
  try {
    const list = await fetchSteamProfiles(steamids, process.env.STEAM_API_KEY);
    for (const p of list) {
      await db.upsertPlayer({
        steamid: p.steamid,
        persona: p.personaname,
        avatar: p.avatarfull,
        country: p.loccountrycode || null,
        profileurl: p.profileurl || null,
        vac_banned: p.vac_banned || 0
      });
    }
    res.json({ updated: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'steam_sync_failed' });
  }
});

// --- sockets
io.on('connection', (socket) => {
  socket.on('join-server', async (serverId) => {
    const row = await db.getServer(serverId);
    if (!row) return;
    socket.join(`srv:${row.id}`);
    try {
      const client = getOrCreateRcon(row);
      await client.ensure();
      client.command('status').catch(()=>{});
    } catch (e) { socket.emit('error', e.message || String(e)); }
  });
  socket.on('leave-server', (serverId) => socket.leave(`srv:${serverId}`));
});

server.listen(PORT, BIND, () => {
  console.log(`API on http://${BIND}:${PORT}`);
});
