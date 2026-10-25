export function requireApiToken(req, res, next) {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'Server misconfigured: API_TOKEN is not set.' });
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized. Send "Authorization: Bearer <API_TOKEN>".' });
  }
  next();
}
