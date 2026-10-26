import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { User } from 'firebase/auth';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { IssueFields, OfficeContact, PhotoAttachments, type AttachedPhoto } from '../components/IssueFields';
import { deleteReport, editReport, fetchMyReports, fetchOffices } from '../lib/api';
import { removeUnsubmittedPhoto } from '../lib/photos';
import { colors } from '../theme';
import type { Office, Report } from '../types';

const formatDate = (value: string) => new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function EditIssue({ user, report, offices, onClose, onSaved }: { user: User; report: Report; offices: Office[]; onClose: () => void; onSaved: (report: Report) => void }) {
  const category = report.ai_category;
  const [description, setDescription] = useState(report.description || '');
  const [officeId, setOfficeId] = useState(report.lgu_id);
  const [photos, setPhotos] = useState<AttachedPhoto[]>((report.image_urls || [report.image_url]).map(url => ({ url })));
  const [busy, setBusy] = useState(false), [attaching, setAttaching] = useState(false), [error, setError] = useState('');
  const latest = useRef(photos), attempted = useRef(false);
  const validOffice = offices.some(office => office._id === officeId && office.active && office.categories.includes(category));
  function changePhotos(next: AttachedPhoto[]) { latest.current = next; setPhotos(next); }
  useEffect(() => () => { if (!attempted.current) for (const photo of latest.current) if (photo.path) void removeUnsubmittedPhoto(user, photo.path); }, [user]);
  async function save() {
    if (busy || attaching || !validOffice) return;
    setBusy(true); setError(''); attempted.current = true;
    try { onSaved(await editReport(user, report._id, { ai_category: category, description, lgu_id: officeId, image_urls: photos.map(photo => photo.url) })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this report.'); }
    finally { setBusy(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy && !attaching) onClose(); }}>
    <ScrollView contentContainerStyle={styles.edit} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>UPDATE YOUR ISSUE</Text><Text style={styles.title}>Edit report</Text><Text style={styles.body}>Changes are available until your LGU acknowledges this issue.</Text>
      <View pointerEvents={busy ? 'none' : 'auto'} style={{ gap: 20 }}>
        <Text style={styles.category}>{category}</Text>
        <IssueFields category={category} description={description} onDescription={setDescription} offices={offices} officeId={officeId} onOffice={setOfficeId} />
        <PhotoAttachments user={user} photos={photos} onChange={changePhotos} onBusyChange={setAttaching} onError={setError} onDiscard={photo => { if (photo.path && !attempted.current) void removeUnsubmittedPhoto(user, photo.path); }} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button title="Save changes" loading={busy} disabled={attaching || !validOffice} onPress={() => void save()} />
      <Button title="Cancel" secondary disabled={busy || attaching} onPress={onClose} />
    </ScrollView>
  </Modal>;
}

export function MyReportsScreen({ user }: { user: User }) {
  const [reports, setReports] = useState<Report[]>([]), [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const [editing, setEditing] = useState<Report | null>(null), [deleting, setDeleting] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const [items, directory] = await Promise.all([fetchMyReports(user), fetchOffices(user)]); setReports(items); setOffices(directory); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your reports.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  function remove(report: Report) {
    Alert.alert('Delete this issue?', 'This permanently removes your submitted report and its pictures. You can only do this before LGU acknowledgment.', [
      { text: 'Keep report', style: 'cancel' },
      { text: 'Delete report', style: 'destructive', onPress: () => void (async () => {
        setDeleting(report._id); setError('');
        try { await deleteReport(user, report._id); setReports(current => current.filter(item => item._id !== report._id)); }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete the report.'); void load(); }
        finally { setDeleting(''); }
      })() },
    ]);
  }
  return <>
    <FlatList data={reports} keyExtractor={item => item._id} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>YOUR VOICE, IN ACTION</Text><Text style={styles.title}>My reports</Text><Text style={styles.body}>Track updates and contact the office handling your issue.</Text>{error ? <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Refresh reports" secondary onPress={() => void load()} /></View> : null}</View>}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>Loading your reports…</Text></View> : !error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your first report matters.</Text><Text style={styles.body}>Submitted issues and LGU updates will appear here.</Text></View> : undefined}
      renderItem={({ item }) => <View style={styles.card}>
        <ScrollView horizontal pagingEnabled contentContainerStyle={styles.images}>{(item.image_urls || [item.image_url]).map((url, index) => <Image key={url} accessibilityLabel={`Report picture ${index + 1}`} source={{ uri: url }} style={styles.image} />)}</ScrollView>
        <View style={styles.cardContent}><Text style={styles.date}>#{item._id.slice(-8).toUpperCase()} · {formatDate(item.createdAt)}</Text><Text style={styles.category}>{item.ai_category}</Text><StatusBadge status={item.status} />
          {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
          <OfficeContact office={item.lgu} />
          {item.lgu_notes ? <View style={styles.notes}><Text style={styles.eyebrow}>UPDATE FROM YOUR LGU</Text><Text style={styles.body}>{item.lgu_notes}</Text></View> : null}
          {item.can_edit ? <View style={styles.actions}><Button title="Edit issue" secondary disabled={Boolean(deleting)} onPress={() => setEditing(item)} /><Button title="Delete issue" secondary loading={deleting === item._id} disabled={Boolean(deleting)} onPress={() => remove(item)} /><Text style={styles.hint}>You can edit or delete until this issue is acknowledged.</Text></View> : <Text style={styles.hint}>This issue has been acknowledged. Editing and deletion are now locked.</Text>}
        </View>
      </View>}
    />
    {editing && <EditIssue user={user} report={editing} offices={offices} onClose={() => { setEditing(null); void load(); }} onSaved={next => { setReports(current => current.map(item => item._id === next._id ? next : item)); setEditing(null); }} />}
  </>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, flexGrow: 1, gap: 20 }, header: { gap: 10, marginBottom: 5 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' }, images: { gap: 3 }, image: { width: 310, height: 185, backgroundColor: colors.soft },
  cardContent: { padding: 18, gap: 13 }, date: { color: colors.muted, fontSize: 11 }, category: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  notes: { backgroundColor: '#FFF8D9', padding: 14, borderRadius: 10, gap: 7 }, actions: { gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 },
  empty: { flex: 1, minHeight: 250, justifyContent: 'center', alignItems: 'center', gap: 16 }, emptyTitle: { color: colors.ink, fontSize: 21, fontWeight: '700' },
  errorBox: { backgroundColor: colors.dangerSoft, padding: 14, borderRadius: 10, gap: 10 }, error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  edit: { padding: 24, paddingTop: 64, paddingBottom: 48, gap: 20, backgroundColor: '#FFFFFF', flexGrow: 1 },
});
