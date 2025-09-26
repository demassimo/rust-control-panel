import jwt from 'jsonwebtoken';

export function signToken(user, secret) {
  const payload = {
    uid: user.id,
    role: user.role || 'user',
    username: user.username
  };
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function authMiddleware(secret, options = {}) {
  const { loadUserContext } = options;
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });
    try {
      const payload = jwt.verify(token, secret);
      req.user = payload;
      if (typeof loadUserContext === 'function') {
        try {
          const context = await loadUserContext(payload.uid);
          if (!context) return res.status(401).json({ error: 'invalid_user' });
          req.authUser = context;
        } catch (err) {
          console.error('auth context load failed', err);
          return res.status(500).json({ error: 'auth_context_error' });
        }
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' });
    }
  };
}

export function requireAdmin(req, res, next) {
  const hasPermission = req.authUser?.permissions?.global?.manageUsers;
  if (req.user?.role !== 'admin' && !hasPermission) return res.status(403).json({ error: 'forbidden' });
  next();
}
