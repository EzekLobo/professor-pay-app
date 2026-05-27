import * as SQLite from 'expo-sqlite';
import { generateLessonsForClass } from './calculations';
import { futureLessonsForClassUpdate, lessonsForClassDeactivation } from './classEditing';
import { sampleClasses, sampleExtraLessons } from './sampleData';
import { hasExistingUserData } from './storageInitialization';
import { resetDatabaseSql } from './storageSql';
import { ClassRecord, LessonRecord, PaymentConfirmation } from './types';

const db = SQLite.openDatabaseSync('aulapay.db');
const realSeedKey = 'real_seed_2026_05';

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      weekDay TEXT NOT NULL,
      time TEXT NOT NULL,
      firstLesson TEXT NOT NULL,
      lessonCount INTEGER NOT NULL,
      durationHours REAL NOT NULL,
      hourlyRate REAL NOT NULL,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY NOT NULL,
      classId TEXT,
      className TEXT NOT NULL,
      number INTEGER NOT NULL,
      lessonDate TEXT NOT NULL,
      student TEXT NOT NULL,
      type TEXT NOT NULL,
      durationHours REAL NOT NULL,
      hourlyRate REAL NOT NULL,
      active INTEGER NOT NULL,
      canceled INTEGER NOT NULL,
      note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_confirmations (
      id TEXT PRIMARY KEY NOT NULL,
      paymentDate TEXT UNIQUE NOT NULL,
      receivedAt TEXT NOT NULL,
      note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const initialized = db.getFirstSync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'initialized'");
  if (!initialized) {
    if (hasExistingUserData(loadExistingDataCounts())) {
      markInitialized('preserved_existing_data');
      return;
    }
    seedDatabase();
    markInitialized('seeded');
    return;
  }
  seedRealDataIfNeeded();
}

function markInitialized(realSeedValue: string) {
  db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('initialized', 'true')");
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [realSeedKey, realSeedValue]);
}

function loadExistingDataCounts() {
  return {
    classes: db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM classes')?.count ?? 0,
    lessons: db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM lessons')?.count ?? 0,
    paymentConfirmations: db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM payment_confirmations')?.count ?? 0,
  };
}

function seedDatabase() {
  const classes = sampleClasses();
  classes.forEach((classRecord) => {
    insertClass(classRecord);
    generateLessonsForClass(classRecord).forEach(insertLesson);
  });
  sampleExtraLessons().forEach(insertLesson);
}

function seedRealDataIfNeeded() {
  const realSeed = db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [realSeedKey]);
  if (realSeed) return;

  const classCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM classes')?.count ?? 0;
  const lessonCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM lessons')?.count ?? 0;
  if (classCount === 0 && lessonCount === 0) {
    seedDatabase();
    db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [realSeedKey, 'seeded']);
  }
}

export function loadClasses(): ClassRecord[] {
  return db
    .getAllSync<ClassRow>('SELECT * FROM classes ORDER BY active DESC, name ASC')
    .map(mapClassRow);
}

export function loadLessons(): LessonRecord[] {
  return db
    .getAllSync<LessonRow>('SELECT * FROM lessons ORDER BY lessonDate ASC, className ASC')
    .map(mapLessonRow);
}

export function loadConfirmations(): PaymentConfirmation[] {
  return db.getAllSync<PaymentConfirmation>('SELECT * FROM payment_confirmations ORDER BY paymentDate ASC');
}

export function addClass(input: Omit<ClassRecord, 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const classRecord: ClassRecord = { ...input, createdAt: now, updatedAt: now };
  insertClass(classRecord);
  generateLessonsForClass(classRecord).forEach(insertLesson);
}

