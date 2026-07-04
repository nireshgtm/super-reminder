import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReminderForm } from '../../src/components/ReminderForm';
import { getReminderById } from '../../src/services/db';
import { getText } from '../../src/services/secureStore';
import type { Reminder } from '../../src/models/Reminder';

export default function EditReminderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [reminderWithText, setReminderWithText] = useState<
    (Reminder & { text: string }) | null
  >(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const reminder = await getReminderById(id);
      if (!reminder) {
        setNotFound(true);
        return;
      }
      const text = (await getText(id)) ?? '';
      setReminderWithText({ ...reminder, text });
    })();
  }, [id]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Edit Reminder</Text>
        <View style={styles.backButton} />
      </View>

      {notFound ? (
        <View style={styles.center}>
          <Text style={styles.notFoundText}>Reminder not found.</Text>
          <Pressable onPress={() => router.back()} style={styles.goBackBtn}>
            <Text style={styles.goBackText}>Go back</Text>
          </Pressable>
        </View>
      ) : reminderWithText === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ReminderForm existing={reminderWithText} />
      )}
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
  },
  backButton: {
    width: 70,
  },
  backText: {
    fontSize: 17,
    color: '#007AFF',
  },
  title: {
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
    gap: 12,
  },
  notFoundText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  goBackBtn: {
    padding: 8,
  },
  goBackText: {
    fontSize: 16,
    color: '#007AFF',
  },
});
