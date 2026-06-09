import * as SQLite from 'expo-sqlite';
import { generateLessonsForClass } from './calculations';
import { futureLessonsForClassUpdate, lessonsForClassDeactivation } from './classEditing';
import { sampleClasses, sampleExtraLessons } from './sampleData';
import { hasExistingUserData } from './storageInitialization';
import { resetDatabaseSql } from './storageSql';
import { KodlandGroupImport, KodlandLessonImport, KodlandPendingReviewImport, KodlandStudentImport } from './kodland';
import { RemoteLicenseStatus, parseRemoteLicenseStatus, serializeRemoteLicenseStatus } from './remoteLicense';
import { ClassRecord, KodlandGroupRecord, KodlandLessonRecord, LessonRecord, PaymentConfirmation, PendingReviewRecord, StudentWithClass } from './types';

export type StudentLocalUpdate = {
  name: string;
  email: string;
  phone: string;
  status: string;
  profileUrl: string;
  localNote: string;
};

export type KodlandLessonMaterialUpdate = {
  slideUrl: string;
  scriptUrl: string;
};

type StoredKodlandLessonMaterial = {
  slideUrl: string;
  slideTitle: string;
  slideMaterialId: string;
  scriptUrl: string;
  scriptTitle: string;
  scriptMaterialId: string;
};

const db = SQLite.openDatabaseSync('aulapay.db');
const realSeedKey = 'real_seed_2026_05';
const pendingReviewsSnapshotVersionKey = 'pending_reviews_snapshot_version';
const pendingReviewsSnapshotVersion = 'submitted_only_v2';
const remoteLicenseStatusKey = 'remote_license_status';
const remoteLicenseSeenNotificationKey = 'remote_license_seen_notification';

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
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      progressSummary TEXT NOT NULL DEFAULT '',
      profileUrl TEXT NOT NULL DEFAULT '',
      localNote TEXT NOT NULL DEFAULT '',
      locallyEdited INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT NOT NULL DEFAULT '',
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
      courseId TEXT NOT NULL DEFAULT '',
      studentCount INTEGER NOT NULL,
      startDate TEXT NOT NULL,
      nextLessonDate TEXT NOT NULL,
      nextLessonTitle TEXT NOT NULL DEFAULT '',
      nextLessonUrl TEXT NOT NULL DEFAULT '',
      nextLessonId TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS kodland_lessons (
      id TEXT PRIMARY KEY NOT NULL,
      externalClassId TEXT NOT NULL,
      externalClassName TEXT NOT NULL,
      courseId TEXT NOT NULL DEFAULT '',
      lessonId TEXT NOT NULL,
      lessonNumber INTEGER NOT NULL,
      lessonTitle TEXT NOT NULL,
      lessonDate TEXT NOT NULL DEFAULT '',
      lessonPassed INTEGER NOT NULL,
      materialUrl TEXT NOT NULL DEFAULT '',
      slideUrl TEXT NOT NULL DEFAULT '',
      slideTitle TEXT NOT NULL DEFAULT '',
      slideMaterialId TEXT NOT NULL DEFAULT '',
      scriptUrl TEXT NOT NULL DEFAULT '',
      scriptTitle TEXT NOT NULL DEFAULT '',
      scriptMaterialId TEXT NOT NULL DEFAULT '',
      recordingUrl TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      externalClassId TEXT NOT NULL,
      externalClassName TEXT NOT NULL,
      externalStudentId TEXT NOT NULL,
      studentName TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      lessonNumber INTEGER NOT NULL,
      lessonTitle TEXT NOT NULL,
      moduleNumber TEXT NOT NULL,
      taskId TEXT NOT NULL,
      taskNumber INTEGER NOT NULL,
      taskTitle TEXT NOT NULL,
      statusKey TEXT NOT NULL,
      statusLabel TEXT NOT NULL,
      correctionUrl TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  ensureColumn('students', 'email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'phone', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'status', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'progressSummary', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'profileUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'localNote', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('students', 'locallyEdited', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('students', 'deletedAt', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_groups', 'courseId', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_groups', 'nextLessonTitle', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_groups', 'nextLessonUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_groups', 'nextLessonId', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'slideUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'slideTitle', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'slideMaterialId', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'scriptUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'scriptTitle', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'scriptMaterialId', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('kodland_lessons', 'recordingUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('pending_reviews', 'correctionUrl', "TEXT NOT NULL DEFAULT ''");
  resetPendingReviewsIfRuleChanged();

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
    `SELECT
        students.*,
        kodland_class_links.localClassId AS classId,
        kodland_student_groups.externalClassId AS externalClassId,
        kodland_groups.title AS externalClassName,
        COALESCE(kodland_class_links.confirmed, 0) AS confirmed
      FROM students
      LEFT JOIN kodland_student_groups ON kodland_student_groups.externalStudentId = students.externalId
      LEFT JOIN kodland_groups ON kodland_groups.externalId = kodland_student_groups.externalClassId
      LEFT JOIN kodland_class_links ON kodland_class_links.externalClassId = kodland_student_groups.externalClassId
      WHERE students.deletedAt = ''
      ORDER BY kodland_groups.title ASC, students.name ASC`,
  ).map(mapStudentRow);
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

export function loadRemoteLicenseStatus(): RemoteLicenseStatus | null {
  const value = db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [remoteLicenseStatusKey])?.value ?? '';
  return parseRemoteLicenseStatus(value);
}

export function saveRemoteLicenseStatus(status: RemoteLicenseStatus) {
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [remoteLicenseStatusKey, serializeRemoteLicenseStatus(status)]);
}

export function loadRemoteLicenseSeenNotification() {
  return db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [remoteLicenseSeenNotificationKey])?.value ?? '';
}

