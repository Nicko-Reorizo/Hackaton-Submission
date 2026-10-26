import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';

// Firebase's react-native export includes this factory, while its web-facing
// TypeScript entry point omits it. Metro selects the native runtime export.
const nativeAuth = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};

export const authPersistence = nativeAuth.getReactNativePersistence(AsyncStorage);
