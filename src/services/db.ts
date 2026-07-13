import * as SQLite from 'expo-sqlite';
import type { Reminder } from '../models/Reminder';
import type { RecurrenceConfig } from '../models/RecurrenceConfig';

let _db: SQLite.SQLiteDatabase | null = null;
// Pending promise shared by all concurrent callers during cold launch —
// prevents two simultaneous openDatabaseAsync calls racing each other.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('super-reminder.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS reminders (
        id             TEXT    PRIMARY KEY,
        created_at     INTEGER NOT NULL,
        is_enabled     INTEGER NOT NULL DEFAULT 1,
        recurrence     TEXT    NOT NULL,
        voice_identifier TEXT
      );
    `);
    // Migration v0 → v1: add repeat_count, rate, pitch columns
    const [versionRow] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
    if (versionRow.user_version < 1) {
      await db.execAsync(`
        ALTER TABLE reminders ADD COLUMN repeat_count INTEGER;
        ALTER TABLE reminders ADD COLUMN rate REAL;
        ALTER TABLE reminders ADD COLUMN pitch REAL;
        PRAGMA user_version = 1;
      `);
    }
    _db = db;
    return db;
  })();
  return _dbPromise;
}

/** Call once at app start to guarantee the schema exists. */
export async function initDb(): Promise<void> {
  await getDb();
}

// ─── Row shape ────────────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  created_at: number;
  is_enabled: number; // SQLite has no boolean; 1 = true, 0 = false
  recurrence: string; // JSON
  voice_identifier: string | null;
  repeat_count: number | null;
  rate: number | null;
  pitch: number | null;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    createdAt: row.created_at,
    isEnabled: row.is_enabled === 1,
    recurrence: JSON.parse(row.recurrence) as RecurrenceConfig,
    voiceIdentifier: row.voice_identifier ?? undefined,
    repeatCount: row.repeat_count ?? undefined,
    rate: row.rate ?? undefined,
    pitch: row.pitch ?? undefined,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getAllReminders(): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReminderRow>(
    'SELECT * FROM reminders ORDER BY created_at ASC',
  );
  return rows.map(rowToReminder);
}

export async function getReminderById(id: string): Promise<Reminder | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ReminderRow>(
    'SELECT * FROM reminders WHERE id = ?',
    id,
  );
  return row ? rowToReminder(row) : null;
}

export async function insertReminder(reminder: Reminder): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminders (id, created_at, is_enabled, recurrence, voice_identifier, repeat_count, rate, pitch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    reminder.id,
    reminder.createdAt,
    reminder.isEnabled ? 1 : 0,
    JSON.stringify(reminder.recurrence),
    reminder.voiceIdentifier ?? null,
    reminder.repeatCount ?? null,
    reminder.rate ?? null,
    reminder.pitch ?? null,
  );
}

export async function updateReminder(reminder: Reminder): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminders
     SET is_enabled = ?, recurrence = ?, voice_identifier = ?, repeat_count = ?, rate = ?, pitch = ?
     WHERE id = ?`,
    reminder.isEnabled ? 1 : 0,
    JSON.stringify(reminder.recurrence),
    reminder.voiceIdentifier ?? null,
    reminder.repeatCount ?? null,
    reminder.rate ?? null,
    reminder.pitch ?? null,
    reminder.id,
  );
}

export async function setReminderEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE reminders SET is_enabled = ? WHERE id = ?',
    enabled ? 1 : 0,
    id,
  );
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reminders WHERE id = ?', id);
}