export function saveRemoteLicenseSeenNotification(notification: string) {
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [remoteLicenseSeenNotificationKey, notification]);
}

export function loadKodlandLessons(): KodlandLessonRecord[] {
  return db.getAllSync<KodlandLessonRow>(
    `SELECT * FROM kodland_lessons
      ORDER BY lessonPassed ASC, lessonNumber ASC, externalClassName ASC`,
  ).map(mapKodlandLessonRow);
}

export function updateKodlandLessonMaterials(lesson: KodlandLessonRecord, input: KodlandLessonMaterialUpdate) {
  const now = new Date().toISOString();
  const slideUrl = input.slideUrl.trim();
  const scriptUrl = input.scriptUrl.trim();
  if (lesson.courseId && lesson.lessonNumber > 0) {
    db.runSync(
      `UPDATE kodland_lessons
        SET slideUrl = ?, scriptUrl = ?, updatedAt = ?
        WHERE courseId = ? AND lessonNumber = ?`,
      [slideUrl, scriptUrl, now, lesson.courseId, lesson.lessonNumber],
    );
    return;
  }
  db.runSync(
    `UPDATE kodland_lessons
      SET slideUrl = ?, scriptUrl = ?, updatedAt = ?
      WHERE id = ?`,
    [slideUrl, scriptUrl, now, lesson.id],
  );
}

export function importKodlandLessons(lessons: KodlandLessonImport[]) {
  const now = new Date().toISOString();
  const lessonMaterials = loadExistingKodlandLessonMaterials();
  lessons.forEach((lesson) => {
    mergeLessonMaterial(lessonMaterials, lessonMaterialKey(lesson), {
      slideUrl: lesson.slideUrl,
      slideTitle: lesson.slideTitle,
      slideMaterialId: lesson.slideMaterialId,
      scriptUrl: lesson.scriptUrl,
      scriptTitle: lesson.scriptTitle,
      scriptMaterialId: lesson.scriptMaterialId,
    });
  });
  db.withTransactionSync(() => {
    lessons.forEach((lesson) => upsertKodlandLesson(lesson, lessonMaterials, now));
  });
}

export function loadPendingReviewsLastSync() {
  return db.getFirstSync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'kodland_pending_reviews_last_sync'")?.value ?? '';
}

