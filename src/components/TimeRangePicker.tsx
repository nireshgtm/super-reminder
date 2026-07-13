import { View, Text, Pressable, StyleSheet } from 'react-native';

export interface TimeValue {
  hour: number;   // 0–23
  minute: number; // 0–59
}

interface TimeSpinnerProps {
  label: string;
  value: TimeValue;
  onChange: (v: TimeValue) => void;
}

export function TimeSpinner({ label, value, onChange }: TimeSpinnerProps) {
  const { hour, minute } = value;

  function adjustHour(delta: number) {
    onChange({ hour: (hour + delta + 24) % 24, minute });
  }

  function adjustMinute(delta: number) {
    // Step in 5-min increments; round current minute to nearest 5 first.
    const base = Math.round(minute / 5) * 5;
    onChange({ hour, minute: ((base + delta * 5) % 60 + 60) % 60 });
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.spinnerCol}>
      <Text style={styles.spinnerLabel}>{label}</Text>
      <View style={styles.spinnerRow}>
        {/* Hour column */}
        <View style={styles.unit}>
          <Pressable
            style={styles.arrow}
            onPress={() => adjustHour(1)}
            accessibilityLabel={`Increase ${label} hour`}
          >
            <Text style={styles.arrowText}>▲</Text>
          </Pressable>
          <Text style={styles.digit}>{pad(hour)}</Text>
          <Pressable
            style={styles.arrow}
            onPress={() => adjustHour(-1)}
            accessibilityLabel={`Decrease ${label} hour`}
          >
            <Text style={styles.arrowText}>▼</Text>
          </Pressable>
        </View>

        <Text style={styles.colon}>:</Text>

        {/* Minute column */}
        <View style={styles.unit}>
          <Pressable
            style={styles.arrow}
            onPress={() => adjustMinute(1)}
            accessibilityLabel={`Increase ${label} minute`}
          >
            <Text style={styles.arrowText}>▲</Text>
          </Pressable>
          <Text style={styles.digit}>{pad(minute)}</Text>
          <Pressable
            style={styles.arrow}
            onPress={() => adjustMinute(-1)}
            accessibilityLabel={`Decrease ${label} minute`}
          >
            <Text style={styles.arrowText}>▼</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface Props {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  onChange: (
    field: 'start' | 'end',
    hour: number,
    minute: number,
  ) => void;
}

export function TimeRangePicker({
  startHour,
  startMinute,
  endHour,
  endMinute,
  onChange,
}: Props) {
  return (
    <View style={styles.row}>
      <TimeSpinner
        label="Start"
        value={{ hour: startHour, minute: startMinute }}
        onChange={(v) => onChange('start', v.hour, v.minute)}
      />
      <Text style={styles.dash}>–</Text>
      <TimeSpinner
        label="End"
        value={{ hour: endHour, minute: endMinute }}
        onChange={(v) => onChange('end', v.hour, v.minute)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dash: {
    fontSize: 20,
    color: '#8E8E93',
    marginTop: 18, // align with digit row
  },
  spinnerCol: {
    alignItems: 'center',
    gap: 4,
  },
  spinnerLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  unit: {
    alignItems: 'center',
    minWidth: 44,
  },
  arrow: {
    padding: 6,
  },
  arrowText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '700',
  },
  digit: {
    fontSize: 26,
    fontWeight: '600',
    color: '#1C1C1E',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  colon: {
    fontSize: 26,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: -2,
  },
});
