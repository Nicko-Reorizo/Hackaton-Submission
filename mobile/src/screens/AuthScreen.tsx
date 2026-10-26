import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createUserWithEmailAndPassword, EmailAuthProvider, linkWithCredential, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { Button } from '../components/Button';
import { authenticateCitizen, citizenAuthError, continueAsGuest, validateCitizenCredentials, validateCitizenEmail, type CitizenAuthMode } from '../lib/citizenAuth';
import { getFirebase } from '../lib/firebase';
import { colors } from '../theme';

function actions() {
  const { auth } = getFirebase();
  return {
    currentUser: auth.currentUser,
    signIn: async (email: string, password: string) => (await signInWithEmailAndPassword(auth, email, password)).user,
    createAccount: async (email: string, password: string) => (await createUserWithEmailAndPassword(auth, email, password)).user,
    linkGuest: async (user: User, email: string, password: string) => (await linkWithCredential(user, EmailAuthProvider.credential(email, password))).user,
    signInGuest: async () => (await signInAnonymously(auth)).user,
  };
}

export function AuthScreen({ user, onContinue }: { user: User | null; onContinue: () => void }) {
  const [mode, setMode] = useState<CitizenAuthMode | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'account' | 'guest' | 'reset' | null>(null);
  const inFlight = useRef(false);

  function changeMode(next: typeof mode) {
    if (inFlight.current) return;
    setMode(next); setError(''); setNotice(''); setPassword(''); setConfirmation(''); setShowPassword(false);
  }
  async function submit() {
    if (inFlight.current || mode === 'reset') return;
    inFlight.current = true; setBusy('account'); setError(''); setNotice('');
    try { await authenticateCitizen(mode, { email, password, confirmation }, actions()); onContinue(); }
    catch (caught) { setError(citizenAuthError(caught)); }
    finally { inFlight.current = false; setBusy(null); }
  }
  function requestSubmit() {
    if (inFlight.current || mode === 'reset') return;
    try { validateCitizenCredentials(mode, { email, password, confirmation }); }
    catch (caught) { setError(citizenAuthError(caught)); return; }
    if (mode === 'login' && user?.isAnonymous) {
      Alert.alert('Sign in to an existing account?', 'Signing in opens that account’s report history. Guest reports are not moved to an existing account. Choose Create account to keep this guest session and its reports.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create account', onPress: () => changeMode('signup') },
        { text: 'Sign in', onPress: () => void submit() },
      ]);
    } else void submit();
  }
  async function guest() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('guest'); setError(''); setNotice('');
    try { await continueAsGuest(actions()); onContinue(); }
    catch (caught) { setError(citizenAuthError(caught)); }
    finally { inFlight.current = false; setBusy(null); }
  }
  async function resetPassword() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('reset'); setError(''); setNotice('');
    try {
      await sendPasswordResetEmail(getFirebase().auth, validateCitizenEmail(email));
      setNotice('If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder.');
    } catch (caught) { setError(citizenAuthError(caught)); }
    finally { inFlight.current = false; setBusy(null); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>YOUR VOICE. YOUR COMMUNITY.</Text>
        <Text style={styles.heroTitle}>Snap. Send.{"\n"}<Text style={styles.heroAccent}>Stay in the loop.</Text></Text>
        <Text style={styles.heroBody}>Report an issue and follow every update, with an account or as a guest.</Text>
      </View>
      <View style={styles.form}>
        {mode !== 'reset' && <View style={styles.tabs}>
          {(['login', 'signup'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value, disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={() => changeMode(value)} style={[styles.tab, mode === value && styles.activeTab]}><Text style={[styles.tabText, mode === value && styles.activeTabText]}>{value === 'login' ? 'Log in' : 'Sign up'}</Text></Pressable>)}
        </View>}
        <Text style={styles.title}>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</Text>
        <Text style={styles.body}>{mode === 'signup' ? 'Keep your reports and follow their progress on any device.' : mode === 'reset' ? 'Enter your account email and we’ll send a reset link.' : 'Log in to see your reports and the latest LGU updates.'}</Text>
        {mode === 'signup' && user?.isAnonymous && <Text style={styles.notice}>Your guest reports will stay with you when you create this account.</Text>}
        <Text style={styles.label}>Email address</Text>
        <TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} returnKeyType={mode === 'reset' ? 'send' : 'next'} onSubmitEditing={() => { if (mode === 'reset') void resetPassword(); }} />
        {mode !== 'reset' && <>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} placeholderTextColor={colors.muted} style={styles.passwordInput} returnKeyType={mode === 'signup' ? 'next' : 'go'} onSubmitEditing={() => { if (mode === 'login') requestSubmit(); }} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} disabled={Boolean(busy)} onPress={() => setShowPassword(value => !value)} style={styles.showPassword}><Text style={styles.link}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable>
          </View>
          {mode === 'signup' ? <>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput accessibilityLabel="Confirm password" value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" autoComplete="new-password" placeholder="Enter your password again" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="go" onSubmitEditing={requestSubmit} />
          </> : <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => changeMode('reset')} style={styles.forgot}><Text style={styles.link}>Forgot password?</Text></Pressable>}
        </>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {mode === 'reset' ? <>
          <Button title="Send reset link" loading={busy === 'reset'} disabled={Boolean(busy)} onPress={() => void resetPassword()} />
          <Button title="Back to log in" secondary disabled={Boolean(busy)} onPress={() => changeMode('login')} />
        </> : <>
          <Button title={mode === 'signup' ? 'Create account' : 'Log in'} loading={busy === 'account'} disabled={Boolean(busy)} onPress={requestSubmit} />
          <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>or</Text><View style={styles.line} /></View>
          <Button title="Continue as Guest" secondary loading={busy === 'guest'} disabled={Boolean(busy)} onPress={() => void guest()} />
          <Text style={styles.guestHint}>Guests can submit and track issues on this device. Create an account to keep access when changing devices.</Text>
        </>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, scroll: { padding: 20, paddingTop: 4, paddingBottom: 32, gap: 24, width: '100%', maxWidth: 540, alignSelf: 'center' },
  hero: { padding: 24, borderRadius: 22, backgroundColor: colors.primaryDark, gap: 12, borderTopWidth: 5, borderTopColor: colors.lime },
  heroEyebrow: { color: '#D8E9F4', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, heroTitle: { color: '#FFFFFF', fontSize: 30, lineHeight: 36, fontWeight: '800' }, heroAccent: { color: colors.lime }, heroBody: { color: '#E0EDF6', fontSize: 13, lineHeight: 20 },
  form: { gap: 12 }, tabs: { flexDirection: 'row', padding: 4, backgroundColor: colors.soft, borderRadius: 13, marginBottom: 4 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, activeTab: { backgroundColor: colors.lime }, tabText: { color: colors.muted, fontWeight: '700', fontSize: 14 }, activeTabText: { color: colors.primaryDark },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800' }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 }, label: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, minHeight: 52, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 15, backgroundColor: '#FFFFFF' }, passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 }, passwordInput: { flex: 1, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 15 }, showPassword: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 }, link: { color: colors.primary, fontSize: 13, fontWeight: '700' }, forgot: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' },
  divider: { flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 1 }, line: { height: 1, flex: 1, backgroundColor: colors.border }, dividerText: { color: colors.muted, fontSize: 12 }, guestHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, notice: { color: colors.primaryDark, backgroundColor: '#FFF8D9', padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 20 }, error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 20 },
});
