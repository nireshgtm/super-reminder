import {
  View,
  FlatList,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useReminders } from '../src/hooks/useReminders';
import { usePermissions } from '../src/hooks/usePermissions';
import { speak } from '../src/services/tts';
import { getTextCached } from '../src/services/secureStore';
import { getSettings } from '../src/services/settings';
import { NotificationBanner } from '../src/components/NotificationBanner';
import { ReminderRow } from '../src/components/ReminderRow';
import type { Reminder } from '../src/models/Reminder';

export default function HomeScreen() {
  const router = useRouter();
  const { reminders, isLoading, reload, toggleEnabled, remove } = useReminders();
  const { isDenied } = usePermissions();

  // Reload from DB each time the Home screen comes into focus (e.g. after
  // returning from the Add/Edit screen following a save).
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function handlePress(id: string) {
    const reminder = reminders.find((r) => r.id === id);
    if (reminder) {
      const text = getTextCached(id);
      if (text) {
        const { defaultVoiceIdentifier } = await getSettings();
        speak(text, reminder.voiceIdentifier ?? defaultVoiceIdentifier);
      }
    }
    router.push(`/reminder/${id}` as never);
  }

  function handleToggle(id: string, enabled: boolean) {
    toggleEnabled(id, enabled);
  }

  function handleDelete(id: string) {
    remove(id);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.title}>Reminders</Text>
        <Pressable
          style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.6 }]}
          onPress={() => router.push('/settings' as never)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {isDenied && <NotificationBanner />}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : reminders.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(r: Reminder) => r.id}
          renderItem={({ item }: { item: Reminder }) => (
            <ReminderRow
              reminder={item}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onPress={handlePress}
              notificationsDenied={isDenied}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}

      {/* FAB — navigates to Add Reminder (Phase 5 implements the screen) */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/reminder/new' as never)}
        accessibilityRole="button"
        accessibilityLabel="Add reminder"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyTitle}>No reminders yet</Text>
      <Text style={styles.emptySub}>
        Tap + to add your first reminder
      </Text>
    </View>
  );
}

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
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  settingsBtn: {
    padding: 4,
  },
  settingsIcon: {
    fontSize: 22,
    color: '#007AFF',
  },
  list: {
    paddingBottom: 100, // room for FAB
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  emptySub: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  fabPressed: {
    opacity: 0.85,
  },
  fabIcon: {
    fontSize: 30,
    color: '#fff',
    lineHeight: 34,
  },
});
