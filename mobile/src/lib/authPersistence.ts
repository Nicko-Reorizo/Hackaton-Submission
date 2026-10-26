import { browserLocalPersistence } from 'firebase/auth';

// Metro uses authPersistence.native.ts on Android/iOS and this file on web.
export const authPersistence = browserLocalPersistence;