export function loadPendingReviews(): PendingReviewRecord[] {
  return db.getAllSync<PendingReviewRecord>(
    `SELECT * FROM pending_reviews
      ORDER BY externalClassName ASC, studentName ASC, moduleNumber ASC, lessonNumber ASC, taskNumber ASC, taskTitle ASC`,
  );
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

export function updateKodlandStudent(studentId: string, input: StudentLocalUpdate) {
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE students
      SET name = ?, email = ?, phone = ?, status = ?, profileUrl = ?, localNote = ?, locallyEdited = 1, updatedAt = ?
      WHERE id = ? AND deletedAt = ''`,
    [input.name.trim(), input.email.trim(), input.phone.trim(), input.status.trim(), input.profileUrl.trim(), input.localNote.trim(), now, studentId],
  );
}

export function deleteKodlandStudent(studentId: string) {
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync('UPDATE students SET deletedAt = ?, updatedAt = ? WHERE id = ?', [now, now, studentId]);
    db.runSync('DELETE FROM class_students WHERE studentId = ?', [studentId]);
  });
}

export function importKodlandSnapshot(groups: KodlandGroupImport[], students: KodlandStudentImport[], pendingReviews: KodlandPendingReviewImport[] = [], lessons: KodlandLessonImport[] = []) {
  const now = new Date().toISOString();
  const incomingStudentIds = new Set(students.map((student) => `kodland-student-${student.externalId}`));
  const lessonMaterials = loadExistingKodlandLessonMaterials();
  lessons.forEach((lesson) => {
    mergeLessonMaterial(lessonMaterials, lessonMaterialKey(lesson), {
      slideUrl: lesson.slideUrl,
      slideTitle: lesson.slideTitle,
      slideMaterialId: lesson.slideMaterialId,
      scriptUrl: lesson.scriptUrl,
      scriptTitle: lesson.scriptTitle,
      scriptMaterialId: lesson.scriptMaterialId,
    });
  });
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM class_students WHERE studentId LIKE 'kodland-student-%'");
    const existingStudents = db.getAllSync<{ id: string; deletedAt: string; locallyEdited: number }>("SELECT id, deletedAt, locallyEdited FROM students WHERE id LIKE 'kodland-student-%'");
    existingStudents.forEach((student) => {
      if (!incomingStudentIds.has(student.id) && !student.locallyEdited && !student.deletedAt) {
        db.runSync('DELETE FROM students WHERE id = ?', [student.id]);
      }
    });
    db.runSync('DELETE FROM kodland_groups');
    db.runSync('DELETE FROM kodland_student_groups');
    db.runSync('DELETE FROM kodland_lessons');
    groups.forEach((group) => {
      db.runSync(
        `INSERT INTO kodland_groups
          (externalId, title, courseName, courseId, studentCount, startDate, nextLessonDate, nextLessonTitle, nextLessonUrl, nextLessonId, archived, rawDataJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [group.externalId, group.title, group.courseName, group.courseId, group.studentCount, group.startDate, group.nextLessonDate, group.nextLessonTitle, group.nextLessonUrl, group.nextLessonId, group.archived ? 1 : 0, JSON.stringify(group.rawData), now],
      );
      ensureKodlandGroupSuggestion(group, now);
    });
    lessons.forEach((lesson) => upsertKodlandLesson(lesson, lessonMaterials, now));
    students.forEach((student) => {
      const id = `kodland-student-${student.externalId}`;
      const existing = db.getFirstSync<{ locallyEdited: number; deletedAt: string }>('SELECT locallyEdited, deletedAt FROM students WHERE id = ?', [id]);
      if (existing?.deletedAt) return;
      if (existing?.locallyEdited) {
        db.runSync(
          `UPDATE students
            SET progressSummary = ?, rawDataJson = ?, updatedAt = ?
            WHERE id = ?`,
          [student.progressSummary, JSON.stringify(student.rawData), now, id],
        );
      } else {
        db.runSync(
          `INSERT INTO students
            (id, externalId, name, email, phone, status, progressSummary, profileUrl, localNote, locallyEdited, deletedAt, primaryClassId, rawDataJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, '', NULL, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              email = excluded.email,
              phone = excluded.phone,
              status = excluded.status,
              progressSummary = excluded.progressSummary,
              profileUrl = excluded.profileUrl,
              rawDataJson = excluded.rawDataJson,
              updatedAt = excluded.updatedAt`,
          [id, student.externalId, student.name, student.email, student.phone, student.status, student.progressSummary, student.profileUrl, JSON.stringify(student.rawData), now],
        );
      }
      db.runSync(
        `INSERT OR REPLACE INTO kodland_student_groups (externalStudentId, externalClassId, updatedAt)
          VALUES (?, ?, ?)`,
        [student.externalId, student.externalClassId, now],
      );
    });
    replacePendingReviews(pendingReviews, now);
    db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kodland_last_sync', ?)", [now]);
    rebuildKodlandStudentLinks(now);
  });
  const linked = loadStudents().filter((student) => Boolean(student.classId)).length;
  return { imported: students.length, linked, unlinked: students.length - linked };
}

