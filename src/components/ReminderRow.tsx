import { View, Text, Switch, Pressable, StyleSheet, Alert } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import type { Reminder } from '../models/Reminder';
import { getTextCached } from '../services/secureStore';
import { formatRecurrence } from '../utils/formatRecurrence';

interface Props {
  reminder: Reminder;
  /** Called when the enabled Switch is toggled. */
  onToggle: (id: string, enabled: boolean) => void;
  /** Called when the delete action is confirmed. */
  onDelete: (id: string) => void;
  /** Called when the row body is tapped (speak + navigate). */
  onPress: (id: string) => void;
  /** True when notification permission is denied — affects toggle UX. */
  notificationsDenied: boolean;
}

export function ReminderRow({
  reminder,
  onToggle,
  onDelete,
  onPress,
  notificationsDenied,
}: Props) {
  const text = getTextCached(reminder.id) ?? '…';
  const summary = formatRecurrence(reminder.recurrence);

  function handleDelete() {
    Alert.alert(
      'Delete reminder',
      `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(reminder.id),
        },
      ],
    );
  }

  function handleToggle(value: boolean) {
    onToggle(reminder.id, value);
    // P4: when permission is denied the banner will already be visible at the
    // top of the screen, so no extra action needed here — the toggle intent is
    // still saved (isEnabled = true in DB) so it activates when permission is
    // later granted.
  }

  const renderRightActions = (
    _progress: SharedValue<number>,
    _translation: SharedValue<number>,
    _methods: SwipeableMethods,
  ) => (
    <Pressable
      onPress={handleDelete}
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel="Delete reminder"
    >
      <Text style={styles.deleteText}>Delete</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        onPress={() => onPress(reminder.id)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Reminder: ${text}`}
      >
        <View style={styles.content}>
          <Text style={styles.text} numberOfLines={2}>
            {text}
          </Text>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
          {notificationsDenied && reminder.isEnabled && (
            <Text style={styles.deniedHint}>Notifications off</Text>
          )}
        </View>
        <Switch
          value={reminder.isEnabled}
          onValueChange={handleToggle}
          // Accessibility: announce current state + denied hint
          accessibilityLabel={`${reminder.isEnabled ? 'Disable' : 'Enable'} reminder`}
        />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowPressed: {
    backgroundColor: '#F9F9F9',
  },
  content: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  text: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '500',
    lineHeight: 22,
  },
  summary: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 17,
  },
  deniedHint: {
    fontSize: 11,
    color: '#FF9500',
    lineHeight: 16,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
  },
  deleteText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
