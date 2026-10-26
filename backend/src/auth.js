import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { HttpError } from './errors.js';

export function createTokenVerifier(config) {
  const app = getApps()[0] || initializeApp({
    projectId: config.firebaseProjectId,
    credential: config.firebaseClientEmail && config.firebasePrivateKey
      ? cert({ projectId: config.firebaseProjectId, clientEmail: config.firebaseClientEmail, privateKey: config.firebasePrivateKey })
      : applicationDefault(),
  });
  return (token) => getAuth(app).verifyIdToken(token, true);
}

export const getAdminAuth = () => getAuth(getApps()[0]);

export function authorizeLgu(config, Account, Office) {
  return async (req, _res, next) => {
    try {
      if (req.user.firebase?.sign_in_provider !== 'password') throw new HttpError(403, 'An LGU email/password account is required.');
      if (config.lguUids.has(req.user.uid)) {
        req.lgu = { role: 'admin', name: 'Administrator', categories: [], office: null };
      } else {
        const account = await Account.findById(req.user.uid).lean();
        const office = account?.active ? await Office.findById(account.office_id).lean() : null;
        if (!account?.active || !office) throw new HttpError(403, 'This account has no active LGU office assignment. Contact the administrator.');
        req.lgu = { ...account, role: 'official', office,
          categories: account.categories.filter(category => office.categories.includes(category)) };
      }
      next();
    } catch (error) { next(error); }
  };
}

export function requireAdministrator(req, _res, next) {
  if (req.lgu?.role !== 'admin') return next(new HttpError(403, 'Administrator access is required.'));
  next();
}

export function authenticate(verifyToken) {
  return async (req, _res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) return next(new HttpError(401, 'Sign in before using the reporting service.'));
    try {
      req.user = await verifyToken(match[1]);
      if (!req.user?.uid) throw new Error('Missing UID');
      next();
    } catch {
      next(new HttpError(401, 'Your session has expired or is invalid. Sign in again.'));
    }
  };
}

export function requireCitizen(req, _res, next) {
  if (!['anonymous', 'password'].includes(req.user.firebase?.sign_in_provider)) {
    return next(new HttpError(403, 'Sign in with a citizen account or continue as a guest.'));
  }
  next();
}