function upsertKodlandLesson(lesson: KodlandLessonImport, lessonMaterials: Map<string, StoredKodlandLessonMaterial>, now: string) {
  const materials = lessonMaterials.get(lessonMaterialKey(lesson)) ?? { slideUrl: '', slideTitle: '', slideMaterialId: '', scriptUrl: '', scriptTitle: '', scriptMaterialId: '' };
  const existing = db.getFirstSync<KodlandLessonRow>('SELECT * FROM kodland_lessons WHERE id = ?', [lesson.id]);
  db.runSync(
    `INSERT OR REPLACE INTO kodland_lessons
      (id, externalClassId, externalClassName, courseId, lessonId, lessonNumber, lessonTitle, lessonDate, lessonPassed, materialUrl, slideUrl, slideTitle, slideMaterialId, scriptUrl, scriptTitle, scriptMaterialId, recordingUrl, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lesson.id,
      lesson.externalClassId || existing?.externalClassId || '',
      lesson.externalClassName || existing?.externalClassName || '',
      lesson.courseId || existing?.courseId || '',
      lesson.lessonId || existing?.lessonId || '',
      lesson.lessonNumber || existing?.lessonNumber || 0,
      lesson.lessonTitle || existing?.lessonTitle || '',
      lesson.lessonDate || existing?.lessonDate || '',
      lesson.lessonPassed ? 1 : existing?.lessonPassed ?? 0,
      lesson.materialUrl || existing?.materialUrl || '',
      lesson.slideUrl || materials.slideUrl,
      lesson.slideTitle || materials.slideTitle,
      lesson.slideMaterialId || materials.slideMaterialId,
      lesson.scriptUrl || materials.scriptUrl,
      lesson.scriptTitle || materials.scriptTitle,
      lesson.scriptMaterialId || materials.scriptMaterialId,
      lesson.recordingUrl || existing?.recordingUrl || '',
      now,
    ],
  );
}

function loadExistingKodlandLessonMaterials() {
  const materials = new Map<string, StoredKodlandLessonMaterial>();
  db.getAllSync<KodlandLessonRow>('SELECT * FROM kodland_lessons').forEach((lesson) => {
    mergeLessonMaterial(materials, lessonMaterialKey(lesson), {
      slideUrl: lesson.slideUrl,
      slideTitle: lesson.slideTitle,
      slideMaterialId: lesson.slideMaterialId,
      scriptUrl: lesson.scriptUrl,
      scriptTitle: lesson.scriptTitle,
      scriptMaterialId: lesson.scriptMaterialId,
    });
  });
  return materials;
}

function mergeLessonMaterial(materials: Map<string, StoredKodlandLessonMaterial>, key: string, input: StoredKodlandLessonMaterial) {
  if (!key) return;
  const current = materials.get(key) ?? { slideUrl: '', slideTitle: '', slideMaterialId: '', scriptUrl: '', scriptTitle: '', scriptMaterialId: '' };
  materials.set(key, {
    slideUrl: current.slideUrl || input.slideUrl.trim(),
    slideTitle: current.slideTitle || input.slideTitle.trim(),
    slideMaterialId: current.slideMaterialId || input.slideMaterialId.trim(),
    scriptUrl: current.scriptUrl || input.scriptUrl.trim(),
    scriptTitle: current.scriptTitle || input.scriptTitle.trim(),
    scriptMaterialId: current.scriptMaterialId || input.scriptMaterialId.trim(),
  });
}

function lessonMaterialKey(lesson: Pick<KodlandLessonRecord, 'id' | 'courseId' | 'lessonNumber'>) {
  if (lesson.courseId && lesson.lessonNumber > 0) return `${lesson.courseId}:${lesson.lessonNumber}`;
  return `lesson:${lesson.id}`;
}

export function importKodlandPendingReviews(pendingReviews: KodlandPendingReviewImport[]) {
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    replacePendingReviews(pendingReviews, now);
  });
  return { imported: pendingReviews.length };
}

function replacePendingReviews(pendingReviews: KodlandPendingReviewImport[], now: string) {
  db.runSync('DELETE FROM pending_reviews');
  pendingReviews.forEach((review) => {
    db.runSync(
      `INSERT OR REPLACE INTO pending_reviews
        (id, externalClassId, externalClassName, externalStudentId, studentName, lessonId, lessonNumber, lessonTitle, moduleNumber, taskId, taskNumber, taskTitle, statusKey, statusLabel, correctionUrl, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        review.id,
        review.externalClassId,
        review.externalClassName,
        review.externalStudentId,
        review.studentName,
        review.lessonId,
        review.lessonNumber,
        review.lessonTitle,
        review.moduleNumber,
        review.taskId,
        review.taskNumber,
        review.taskTitle,
        review.statusKey,
        review.statusLabel,
        review.correctionUrl,
        now,
      ],
    );
  });
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [pendingReviewsSnapshotVersionKey, pendingReviewsSnapshotVersion]);
  db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kodland_pending_reviews_last_sync', ?)", [now]);
}

