export interface CitizenIdentity { uid: string; isAnonymous: boolean }
export type CitizenAuthMode = 'login' | 'signup';
export interface CitizenCredentials { email: string; password: string; confirmation: string }
export interface CitizenAuthActions<TUser extends CitizenIdentity> {
  currentUser: TUser | null;
  signIn: (email: string, password: string) => Promise<TUser>;
  createAccount: (email: string, password: string) => Promise<TUser>;
  linkGuest: (user: TUser, email: string, password: string) => Promise<TUser>;
  signInGuest: () => Promise<TUser>;
}

class InputError extends Error {}

export function validateCitizenEmail(value: string): string {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.');
  return email;
}

export function validateCitizenCredentials(mode: CitizenAuthMode, input: CitizenCredentials) {
  const email = validateCitizenEmail(input.email);
  if (!input.password) throw new InputError('Enter your password.');
  if (mode === 'signup') {
    if (input.password.length < 8) throw new InputError('Use at least 8 characters for your password.');
    if (input.password !== input.confirmation) throw new InputError('Your passwords do not match.');
  }
  return { email, password: input.password };
}

export async function authenticateCitizen<TUser extends CitizenIdentity>(mode: CitizenAuthMode, input: CitizenCredentials, actions: CitizenAuthActions<TUser>): Promise<TUser> {
  const { email, password } = validateCitizenCredentials(mode, input);
  if (mode === 'login') return actions.signIn(email, password);
  // Linking retains the Firebase UID, so existing reports and owned photos stay accessible.
  if (actions.currentUser?.isAnonymous) return actions.linkGuest(actions.currentUser, email, password);
  return actions.createAccount(email, password);
}

export async function continueAsGuest<TUser extends CitizenIdentity>(actions: CitizenAuthActions<TUser>): Promise<TUser> {
  // Never replace a restored guest: its UID is the key to its report history.
  return actions.currentUser || actions.signInGuest();
}

export function citizenAuthError(error: unknown): string {
  if (error instanceof InputError) return error.message;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'The email or password is incorrect. Please try again.';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use': return 'This email already has an account. Sign in with that account, or use another email to keep this guest history.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return 'Choose a stronger password that meets this project’s password requirements.';
    case 'auth/network-request-failed': return 'Could not connect. Check your internet connection and try again.';
    case 'auth/too-many-requests': return 'There have been too many attempts. Wait a moment and try again.';
    case 'auth/user-disabled': return 'This account has been disabled. Contact the administrator.';
    case 'auth/operation-not-allowed': return 'This sign-in option is not enabled. Ask the administrator to enable Email/Password and Anonymous sign-in in Firebase.';
    default: return 'We could not complete your request. Please try again.';
  }
}
