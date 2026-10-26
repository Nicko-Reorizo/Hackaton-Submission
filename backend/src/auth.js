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
  if (req.user.firebase?.sign_in_provider !== 'anonymous') {
    return next(new HttpError(403, 'This action requires a citizen guest account.'));
  }
  next();
}

export function requireLgu(lguUids) {
  return (req, _res, next) => {
    const passwordSignIn = req.user.firebase?.sign_in_provider === 'password';
    if (!passwordSignIn || !(req.user.lgu === true || lguUids.has(req.user.uid))) {
      return next(new HttpError(403, 'This account is not authorized for the LGU dashboard. Ask your administrator to grant access.'));
    }
    next();
  };
}
