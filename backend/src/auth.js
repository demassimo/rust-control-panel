import jwt from 'jsonwebtoken';

export function signToken(user, secret) {
  const payload = {
    uid: user.id,
    role: user.role || 'user',
    username: user.username
  };
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function extractQueryToken(req) {
  const candidates = [
    req.query?.token,
    req.query?.auth,
    req.query?.authToken,
    req.query?.access_token
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function authMiddleware(secret, options = {}) {
  const { allowQueryToken = false } = options;
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && allowQueryToken) {
      token = extractQueryToken(req);
    }
    if (!token) return res.status(401).json({ error: 'missing_token' });
    try {
      const payload = jwt.verify(token, secret);
      req.user = payload;
      req.authToken = token;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' });
    }
  };
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