function resetPendingReviewsIfRuleChanged() {
  const storedVersion = db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [pendingReviewsSnapshotVersionKey])?.value ?? '';
  if (storedVersion === pendingReviewsSnapshotVersion) return;
  db.runSync('DELETE FROM pending_reviews');
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [pendingReviewsSnapshotVersionKey, pendingReviewsSnapshotVersion]);
}

export function addClass(input: Omit<ClassRecord, 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const classRecord: ClassRecord = { ...input, createdAt: now, updatedAt: now };
  insertClass(classRecord);
  generateLessonsForClass(classRecord).forEach(insertLesson);
  return classRecord;
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
  db.runSync(
    `INSERT INTO kodland_class_links (externalClassId, localClassId, confirmed, updatedAt)
      VALUES (?, ?, 0, ?)`,
    [group.externalId, null, now],
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
type StudentWithClassRow = Omit<StudentWithClass, 'confirmed' | 'locallyEdited'> & { confirmed: number; locallyEdited: number };
type KodlandGroupRow = Omit<KodlandGroupRecord, 'archived' | 'confirmed'> & { archived: number; confirmed: number };
type KodlandLessonRow = Omit<KodlandLessonRecord, 'lessonPassed'> & { lessonPassed: number };

function mapClassRow(row: ClassRow): ClassRecord {
  return { ...row, active: Boolean(row.active) };
}

function mapLessonRow(row: LessonRow): LessonRecord {
  return { ...row, active: Boolean(row.active), canceled: Boolean(row.canceled) };
}

function mapStudentRow(row: StudentWithClassRow): StudentWithClass {
  return { ...row, confirmed: Boolean(row.confirmed), locallyEdited: Boolean(row.locallyEdited) };
}

function mapKodlandLessonRow(row: KodlandLessonRow): KodlandLessonRecord {
  return { ...row, lessonPassed: Boolean(row.lessonPassed) };
}
