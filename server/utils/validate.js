/** Input sanitisation and shared error helpers. */

/** An error that maps to a specific HTTP status and a user-facing message. */
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

export const badRequest = (message, code) => new ApiError(400, message, code);
export const unauthorized = (message = 'Not authorised.', code) => new ApiError(401, message, code);
export const forbidden = (message = 'Not allowed.', code) => new ApiError(403, message, code);
export const notFound = (message, code) => new ApiError(404, message, code);
export const conflict = (message, code) => new ApiError(409, message, code);

/**
 * Trim, collapse whitespace, strip control characters and angle brackets.
 * Angle brackets go because these strings are rendered in the admin dashboard;
 * React escapes them anyway, but keeping them out of storage means a stray
 * `<script>` never shows up in a CSV export or log line either.
 */
export function cleanString(value, { max = 200 } = {}) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function requireString(value, field, { max = 200, min = 1 } = {}) {
  const cleaned = cleanString(value, { max });
  if (cleaned.length < min) throw badRequest(`${field} is required.`);
  return cleaned;
}

export function cleanEmail(value, field = 'Email') {
  const email = cleanString(value, { max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest(`Enter a valid ${field.toLowerCase()}.`);
  return email;
}

/**
 * Account IDs become part of QR payloads and URLs, so restrict them to an
 * unambiguous uppercase alphanumeric set.
 */
export function cleanAccountId(value, field = 'ID') {
  const id = cleanString(value, { max: 32 }).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (id.length < 3) throw badRequest(`${field} must be at least 3 characters (letters and numbers).`);
  return id;
}

export function requirePassword(value) {
  const password = String(value ?? '');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
  if (password.length > 128) throw badRequest('Password is too long.');
  return password;
}
