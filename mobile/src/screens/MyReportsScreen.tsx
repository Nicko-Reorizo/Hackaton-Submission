import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { User } from 'firebase/auth';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { fetchMyReports } from '../lib/api';
import { colors } from '../theme';
import type { Report } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function MyReportsScreen({ user }: { user: User }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setReports(await fetchMyReports(user)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your reports.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>YOUR VOICE, IN ACTION</Text><Text style={styles.title}>My reports</Text><Text style={styles.body}>Follow each issue from your first photo to the LGU’s latest update.</Text>{error ? <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Try again" secondary onPress={() => { setRefreshing(true); void load(); }} /></View> : null}</View>}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.body}>Loading your reports…</Text></View> : !error ? <View style={styles.empty}><Text style={styles.emptyIcon}>↗</Text><Text style={styles.emptyTitle}>Your first tap matters.</Text><Text style={styles.emptyBody}>When you report an issue, its progress and updates will appear here.</Text></View> : undefined}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Image accessibilityLabel={`${item.ai_category} report photo`} source={{ uri: item.image_url }} style={styles.image} />
          <View style={styles.cardContent}>
            <View style={styles.meta}><Text style={styles.id}>#{item._id.slice(-8).toUpperCase()}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View>
            <Text style={styles.category}>{item.ai_category}</Text>
            <StatusBadge status={item.status} />
            {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
            {item.lgu_notes ? <View style={styles.notes}><Text style={styles.notesLabel}>UPDATE FROM YOUR LGU</Text><Text style={styles.notesText}>{item.lgu_notes}</Text><Text style={styles.updated}>Updated {formatDate(item.updatedAt)}</Text></View> : <Text style={styles.noNotes}>LGU updates will appear here.</Text>}
          </View>
        </View>
      )}
      ListFooterComponent={!loading && reports.length > 0 ? <Text style={styles.footer}>Pull down to check for the latest updates.</Text> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, flexGrow: 1, gap: 18 },
  header: { gap: 12, marginBottom: 4 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  title: { fontSize: 30, lineHeight: 35, color: colors.ink, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  image: { width: '100%', height: 175, backgroundColor: colors.soft },
  cardContent: { padding: 18, gap: 12 },
  meta: { gap: 6 },
  id: { color: colors.primary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  date: { fontSize: 11, color: colors.muted },
  category: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  notes: { backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 8 },
  notesLabel: { color: colors.primary, fontSize: 9, letterSpacing: 1.1, fontWeight: '800' },
  notesText: { fontSize: 14, lineHeight: 21, color: colors.ink },
  updated: { color: colors.muted, fontSize: 10 },
  noNotes: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  empty: { flex: 1, minHeight: 300, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  emptyIcon: { fontSize: 35, color: colors.primary, backgroundColor: colors.lime, padding: 18, borderRadius: 25, overflow: 'hidden' },
  emptyTitle: { fontSize: 22, color: colors.ink, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  errorBox: { gap: 12, backgroundColor: colors.dangerSoft, padding: 15, borderRadius: 12 },
  error: { fontSize: 14, color: colors.danger, lineHeight: 21 },
  footer: { fontSize: 11, textAlign: 'center', color: colors.muted, marginVertical: 10 },
});
