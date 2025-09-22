import jwt from 'jsonwebtoken';

export function signToken(user, secret) {
  const payload = {
    uid: user.id,
    role: user.role || 'user',
    username: user.username
  };
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function authMiddleware(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });
    try {
      const payload = jwt.verify(token, secret);
      req.user = payload;
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
