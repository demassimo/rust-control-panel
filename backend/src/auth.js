import jwt from 'jsonwebtoken';

export function signToken(userId, secret) {
  return jwt.sign({ uid: userId }, secret, { expiresIn: '7d' });
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
