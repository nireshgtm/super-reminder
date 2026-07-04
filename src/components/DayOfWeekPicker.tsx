import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ALL_WEEKDAYS, type Weekday } from '../models/Weekday';

const LABELS: Record<Weekday, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};

const FULL_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

interface Props {
  selected: Weekday[];
  /** Called with the new selection. Caller must ensure ≥1 day remains. */
  onChange: (days: Weekday[]) => void;
}

export function DayOfWeekPicker({ selected, onChange }: Props) {
  function toggle(day: Weekday) {
    const isOn = selected.includes(day);
    // Prevent deselecting the last day.
    if (isOn && selected.length === 1) return;
    const next = isOn
      ? selected.filter((d) => d !== day)
      : [...selected, day];
    onChange(next);
  }

  return (
    <View style={styles.row}>
      {ALL_WEEKDAYS.map((day) => {
        const active = selected.includes(day);
        return (
          <Pressable
            key={day}
            onPress={() => toggle(day)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={FULL_LABELS[day]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {LABELS[day]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E5EA',
  },
  chipActive: {
    backgroundColor: '#007AFF',
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
  },
  chipTextActive: {
    color: '#fff',
  },
});
