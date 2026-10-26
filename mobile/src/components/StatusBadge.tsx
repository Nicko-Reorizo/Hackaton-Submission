import { StyleSheet, Text, View } from 'react-native';
import type { ReportStatus } from '../types';

const palettes: Record<ReportStatus, { backgroundColor: string; color: string }> = {
  Pending: { backgroundColor: '#FFF0CD', color: '#835D08' },
  Acknowledged: { backgroundColor: '#E9E6FB', color: '#5B4995' },
  'In Progress': { backgroundColor: '#E0EFFC', color: '#245C8E' },
  Resolved: { backgroundColor: '#E0F0DC', color: '#346B32' },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const palette = palettes[status] ?? palettes.Pending;
  return <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}><View style={[styles.dot, { backgroundColor: palette.color }]} /><Text style={[styles.text, { color: palette.color }]}>{status}</Text></View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 30, paddingVertical: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
