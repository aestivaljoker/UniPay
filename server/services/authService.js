/** Signup / login for students, merchants and the seeded admin. */

import bcrypt from 'bcryptjs';
import { COLLECTIONS, readData, updateData } from '../utils/jsonDb.js';
import { buildStudentQrIdentifier } from '../utils/qr.js';
import { createSession } from './sessionService.js';
import { publicMerchant, publicStudent } from './ledgerService.js';
import { conflict, unauthorized } from '../utils/validate.js';
import { emitEvent } from '../socket/realtime.js';

const ROUNDS = 10;

const byEmail = (rows, email) => rows.find((r) => String(r.email).toLowerCase() === email);
const byId = (rows, id) => rows.find((r) => String(r.id).toUpperCase() === String(id).toUpperCase());

export async function studentSignup({ name, email, studentId, password, course = '', year = null }) {
  const [students, merchants] = await Promise.all([
    readData(COLLECTIONS.students, []),
    readData(COLLECTIONS.merchants, []),
  ]);

  if (byEmail(students, email) || byEmail(merchants, email)) {
    throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
  }
  if (byId(students, studentId)) {
    throw conflict('This Student ID is already registered.', 'STUDENT_ID_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  const student = {
    id: studentId,
    name,
    email,
    passwordHash,
    walletBalance: 0,
    qrIdentifier: buildStudentQrIdentifier(studentId),
    course,
    year,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  await updateData(COLLECTIONS.students, (rows) => {
    // Re-check inside the lock: two signups racing on the same ID would both
    // pass the check above.
    if (byId(rows, studentId)) throw conflict('This Student ID is already registered.', 'STUDENT_ID_TAKEN');
    if (byEmail(rows, email)) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
    rows.push(student);
  });

  emitEvent('admin:accountCreated', { role: 'STUDENT', account: publicStudent(student) });

  return sessionFor('STUDENT', student, publicStudent(student));
}

export async function merchantSignup({ ownerName, shopName, email, merchantId, password, category = '', location = '' }) {
  const [students, merchants] = await Promise.all([
    readData(COLLECTIONS.students, []),
    readData(COLLECTIONS.merchants, []),
  ]);

  if (byEmail(students, email) || byEmail(merchants, email)) {
    throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
  }
  if (byId(merchants, merchantId)) {
    throw conflict('This Merchant ID is already registered.', 'MERCHANT_ID_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  const merchant = {
    id: merchantId,
    ownerName,
    shopName,
    email,
    passwordHash,
    pendingReceivable: 0,
    lifetimeSettled: 0,
    category,
    location,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  await updateData(COLLECTIONS.merchants, (rows) => {
    if (byId(rows, merchantId)) throw conflict('This Merchant ID is already registered.', 'MERCHANT_ID_TAKEN');
    if (byEmail(rows, email)) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
    rows.push(merchant);
  });

  emitEvent('admin:accountCreated', { role: 'MERCHANT', account: publicMerchant(merchant) });

  return sessionFor('MERCHANT', merchant, publicMerchant(merchant));
}

export async function login({ role, email, password }) {
  const collection =
    role === 'STUDENT' ? COLLECTIONS.students : role === 'MERCHANT' ? COLLECTIONS.merchants : COLLECTIONS.admins;

  const rows = await readData(collection, []);
  const account = byEmail(rows, email);

  // Compare against a dummy hash when the account is missing so a wrong email
  // and a wrong password take the same amount of time.
  const hash = account?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);

  if (!account || !ok) throw unauthorized('Incorrect email or password.', 'BAD_CREDENTIALS');
  if (account.status === 'BLOCKED') throw unauthorized('This account is blocked.', 'ACCOUNT_BLOCKED');

  const profile =
    role === 'STUDENT'
      ? publicStudent(account)
      : role === 'MERCHANT'
        ? publicMerchant(account)
        : { id: account.id, name: account.name, email: account.email, role: 'ADMIN' };

  return sessionFor(role, account, profile);
}

function sessionFor(role, account, profile) {
  const token = createSession({ role, accountId: account.id, email: account.email });
  return { token, role, profile };
}

export async function currentProfile({ role, accountId }) {
  if (role === 'STUDENT') {
    const students = await readData(COLLECTIONS.students, []);
    return publicStudent(byId(students, accountId));
  }
  if (role === 'MERCHANT') {
    const merchants = await readData(COLLECTIONS.merchants, []);
    return publicMerchant(byId(merchants, accountId));
  }
  const admins = await readData(COLLECTIONS.admins, []);
  const admin = byId(admins, accountId);
  return admin ? { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' } : null;
}
