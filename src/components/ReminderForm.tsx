import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import * as IntentLauncher from 'expo-intent-launcher';

import { DayOfWeekPicker } from './DayOfWeekPicker';
import { TimeRangePicker, TimeSpinner } from './TimeRangePicker';
import { useVoices } from '../hooks/useVoices';
import { setText } from '../services/secureStore';
import { insertReminder, updateReminder, getAllReminders } from '../services/db';
import { rescheduleAll } from '../services/notificationScheduler';
import type { Reminder } from '../models/Reminder';
import type { RecurrenceConfig, RecurringConfig } from '../models/RecurrenceConfig';
import { isOnceConfig } from '../models/RecurrenceConfig';
import type { Weekday } from '../models/Weekday';

const MAX_TEXT_LENGTH = 500;

// ─── Date spinner ─────────────────────────────────────────────────────────────

interface DateValue {
  year: number;
  month: number; // 1–12
  day: number;   // 1–31
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function dateToMs(d: DateValue): number {
  return new Date(d.year, d.month - 1, d.day).getTime();
}

function msToDate(ms: number): DateValue {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function todayDate(): DateValue {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function tomorrowDate(): DateValue {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function dateTimeToMs(d: DateValue, t: { hour: number; minute: number }): number {
  return new Date(d.year, d.month - 1, d.day, t.hour, t.minute, 0, 0).getTime();
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface DateSpinnerProps {
  label: string;
  value: DateValue;
  onChange: (v: DateValue) => void;
}

function DateSpinner({ label, value, onChange }: DateSpinnerProps) {
  const { year, month, day } = value;

  function adj(field: 'year' | 'month' | 'day', delta: number) {
    let ny = year, nm = month, nd = day;
    if (field === 'year') {
      ny = Math.max(2024, Math.min(2040, year + delta));
    } else if (field === 'month') {
      nm = ((month - 1 + delta + 12) % 12) + 1;
    } else {
      const maxDay = daysInMonth(ny, nm);
      nd = ((day - 1 + delta + maxDay) % maxDay) + 1;
    }
    nd = clampDay(ny, nm, nd);
    onChange({ year: ny, month: nm, day: nd });
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={dateStyles.col}>
      <Text style={dateStyles.label}>{label}</Text>
      <View style={dateStyles.row}>
        {/* Year */}
        <View style={dateStyles.unit}>
          <Pressable style={dateStyles.arrow} onPress={() => adj('year', 1)}>
            <Text style={dateStyles.arrowTxt}>▲</Text>
          </Pressable>
          <Text style={dateStyles.digit}>{year}</Text>
          <Pressable style={dateStyles.arrow} onPress={() => adj('year', -1)}>
            <Text style={dateStyles.arrowTxt}>▼</Text>
          </Pressable>
        </View>
        <Text style={dateStyles.sep}>/</Text>
        {/* Month */}
        <View style={dateStyles.unit}>
          <Pressable style={dateStyles.arrow} onPress={() => adj('month', 1)}>
            <Text style={dateStyles.arrowTxt}>▲</Text>
          </Pressable>
          <Text style={dateStyles.digit}>{MONTH_NAMES[month - 1]}</Text>
          <Pressable style={dateStyles.arrow} onPress={() => adj('month', -1)}>
            <Text style={dateStyles.arrowTxt}>▼</Text>
          </Pressable>
        </View>
        <Text style={dateStyles.sep}>/</Text>
        {/* Day */}
        <View style={dateStyles.unit}>
          <Pressable style={dateStyles.arrow} onPress={() => adj('day', 1)}>
            <Text style={dateStyles.arrowTxt}>▲</Text>
          </Pressable>
          <Text style={dateStyles.digit}>{pad(day)}</Text>
          <Pressable style={dateStyles.arrow} onPress={() => adj('day', -1)}>
            <Text style={dateStyles.arrowTxt}>▼</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const dateStyles = StyleSheet.create({
  col: { alignItems: 'center', gap: 4 },
  label: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unit: { alignItems: 'center', minWidth: 44 },
  arrow: { padding: 6 },
  arrowTxt: { fontSize: 11, color: '#007AFF', fontWeight: '700' },
  digit: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  sep: { fontSize: 16, color: '#8E8E93', paddingBottom: 2 },
});

// ─── Default recurrence ───────────────────────────────────────────────────────

const DEFAULT_RECURRENCE: RecurringConfig = {
  intervalValue: 30,
  intervalUnit: 'minutes',
  windowStartHour: 9,
  windowStartMinute: 0,
  windowEndHour: 17,
  windowEndMinute: 0,
  dateRangeEnabled: false,
  activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
};

// ─── Main form ────────────────────────────────────────────────────────────────

export interface ReminderFormProps {
  /** If provided, we're editing; otherwise adding. */
  existing?: Reminder & { text: string };
}

export function ReminderForm({ existing }: ReminderFormProps) {
  const router = useRouter();
  const { voices, isLoading: voicesLoading } = useVoices();

  // ── Form state ──────────────────────────────────────────────────────────────
  const existingIsOnce = existing ? isOnceConfig(existing.recurrence) : false;
  const existingRecurring = existing && !existingIsOnce
    ? (existing.recurrence as RecurringConfig)
    : undefined;

  const [mode, setMode] = useState<'recurring' | 'once'>(
    existingIsOnce ? 'once' : 'recurring',
  );
  const [text, setText_] = useState(existing?.text ?? '');
  const [recurrence, setRecurrence] = useState<RecurringConfig>(
    existingRecurring ?? DEFAULT_RECURRENCE,
  );
  const [voiceIdentifier, setVoiceIdentifier] = useState<string | undefined>(
    existing?.voiceIdentifier,
  );
  const [intervalText, setIntervalText] = useState(
    String(existingRecurring?.intervalValue ?? 30),
  );
  const [dateFrom, setDateFrom] = useState<DateValue>(
    existingRecurring?.dateFrom
      ? msToDate(existingRecurring.dateFrom)
      : todayDate(),
  );
  const [dateTo, setDateTo] = useState<DateValue>(
    existingRecurring?.dateTo
      ? msToDate(existingRecurring.dateTo)
      : todayDate(),
  );

  // One-time fire date/time state
  const existingOnceFireAt = existingIsOnce && existing
    ? (existing.recurrence as { type: 'once'; fireAt: number }).fireAt
    : undefined;
  const [onceDate, setOnceDate] = useState<DateValue>(
    existingOnceFireAt ? msToDate(existingOnceFireAt) : tomorrowDate(),
  );
  const [onceTime, setOnceTime] = useState<{ hour: number; minute: number }>(
    existingOnceFireAt
      ? (() => {
          const d = new Date(existingOnceFireAt);
          return { hour: d.getHours(), minute: d.getMinutes() };
        })()
      : { hour: 9, minute: 0 },
  );
  const [repeatCount, setRepeatCount] = useState(existing?.repeatCount ?? 1);
  const [speechRate, setSpeechRate] = useState(existing?.rate ?? 1.0);
  const [speechPitch, setSpeechPitch] = useState(existing?.pitch ?? 1.0);
  const [saving, setSaving] = useState(false);
  const [sttLoading, setSttLoading] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function updateRecurrence(patch: Partial<RecurringConfig>) {
    setRecurrence((prev) => ({ ...prev, ...patch }));
  }

  function handleIntervalChange(raw: string) {
    setIntervalText(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) {
      updateRecurrence({ intervalValue: n });
    }
  }

  function handleTimeChange(
    field: 'start' | 'end',
    hour: number,
    minute: number,
  ) {
    if (field === 'start') {
      updateRecurrence({ windowStartHour: hour, windowStartMinute: minute });
    } else {
      updateRecurrence({ windowEndHour: hour, windowEndMinute: minute });
    }
  }

  function handleDaysChange(days: Weekday[]) {
    updateRecurrence({ activeDays: days });
  }

  function handleDateRangeToggle(enabled: boolean) {
    updateRecurrence({ dateRangeEnabled: enabled });
  }

  function handleFromChange(d: DateValue) {
    setDateFrom(d);
    updateRecurrence({ dateFrom: dateToMs(d) });
  }

  function handleToChange(d: DateValue) {
    setDateTo(d);
    updateRecurrence({ dateTo: dateToMs(d) });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!text.trim()) return 'Reminder text cannot be empty.';
    if (text.length > MAX_TEXT_LENGTH)
      return `Text must be ${MAX_TEXT_LENGTH} characters or fewer.`;

    if (mode === 'once') {
      if (dateTimeToMs(onceDate, onceTime) <= Date.now())
        return 'Fire time must be in the future.';
      return null;
    }

    const iv = parseInt(intervalText, 10);
    if (isNaN(iv) || iv <= 0) return 'Interval must be a positive number.';

    const startTotalMin =
      recurrence.windowStartHour * 60 + recurrence.windowStartMinute;
    const endTotalMin =
      recurrence.windowEndHour * 60 + recurrence.windowEndMinute;
    if (endTotalMin <= startTotalMin)
      return 'Window end must be after window start.';

    if (recurrence.activeDays.length === 0)
      return 'Select at least one day of the week.';

    if (recurrence.dateRangeEnabled) {
      const fromMs = dateToMs(dateFrom);
      const toMs = dateToMs(dateTo);
      if (toMs < fromMs) return '"To" date must be on or after "From" date.';
    }

    return null;
  }

  // ── STT (Android) ────────────────────────────────────────────────────────

  async function handleMicPress() {
    setSttLoading(true);
    try {
      const result = await IntentLauncher.startActivityAsync(
        'android.speech.action.RECOGNIZE_SPEECH',
        { extra: { 'android.speech.extra.LANGUAGE_MODEL': 'free_form' } },
      );
      const spoken = result.extra?.['android.speech.extra.RESULTS']?.[0] as string | undefined;
      if (spoken) setText_(spoken.slice(0, MAX_TEXT_LENGTH));
    } catch {
      Alert.alert('Speech not available', 'Speech recognition is not available on this device.');
    } finally {
      setSttLoading(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const error = validate();
    if (error) {
      Alert.alert('Check your input', error);
      return;
    }

    setSaving(true);

    // ── Step 1: persist the reminder (must succeed) ──────────────────────────
    try {
      const finalRecurrence: RecurrenceConfig = mode === 'once'
        ? { type: 'once', fireAt: dateTimeToMs(onceDate, onceTime) }
        : {
            ...recurrence,
            intervalValue: parseInt(intervalText, 10),
            dateFrom: recurrence.dateRangeEnabled ? dateToMs(dateFrom) : undefined,
            dateTo: recurrence.dateRangeEnabled ? dateToMs(dateTo) : undefined,
          };

      if (existing) {
        const updated: Reminder = {
          ...existing,
          recurrence: finalRecurrence,
          voiceIdentifier: voiceIdentifier ?? undefined,
          repeatCount,
          rate: speechRate,
          pitch: speechPitch,
        };
        await setText(existing.id, text.trim());
        await updateReminder(updated);
      } else {
        const id = generateId();
        const reminder: Reminder = {
          id,
          createdAt: Date.now(),
          isEnabled: true,
          recurrence: finalRecurrence,
          voiceIdentifier: voiceIdentifier ?? undefined,
          repeatCount,
          rate: speechRate,
          pitch: speechPitch,
        };
        await setText(id, text.trim());
        await insertReminder(reminder);
      }
    } catch (e) {
      console.error('ReminderForm: save failed', e);
      Alert.alert('Error', 'Could not save reminder. Please try again.');
      setSaving(false);
      return;
    }

    // ── Step 2: reschedule (best-effort — never blocks navigation) ───────────
    try {
      const all = await getAllReminders();
      await rescheduleAll(all);
    } catch (e) {
      console.error('ReminderForm: reschedule failed (non-fatal)', e);
    }

    setSaving(false);
    router.back();
  }

  // ── Voice selected label ────────────────────────────────────────────────────

  const selectedVoiceName = voiceIdentifier
    ? (voices.find((v) => v.identifier === voiceIdentifier)?.name ??
      'Unknown voice')
    : 'Use default';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Text ── */}
        <Section title="Reminder Text">
          <TextInput
            style={styles.textInput}
            placeholder="What should I remind you about?"
            placeholderTextColor="#C7C7CC"
            value={text}
            onChangeText={(t) => setText_(t.slice(0, MAX_TEXT_LENGTH))}
            multiline
            maxLength={MAX_TEXT_LENGTH}
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Reminder text"
          />
          <View style={styles.textFooter}>
            {Platform.OS === 'android' && (
              <Pressable
                style={({ pressed }) => [
                  styles.micBtn,
                  pressed && styles.micBtnPressed,
                  sttLoading && styles.micBtnDisabled,
                ]}
                onPress={handleMicPress}
                disabled={sttLoading}
                accessibilityRole="button"
                accessibilityLabel="Dictate reminder text"
              >
                {sttLoading ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.micIcon}>🎤</Text>
                )}
              </Pressable>
            )}
            <Text style={styles.charCount}>
              {text.length} / {MAX_TEXT_LENGTH}
            </Text>
          </View>
        </Section>

        {/* ── Mode toggle ── */}
        <Section title="Reminder Type">
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeBtn, mode === 'once' && styles.modeBtnActive]}
              onPress={() => setMode('once')}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === 'once' }}
              accessibilityLabel="One-time reminder"
            >
              <Text style={[styles.modeBtnText, mode === 'once' && styles.modeBtnTextActive]}>
                One-time
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'recurring' && styles.modeBtnActive]}
              onPress={() => setMode('recurring')}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === 'recurring' }}
              accessibilityLabel="Recurring reminder"
            >
              <Text style={[styles.modeBtnText, mode === 'recurring' && styles.modeBtnTextActive]}>
                Recurring
              </Text>
            </Pressable>
          </View>
        </Section>

        {mode === 'once' ? (
          /* ── One-time: date + time ── */
          <Section title="Fire At">
            <View style={styles.onceRow}>
              <DateSpinner
                label="Date"
                value={onceDate}
                onChange={setOnceDate}
              />
              <Text style={styles.dateRangeDash}>·</Text>
              <TimeSpinner
                label="Time"
                value={onceTime}
                onChange={setOnceTime}
              />
            </View>
          </Section>
        ) : (
          <>
            {/* ── Interval ── */}
            <Section title="Repeat Interval">
              <View style={styles.intervalRow}>
                <Text style={styles.intervalLabel}>Every</Text>
                <TextInput
                  style={styles.intervalInput}
                  value={intervalText}
                  onChangeText={handleIntervalChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  accessibilityLabel="Interval value"
                />
                <View style={styles.unitToggle}>
                  <Pressable
                    style={[
                      styles.unitBtn,
                      recurrence.intervalUnit === 'minutes' && styles.unitBtnActive,
                    ]}
                    onPress={() => updateRecurrence({ intervalUnit: 'minutes' })}
                  >
                    <Text
                      style={[
                        styles.unitBtnText,
                        recurrence.intervalUnit === 'minutes' &&
                          styles.unitBtnTextActive,
                      ]}
                    >
                      min
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.unitBtn,
                      recurrence.intervalUnit === 'hours' && styles.unitBtnActive,
                    ]}
                    onPress={() => updateRecurrence({ intervalUnit: 'hours' })}
                  >
                    <Text
                      style={[
                        styles.unitBtnText,
                        recurrence.intervalUnit === 'hours' &&
                          styles.unitBtnTextActive,
                      ]}
                    >
                      hr
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Section>

            {/* ── Daily window ── */}
            <Section title="Daily Window">
              <TimeRangePicker
                startHour={recurrence.windowStartHour}
                startMinute={recurrence.windowStartMinute}
                endHour={recurrence.windowEndHour}
                endMinute={recurrence.windowEndMinute}
                onChange={handleTimeChange}
              />
            </Section>

            {/* ── Days of week ── */}
            <Section title="Active Days">
              <DayOfWeekPicker
                selected={recurrence.activeDays}
                onChange={handleDaysChange}
              />
            </Section>

            {/* ── Date range ── */}
            <Section title="Date Range">
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Restrict to date range</Text>
                <Switch
                  value={recurrence.dateRangeEnabled}
                  onValueChange={handleDateRangeToggle}
                  accessibilityLabel="Enable date range"
                />
              </View>
              {recurrence.dateRangeEnabled && (
                <View style={styles.dateRangeRow}>
                  <DateSpinner
                    label="From"
                    value={dateFrom}
                    onChange={handleFromChange}
                  />
                  <Text style={styles.dateRangeDash}>–</Text>
                  <DateSpinner
                    label="To"
                    value={dateTo}
                    onChange={handleToChange}
                  />
                </View>
              )}
            </Section>
          </>
        )}

        {/* ── Voice & Speech ── */}
        <Section title="Voice & Speech">
          <Pressable
            style={styles.voiceButton}
            onPress={() => setVoiceModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Select voice"
          >
            <Text style={styles.voiceButtonText}>{selectedVoiceName}</Text>
            <Text style={styles.voiceChevron}>›</Text>
          </Pressable>
          <Stepper
            label="Repeat"
            displayValue={String(repeatCount)}
            onDecrement={() => setRepeatCount((n) => Math.max(1, n - 1))}
            onIncrement={() => setRepeatCount((n) => Math.min(5, n + 1))}
          />
          <Stepper
            label="Speed"
            displayValue={`${speechRate.toFixed(1)}×`}
            onDecrement={() => setSpeechRate((r) => Math.round(Math.max(0.5, r - 0.1) * 10) / 10)}
            onIncrement={() => setSpeechRate((r) => Math.round(Math.min(2.0, r + 0.1) * 10) / 10)}
          />
          <Stepper
            label="Pitch"
            displayValue={speechPitch.toFixed(1)}
            onDecrement={() => setSpeechPitch((p) => Math.round(Math.max(0.5, p - 0.1) * 10) / 10)}
            onIncrement={() => setSpeechPitch((p) => Math.round(Math.min(2.0, p + 0.1) * 10) / 10)}
          />
        </Section>

        {/* ── Save / Cancel ── */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && styles.saveBtnPressed,
              saving && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save reminder"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {existing ? 'Save Changes' : 'Add Reminder'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.cancelBtnPressed,
            ]}
            onPress={() => router.back()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Voice picker modal ── */}
      <Modal
        visible={voiceModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Voice</Text>
            <Pressable
              onPress={() => setVoiceModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close voice picker"
            >
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>

          {voicesLoading ? (
            <View style={styles.modalCenter}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <FlatList
              data={[
                { identifier: '', name: 'Use default', language: '' },
                ...voices,
              ]}
              keyExtractor={(v) => v.identifier}
              renderItem={({ item }) => {
                const isSelected =
                  item.identifier === '' && !voiceIdentifier
                    ? true
                    : item.identifier === voiceIdentifier;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.voiceItem,
                      pressed && styles.voiceItemPressed,
                    ]}
                    onPress={() => {
                      setVoiceIdentifier(
                        item.identifier === '' ? undefined : item.identifier,
                      );
                      setVoiceModalVisible(false);
                      if (text.trim() && item.identifier !== '') {
                        Speech.speak(text.slice(0, 60), {
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
                    {isSelected && (
                      <Text style={styles.voiceCheck}>✓</Text>
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={styles.separator} />
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({
  label,
  displayValue,
  onDecrement,
  onIncrement,
}: {
  label: string;
  displayValue: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
          onPress={onDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{displayValue}</Text>
        <Pressable
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
          onPress={onIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { paddingBottom: 48 },

  section: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },

  modeToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007AFF',
    alignSelf: 'stretch',
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modeBtnActive: {
    backgroundColor: '#007AFF',
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  modeBtnTextActive: {
    color: '#fff',
  },

  onceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  textInput: {
    fontSize: 16,
    color: '#1C1C1E',
    minHeight: 80,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  textFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  charCount: {
    flex: 1,
    fontSize: 12,
    color: '#C7C7CC',
    textAlign: 'right',
  },
  micBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#EBF3FF',
  },
  micBtnPressed: {
    backgroundColor: '#D6E8FF',
  },
  micBtnDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 18,
  },

  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  intervalLabel: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  intervalInput: {
    width: 64,
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#007AFF',
    paddingBottom: 2,
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  unitBtnActive: {
    backgroundColor: '#007AFF',
  },
  unitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  unitBtnTextActive: {
    color: '#fff',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
  },
  dateRangeDash: {
    fontSize: 20,
    color: '#8E8E93',
    marginTop: 12,
  },

  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceButtonText: {
    fontSize: 15,
    color: '#1C1C1E',
    flex: 1,
  },
  voiceChevron: {
    fontSize: 18,
    color: '#C7C7CC',
  },

  actions: {
    marginTop: 28,
    marginHorizontal: 16,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cancelBtnPressed: { opacity: 0.7 },
  cancelBtnText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FF3B30',
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
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  modalClose: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '500',
  },
  modalCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  voiceItemPressed: { backgroundColor: '#F5F5F5' },
  voiceItemContent: { flex: 1 },
  voiceItemName: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  voiceItemLang: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  voiceCheck: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 16,
  },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EBF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: {
    backgroundColor: '#D6E8FF',
  },
  stepperBtnText: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: '500',
    lineHeight: 24,
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    minWidth: 48,
    textAlign: 'center',
  },
});
