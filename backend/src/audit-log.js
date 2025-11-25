import { db } from './db/index.js';

export async function recordAuditEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (typeof db.createAuditEvent !== 'function') return null;
  try {
    return await db.createAuditEvent(event);
  } catch (err) {
    console.error('failed to record audit event', err);
    return null;
  }
}

