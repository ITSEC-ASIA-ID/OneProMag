/**
 * Security headers, applied by server/index.js to every response.
 *
 * Kept in its own module so the values can be asserted without booting a server
 * (server/index.js starts listening the moment it is imported).
 *
 * `frame-ancestors 'none'` is the header that matters most here. The session
 * cookie is HttpOnly, which protects it from script but not from a framed copy of
 * the app: a page inside an iframe runs with the visitor's real session, so every
 * button in it works — including delete. `X-Frame-Options` says the same thing to
 * browsers that predate CSP Level 2, and costs one line.
 *
 * `script-src 'self'` is strict on purpose: there is no `eval`, no `new Function`
 * and no inline <script> anywhere in the app, so nothing needs an exemption.
 * `style-src` is NOT strict yet — 34 inline `style=` attributes would all stop
 * applying — and removing that exemption is what the split work exists to enable.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
});