export function updateClassFutureLessons(input: ClassRecord, today: string) {
  const current = db.getFirstSync<ClassRow>('SELECT * FROM classes WHERE id = ?', [input.id]);
  if (!current) return;
  const now = new Date().toISOString();
  const updatedClass: ClassRecord = {
    ...input,
    active: true,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  const existingLessons = db
    .getAllSync<LessonRow>('SELECT * FROM lessons WHERE classId = ? ORDER BY lessonDate ASC', [input.id])
    .map(mapLessonRow);
  const receivedPaymentDates = new Set(loadConfirmations().map((confirmation) => confirmation.paymentDate));
  const { nextLessons } = futureLessonsForClassUpdate(updatedClass, existingLessons, receivedPaymentDates);

  db.runSync(
    `UPDATE classes
      SET name = ?, weekDay = ?, time = ?, firstLesson = ?, lessonCount = ?, durationHours = ?, hourlyRate = ?, active = 1, updatedAt = ?
      WHERE id = ?`,
    [
      updatedClass.name,
      updatedClass.weekDay,
      updatedClass.time,
      updatedClass.firstLesson,
      updatedClass.lessonCount,
      updatedClass.durationHours,
      updatedClass.hourlyRate,
      updatedClass.updatedAt,
      updatedClass.id,
    ],
  );
  db.runSync('DELETE FROM lessons WHERE classId = ?', [updatedClass.id]);
  nextLessons.forEach(insertLesson);
}

export function deactivateClass(classId: string, today: string) {
  const now = new Date().toISOString();
  const existingLessons = db
    .getAllSync<LessonRow>('SELECT * FROM lessons WHERE classId = ? ORDER BY lessonDate ASC', [classId])
    .map(mapLessonRow);
  const receivedPaymentDates = new Set(loadConfirmations().map((confirmation) => confirmation.paymentDate));
  const nextLessons = lessonsForClassDeactivation(classId, existingLessons, receivedPaymentDates);

  db.runSync('UPDATE classes SET active = 0, updatedAt = ? WHERE id = ?', [now, classId]);
  nextLessons.forEach(insertLesson);
}

export function cancelLesson(lessonId: string) {
  db.runSync('UPDATE lessons SET active = 0, canceled = 1 WHERE id = ?', [lessonId]);
}

export function confirmPayment(paymentDate: string) {
  const now = new Date().toISOString();
  db.runSync(
    'INSERT OR REPLACE INTO payment_confirmations (id, paymentDate, receivedAt, note) VALUES (?, ?, ?, ?)',
    [`payment-${paymentDate}`, paymentDate, now, ''],
  );
}

export function addExtraLesson(input: Omit<LessonRecord, 'id' | 'classId' | 'className' | 'number' | 'type' | 'active' | 'canceled' | 'note'>) {
  const id = `extra-${Date.now()}`;
  insertLesson({
    id,
    classId: null,
    className: 'Extra',
    number: 1,
    lessonDate: input.lessonDate,
    student: input.student,
    type: 'Extra',
    durationHours: input.durationHours,
    hourlyRate: input.hourlyRate,
    active: true,
    canceled: false,
    note: '',
  });
}

export function resetDatabase() {
  db.execSync(resetDatabaseSql);
}

function insertClass(classRecord: ClassRecord) {
  db.runSync(
    `INSERT OR REPLACE INTO classes
      (id, name, weekDay, time, firstLesson, lessonCount, durationHours, hourlyRate, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      classRecord.id,
      classRecord.name,
      classRecord.weekDay,
      classRecord.time,
      classRecord.firstLesson,
      classRecord.lessonCount,
      classRecord.durationHours,
      classRecord.hourlyRate,
      classRecord.active ? 1 : 0,
      classRecord.createdAt,
      classRecord.updatedAt,
    ],
  );
}

function insertLesson(lesson: LessonRecord) {
  db.runSync(
    `INSERT OR REPLACE INTO lessons
      (id, classId, className, number, lessonDate, student, type, durationHours, hourlyRate, active, canceled, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lesson.id,
      lesson.classId,
      lesson.className,
      lesson.number,
      lesson.lessonDate,
      lesson.student,
      lesson.type,
      lesson.durationHours,
      lesson.hourlyRate,
      lesson.active ? 1 : 0,
      lesson.canceled ? 1 : 0,
      lesson.note,
    ],
  );
}

type ClassRow = Omit<ClassRecord, 'active'> & { active: number };
type LessonRow = Omit<LessonRecord, 'active' | 'canceled' | 'type'> & {
  active: number;
  canceled: number;
  type: 'Normal' | 'Extra';
};

function mapClassRow(row: ClassRow): ClassRecord {
  return { ...row, active: Boolean(row.active) };
}

function mapLessonRow(row: LessonRow): LessonRecord {
  return { ...row, active: Boolean(row.active), canceled: Boolean(row.canceled) };
}
