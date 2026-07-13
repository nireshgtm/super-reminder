import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getAllReminders,
  deleteReminder,
  setReminderEnabled,
} from '../services/db';
import { prefetchTexts, deleteText } from '../services/secureStore';
import { rescheduleAll } from '../services/notificationScheduler';
import type { Reminder } from '../models/Reminder';

export interface UseRemindersResult {
  reminders: Reminder[];
  isLoading: boolean;
  /** Re-load from DB and warm text cache. Call after add/edit in Phase 5. */
  reload: () => Promise<void>;
  /** Optimistic toggle: updates UI immediately, then persists + reschedules. */
  toggleEnabled: (id: string, enabled: boolean) => Promise<void>;
  /** Remove reminder from DB + SecureStore + reschedule. */
  remove: (id: string) => Promise<void>;
}

export function useReminders(): UseRemindersResult {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Only show the full-screen spinner on the very first load. Focus-return
  // reloads (e.g. coming back from Add/Edit or Cancel) update data silently.
  const initialLoadDone = useRef(false);

  const reload = useCallback(async () => {
    const showSpinner = !initialLoadDone.current;
    if (showSpinner) setIsLoading(true);
    try {
      const rows = await getAllReminders();
      // Warm the text cache for all reminders in parallel (P3).
      await prefetchTexts(rows.map((r) => r.id));
      setReminders(rows);
      initialLoadDone.current = true;
    } catch (e) {
      console.error('useReminders: reload failed', e);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      // Optimistic update: reflect the change in UI before the async write.
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isEnabled: enabled } : r)),
      );
      // Persist to DB.
      await setReminderEnabled(id, enabled);
      // Reschedule from the source-of-truth. Re-fetching from DB ensures the
      // scheduler sees the committed state (not just the optimistic snapshot).
      const current = await getAllReminders();
      await rescheduleAll(current);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    // Optimistic update.
    setReminders((prev) => prev.filter((r) => r.id !== id));
    // Delete text from SecureStore first so there's no orphan.
    await deleteText(id);
    await deleteReminder(id);
    // Reschedule with the deleted reminder absent.
    const current = await getAllReminders();
    await rescheduleAll(current);
  }, []);

  return { reminders, isLoading, reload, toggleEnabled, remove };
}
