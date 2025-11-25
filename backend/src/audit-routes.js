import express from 'express';
import { recordAuditEvent } from './audit-log.js';

export function createAuditRouter() {
  const router = express.Router();

  router.post('/events', async (req, res) => {
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const { action, serverId = null, metadata = {} } = req.body || {};
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'missing_action' });
    }
    try {
      await recordAuditEvent({
        team_id: user.activeTeamId ?? null,
        server_id: Number.isFinite(Number(serverId)) ? Number(serverId) : null,
        source: 'panel',
        actor_type: 'panel_user',
        actor_id: user.id,
        actor_name: user.username ?? null,
        action,
        metadata
      });
      res.status(204).end();
    } catch (err) {
      console.error('failed to record ui audit event', err);
      res.status(500).json({ error: 'audit_error' });
    }
  });

  router.get('/events', async (req, res) => {
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!user.permissions?.global?.manageServers && !user.superuser) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const teamId = user.activeTeamId;
    if (!Number.isFinite(Number(teamId))) {
      return res.json({ items: [], nextCursor: null });
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
    const dbApi = req.app.locals.db;
    if (!dbApi || typeof dbApi.listAuditEventsForTeam !== 'function') {
      return res.status(501).json({ error: 'not_supported' });
    }
    try {
      const result = await dbApi.listAuditEventsForTeam(teamId, { limit, search, cursor });
      res.json(result);
    } catch (err) {
      console.error('failed to list audit events', err);
      res.status(500).json({ error: 'audit_error' });
    }
  });

  return router;
}

