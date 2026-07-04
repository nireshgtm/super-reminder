import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';

import { getSettings, saveSettings, type Settings } from '../src/services/settings';
import { useVoices } from '../src/hooks/useVoices';
import { getAllReminders } from '../src/services/db';
import { rescheduleAll } from '../src/services/notificationScheduler';

export default function SettingsScreen() {
  const router = useRouter();
  const { voices, isLoading: voicesLoading } = useVoices();

  const [settings, setSettings] = useState<Settings>({
    hideTextOnLockScreen: false,
  });
  const [loading, setLoading] = useState(true);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  // ── Load settings on mount ──────────────────────────────────────────────────
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // ── Persist + reschedule whenever a setting changes ──────────────────────────
  const applySettings = useCallback(async (next: Settings) => {
    setSettings(next);
    try {
      await saveSettings(next);
      const reminders = await getAllReminders();
      await rescheduleAll(reminders);
    } catch {
      Alert.alert('Error', 'Could not save settings.');
    }
  }, []);

  // ── Derived label for the selected default voice ─────────────────────────────
  const defaultVoiceName = settings.defaultVoiceIdentifier
    ? (voices.find((v) => v.identifier === settings.defaultVoiceIdentifier)?.name ??
      'Unknown voice')
    : 'System default';

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={() => router.back()} />

      {/* ── Notifications section ── */}
      <SectionLabel text="Notifications" />
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Hide text on lock screen</Text>
            <Text style={styles.rowSub}>
              Show "You have a reminder" instead of your reminder text on lock-screen banners
            </Text>
          </View>
          <Switch
            value={settings.hideTextOnLockScreen}
            onValueChange={(v) =>
              applySettings({ ...settings, hideTextOnLockScreen: v })
            }
            accessibilityLabel="Hide text on lock screen"
          />
        </View>
      </View>

      {/* ── Voice section ── */}
      <SectionLabel text="Voice" />
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setVoiceModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose default voice"
        >
          <Text style={styles.rowTitle}>Default Voice</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>
              {defaultVoiceName}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      </View>

      {/* ── Voice picker modal ── */}
      <Modal
        visible={voiceModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Default Voice</Text>
            <Pressable
              onPress={() => setVoiceModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close voice picker"
            >
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>

          {voicesLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <FlatList
              data={[
                { identifier: '', name: 'System default', language: '' } as Speech.Voice,
                ...voices,
              ]}
              keyExtractor={(v) => v.identifier}
              renderItem={({ item }) => {
                const isSelected =
                  item.identifier === '' && !settings.defaultVoiceIdentifier
                    ? true
                    : item.identifier === settings.defaultVoiceIdentifier;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.voiceItem,
                      pressed && styles.voiceItemPressed,
                    ]}
                    onPress={() => {
                      const nextId =
                        item.identifier === '' ? undefined : item.identifier;
                      applySettings({ ...settings, defaultVoiceIdentifier: nextId });
                      setVoiceModalVisible(false);
                      if (item.identifier !== '') {
                        Speech.speak('This is how I sound.', {
                          voice: item.identifier,
                          onError: () => {},
                        });
                      }
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View style={styles.voiceItemContent}>
                      <Text style={styles.voiceItemName}>{item.name}</Text>
                      {item.language ? (
                        <Text style={styles.voiceItemLang}>{item.language}</Text>
                      ) : null}
                    </View>
                    {isSelected && <Text style={styles.voiceCheck}>✓</Text>}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Settings</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { width: 70 },
  backText: { fontSize: 17, color: '#007AFF' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 6,
    marginHorizontal: 16,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: '#F5F5F5',
  },
  rowContent: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
  },
  rowValue: {
    fontSize: 15,
    color: '#8E8E93',
    flexShrink: 1,
  },
  chevron: {
    fontSize: 18,
    color: '#C7C7CC',
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  modalDone: { fontSize: 17, color: '#007AFF', fontWeight: '500' },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  voiceItemPressed: { backgroundColor: '#F5F5F5' },
  voiceItemContent: { flex: 1 },
  voiceItemName: { fontSize: 15, color: '#1C1C1E' },
  voiceItemLang: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  voiceCheck: { fontSize: 17, color: '#007AFF', fontWeight: '600' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 16,
  },
});
