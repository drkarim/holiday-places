import { canEditTrip } from '../lib/trips.js';

export function bearerToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' ? token : null;
}

// Admin-only actions (creating trips): the API_TOKEN from the server's env.
export function requireApiToken(req, res, next) {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'Server misconfigured: API_TOKEN is not set.' });
  }
  if (bearerToken(req) !== expected) {
    return res.status(401).json({ error: 'Unauthorized. Send "Authorization: Bearer <API_TOKEN>".' });
  }
  next();
}

// Changes to a trip's places: that trip's edit key, or the admin API_TOKEN.
// Expects req.trip (set by the trip loader).
export function requireTripEditor(req, res, next) {
  if (canEditTrip(req.trip, bearerToken(req))) return next();
  res.status(401).json({
    error: `Editing "${req.trip?.name || 'this trip'}" needs its edit link. Send "Authorization: Bearer <edit key>".`,
  });
}
