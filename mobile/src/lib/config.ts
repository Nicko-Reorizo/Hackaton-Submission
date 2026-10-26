// Expo statically substitutes EXPO_PUBLIC_ values; keep these direct property accesses.
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const missingConfig = [
  ...Object.entries(firebaseConfig).filter(([key, value]) => key !== 'storageBucket' && !value).map(([key]) => `Firebase ${key}`),
  ...(!/^https?:\/\//.test(apiUrl) ? ['EXPO_PUBLIC_API_URL (http:// or https://)'] : []),
];
