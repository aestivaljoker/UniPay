/**
 * The UniPay QR contract.
 *
 * A student QR carries an identifier and NOTHING ELSE — no name, no balance.
 * The merchant app resolves the identifier against the server to get the
 * current balance, so a stale or photographed QR can never assert a balance.
 *
 * Canonical payload (what we generate):
 *   {"type":"UNIPAY_STUDENT","studentId":"GU2026DEV","v":1}
 *
 * We also accept the compact legacy form `UNIPAY:GU2026DEV` so a printed card
 * or a hand-made QR still scans during a demo.
 */

export const QR_VERSION = 1;

export function buildStudentQrPayload(studentId) {
  return JSON.stringify({ type: 'UNIPAY_STUDENT', studentId, v: QR_VERSION });
}

/** Short form kept on the student record for display/debugging. */
export function buildStudentQrIdentifier(studentId) {
  return `UNIPAY:${studentId}`;
}

/**
 * Parse whatever the camera decoded.
 * Returns `{ ok: true, studentId }` or `{ ok: false, message }`.
 */
export function parseStudentQr(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, message: 'Invalid UniPay QR code.' };

  // JSON form
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type !== 'UNIPAY_STUDENT') return { ok: false, message: 'Invalid UniPay QR code.' };
      const studentId = normaliseId(parsed.studentId);
      if (!studentId) return { ok: false, message: 'Invalid UniPay QR code.' };
      return { ok: true, studentId };
    } catch {
      return { ok: false, message: 'Invalid UniPay QR code.' };
    }
  }

  // Compact form: UNIPAY:GU2026DEV
  const match = /^UNIPAY:([A-Za-z0-9]{3,32})$/.exec(text);
  if (match) {
    const studentId = normaliseId(match[1]);
    if (studentId) return { ok: true, studentId };
  }

  return { ok: false, message: 'Invalid UniPay QR code.' };
}

function normaliseId(value) {
  const id = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return id.length >= 3 && id.length <= 32 ? id : null;
}
