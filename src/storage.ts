import * as SQLite from 'expo-sqlite';
import { generateLessonsForClass } from './calculations';
import { futureLessonsForClassUpdate, lessonsForClassDeactivation } from './classEditing';
import { sampleClasses, sampleExtraLessons } from './sampleData';
import { hasExistingUserData } from './storageInitialization';
import { resetDatabaseSql } from './storageSql';
import { KodlandGroupImport, KodlandStudentImport } from './kodland';
import { ClassRecord, KodlandGroupRecord, LessonRecord, PaymentConfirmation, StudentWithClass } from './types';

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

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY NOT NULL,
      externalId TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      progressSummary TEXT NOT NULL DEFAULT '',
      primaryClassId TEXT,
      rawDataJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_students (
      classId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      externalClassId TEXT NOT NULL,
      externalClassName TEXT NOT NULL,
      confirmed INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (classId, studentId)
    );

    CREATE TABLE IF NOT EXISTS kodland_groups (
      externalId TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      courseName TEXT NOT NULL,
      studentCount INTEGER NOT NULL,
      startDate TEXT NOT NULL,
      nextLessonDate TEXT NOT NULL,
      archived INTEGER NOT NULL,
      rawDataJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kodland_class_links (
      externalClassId TEXT PRIMARY KEY NOT NULL,
      localClassId TEXT,
      confirmed INTEGER NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kodland_student_groups (
      externalStudentId TEXT NOT NULL,
      externalClassId TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (externalStudentId, externalClassId)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  ensureColumn('students', 'email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'status', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'progressSummary', "TEXT NOT NULL DEFAULT ''");

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

export function loadStudents(): StudentWithClass[] {
  return db.getAllSync<StudentWithClassRow>(
    `SELECT students.*, class_students.classId, class_students.externalClassId, class_students.externalClassName, class_students.confirmed
      FROM students
      LEFT JOIN class_students ON class_students.studentId = students.id
      ORDER BY students.name ASC`,
  ).map((row) => ({ ...row, confirmed: Boolean(row.confirmed) }));
}

export function loadKodlandGroups(): KodlandGroupRecord[] {
  return db.getAllSync<KodlandGroupRow>(
    `SELECT kodland_groups.*, kodland_class_links.localClassId, kodland_class_links.confirmed
      FROM kodland_groups
      LEFT JOIN kodland_class_links ON kodland_class_links.externalClassId = kodland_groups.externalId
      ORDER BY kodland_groups.archived ASC, kodland_groups.title ASC`,
  ).map((row) => ({ ...row, archived: Boolean(row.archived), confirmed: Boolean(row.confirmed) }));
}

export function loadKodlandLastSync() {
  return db.getFirstSync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'kodland_last_sync'")?.value ?? '';
}

export function linkKodlandGroup(externalClassId: string, localClassId: string | null) {
  const now = new Date().toISOString();
  db.runSync(
    `INSERT OR REPLACE INTO kodland_class_links (externalClassId, localClassId, confirmed, updatedAt)
      VALUES (?, ?, 1, ?)`,
    [externalClassId, localClassId, now],
  );
  rebuildKodlandStudentLinks();
}

export function importKodlandSnapshot(groups: KodlandGroupImport[], students: KodlandStudentImport[]) {
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM class_students WHERE studentId LIKE 'kodland-student-%'");
    db.runSync("DELETE FROM students WHERE id LIKE 'kodland-student-%'");
    db.runSync('DELETE FROM kodland_groups');
    db.runSync('DELETE FROM kodland_student_groups');
    groups.forEach((group) => {
      db.runSync(
        `INSERT INTO kodland_groups
          (externalId, title, courseName, studentCount, startDate, nextLessonDate, archived, rawDataJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [group.externalId, group.title, group.courseName, group.studentCount, group.startDate, group.nextLessonDate, group.archived ? 1 : 0, JSON.stringify(group.rawData), now],
      );
      ensureKodlandGroupSuggestion(group, now);
    });
    students.forEach((student) => {
      const id = `kodland-student-${student.externalId}`;
      db.runSync(
        `INSERT OR REPLACE INTO students
          (id, externalId, name, email, status, progressSummary, primaryClassId, rawDataJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [id, student.externalId, student.name, student.email, student.status, student.progressSummary, JSON.stringify(student.rawData), now],
      );
      db.runSync(
        `INSERT OR REPLACE INTO kodland_student_groups (externalStudentId, externalClassId, updatedAt)
          VALUES (?, ?, ?)`,
        [student.externalId, student.externalClassId, now],
      );
    });
    db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kodland_last_sync', ?)", [now]);
    rebuildKodlandStudentLinks(now);
  });
  const linked = loadStudents().filter((student) => Boolean(student.classId)).length;
  return { imported: students.length, linked, unlinked: students.length - linked };
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

function ensureKodlandGroupSuggestion(group: KodlandGroupImport, now: string) {
  const existing = db.getFirstSync<{ externalClassId: string }>('SELECT externalClassId FROM kodland_class_links WHERE externalClassId = ?', [group.externalId]);
  if (existing) return;
  const localClass = loadClasses().find((item) => normalizedName(item.name) === normalizedName(group.title));
  db.runSync(
    `INSERT INTO kodland_class_links (externalClassId, localClassId, confirmed, updatedAt)
      VALUES (?, ?, 0, ?)`,
    [group.externalId, localClass?.id ?? null, now],
  );
}

function rebuildKodlandStudentLinks(now = new Date().toISOString()) {
  db.runSync("DELETE FROM class_students WHERE studentId LIKE 'kodland-student-%'");
  const students = db.getAllSync<{ id: string; externalId: string }>("SELECT id, externalId FROM students WHERE id LIKE 'kodland-student-%'");
  students.forEach((student) => {
    const groups = db.getAllSync<{ externalClassId: string; externalClassName: string; localClassId: string }>(
      `SELECT kodland_groups.externalId AS externalClassId, kodland_groups.title AS externalClassName, kodland_class_links.localClassId
        FROM kodland_groups
        INNER JOIN kodland_class_links ON kodland_class_links.externalClassId = kodland_groups.externalId
        WHERE kodland_class_links.localClassId IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM kodland_student_groups
            WHERE externalStudentId = ? AND externalClassId = kodland_groups.externalId
          )`,
      [student.externalId],
    );
    groups.forEach((group) => {
      db.runSync(
        `INSERT OR REPLACE INTO class_students
          (classId, studentId, externalClassId, externalClassName, confirmed, updatedAt)
          VALUES (?, ?, ?, ?, 1, ?)`,
        [group.localClassId, student.id, group.externalClassId, group.externalClassName, now],
      );
    });
    db.runSync('UPDATE students SET primaryClassId = ? WHERE id = ?', [groups[0]?.localClassId ?? null, student.id]);
  });
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
type StudentWithClassRow = Omit<StudentWithClass, 'confirmed'> & { confirmed: number };
type KodlandGroupRow = Omit<KodlandGroupRecord, 'archived' | 'confirmed'> & { archived: number; confirmed: number };

function mapClassRow(row: ClassRow): ClassRecord {
  return { ...row, active: Boolean(row.active) };
}

function mapLessonRow(row: LessonRow): LessonRecord {
  return { ...row, active: Boolean(row.active), canceled: Boolean(row.canceled) };
}
