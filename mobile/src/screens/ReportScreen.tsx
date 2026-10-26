import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import type { User } from 'firebase/auth';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { analyzePhoto, submitReport } from '../lib/api';
import { removeUnsubmittedPhoto, uploadPhoto } from '../lib/photos';
import { colors } from '../theme';
import type { Analysis, Report } from '../types';

interface Draft {
  uri: string;
  base64: string;
  location: { latitude: number; longitude: number };
  uploaded?: { path: string; url: string };
  analysis?: Analysis;
  submitAttempted?: boolean;
}

interface Props { user: User; onLockChange: (locked: boolean) => void; onViewReports: () => void }

const stages = {
  photo: 'Taking your photo…',
  location: 'Finding the issue’s location…',
  upload: 'Uploading your photo…',
  analyze: 'Checking the issue with AI…',
  submit: 'Sending your report…',
};

async function currentLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location access is needed to show the LGU where the issue is. Enable it in your device settings, then try again.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on your device’s location services, then try again.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('We could not get your location. Move to an open area and try again.')), 25_000); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

export function ReportScreen({ user, onLockChange, onViewReports }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [stage, setStage] = useState<keyof typeof stages | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Report | null>(null);
  const inFlight = useRef(false);

  function updateDraft(next: Draft | null) { draftRef.current = next; setDraft(next); }

  useEffect(() => { onLockChange(Boolean(stage || draft)); }, [stage, draft, onLockChange]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Permission may have changed while the user was in device settings.
      if (state === 'active') void getPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [getPermission]);
  useEffect(() => () => {
    const path = draftRef.current?.submitAttempted ? undefined : draftRef.current?.uploaded?.path;
    if (path) void removeUnsubmittedPhoto(user, path);
    onLockChange(false);
  }, [onLockChange]);

  async function processDraft(next: Draft) {
    if (!next.uploaded) {
      setStage('upload');
      next = { ...next, uploaded: await uploadPhoto(user, next.base64) };
      updateDraft(next);
    }
    setStage('analyze');
    const analysis = await analyzePhoto(user, next.base64);
    updateDraft({ ...next, analysis });
  }

  async function snap() {
    if (inFlight.current || !camera.current || !cameraReady) return;
    inFlight.current = true;
    setError('');
    try {
      setStage('photo');
      const photo = await camera.current.takePictureAsync({ quality: 0.35, base64: true, exif: false });
      if (!photo?.base64) throw new Error('The photo could not be saved. Please try again.');
      if (photo.base64.length > 6_500_000) throw new Error('This photo is too large to send. Please retake it.');
      setStage('location');
      const position = await currentLocation();
      const next: Draft = { uri: photo.uri, base64: photo.base64, location: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
      updateDraft(next);
      await processDraft(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not prepare your report. Please try again.');
    } finally { setStage(null); inFlight.current = false; }
  }

  async function enableCamera() {
    setError('');
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setError('We could not open camera permissions. Enable camera access in your device settings, then return to MyNaga.');
    }
  }

  async function retryAnalysis() {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setError('');
    try { await processDraft(draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not check your photo. Please try again.'); }
    finally { setStage(null); inFlight.current = false; }
  }

  function retake() {
    if (inFlight.current) return;
    // A response may have been lost after the server committed the report.
    // Preserve that photo after any submission attempt, including on retake.
    const path = draft?.submitAttempted ? undefined : draft?.uploaded?.path;
    updateDraft(null);
    setCameraReady(false);
    setError('');
    if (path) void removeUnsubmittedPhoto(user, path);
  }

  async function confirm() {
    if (!draft?.analysis || !draft.uploaded || inFlight.current) return;
    inFlight.current = true;
    setStage('submit');
    setError('');
    updateDraft({ ...draft, submitAttempted: true });
    try {
      const report = await submitReport(user, {
        reporter_uid: user.uid,
        image_url: draft.uploaded.url,
        ai_category: draft.analysis.detected_category,
        location: draft.location,
      });
      // A submitted photo belongs to the report and must not be removed on unmount.
      updateDraft(null);
      setSuccess(report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not send your report. Please try again.');
    } finally { setStage(null); inFlight.current = false; }
  }

  if (success) return (
    <ScrollView contentContainerStyle={styles.success}>
      <View style={styles.successIcon}><Text style={styles.check}>✓</Text></View>
      <Text style={styles.eyebrow}>REPORT RECEIVED</Text>
      <Text style={styles.successTitle}>Thank you for looking out for Naga.</Text>
      <Text style={styles.body}>Your report has been sent to the LGU. Follow its progress in My reports.</Text>
      <View style={styles.receipt}><Text style={styles.category}>{success.ai_category}</Text><StatusBadge status={success.status} /><Text style={styles.receiptId}>Report #{success._id.slice(-8).toUpperCase()}</Text></View>
      <Button title="View my reports" onPress={onViewReports} />
      <Button title="Report another issue" secondary onPress={() => { setSuccess(null); setCameraReady(false); }} />
    </ScrollView>
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SEE IT. SNAP IT. SEND IT.</Text>
        <Text style={styles.title}>A small tap. A better Naga.</Text>
        <Text style={styles.body}>Take a clear photo of the issue. We’ll help send it to the right place.</Text>
        <View style={styles.cameraFrame}>
          {draft ? <Image accessibilityLabel="Your captured civic issue" source={{ uri: draft.uri }} style={styles.camera} />
            : permission?.granted ? <CameraView ref={camera} style={styles.camera} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => { setCameraReady(false); setError('The camera could not open. Close other apps using the camera, then reopen MyNaga.'); }} />
            : <View style={styles.permission}><View style={styles.cameraGlyph}><View style={styles.cameraLens} /></View><Text style={styles.permissionTitle}>Start with a photo</Text><Text style={styles.permissionBody}>Allow camera access to capture the issue you want to report.</Text><Button title={permission?.canAskAgain === false ? 'Open device settings' : 'Allow camera'} onPress={() => void enableCamera()} /></View>}
          {permission?.granted && !draft && <View pointerEvents="none" style={styles.cameraHint}><Text style={styles.cameraHintText}>Keep the issue inside the frame</Text></View>}
        </View>

        {stage && <View accessibilityLiveRegion="polite" style={styles.progress}><ActivityIndicator color={colors.primary} /><Text style={styles.progressText}>{stages[stage]}</Text></View>}
        {error && !draft?.analysis ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {draft && !draft.analysis ? <View style={styles.actions}><Button title="Try again" loading={Boolean(stage)} onPress={() => void retryAnalysis()} /><Button title="Retake photo" secondary disabled={Boolean(stage)} onPress={retake} /></View>
          : <Button title="Snap an issue" loading={Boolean(stage)} disabled={!permission?.granted || !cameraReady} onPress={() => void snap()} />}

        <View style={styles.footnote}><Text style={styles.stepNumber}>1</Text><Text style={styles.footnoteText}>Snap a photo</Text><Text style={styles.stepDivider}>→</Text><Text style={styles.stepNumber}>2</Text><Text style={styles.footnoteText}>Confirm & submit</Text></View>
        <Text style={styles.locationNote}>Your current location is attached when you take a photo.</Text>
      </ScrollView>

      <Modal visible={Boolean(draft?.analysis)} transparent animationType="slide" onRequestClose={() => { if (!stage) retake(); }}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View accessibilityViewIsModal style={styles.modal}>
              <View style={styles.modalHandle} />
              <Text style={styles.eyebrow}>ONE QUICK CHECK</Text>
              <Text style={styles.modalTitle}>Does this look right?</Text>
              {draft && <Image accessibilityLabel="Photo to submit" source={{ uri: draft.uri }} style={styles.modalImage} />}
              <Text style={styles.category}>{draft?.analysis?.detected_category}</Text>
              <Text style={styles.body}>{draft?.analysis?.user_confirmation_prompt}</Text>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Button title="Yes, Submit" loading={stage === 'submit'} onPress={() => void confirm()} />
              <Button title="No, Retake" secondary disabled={Boolean(stage)} onPress={retake} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, gap: 16, paddingBottom: 28 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  title: { fontSize: 30, lineHeight: 35, color: colors.ink, fontWeight: '800', maxWidth: 290 },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  cameraFrame: { height: 310, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border },
  camera: { flex: 1, width: '100%', height: '100%' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 13 },
  cameraGlyph: { width: 45, height: 34, borderRadius: 9, borderWidth: 2, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  cameraLens: { width: 17, height: 17, borderWidth: 2, borderRadius: 10, borderColor: colors.primary },
  permissionTitle: { fontSize: 20, color: colors.ink, fontWeight: '700' },
  permissionBody: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  cameraHint: { position: 'absolute', bottom: 16, left: 16, right: 16, alignItems: 'center' },
  cameraHintText: { color: '#FFFFFF', fontSize: 12, backgroundColor: '#173C37D9', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  progressText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  actions: { gap: 10 },
  error: { fontSize: 14, color: colors.danger, backgroundColor: colors.dangerSoft, padding: 14, borderRadius: 12, lineHeight: 21 },
  footnote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 },
  stepNumber: { color: colors.primary, backgroundColor: colors.soft, fontSize: 10, fontWeight: '700', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 7 },
  footnoteText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  stepDivider: { color: colors.muted, marginHorizontal: 5 },
  locationNote: { color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16 },
  modalBackdrop: { flex: 1, backgroundColor: '#102F27AA' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 50 },
  modal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16, backgroundColor: colors.surface },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.border, marginBottom: 8 },
  modalTitle: { color: colors.ink, fontSize: 27, fontWeight: '800' },
  modalImage: { height: 170, width: '100%', borderRadius: 16 },
  category: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  success: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 },
  successIcon: { width: 78, height: 78, backgroundColor: colors.lime, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  check: { fontSize: 36, color: colors.primary },
  successTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  receipt: { gap: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, backgroundColor: colors.surface, marginBottom: 8 },
  receiptId: { fontSize: 12, color: colors.muted },
});
