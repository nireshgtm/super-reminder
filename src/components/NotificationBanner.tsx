import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';

/**
 * Sticky banner shown at the top of the Home screen when notification
 * permission has been denied. Tapping "Enable in Settings" deep-links to the
 * system settings page so the user can grant permission without re-launching.
 */
export function NotificationBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.message}>
        Notifications are off — reminders won't fire
      </Text>
      <Pressable
        onPress={() => Linking.openSettings()}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Enable notifications in Settings"
      >
        <Text style={styles.buttonText}>Enable in Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0C14B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#856404',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
