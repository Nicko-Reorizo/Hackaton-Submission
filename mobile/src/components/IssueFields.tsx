import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { User } from 'firebase/auth';
import { uploadPhoto, removeUnsubmittedPhoto } from '../lib/photos';
import { colors } from '../theme';
import { ISSUE_CATEGORIES, type Category, type Office } from '../types';
import { Button } from './Button';

export interface AttachedPhoto { path?: string; url: string }

export function OfficeContact({ office }: { office: Office | null }) {
  if (!office) return <Text style={styles.hint}>The receiving office will appear here.</Text>;
  const hasContact = Boolean(office.phone || office.email || office.address);
  return <View style={styles.contact}>
    <Text style={styles.eyebrow}>RECEIVING LGU OFFICE</Text><Text style={styles.officeName}>{office.name}</Text>
    {office.area ? <Text style={styles.hint}>{office.area}</Text> : null}
    {office.phone ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${office.phone.replace(/[^\d+]/g, '')}`).catch(() => undefined)}><Text style={styles.link}>Call: {office.phone}</Text></Pressable> : null}
    {office.email ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${office.email}`).catch(() => undefined)}><Text style={styles.link}>{office.email}</Text></Pressable> : null}
    {office.address ? <Text style={styles.hint}>{office.address}</Text> : null}
    {!hasContact && <Text style={styles.hint}>Contact details have not been provided by this office yet.</Text>}
  </View>;
}

export function IssueDescription({ description, onDescription }: { description: string; onDescription: (value: string) => void }) {
  return <View style={styles.fields}>
    <Text style={styles.label}>Description <Text style={styles.hint}>(optional)</Text></Text>
    <TextInput accessibilityLabel="Issue description" value={description} onChangeText={onDescription} multiline maxLength={3000} placeholder="What happened? Add a landmark or useful details…" placeholderTextColor={colors.muted} style={styles.input} textAlignVertical="top" />
  </View>;
}

export function IssueFields({ category, onCategory, description, onDescription, offices, officeId, onOffice, showClassification = false, showDescription = true }: {
  category: Category; onCategory?: (category: Category) => void; description: string; onDescription: (value: string) => void;
  offices: Office[]; officeId: string; onOffice: (id: string) => void; showClassification?: boolean; showDescription?: boolean;
}) {
  const [choosing, setChoosing] = useState(showClassification);
  const eligible = offices.filter(office => office.active && office.categories.includes(category));
  function selectCategory(next: Category) {
    onCategory?.(next); setChoosing(false);
    const current = offices.find(office => office._id === officeId);
    if (!current?.categories.includes(next)) {
      const choices = offices.filter(office => office.active && office.categories.includes(next));
      onOffice(choices.length === 1 ? choices[0]._id : '');
    }
  }
  return <View style={styles.fields}>
    {showClassification && onCategory && <>
      <View><Text style={styles.label}>Choose a classification</Text><Text style={styles.hint}>Still not right after several photos? Select the category that fits.</Text></View>
      <Button title={`${category}  ▾`} secondary onPress={() => setChoosing(value => !value)} />
      {choosing && <View style={styles.choices}>{ISSUE_CATEGORIES.map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: value === category }} key={value} onPress={() => selectCategory(value)} style={[styles.choice, value === category && styles.selected]}><Text style={styles.choiceText}>{value === category ? '●  ' : '○  '}{value}</Text></Pressable>)}</View>}
    </>}
    {showDescription && <IssueDescription description={description} onDescription={onDescription} />}
    <Text style={styles.label}>Receiving office</Text>
    {!eligible.length && <Text style={styles.hint}>No active office handles this classification. Please retake the photo or contact the administrator.</Text>}
    {eligible.map(office => <Pressable accessibilityRole="radio" accessibilityState={{ checked: officeId === office._id }} key={office._id} onPress={() => onOffice(office._id)} style={[styles.choice, officeId === office._id && styles.selected]}><Text style={styles.choiceText}>{officeId === office._id ? '●  ' : '○  '}{office.name}{office.area ? ` · ${office.area}` : ''}</Text></Pressable>)}
    <OfficeContact office={offices.find(office => office._id === officeId) || null} />
  </View>;
}

export function PhotoAttachments({ user, photos, onChange, onBusyChange, onError, onDiscard }: {
  user: User; photos: AttachedPhoto[]; onChange: (photos: AttachedPhoto[]) => void;
  onBusyChange: (busy: boolean) => void; onError: (message: string) => void; onDiscard?: (photo: AttachedPhoto) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function attach() {
    if (busy || photos.length >= 5) return;
    setBusy(true); onBusyChange(true);
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 - photos.length, quality: 0.7 });
      if (selected.canceled) return;
      const next = [...photos];
      for (const asset of selected.assets.slice(0, 5 - photos.length)) {
        const image = await manipulateAsync(asset.uri, asset.width > 1600 ? [{ resize: { width: 1600 } }] : [], { compress: 0.65, format: SaveFormat.JPEG, base64: true });
        if (!image.base64 || image.base64.length > 6_500_000) throw new Error('One selected picture is too large. Choose a smaller photo.');
        const uploaded = await uploadPhoto(user, image.base64);
        next.push(uploaded);
        // Persist each successful upload so later failures cannot lose its reference.
        onChange([...next]);
      }
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not attach the selected photos.'); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function remove(index: number) {
    const photo = photos[index];
    onChange(photos.filter((_, position) => position !== index));
    if (onDiscard) onDiscard(photo);
    else if (photo.path) void removeUnsubmittedPhoto(user, photo.path);
  }
  return <View style={styles.fields}>
    <Text style={styles.label}>Pictures <Text style={styles.hint}>({photos.length}/5)</Text></Text>
    <ScrollView horizontal contentContainerStyle={styles.photos}>{photos.map((photo, index) => <View key={photo.url} style={styles.photoWrap}><Image source={{ uri: photo.url }} style={styles.photo} accessibilityLabel={`Attached picture ${index + 1}`} />{index > 0 && !busy && <Pressable accessibilityLabel={`Remove picture ${index + 1}`} style={styles.remove} onPress={() => remove(index)}><Text style={styles.removeText}>×</Text></Pressable>}</View>)}</ScrollView>
    {busy ? <View style={styles.progress}><ActivityIndicator color={colors.primary} /><Text style={styles.hint}>Preparing your pictures…</Text></View> : <Button title="+ Attach pictures" secondary disabled={photos.length >= 5} onPress={() => void attach()} />}
    <Text style={styles.hint}>Attach up to five photos. The original photo stays with the report.</Text>
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: 11 }, label: { color: colors.ink, fontWeight: '700', fontSize: 15 }, hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  input: { minHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.ink, fontSize: 15, backgroundColor: '#FFFFFF' },
  choices: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }, choice: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#FFF6CE', borderColor: '#E4BE38' }, choiceText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  contact: { backgroundColor: colors.soft, borderRadius: 14, padding: 16, gap: 6, borderLeftWidth: 4, borderLeftColor: colors.lime },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, officeName: { fontSize: 16, fontWeight: '700', color: colors.ink }, link: { color: colors.primary, fontSize: 14, paddingVertical: 4, textDecorationLine: 'underline' },
  photos: { gap: 10 }, photoWrap: { position: 'relative' }, photo: { width: 100, height: 100, borderRadius: 10, backgroundColor: colors.soft },
  remove: { position: 'absolute', right: 3, top: 3, backgroundColor: colors.primaryDark, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, removeText: { color: '#FFFFFF', fontSize: 22, lineHeight: 25 }, progress: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
