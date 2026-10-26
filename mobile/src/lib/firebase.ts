import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { authPersistence } from './authPersistence';
import { firebaseConfig, missingConfig } from './config';

export function getFirebase() {
  if (missingConfig.length) throw new Error('Complete mobile/.env before connecting to Firebase.');
  const exists = getApps().length > 0;
  const app = exists ? getApp() : initializeApp(firebaseConfig);
  const auth = exists ? getAuth(app) : initializeAuth(app, { persistence: authPersistence });
  return { auth };
}
