import * as SQLite from 'expo-sqlite';
import type { Reminder } from '../models/Reminder';
import type { RecurrenceConfig } from '../models/RecurrenceConfig';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('super-reminder.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reminders (
      id             TEXT    PRIMARY KEY,
      created_at     INTEGER NOT NULL,
      is_enabled     INTEGER NOT NULL DEFAULT 1,
      recurrence     TEXT    NOT NULL,
      voice_identifier TEXT
    );
  `);
  return _db;
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
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    createdAt: row.created_at,
    isEnabled: row.is_enabled === 1,
    recurrence: JSON.parse(row.recurrence) as RecurrenceConfig,
    voiceIdentifier: row.voice_identifier ?? undefined,
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
    `INSERT INTO reminders (id, created_at, is_enabled, recurrence, voice_identifier)
     VALUES (?, ?, ?, ?, ?)`,
    reminder.id,
    reminder.createdAt,
    reminder.isEnabled ? 1 : 0,
    JSON.stringify(reminder.recurrence),
    reminder.voiceIdentifier ?? null,
  );
}

export async function updateReminder(reminder: Reminder): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminders
     SET is_enabled = ?, recurrence = ?, voice_identifier = ?
     WHERE id = ?`,
    reminder.isEnabled ? 1 : 0,
    JSON.stringify(reminder.recurrence),
    reminder.voiceIdentifier ?? null,
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
