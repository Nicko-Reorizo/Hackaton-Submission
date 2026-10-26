import { useEffect, useReducer, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { User } from 'firebase/auth';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { analyzePhoto, ApiError, fetchOffices, submitReport } from '../lib/api';
import { IssueDescription, IssueFields, OfficeContact, PhotoAttachments, type AttachedPhoto } from '../components/IssueFields';
import { removeUnsubmittedPhoto, uploadPhoto } from '../lib/photos';
import { CLASSIFICATION_RETRY_THRESHOLD, initialReportFlow, reportFlowReducer, submissionComment } from '../lib/reportFlow';
import { colors } from '../theme';
import type { Analysis, Category, Office, Report } from '../types';

interface Draft {
  uri: string;
  base64: string;
  location: { latitude: number; longitude: number };
  uploaded?: { path: string; url: string };
  analysis?: Analysis;
  submitAttempted?: boolean;
  attachments?: AttachedPhoto[];
  invalid?: boolean;
}

interface Props { user: User; onLockChange: (locked: boolean) => void; onViewReports: () => void }

const stages = {
  photo: 'Preparing your photo…',
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
  const [category, setCategory] = useState<Category>('Unverified');
  const [description, setDescription] = useState('');
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeId, setOfficeId] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [flow, dispatchFlow] = useReducer(reportFlowReducer, undefined, initialReportFlow);
  const confirmationScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const validOffice = offices.some(office => office._id === officeId && office.active && office.categories.includes(category));

  function updateDraft(next: Draft | null) { draftRef.current = next; setDraft(next); }

  useEffect(() => { onLockChange(Boolean(stage || draft)); }, [stage, draft, onLockChange]);
  useEffect(() => { confirmationScroll.current?.scrollTo({ y: 0, animated: false }); }, [flow.step]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Permission may have changed while the user was in device settings.
      if (state === 'active') void getPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [getPermission]);
  useEffect(() => () => {
    const current = draftRef.current;
    if (current && !current.submitAttempted) for (const photo of [current.uploaded, ...(current.attachments || [])]) {
      if (photo?.path) void removeUnsubmittedPhoto(user, photo.path);
    }
    onLockChange(false);
  }, [onLockChange]);

  async function processDraft(next: Draft) {
    if (!next.uploaded) {
      setStage('upload');
      next = { ...next, uploaded: await uploadPhoto(user, next.base64) };
      updateDraft(next);
    }
    setStage('analyze');
    let analysis: Analysis, directory: Office[];
    try { [analysis, directory] = await Promise.all([analyzePhoto(user, next.base64), fetchOffices(user)]); }
    catch (caught) {
      if (caught instanceof ApiError && caught.code === 'INVALID_ISSUE_IMAGE') updateDraft({ ...next, invalid: true });
      throw caught;
    }
    setOffices(directory); setCategory(analysis.detected_category);
    const eligible = directory.filter(office => office.categories.includes(analysis.detected_category));
    setOfficeId(eligible.length === 1 ? eligible[0]._id : '');
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
      dispatchFlow({ type: 'photo' });
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
      setError('We could not open camera permissions. Enable camera access in your device settings, then return to KitaKo.');
    }
  }

  async function chooseExistingPhoto() {
    if (inFlight.current || draft) return;
    inFlight.current = true; setError(''); setStage('photo');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const photo = await manipulateAsync(asset.uri, asset.width > 1600 ? [{ resize: { width: 1600 } }] : [], { format: SaveFormat.JPEG, compress: 0.65, base64: true });
      if (!photo.base64 || photo.base64.length > 6_500_000) throw new Error('This photo is too large. Choose a smaller picture.');
      setStage('location'); const position = await currentLocation();
      const next: Draft = { uri: photo.uri, base64: photo.base64, location: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
      dispatchFlow({ type: 'photo' });
      updateDraft(next); await processDraft(next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open the selected picture.'); }
    finally { inFlight.current = false; setStage(null); }
  }

  async function retryAnalysis() {
    if (!draft || draft.invalid || inFlight.current) return;
    inFlight.current = true;
    setError('');
    try { await processDraft(draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not check your photo. Please try again.'); }
    finally { setStage(null); inFlight.current = false; }
  }

  function retake() {
    if (inFlight.current || attaching) return;
    dispatchFlow({ type: 'retake' });
    // A response may have been lost after the server committed the report.
    // Preserve that photo after any submission attempt, including on retake.
    const abandoned = draft?.submitAttempted ? [] : [draft?.uploaded, ...(draft?.attachments || [])];
    updateDraft(null);
    setCameraReady(false);
    setError('');
    setDescription(''); setOfficeId('');
    for (const photo of abandoned) if (photo?.path) void removeUnsubmittedPhoto(user, photo.path);
  }

  function rejectClassification() {
    if (inFlight.current || attaching) return;
    setError('');
    dispatchFlow({ type: 'reject' });
    // Keep the third rejected photo so manual correction does not require a fourth.
    if (flow.photoAttempts < CLASSIFICATION_RETRY_THRESHOLD) retake();
  }

  function acceptClassification() {
    if (inFlight.current || attaching || !validOffice) return;
    setError('');
    dispatchFlow({ type: 'accept' });
  }

  async function confirm(includeComment: boolean) {
    const comment = submissionComment(flow, description, includeComment);
    if (comment === null) return;
    if (!draft?.analysis || !draft.uploaded || inFlight.current || attaching || !validOffice) return;
    inFlight.current = true;
    setStage('submit');
    setError('');
    updateDraft({ ...draft, submitAttempted: true });
    try {
      const report = await submitReport(user, {
        reporter_uid: user.uid,
        image_url: draft.uploaded.url,
        ai_category: category,
        ai_suggested_category: draft.analysis.detected_category,
        description: comment,
        lgu_id: officeId,
        image_urls: [draft.uploaded.url, ...(draft.attachments || []).map(photo => photo.url)],
        location: draft.location,
      });
      // A submitted photo belongs to the report and must not be removed on unmount.
      updateDraft(null);
      setSuccess(report);
      dispatchFlow({ type: 'reset' });
      setDescription('');
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
      <OfficeContact office={success.lgu} />
      <Button title="View my reports" onPress={onViewReports} />
      <Button title="Report another issue" secondary onPress={() => { setSuccess(null); setCameraReady(false); setDescription(''); }} />
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
            : permission?.granted ? <CameraView ref={camera} style={styles.camera} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => { setCameraReady(false); setError('The camera could not open. Close other apps using the camera, then reopen KitaKo.'); }} />
            : <View style={styles.permission}><View style={styles.cameraGlyph}><View style={styles.cameraLens} /></View><Text style={styles.permissionTitle}>Start with a photo</Text><Text style={styles.permissionBody}>Allow camera access to capture the issue you want to report.</Text><Button title={permission?.canAskAgain === false ? 'Open device settings' : 'Allow camera'} onPress={() => void enableCamera()} /></View>}
          {permission?.granted && !draft && <View pointerEvents="none" style={styles.cameraHint}><Text style={styles.cameraHintText}>Keep the issue inside the frame</Text></View>}
        </View>

        {stage && <View accessibilityLiveRegion="polite" style={styles.progress}><ActivityIndicator color={colors.primary} /><Text style={styles.progressText}>{stages[stage]}</Text></View>}
        {error && !draft?.analysis ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {draft && !draft.analysis ? <View style={styles.actions}>{!draft.invalid && <Button title="Try again" loading={Boolean(stage)} onPress={() => void retryAnalysis()} />}<Button title="Retake photo" secondary={!draft.invalid} disabled={Boolean(stage)} onPress={retake} /></View>
          : <Button title="Snap an issue" loading={Boolean(stage)} disabled={!permission?.granted || !cameraReady} onPress={() => void snap()} />}
        {!draft && <Button title="Choose from pictures" secondary disabled={Boolean(stage)} onPress={() => void chooseExistingPhoto()} />}

        <View style={styles.footnote}><Text style={styles.stepNumber}>1</Text><Text style={styles.footnoteText}>Snap a photo</Text><Text style={styles.stepDivider}>→</Text><Text style={styles.stepNumber}>2</Text><Text style={styles.footnoteText}>Confirm & submit</Text></View>
        <Text style={styles.locationNote}>Your current location is attached to the report, including when you choose an existing picture.</Text>
      </ScrollView>

      <Modal visible={Boolean(draft?.analysis)} transparent animationType="slide" onRequestClose={() => {
        if (stage || attaching) return;
        if (flow.step === 'comment-choice' || flow.step === 'comment') dispatchFlow({ type: 'back' });
        else if (flow.step === 'review') rejectClassification();
        else retake();
      }}>
        <View style={styles.modalBackdrop}>
          <ScrollView ref={confirmationScroll} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
            <View accessibilityViewIsModal style={styles.modal}>
              <View style={styles.modalHandle} />
              {flow.step === 'review' && <>
                <Text style={styles.eyebrow}>ONE QUICK CHECK</Text>
                <Text style={styles.modalTitle}>Does this look right?</Text>
                {draft && <Image accessibilityLabel="Photo to submit" source={{ uri: draft.uri }} style={styles.modalImage} />}
                <Text style={styles.category}>{category}</Text>
                <Text style={styles.body}>{category === draft?.analysis?.detected_category ? draft?.analysis?.user_confirmation_prompt : 'You selected this classification. Is this correct?'}</Text>
                <View pointerEvents={stage ? 'none' : 'auto'} style={{ gap: 18 }}>
                  <IssueFields category={category} onCategory={setCategory} description={description} onDescription={setDescription} offices={offices} officeId={officeId} onOffice={setOfficeId} showClassification={flow.canChooseClassification} showDescription={false} />
                  {draft?.uploaded && <PhotoAttachments user={user} photos={[draft.uploaded, ...(draft.attachments || [])]} onChange={photos => { if (draftRef.current) updateDraft({ ...draftRef.current, attachments: photos.slice(1) }); }} onBusyChange={setAttaching} onError={setError} />}
                </View>
                <Button title="Yes, Submit" disabled={Boolean(stage) || attaching || !validOffice} onPress={acceptClassification} />
                <Button title="No, Retake" secondary disabled={Boolean(stage) || attaching} onPress={rejectClassification} />
              </>}
              {flow.step === 'classification-help' && <>
                <Text style={styles.eyebrow}>LET’S GET IT TO THE RIGHT PLACE</Text>
                <Text style={styles.modalTitle}>Still not the right classification?</Text>
                <Text style={styles.body}>You’ve tried {flow.photoAttempts} photos for this issue. You can choose a classification for this picture, or take another photo.</Text>
                {draft && <Image accessibilityLabel="Photo to classify" source={{ uri: draft.uri }} style={styles.modalImage} />}
                <Button title="Choose classification" onPress={() => dispatchFlow({ type: 'choose-classification' })} />
                <Button title="Retake photo" secondary onPress={retake} />
              </>}
              {flow.step === 'comment-choice' && <>
                <Text style={styles.eyebrow}>BEFORE WE SEND IT</Text>
                <Text style={styles.modalTitle}>Would you like to add a comment?</Text>
                <Text style={styles.body}>You can add details to help the LGU understand the issue, or send your report now.</Text>
                <Text style={styles.category}>{category}</Text>
                <OfficeContact office={offices.find(office => office._id === officeId) || null} />
                <Button title="Yes, add a comment" disabled={Boolean(stage)} onPress={() => { setError(''); dispatchFlow({ type: 'add-comment' }); }} />
                <Button title="No, submit now" loading={stage === 'submit'} disabled={!validOffice} onPress={() => void confirm(false)} />
                <Button title="Back to review" secondary disabled={Boolean(stage)} onPress={() => { setError(''); dispatchFlow({ type: 'back' }); }} />
              </>}
              {flow.step === 'comment' && <>
                <Text style={styles.eyebrow}>A LITTLE MORE CONTEXT</Text>
                <Text style={styles.modalTitle}>Add your comment</Text>
                <View pointerEvents={stage ? 'none' : 'auto'}><IssueDescription description={description} onDescription={setDescription} /></View>
                <Button title="Submit report" loading={stage === 'submit'} disabled={!validOffice} onPress={() => void confirm(true)} />
                <Button title="Skip comment & submit" secondary disabled={Boolean(stage) || !validOffice} onPress={() => void confirm(false)} />
                <Button title="Back to review" secondary disabled={Boolean(stage)} onPress={() => { setError(''); dispatchFlow({ type: 'back' }); }} />
              </>}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
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
  cameraHintText: { color: '#FFFFFF', fontSize: 12, backgroundColor: `${colors.primary}D9`, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  progressText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  actions: { gap: 10 },
  error: { fontSize: 14, color: colors.danger, backgroundColor: colors.dangerSoft, padding: 14, borderRadius: 12, lineHeight: 21 },
  footnote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 },
  stepNumber: { color: colors.primary, backgroundColor: colors.soft, fontSize: 10, fontWeight: '700', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 7 },
  footnoteText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  stepDivider: { color: colors.muted, marginHorizontal: 5 },
  locationNote: { color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16 },
  modalBackdrop: { flex: 1, backgroundColor: `${colors.primary}AA` },
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
