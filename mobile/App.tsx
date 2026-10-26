import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { Button } from './src/components/Button';
import { missingConfig } from './src/lib/config';
import { getFirebase } from './src/lib/firebase';
import { ReportScreen } from './src/screens/ReportScreen';
import { MyReportsScreen } from './src/screens/MyReportsScreen';
import { colors } from './src/theme';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'report' | 'reports'>('report');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (missingConfig.length) return;
    let active = true;
    setAuthError('');
    let auth: ReturnType<typeof getFirebase>['auth'];
    try { auth = getFirebase().auth; }
    catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not initialize Firebase. Check mobile/.env.');
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (active) setUser(nextUser);
    });
    async function connect() {
      try {
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          throw new Error('This app requires a Firebase guest account. Clear this app’s local data and open it again.');
        }
      } catch (error) {
        if (active) setAuthError(error instanceof Error ? error.message : 'Could not start your guest session.');
      }
    }
    void connect();
    return () => { active = false; unsubscribe(); };
  }, [attempt]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>m.</Text></View>
          <View><Text style={styles.brand}>MyNaga <Text style={styles.brandAccent}>1-Tap</Text></Text><Text style={styles.brandCaption}>A better city starts with you.</Text></View>
          <View style={styles.guest}><View style={styles.guestDot} /><Text style={styles.guestText}>Guest</Text></View>
        </View>

        {missingConfig.length ? (
          <ScrollView contentContainerStyle={styles.setup}>
            <Text style={styles.eyebrow}>CITIZEN APP SETUP</Text>
            <Text style={styles.title}>Your city, one tap closer.</Text>
            <Text style={styles.body}>Connect Firebase and your MyNaga API to start taking reports. Copy mobile/.env.example to mobile/.env and fill in these values:</Text>
            <View style={styles.setupList}>{missingConfig.map((name) => <Text key={name} style={styles.setupItem}>• {name}</Text>)}</View>
            <Text style={styles.body}>Enable Anonymous sign-in in Firebase Authentication, then restart Expo. The setup steps are in mobile/README.md.</Text>
          </ScrollView>
        ) : authError ? (
          <View style={styles.center}><Text style={styles.title}>Let’s get connected.</Text><Text accessibilityRole="alert" style={styles.error}>{authError}</Text><Text style={styles.body}>Check your internet connection and that Anonymous sign-in is enabled for this Firebase project.</Text><Button title="Try again" onPress={() => setAttempt((value) => value + 1)} /></View>
        ) : !user ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.body}>Starting your guest session…</Text></View>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'report', disabled: locked }} disabled={locked} onPress={() => setTab('report')} style={[styles.tab, tab === 'report' && styles.activeTab]}><Text style={[styles.tabText, tab === 'report' && styles.activeTabText]}>Report an issue</Text></Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'reports', disabled: locked }} disabled={locked} onPress={() => setTab('reports')} style={[styles.tab, tab === 'reports' && styles.activeTab]}><Text style={[styles.tabText, tab === 'reports' && styles.activeTabText]}>My reports</Text></Pressable>
            </View>
            {tab === 'report'
              ? <ReportScreen user={user} onLockChange={setLocked} onViewReports={() => setTab('reports')} />
              : <MyReportsScreen user={user} />}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 11 },
  brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  brandMarkText: { fontSize: 26, fontWeight: '800', color: colors.lime, marginTop: -4 },
  brand: { fontSize: 19, fontWeight: '800', color: colors.ink },
  brandAccent: { color: colors.primary, fontWeight: '500' },
  brandCaption: { fontSize: 10, color: colors.muted, marginTop: 2 },
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
});
