import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Button } from './src/components/Button';
import { missingConfig } from './src/lib/config';
import { getFirebase } from './src/lib/firebase';
import { citizenAuthError } from './src/lib/citizenAuth';
import { AuthScreen } from './src/screens/AuthScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { MyReportsScreen } from './src/screens/MyReportsScreen';
import { colors } from './src/theme';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'report' | 'reports'>('report');
  const [locked, setLocked] = useState(false);
  const [restoring, setRestoring] = useState(true), [showAuth, setShowAuth] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false), [signingOut, setSigningOut] = useState(false), [accountError, setAccountError] = useState('');

  useEffect(() => {
    if (missingConfig.length) return;
    let active = true;
    let initial = true;
    setAuthError('');
    setRestoring(true);
    let auth: ReturnType<typeof getFirebase>['auth'];
    try { auth = getFirebase().auth; }
    catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not initialize Firebase. Check mobile/.env.');
      setRestoring(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (initial) { setShowAuth(!nextUser || nextUser.isAnonymous); initial = false; }
      if (!nextUser) { setShowAuth(true); setTab('report'); setLocked(false); }
      setRestoring(false);
    }, () => {
      if (active) { setAuthError('Could not restore your session. Check your internet connection and try again.'); setRestoring(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, [attempt]);

  function enterApp() {
    setUser(getFirebase().auth.currentUser); setShowAuth(false); setTab('report'); setLocked(false); setAccountOpen(false);
  }
  async function leaveAccount() {
    if (locked || signingOut) return;
    setSigningOut(true); setAccountError('');
    try { await signOut(getFirebase().auth); setAccountOpen(false); setShowAuth(true); }
    catch (caught) { setAccountError(citizenAuthError(caught)); }
    finally { setSigningOut(false); }
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.brand}><Image source={require('./assets/branding/kitako-logo.png')} accessibilityLabel="KitaKo" resizeMode="contain" style={styles.brandLogo} /><Text style={styles.brandCaption}>A better city starts with you.</Text></View>
          {user && !showAuth && !restoring && <Pressable accessibilityRole="button" accessibilityLabel={user.isAnonymous ? 'Sign in or create an account' : 'Open your account'} accessibilityState={{ disabled: locked }} disabled={locked} style={[styles.guest, locked && { opacity: 0.5 }]} onPress={() => { if (user.isAnonymous) setShowAuth(true); else { setAccountError(''); setAccountOpen(true); } }}><View style={styles.guestDot} /><Text style={styles.guestText}>{user.isAnonymous ? 'Guest · Sign in' : 'Account'}</Text></Pressable>}
        </View>

        {missingConfig.length ? (
          <ScrollView contentContainerStyle={styles.setup}>
            <Text style={styles.eyebrow}>CITIZEN APP SETUP</Text>
            <Text style={styles.title}>Your city, one tap closer.</Text>
            <Text style={styles.body}>Connect Firebase and your KitaKo API to start taking reports. Copy mobile/.env.example to mobile/.env and fill in these values:</Text>
            <View style={styles.setupList}>{missingConfig.map((name) => <Text key={name} style={styles.setupItem}>• {name}</Text>)}</View>
            <Text style={styles.body}>Enable Anonymous and Email/Password sign-in in Firebase Authentication, then restart Expo. The setup steps are in mobile/README.md.</Text>
          </ScrollView>
        ) : authError ? (
          <View style={styles.center}><Text style={styles.title}>Let’s get connected.</Text><Text accessibilityRole="alert" style={styles.error}>{authError}</Text><Button title="Try again" onPress={() => setAttempt((value) => value + 1)} /></View>
        ) : restoring ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.body}>Restoring your session…</Text></View>
        ) : showAuth || !user ? (
          <AuthScreen user={user} onContinue={enterApp} />
        ) : (
          <>
            <View style={styles.tabs}>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'report', disabled: locked }} disabled={locked} onPress={() => setTab('report')} style={[styles.tab, tab === 'report' && styles.activeTab]}><Text style={[styles.tabText, tab === 'report' && styles.activeTabText]}>Report an issue</Text></Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'reports', disabled: locked }} disabled={locked} onPress={() => setTab('reports')} style={[styles.tab, tab === 'reports' && styles.activeTab]}><Text style={[styles.tabText, tab === 'reports' && styles.activeTabText]}>My reports</Text></Pressable>
            </View>
            {tab === 'report'
              ? <ReportScreen key={user.uid} user={user} onLockChange={setLocked} onViewReports={() => setTab('reports')} />
              : <MyReportsScreen key={user.uid} user={user} />}
          </>
        )}
        <Modal visible={accountOpen && Boolean(user) && !showAuth} transparent animationType="slide" onRequestClose={() => { if (!signingOut) setAccountOpen(false); }}>
          <View style={styles.accountBackdrop}><View accessibilityViewIsModal style={styles.accountPanel}>
            <Text style={styles.eyebrow}>YOUR CITIZEN ACCOUNT</Text><Text style={styles.title}>You’re signed in.</Text><Text style={styles.accountEmail}>{user?.email}</Text>
            <Text style={styles.body}>Your reports stay linked to this account. Log in on another device to follow their progress.</Text>
            {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
            <Button title="Sign out" loading={signingOut} disabled={locked} onPress={() => void leaveAccount()} /><Button title="Close" secondary disabled={signingOut} onPress={() => setAccountOpen(false)} />
          </View></View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 11 },
  brand: { flexShrink: 1, gap: 5 },
  brandLogo: { width: 138, height: 44 },
  brandCaption: { fontSize: 10, color: colors.muted },
  guest: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', padding: 8, borderRadius: 20, backgroundColor: colors.soft },
  guestDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  guestText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 15, backgroundColor: colors.soft, marginBottom: 8 },
  tab: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  activeTab: { backgroundColor: colors.surface },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  activeTabText: { color: colors.ink },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
  setup: { padding: 24, paddingTop: 42, gap: 18 },
  eyebrow: { color: colors.primary, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  title: { fontSize: 30, color: colors.ink, fontWeight: '800', lineHeight: 36 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  setupList: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, gap: 10 },
  setupItem: { color: colors.ink, fontSize: 13 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 23 },
  accountBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: `${colors.primary}AA` }, accountPanel: { padding: 24, paddingBottom: 44, gap: 18, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, accountEmail: { color: colors.primary, fontSize: 17, fontWeight: '700' },
});
