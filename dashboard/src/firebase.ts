import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries({
  VITE_FIREBASE_API_KEY: config.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_APP_ID: config.appId,
}).filter(([, value]) => !value?.trim()).map(([key]) => key);

let auth: Auth | null = null;
let configurationError = '';

if (missing.length) {
  configurationError = `Add ${missing.join(', ')} to dashboard/.env, then restart the dashboard.`;
} else {
  try {
    auth = getAuth(initializeApp(config));
  } catch {
    configurationError = 'Firebase could not initialize. Check dashboard/.env and restart the dashboard.';
  }
}

export { auth, configurationError };
