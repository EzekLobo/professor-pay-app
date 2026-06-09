import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  Edit3,
  GraduationCap,
  Link2,
  MessageCircle,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  buildDashboard,
  filterLessonHistoryByKind,
  formatCurrency,
  formatDate,
  fromPickerDate,
  getWeekDayLabel,
  groupClassLessonHistory,
  relevantPayments,
  todayIso,
  toPickerDate,
  type ClassLessonHistoryGroup,
  type LessonFilter,
} from './src/calculations';
import { clearKodlandCredentials, loadKodlandCredentials, saveKodlandCredentials } from './src/kodlandCredentials';
import { syncKodlandLessonMaterials, syncKodlandPendingReviews, syncKodlandStudents } from './src/kodland';
import { labels } from './src/labels';
import {
  addClass,
  addExtraLesson,
  cancelLesson,
  confirmPayment,
  deactivateClass,
  deleteKodlandStudent,
  importKodlandLessons,
  importKodlandPendingReviews,
  importKodlandSnapshot,
  initDatabase,
  linkKodlandGroup,
  loadClasses,
  loadConfirmations,
  loadKodlandLessons,
  loadLessons,
  loadKodlandGroups,
  loadKodlandLastSync,
  loadPendingReviews,
  loadPendingReviewsLastSync,
  loadStudents,
  resetDatabase,
  updateKodlandLessonMaterials,
  updateKodlandStudent,
  updateClassFutureLessons,
} from './src/storage';
import { ClassRecord, DashboardData, KodlandGroupRecord, KodlandLessonRecord, LessonView, PaymentView, PendingReviewRecord, StudentWithClass } from './src/types';
import { parseDecimal, validateClassForm, validateExtraLessonForm } from './src/validation';
import { normalizeWhatsAppPhone } from './src/whatsapp';
import { compareStudentsByStatusProgressThenName, isHighlightedRank, studentPointsLabel, studentRankPosition, studentStatusLabel } from './src/studentStatus';
import { filterPendingReviewsByModule, filterPendingReviewsForActiveStudents, summarizePendingReviews, summarizePendingReviewsByModule } from './src/pendingReviews';
import { groupKodlandMaterialsByCourse } from './src/kodlandLessonMaterials';

type Tab = 'Resumo' | 'Pagamentos' | 'Turmas' | 'Aulas' | 'Correções' | 'Kodland';
type PaymentArea = 'Pagamentos' | 'Histórico';
type SelectOption = { label: string; value: string };
type MetricHelp = {
  title: string;
  items: { label: string; description: string }[];
};

const tabs: Tab[] = ['Resumo', 'Pagamentos', 'Turmas', 'Aulas', 'Correções', 'Kodland'];
const paymentAreas: PaymentArea[] = ['Pagamentos', 'Histórico'];
const lessonFilters: LessonFilter[] = ['Todas', 'Turmas', 'Extras'];
const timeOptions = Array.from({ length: 36 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minute = String(totalMinutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
});

const emptyDashboard: DashboardData = buildDashboard([], [], []);
const summaryHelp: MetricHelp = {
  title: labels.summaryTodayLabel,
  items: [
    { label: labels.earnedLabel, description: 'Valor das aulas realizadas ate hoje.' },
    { label: labels.receivedLabel, description: 'Pagamentos recebidos ou ja vencidos.' },
    { label: labels.normalLabel, description: 'Aulas de turma ja realizadas.' },
    { label: labels.extraLabel, description: 'Aulas extras ja realizadas.' },
  ],
};
const futureHelp: MetricHelp = {
  title: labels.futureLabel,
  items: [
    { label: labels.plannedLabel, description: 'Valor das aulas futuras.' },
    { label: labels.futureLessonsLabel, description: 'Aulas ainda planejadas.' },
    { label: labels.totalPlannedLabel, description: 'Soma ativa do planejamento.' },
    { label: labels.totalLessonsLabel, description: 'Quantidade total ativa.' },
  ],
};

function upcomingKodlandLessons(lessons: KodlandLessonRecord[], today: string) {
  return lessons
    .filter((lesson) => !lesson.lessonPassed && (!lesson.lessonDate || lesson.lessonDate >= today))
    .sort((a, b) => {
      const aDate = a.lessonDate || '9999-12-31';
      const bDate = b.lessonDate || '9999-12-31';
      return aDate.localeCompare(bDate)
        || a.externalClassName.localeCompare(b.externalClassName, 'pt-BR', { sensitivity: 'base' })
        || a.lessonNumber - b.lessonNumber;
    });
}

function nextKodlandLessonsByClass(lessons: KodlandLessonRecord[], today: string) {
  const byClass = new Map<string, KodlandLessonRecord>();
  upcomingKodlandLessons(lessons, today).forEach((lesson) => {
    if (!byClass.has(lesson.externalClassId)) byClass.set(lesson.externalClassId, lesson);
  });
  return [...byClass.values()].sort((a, b) => a.externalClassName.localeCompare(b.externalClassName, 'pt-BR', { sensitivity: 'base' }));
}

export default function App() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [kodlandLessons, setKodlandLessons] = useState<KodlandLessonRecord[]>([]);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [kodlandGroups, setKodlandGroups] = useState<KodlandGroupRecord[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReviewRecord[]>([]);
  const [kodlandLastSync, setKodlandLastSync] = useState('');
  const [pendingReviewsLastSync, setPendingReviewsLastSync] = useState('');
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [activeTab, setActiveTab] = useState<Tab>('Resumo');
  const [selectedPayment, setSelectedPayment] = useState<PaymentView | null>(null);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [classInitialName, setClassInitialName] = useState('');
  const [pendingKodlandGroup, setPendingKodlandGroup] = useState<KodlandGroupRecord | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithClass | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentWithClass | null>(null);
  const [editingKodlandLesson, setEditingKodlandLesson] = useState<KodlandLessonRecord | null>(null);
  const [paymentArea, setPaymentArea] = useState<PaymentArea>('Pagamentos');
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>('Todas');
  const [expandedLessonClassId, setExpandedLessonClassId] = useState<string | null>(null);
  const [refreshingKodlandMaterials, setRefreshingKodlandMaterials] = useState(false);
  const [activeHelp, setActiveHelp] = useState<MetricHelp | null>(null);

  const refresh = () => {
    const loadedClasses = loadClasses();
    const loadedLessons = loadLessons();
    const loadedConfirmations = loadConfirmations();
    const nextDashboard = buildDashboard(loadedClasses, loadedLessons, loadedConfirmations);
    setClasses(loadedClasses);
    setLessons(nextDashboard.lessons);
    setKodlandLessons(loadKodlandLessons());
    setStudents(loadStudents());
    setKodlandGroups(loadKodlandGroups());
    setPendingReviews(loadPendingReviews());
    setKodlandLastSync(loadKodlandLastSync());
    setPendingReviewsLastSync(loadPendingReviewsLastSync());
    setDashboard(nextDashboard);
  };

  useEffect(() => {
    initDatabase();
    refresh();
  }, []);

  const filteredLessons = useMemo(() => filterLessonHistoryByKind(lessons, lessonFilter, dashboard.today), [lessons, lessonFilter, dashboard.today]);
  const classLessonGroups = useMemo(() => lessonFilter === 'Turmas' ? groupClassLessonHistory(filteredLessons) : [], [filteredLessons, lessonFilter]);
  const visiblePayments = useMemo(() => relevantPayments(dashboard.payments, dashboard.today), [dashboard.payments, dashboard.today]);
  const nextKodlandLessons = useMemo(() => nextKodlandLessonsByClass(kodlandLessons, dashboard.today), [kodlandLessons, dashboard.today]);
  const kodlandMaterialCourses = useMemo(() => groupKodlandMaterialsByCourse(kodlandLessons, kodlandGroups), [kodlandLessons, kodlandGroups]);
  const hasKodlandMaterialLinks = useMemo(() => kodlandLessons.some((lesson) => Boolean(lesson.slideUrl || lesson.scriptUrl)), [kodlandLessons]);
  const selectedClass = selectedClassId ? classes.find((item) => item.id === selectedClassId) ?? null : null;
  const selectedClassStudents = selectedClassId ? students.filter((student) => student.classId === selectedClassId).sort(compareStudentsByStatusProgressThenName) : [];

  useEffect(() => {
    setExpandedLessonClassId(null);
  }, [activeTab, lessonFilter]);

  const handleTabChange = (tab: Tab) => {
    setSelectedClassId(null);
    setSelectedStudent(null);
    setSelectedPayment(null);
    setEditingStudent(null);
    if (tab !== 'Pagamentos') setPaymentArea('Pagamentos');
    if (tab === 'Aulas') setExpandedLessonClassId(null);
    setActiveTab(tab);
  };

  const handleDeactivateClass = (classId: string) => {
    Alert.alert('Retirar turma', 'Aulas realizadas ficam no histórico. Aulas futuras saem do cálculo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Retirar',
        style: 'destructive',
        onPress: () => {
          deactivateClass(classId, todayIso());
          refresh();
        },
      },
    ]);
  };

  const handleCancelLesson = (lessonId: string) => {
    cancelLesson(lessonId);
    refresh();
  };

  const handleConfirmPayment = (paymentDate: string) => {
    confirmPayment(paymentDate);
    refresh();
    setSelectedPayment((current) => current && buildDashboard(loadClasses(), loadLessons(), loadConfirmations()).payments.find((payment) => payment.paymentDate === current.paymentDate) || current);
  };

  const handleReset = () => {
    Alert.alert('Resetar dados', 'Isso apaga turmas, aulas, extras e todo o histórico de pagamentos recebidos. Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Resetar',
        style: 'destructive',
        onPress: () => {
          resetDatabase();
          setSelectedPayment(null);
          refresh();
        },
      },
    ]);
  };

  const openClassEditor = (classId: string) => {
    const classRecord = classes.find((item) => item.id === classId);
    if (classRecord) {
      setEditingClass(classRecord);
      setClassModalOpen(true);
    }
  };

  const closeClassModal = () => {
    setClassModalOpen(false);
    setEditingClass(null);
    setClassInitialName('');
    setPendingKodlandGroup(null);
  };

  const saveStudent = (student: StudentWithClass, input: { name: string; email: string; phone: string; status: string; profileUrl: string; localNote: string }) => {
    updateKodlandStudent(student.id, input);
    setSelectedStudent((current) => current?.id === student.id ? { ...current, ...input, locallyEdited: true } : current);
    setEditingStudent(null);
    refresh();
  };

  const deleteStudent = (student: StudentWithClass) => {
    Alert.alert('Excluir aluno', `${student.name} será ocultado no AulaPay e não voltará na próxima sincronização.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          deleteKodlandStudent(student.id);
          setSelectedStudent(null);
          refresh();
        },
      },
    ]);
  };

  const copyProfile = async (student: StudentWithClass) => {
    if (!student.profileUrl) return;
    await Clipboard.setStringAsync(student.profileUrl);
    Alert.alert('Perfil Kodland', 'Link copiado.');
  };

  const openWhatsApp = async (student: StudentWithClass) => {
    const phone = normalizeWhatsAppPhone(student.phone);
    if (!phone) return;
    await Linking.openURL(`https://wa.me/${phone}`);
  };

  const openProfile = async (student: StudentWithClass) => {
    if (!student.profileUrl) return;
    await Linking.openURL(student.profileUrl);
  };

  const openReview = async (review: PendingReviewRecord) => {
    if (!review.correctionUrl) return;
    await Linking.openURL(review.correctionUrl);
  };

  const openKodlandMaterial = async (url: string) => {
    if (!url) return;
    await Linking.openURL(url);
  };

  const saveKodlandLessonMaterials = (lesson: KodlandLessonRecord, input: { slideUrl: string; scriptUrl: string }) => {
    updateKodlandLessonMaterials(lesson, input);
    setEditingKodlandLesson(null);
    refresh();
  };

  const refreshPendingReviewsOnly = async () => {
    try {
      const credentials = await loadKodlandCredentials();
      const activeGroups = kodlandGroups
        .filter((group) => !group.archived)
        .map((group) => ({ externalId: group.externalId, title: group.title, archived: group.archived }));
      const result = await syncKodlandPendingReviews(credentials, activeGroups);
      if (!result.ok) {
        Alert.alert('Correções Kodland', result.message);
        return;
      }
      importKodlandPendingReviews(result.pendingReviews);
      refresh();
      const visibleReviews = filterPendingReviewsForActiveStudents(result.pendingReviews, students);
      Alert.alert('Correções Kodland', `${visibleReviews.length} atividades pendentes atualizadas.`);
    } catch {
      Alert.alert('Correções Kodland', 'Não foi possível atualizar as correções.');
    }
  };

  const refreshKodlandMaterialsOnly = async () => {
    if (refreshingKodlandMaterials) return;
    const activeGroups = kodlandGroups
      .filter((group) => !group.archived)
      .map((group) => ({
        externalId: group.externalId,
        title: group.title,
        courseId: group.courseId,
        courseName: group.courseName,
        archived: group.archived,
      }));
    if (!activeGroups.length) {
      Alert.alert('Materiais Kodland', 'Sincronize as turmas Kodland antes de atualizar os materiais.');
      return;
    }
    setRefreshingKodlandMaterials(true);
    try {
      const credentials = await loadKodlandCredentials();
      const result = await syncKodlandLessonMaterials(credentials, activeGroups);
      if (!result.ok) {
        Alert.alert('Materiais Kodland', result.message);
        return;
      }
      importKodlandLessons(result.lessons);
      refresh();
      Alert.alert('Materiais Kodland', `${result.lessons.length} aulas atualizadas.`);
    } catch {
      Alert.alert('Materiais Kodland', 'Nao foi possivel atualizar os materiais.');
    } finally {
      setRefreshingKodlandMaterials(false);
    }
  };

  const openKodlandClassCreator = (group: KodlandGroupRecord) => {
    setEditingClass(null);
    setClassInitialName(group.title);
    setPendingKodlandGroup(group);
    setClassModalOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <Header
          total={dashboard.future.totalPlanned}
          today={dashboard.today}
          onAddClass={() => {
            setEditingClass(null);
            setClassInitialName('');
            setPendingKodlandGroup(null);
            setClassModalOpen(true);
          }}
          onAddExtra={() => setExtraModalOpen(true)}
        />

        <View style={styles.tabsFrame}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {tabs.map((tab) => (
              <Pressable key={tab} onPress={() => handleTabChange(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
                <Text numberOfLines={1} style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {activeTab === 'Resumo' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.paymentGrid}>
              <PaymentHighlightCard tone="green" title={labels.lastPaymentLabel} payment={dashboard.lastPayment} kind="total" onPress={() => dashboard.lastPayment && setSelectedPayment(dashboard.lastPayment)} />
              <PaymentHighlightCard tone="amber" title={labels.nextPaymentLabel} payment={dashboard.nextPayment} kind="preview" onPress={() => dashboard.nextPayment && setSelectedPayment(dashboard.nextPayment)} />
            </View>

            <View style={styles.metricGrid}>
              <MetricCard
                title={labels.summaryTodayLabel}
                icon={<Check size={18} color="#4df6a5" />}
                help={summaryHelp}
                onHelpPress={setActiveHelp}
                items={[
                [labels.earnedLabel, formatCurrency(dashboard.summary.earned)],
                [labels.receivedLabel, formatCurrency(dashboard.summary.received)],
                [labels.normalLabel, String(dashboard.summary.normalLessons)],
                [labels.extraLabel, String(dashboard.summary.extraLessons)],
              ]} />
              <MetricCard
                title={labels.futureLabel}
                icon={<ArrowRight size={18} color="#ffbf5f" />}
                help={futureHelp}
                onHelpPress={setActiveHelp}
                items={[
                [labels.plannedLabel, formatCurrency(dashboard.future.planned)],
                [labels.futureLessonsLabel, String(dashboard.future.futureLessons)],
                [labels.totalPlannedLabel, formatCurrency(dashboard.future.totalPlanned)],
                [labels.totalLessonsLabel, String(dashboard.future.totalLessons)],
              ]} />
            </View>

            <SectionTitle title="Proximas aulas" action="Ver aulas" onPress={() => setActiveTab('Aulas')} />
            {nextKodlandLessons.length ? (
              <KodlandNextLessonsOverview lessons={nextKodlandLessons} onOpenMaterial={openKodlandMaterial} onEdit={setEditingKodlandLesson} />
            ) : (
              <View style={styles.kodlandLessonEmpty}>
                <Text style={styles.lessonTitle}>Nenhuma aula Kodland sincronizada</Text>
                <Text style={styles.lessonMeta}>Sincronize a Kodland para ver a proxima aula de cada turma.</Text>
              </View>
            )}

            <SectionTitle title={labels.classesLabel} action="Ver todas" onPress={() => setActiveTab('Turmas')} />
            {dashboard.progress.map((progress) => (
              <ClassProgressCard key={progress.classId} progress={progress} studentCount={students.filter((student) => student.classId === progress.classId).length} />
            ))}

            <SectionTitle title={labels.paymentsLabel} action="Detalhes" onPress={() => setActiveTab('Pagamentos')} />
            {visiblePayments.slice(0, 4).map((payment) => (
              <PaymentListItem key={payment.paymentDate} payment={payment} onPress={() => setSelectedPayment(payment)} />
            ))}

            <View style={styles.dataSection}>
              <View>
                <Text style={styles.dataSectionTitle}>Dados</Text>
                <Text style={styles.dataSectionText}>Reset completo para limpar turmas, aulas, extras e histórico.</Text>
              </View>
              <Pressable style={styles.resetDangerButton} onPress={handleReset}>
                <RotateCcw size={15} color="#ff7b89" />
                <Text style={styles.resetDangerText}>Resetar dados</Text>
              </Pressable>
            </View>
            <Text style={styles.copyrightText}>© 2026 Ezequiell Lobo. Todos os direitos reservados.</Text>
          </ScrollView>
        )}

        {activeTab === 'Pagamentos' && (
          paymentArea === 'Histórico' ? (
            lessonFilter === 'Turmas' ? (
              <FlatList
                data={classLessonGroups}
                keyExtractor={(item) => item.classId}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <ClassLessonHistoryCard
                    group={item}
                    expanded={expandedLessonClassId === item.classId}
                    onPress={() => setExpandedLessonClassId((current) => current === item.classId ? null : item.classId)}
                    onCancelLesson={handleCancelLesson}
                  />
                )}
                ListHeaderComponent={(
                  <PaymentHistoryHeader
                    paymentArea={paymentArea}
                    onPaymentAreaChange={setPaymentArea}
                    lessonFilter={lessonFilter}
                    onLessonFilterChange={(value) => {
                      setExpandedLessonClassId(null);
                      setLessonFilter(value);
                    }}
                  />
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>Sem aulas de turma no historico.</Text>}
              />
            ) : (
              <FlatList
                data={filteredLessons}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => <LessonListItem lesson={item} onCancel={() => handleCancelLesson(item.id)} />}
                ListHeaderComponent={(
                  <PaymentHistoryHeader
                    paymentArea={paymentArea}
                    onPaymentAreaChange={setPaymentArea}
                    lessonFilter={lessonFilter}
                    onLessonFilterChange={(value) => {
                      setExpandedLessonClassId(null);
                      setLessonFilter(value);
                    }}
                  />
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>Sem aulas no historico.</Text>}
              />
            )
          ) : (
            <FlatList
              data={visiblePayments}
              keyExtractor={(item) => item.paymentDate}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => <PaymentListItem payment={item} onPress={() => setSelectedPayment(item)} />}
              ListHeaderComponent={<PaymentAreaHeader paymentArea={paymentArea} onPaymentAreaChange={setPaymentArea} />}
              ListEmptyComponent={<Text style={styles.emptyText}>Sem pagamentos no historico.</Text>}
            />
          )
        )}

        {activeTab === 'Turmas' && (
          selectedClass ? (
            <FlatList
              data={selectedClassStudents}
              keyExtractor={(item) => `${item.id}-${item.externalClassId ?? selectedClass.id}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={(
                <>
                  <View style={styles.kodlandSubHeader}>
                    <Pressable style={styles.kodlandSecondaryButton} onPress={() => setSelectedClassId(null)}>
                      <Text style={styles.kodlandSecondaryText}>Voltar turmas</Text>
                    </Pressable>
                    <Pressable style={styles.actionIconButton} onPress={() => openClassEditor(selectedClass.id)}>
                      <Edit3 size={17} color="#75d7ff" />
                    </Pressable>
                  </View>
                  <Text style={styles.sectionText}>{selectedClass.name}</Text>
                  <Text style={styles.listHint}>{selectedClassStudents.length} alunos vinculados</Text>
                </>
              )}
              renderItem={({ item, index }) => (
                <StudentListItem student={item} showLinkStatus={false} rankPosition={studentRankPosition(item, index)} onPress={() => setSelectedStudent(item)} />
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Nenhum aluno vinculado a esta turma.</Text>}
            />
          ) : (
            <FlatList
              data={dashboard.progress}
              keyExtractor={(item) => item.classId}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ClassProgressCard
                  progress={item}
                  studentCount={students.filter((student) => student.classId === item.classId).length}
                  onPress={() => setSelectedClassId(item.classId)}
                  onEdit={() => openClassEditor(item.classId)}
                  onDelete={() => handleDeactivateClass(item.classId)}
                />
              )}
            />
          )
        )}

        {activeTab === 'Aulas' && (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            <KodlandMaterialsLibrary
              courses={kodlandMaterialCourses}
              refreshing={refreshingKodlandMaterials}
              onRefreshMaterials={refreshKodlandMaterialsOnly}
              onOpenMaterial={openKodlandMaterial}
              onEdit={setEditingKodlandLesson}
            />
          </ScrollView>
        )}

        {activeTab === 'Kodland' && (
          <KodlandScreen classes={classes} groups={kodlandGroups} students={students} lastSync={kodlandLastSync} shouldSyncInitialMaterials={!hasKodlandMaterialLinks} onRefresh={refresh} onCreateClass={openKodlandClassCreator} onOpenStudent={setSelectedStudent} />
        )}

        {activeTab === 'Correções' && (
          <CorrectionsScreen reviews={pendingReviews} students={students} lastSync={pendingReviewsLastSync || kodlandLastSync} onOpenStudentProfile={openProfile} onOpenReview={openReview} onRefreshReviews={refreshPendingReviewsOnly} />
        )}
      </View>

      <PaymentDetailsModal
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onConfirm={(paymentDate) => handleConfirmPayment(paymentDate)}
      />
      <MetricHelpModal help={activeHelp} onClose={() => setActiveHelp(null)} />
      <KodlandStudentDetailsModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onEdit={(student) => setEditingStudent(student)}
        onDelete={deleteStudent}
        onCopyProfile={copyProfile}
        onOpenProfile={openProfile}
        onOpenWhatsApp={openWhatsApp}
      />
      <KodlandStudentEditModal
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onSave={saveStudent}
      />
      <KodlandLessonMaterialsModal
        lesson={editingKodlandLesson}
        onClose={() => setEditingKodlandLesson(null)}
        onSave={saveKodlandLessonMaterials}
      />
      <ClassFormModal
        open={classModalOpen}
        initialClass={editingClass}
        initialName={classInitialName}
        onClose={closeClassModal}
        onSaved={(classId) => {
          if (pendingKodlandGroup) linkKodlandGroup(pendingKodlandGroup.externalId, classId);
          refresh();
        }}
      />
      <ExtraLessonModal open={extraModalOpen} onClose={() => setExtraModalOpen(false)} onSaved={refresh} />
    </SafeAreaView>
  );
}

function Header({
  total,
  today,
  onAddClass,
  onAddExtra,
}: {
  total: number;
  today: string;
  onAddClass: () => void;
  onAddExtra: () => void;
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>Hoje {formatDate(today)}</Text>
        <Text style={styles.title}>{labels.appName}</Text>
        <Text style={styles.subtitle}>Total previsto {formatCurrency(total)}</Text>
      </View>
      <View style={styles.headerActions}>
        <View style={styles.primaryActions}>
          <IconButton label="Turma" onPress={onAddClass} icon={<Plus size={18} color="#08111f" />} />
          <IconButton label="Extra" onPress={onAddExtra} icon={<GraduationCap size={18} color="#08111f" />} />
        </View>
      </View>
    </View>
  );
}

function IconButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress}>
      {icon}
      <Text style={styles.iconButtonText}>{label}</Text>
    </Pressable>
  );
}

function PaymentHighlightCard({ title, payment, kind, tone, onPress }: { title: string; payment: PaymentView | null; kind: 'total' | 'preview'; tone: 'green' | 'amber'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.highlightCard, tone === 'green' ? styles.greenGlow : styles.amberGlow]}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        {payment && <StatusBadge status={payment.status} />}
      </View>
      {payment ? (
        <>
          <Text style={[styles.money, tone === 'green' ? styles.greenText : styles.amberText]}>{formatCurrency(payment.total)}</Text>
          <View style={styles.compactRows}>
            <CompactInfo icon={<CalendarDays size={14} color="#9fb7d8" />} label="Data" value={formatDate(payment.paymentDate)} />
            <CompactInfo icon={<Clock3 size={14} color="#9fb7d8" />} label="Período" value={payment.period} />
            <CompactInfo icon={<GraduationCap size={14} color="#9fb7d8" />} label={labels.lessonsCountLabel} value={String(payment.lessonCount)} />
            <CompactInfo icon={<CircleDollarSign size={14} color="#9fb7d8" />} label={kind === 'preview' ? 'Previsão' : 'Total'} value={formatCurrency(payment.total)} />
          </View>
        </>
      ) : (
        <Text style={styles.emptyText}>Sem dados</Text>
      )}
    </Pressable>
  );
}

function MetricCard({
  title,
  icon,
  items,
  help,
  onHelpPress,
}: {
  title: string;
  icon: React.ReactNode;
  items: [string, string][];
  help?: MetricHelp;
  onHelpPress?: (help: MetricHelp) => void;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.cardTitleRow}>
        <View style={styles.metricTitleGroup}>
          <Text style={styles.cardTitle}>{title}</Text>
          {help && (
            <Pressable
              accessibilityLabel={`Ajuda sobre ${title}`}
              hitSlop={8}
              onPress={() => onHelpPress?.(help)}
              style={styles.helpButton}
            >
              <CircleHelp size={16} color="#75d7ff" />
            </Pressable>
          )}
        </View>
        {icon}
      </View>
      {items.map(([label, value]) => (
        <View key={label} style={styles.metricRow}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetricHelpModal({ help, onClose }: { help: MetricHelp | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(help)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.helpPanel}>
          {help && (
            <>
              <View style={styles.modalHeader}>
                <View style={styles.helpTitleGroup}>
                  <CircleHelp size={18} color="#75d7ff" />
                  <Text style={styles.modalTitle}>{help.title}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
              </View>
              <View style={styles.helpRows}>
                {help.items.map((item) => (
                  <View key={item.label} style={styles.helpInfoRow}>
                    <Text style={styles.helpInfoLabel}>{item.label}</Text>
                    <Text style={styles.helpInfoText}>{item.description}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SegmentedFilter<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmentedFilter}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable key={option} style={[styles.segmentOption, active && styles.segmentOptionActive]} onPress={() => onChange(option)}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ClassProgressCard({
  progress,
  studentCount = 0,
  onPress,
  onEdit,
  onDelete,
}: {
  progress: DashboardData['progress'][number];
  studentCount?: number;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const Container = onPress ? Pressable : View;
  return (
    <Container style={styles.classCard} onPress={onPress}>
      <View style={styles.cardTitleRow}>
        <View style={styles.classTitleBlock}>
          <Text style={styles.className}>{progress.name}</Text>
          <Text style={styles.percent}>{progress.percent}{labels.percentLabel}</Text>
        </View>
        {(onEdit || onDelete) && (
          <View style={styles.inlineClassActions}>
            {onEdit && (
              <Pressable style={styles.actionIconButton} onPress={onEdit}>
                <Edit3 size={17} color="#75d7ff" />
              </Pressable>
            )}
            {onDelete && (
              <Pressable style={styles.actionIconButton} onPress={onDelete}>
                <Trash2 size={17} color="#ff7b89" />
              </Pressable>
            )}
          </View>
        )}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(progress.percent, 100)}%` }]} />
      </View>
      <View style={styles.classStats}>
        <Text style={styles.smallStat}>{labels.lessonsCountLabel}: {progress.lessonCount}</Text>
        <Text style={styles.smallStat}>Ok: {progress.completed}</Text>
        <Text style={styles.smallStat}>Restam: {progress.remaining}</Text>
        {studentCount > 0 && <Text style={styles.smallStat}>Alunos: {studentCount}</Text>}
      </View>
    </Container>
  );
}

function StudentListItem({
  student,
  onPress,
  showLinkStatus = true,
  rankPosition = null,
}: {
  student: StudentWithClass;
  onPress: () => void;
  showLinkStatus?: boolean;
  rankPosition?: number | null;
}) {
  const statusLabel = studentStatusLabel(student.status);
  const pointsLabel = studentPointsLabel(student.progressSummary);
  const initial = student.name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
  const contact = [student.email, student.phone].filter(Boolean).join(' / ') || 'Sem contato';
  const highlightedRank = isHighlightedRank(rankPosition);
  return (
    <Pressable style={[styles.studentCard, highlightedRank ? styles.studentCardRanked : null, statusLabel && styles.studentCardExpelled]} onPress={onPress}>
      <View style={[styles.studentAvatar, statusLabel && styles.studentAvatarExpelled]}>
        <Text style={[styles.studentAvatarText, statusLabel && styles.studentAvatarTextExpelled]}>{initial}</Text>
      </View>
      <View style={styles.studentCardBody}>
        <View style={styles.studentTitleRow}>
          <Text numberOfLines={1} style={styles.studentName}>{student.name}</Text>
          {rankPosition ? <Text numberOfLines={1} style={[styles.rankBadge, highlightedRank && styles.rankBadgeHighlighted]}>{rankPosition}º</Text> : null}
          {statusLabel ? <Text numberOfLines={1} style={styles.expelledBadge}>{statusLabel}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.studentContact}>{contact}</Text>
        <View style={styles.studentChips}>
          {pointsLabel ? <Text numberOfLines={1} style={styles.studentChip}>Pontos {pointsLabel}</Text> : null}
          {showLinkStatus && !student.classId ? <Text numberOfLines={1} style={styles.reviewChip}>Revisar</Text> : null}
        </View>
      </View>
      <ArrowRight size={16} color={statusLabel ? '#a36c75' : '#75d7ff'} />
    </Pressable>
  );
}

function PaymentAreaHeader({ paymentArea, onPaymentAreaChange }: { paymentArea: PaymentArea; onPaymentAreaChange: (value: PaymentArea) => void }) {
  return (
    <View style={styles.subTabHeader}>
      <SegmentedFilter options={paymentAreas} value={paymentArea} onChange={onPaymentAreaChange} />
    </View>
  );
}

function PaymentHistoryHeader({
  paymentArea,
  onPaymentAreaChange,
  lessonFilter,
  onLessonFilterChange,
}: {
  paymentArea: PaymentArea;
  onPaymentAreaChange: (value: PaymentArea) => void;
  lessonFilter: LessonFilter;
  onLessonFilterChange: (value: LessonFilter) => void;
}) {
  return (
    <>
      <PaymentAreaHeader paymentArea={paymentArea} onPaymentAreaChange={onPaymentAreaChange} />
      <View style={styles.compactFilterBlock}>
        <SegmentedFilter options={lessonFilters} value={lessonFilter} onChange={onLessonFilterChange} />
      </View>
      <Text style={styles.listHint}>{lessonFilter === 'Turmas' ? 'Histórico por turma' : 'Histórico de aulas dadas'}</Text>
    </>
  );
}

function CorrectionsScreen({
  reviews,
  students,
  lastSync,
  onOpenStudentProfile,
  onOpenReview,
  onRefreshReviews,
}: {
  reviews: PendingReviewRecord[];
  students: StudentWithClass[];
  lastSync: string;
  onOpenStudentProfile: (student: StudentWithClass) => void;
  onOpenReview: (review: PendingReviewRecord) => void;
  onRefreshReviews: () => Promise<void>;
}) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [refreshingReviews, setRefreshingReviews] = useState(false);
  const visibleReviews = useMemo(() => filterPendingReviewsForActiveStudents(reviews, students), [reviews, students]);
  const selectedClassReviews = selectedClassId ? visibleReviews.filter((review) => review.externalClassId === selectedClassId) : [];
  const selectedStudentReviews = selectedStudentId ? selectedClassReviews.filter((review) => review.externalStudentId === selectedStudentId) : [];
  const selectedModuleReviews = selectedModuleId ? filterPendingReviewsByModule(selectedStudentReviews, selectedModuleId) : [];
  const selectedClassName = selectedClassReviews[0]?.externalClassName ?? '';
  const selectedStudentName = selectedStudentReviews[0]?.studentName ?? '';
  const selectedModuleName = summarizePendingReviewsByModule(selectedStudentReviews).find((module) => module.id === selectedModuleId)?.title ?? '';
  const selectedStudent = selectedStudentId
    ? students.find((student) => student.externalId === selectedStudentId && (!selectedClassId || student.externalClassId === selectedClassId))
      ?? students.find((student) => student.externalId === selectedStudentId)
      ?? null
    : null;
  const classSummaries = summarizePendingReviews(visibleReviews, 'externalClassId', 'externalClassName');
  const studentSummaries = summarizePendingReviews(selectedClassReviews, 'externalStudentId', 'studentName');
  const moduleSummaries = summarizePendingReviewsByModule(selectedStudentReviews);

  const updateReviews = async () => {
    setRefreshingReviews(true);
    try {
      await onRefreshReviews();
    } finally {
      setRefreshingReviews(false);
    }
  };

  useEffect(() => {
    if (selectedClassId && !visibleReviews.some((review) => review.externalClassId === selectedClassId)) {
      setSelectedClassId(null);
      setSelectedStudentId(null);
      setSelectedModuleId(null);
    }
  }, [visibleReviews, selectedClassId]);

  if (selectedModuleId) {
    return (
      <FlatList
        data={selectedModuleReviews}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <View style={styles.kodlandSubHeader}>
              <Pressable style={styles.kodlandSecondaryButton} onPress={() => setSelectedModuleId(null)}>
                <Text style={styles.kodlandSecondaryText}>Voltar módulos</Text>
              </Pressable>
              {selectedStudent?.profileUrl ? (
                <Pressable accessibilityLabel="Abrir perfil Kodland" style={styles.actionIconButton} onPress={() => onOpenStudentProfile(selectedStudent)}>
                  <ExternalLink size={17} color="#75d7ff" />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.sectionText}>{selectedModuleName}</Text>
            <Text style={styles.listHint}>{selectedModuleReviews.length} atividades pendentes de correção / {selectedStudentName}</Text>
          </>
        )}
        renderItem={({ item }) => <PendingReviewItem review={item} onOpen={() => onOpenReview(item)} />}
        ListEmptyComponent={<Text style={styles.emptyText}>Sem pendências neste módulo.</Text>}
      />
    );
  }

  if (selectedStudentId) {
    return (
      <FlatList
        data={moduleSummaries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <View style={styles.kodlandSubHeader}>
              <Pressable style={styles.kodlandSecondaryButton} onPress={() => {
                setSelectedStudentId(null);
                setSelectedModuleId(null);
              }}>
                <Text style={styles.kodlandSecondaryText}>Voltar alunos</Text>
              </Pressable>
              {selectedStudent?.profileUrl ? (
                <Pressable accessibilityLabel="Abrir perfil Kodland" style={styles.actionIconButton} onPress={() => onOpenStudentProfile(selectedStudent)}>
                  <ExternalLink size={17} color="#75d7ff" />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.sectionText}>{selectedStudentName}</Text>
            <Text style={styles.listHint}>{selectedStudentReviews.length} atividades pendentes de correção / {selectedClassName}</Text>
          </>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.studentItem} onPress={() => setSelectedModuleId(item.id)}>
            <View style={styles.lessonBody}>
              <Text style={styles.lessonTitle}>{item.title}</Text>
              <Text style={styles.lessonMeta}>{item.count} atividades pendentes de correção</Text>
            </View>
            <Text style={styles.reviewChip}>{item.count}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Sem pendências para este aluno.</Text>}
      />
    );
  }

  if (selectedClassId) {
    return (
      <FlatList
        data={studentSummaries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <View style={styles.kodlandSubHeader}>
              <Pressable style={styles.kodlandSecondaryButton} onPress={() => {
                setSelectedClassId(null);
                setSelectedStudentId(null);
                setSelectedModuleId(null);
              }}>
                <Text style={styles.kodlandSecondaryText}>Voltar turmas</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionText}>{selectedClassName}</Text>
            <Text style={styles.listHint}>{selectedClassReviews.length} atividades pendentes de correção</Text>
          </>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.studentItem} onPress={() => setSelectedStudentId(item.id)}>
            <View style={styles.lessonBody}>
              <Text style={styles.lessonTitle}>{item.title}</Text>
              <Text style={styles.lessonMeta}>{item.count} atividades pendentes de correção</Text>
            </View>
            <Text style={styles.reviewChip}>{item.count}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Sem alunos com pendências nesta turma.</Text>}
      />
    );
  }

  return (
    <FlatList
      data={classSummaries}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={(
        <>
          <Text style={styles.sectionText}>Correções</Text>
          <Text style={styles.listHint}>{visibleReviews.length} atividades pendentes de correção{lastSync ? ` / Atualizado ${new Date(lastSync).toLocaleString('pt-BR')}` : ''}</Text>
          <Pressable style={styles.kodlandPrimaryButton} disabled={refreshingReviews} onPress={updateReviews}>
            <Text style={styles.kodlandPrimaryText}>{refreshingReviews ? 'Atualizando...' : 'Atualizar correções'}</Text>
          </Pressable>
        </>
      )}
      renderItem={({ item }) => (
        <Pressable style={styles.studentItem} onPress={() => setSelectedClassId(item.id)}>
          <View style={styles.lessonBody}>
            <Text style={styles.lessonTitle}>{item.title}</Text>
            <Text style={styles.lessonMeta}>{item.count} atividades pendentes de correção</Text>
          </View>
          <Text style={styles.reviewChip}>{item.count}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>Sem pendências de correção.</Text>}
    />
  );
}

function PendingReviewItem({ review, onOpen }: { review: PendingReviewRecord; onOpen: () => void }) {
  const moduleLabel = review.moduleNumber ? `Módulo ${review.moduleNumber}` : 'Módulo não informado';
  const lessonLabel = review.lessonNumber ? `Aula ${review.lessonNumber}` : 'Aula sem número';
  const taskLabel = review.taskNumber ? `${review.taskNumber}. ${review.taskTitle}` : review.taskTitle;
  return (
    <View style={styles.studentItem}>
      <View style={styles.lessonBody}>
        <Text style={styles.lessonTitle}>{taskLabel || 'Atividade sem título'}</Text>
        <Text style={styles.lessonMeta}>{moduleLabel} / {lessonLabel}</Text>
        <Text style={styles.lessonMeta}>{review.lessonTitle || 'Título da aula não informado'}</Text>
      </View>
      <View style={styles.inlineActions}>
        <Text style={styles.reviewChip}>{review.statusLabel || 'Entregue'}</Text>
        <Pressable accessibilityLabel="Abrir atividade na Kodland" style={styles.actionIconButton} onPress={onOpen}>
          <ExternalLink size={17} color="#75d7ff" />
        </Pressable>
      </View>
    </View>
  );
}

function KodlandScreen({
  classes,
  groups,
  students,
  lastSync,
  shouldSyncInitialMaterials,
  onRefresh,
  onCreateClass,
  onOpenStudent,
}: {
  classes: ClassRecord[];
  groups: KodlandGroupRecord[];
  students: StudentWithClass[];
  lastSync: string;
  shouldSyncInitialMaterials: boolean;
  onRefresh: () => void;
  onCreateClass: (group: KodlandGroupRecord) => void;
  onOpenStudent: (student: StudentWithClass) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [linkingGroup, setLinkingGroup] = useState<KodlandGroupRecord | null>(null);

  const selectedGroup = groups.find((group) => group.externalId === selectedGroupId) ?? null;
  const visibleStudents = selectedGroup ? students.filter((student) => student.externalClassId === selectedGroup.externalId).sort(compareStudentsByStatusProgressThenName) : [];

  useEffect(() => {
    loadKodlandCredentials().then((credentials) => {
      setUsername(credentials.username);
      setPassword(credentials.password);
    }).catch(() => {
      Alert.alert('Kodland', 'Não foi possível ler as credenciais salvas neste aparelho.');
    });
  }, []);

  const saveCredentials = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Kodland', 'Informe usuário e senha.');
      return;
    }
    setBusy(true);
    try {
      await saveKodlandCredentials({ username, password });
      Alert.alert('Kodland', 'Credenciais salvas com segurança neste aparelho.');
    } catch {
      Alert.alert('Kodland', 'Não foi possível salvar as credenciais.');
    } finally {
      setBusy(false);
    }
  };

  const clearCredentials = async () => {
    setBusy(true);
    try {
      await clearKodlandCredentials();
      setUsername('');
      setPassword('');
      Alert.alert('Kodland', 'Credenciais removidas deste aparelho.');
    } catch {
      Alert.alert('Kodland', 'Não foi possível remover as credenciais.');
    } finally {
      setBusy(false);
    }
  };

  const synchronize = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Kodland', 'Informe usuário e senha.');
      return;
    }
    setBusy(true);
    try {
      await saveKodlandCredentials({ username, password });
      const result = await syncKodlandStudents({ username, password }, { includeMaterials: shouldSyncInitialMaterials });
      if (!result.ok) {
        Alert.alert('Sincronização Kodland', result.message);
        return;
      }
      importKodlandSnapshot(result.groups, result.students, result.pendingReviews, result.lessons);
      onRefresh();
      const visibleReviews = filterPendingReviewsForActiveStudents(result.pendingReviews, result.students.map((student) => ({
        externalId: student.externalId,
        externalClassId: student.externalClassId,
        status: student.status,
      })));
      Alert.alert('Sincronização Kodland', `${result.students.length} alunos recebidos. ${result.lessons.length} aulas sincronizadas. ${visibleReviews.length} pendências de correção.`);
    } catch {
      Alert.alert('Sincronização Kodland', 'Não foi possível iniciar a sincronização.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
      <View style={styles.kodlandPanel}>
        <Text style={styles.sectionText}>Kodland</Text>
        <Text style={styles.kodlandText}>Credenciais ficam protegidas neste aparelho e não entram no banco de dados do AulaPay.</Text>
        <FormInput label="Usuário Kodland" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <FormInput label="Senha Kodland" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <View style={styles.kodlandActions}>
          <Pressable style={styles.kodlandSecondaryButton} disabled={busy} onPress={saveCredentials}>
            <Text style={styles.kodlandSecondaryText}>Salvar acesso</Text>
          </Pressable>
          <Pressable style={styles.kodlandPrimaryButton} disabled={busy} onPress={synchronize}>
            <Text style={styles.kodlandPrimaryText}>{busy ? 'Aguarde...' : 'Sincronizar'}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.kodlandClearButton} disabled={busy} onPress={clearCredentials}>
          <Text style={styles.resetDangerText}>Apagar credenciais</Text>
        </Pressable>
      </View>

      <Text style={styles.listHint}>{groups.length} turmas Kodland / {students.length} alunos{lastSync ? ` / Atualizado ${new Date(lastSync).toLocaleString('pt-BR')}` : ''}</Text>
      {!selectedGroup && groups.map((group) => {
        const localClass = classes.find((item) => item.id === group.localClassId);
        const groupStudents = students.filter((student) => student.externalClassId === group.externalId);
        return (
          <Pressable key={group.externalId} style={styles.studentItem} onPress={() => setSelectedGroupId(group.externalId)}>
            <View style={styles.lessonBody}>
              <Text style={styles.lessonTitle}>{group.title}</Text>
              <Text style={styles.lessonMeta}>{group.courseName || 'Curso nao informado'} / {groupStudents.length || group.studentCount} alunos</Text>
              <Text style={styles.lessonMeta}>{localClass ? `Vinculada a ${localClass.name}` : 'Sem turma local vinculada'}</Text>
            </View>
            <Pressable accessibilityLabel={`Vincular ${group.title}`} style={styles.actionIconButton} onPress={() => setLinkingGroup(group)}>
              <Link2 size={17} color={localClass ? '#4df6a5' : '#75d7ff'} />
            </Pressable>
          </Pressable>
        );
      })}

      {selectedGroup && (
        <>
          <View style={styles.kodlandSubHeader}>
            <Pressable style={styles.kodlandSecondaryButton} onPress={() => {
              setSelectedGroupId(null);
            }}>
              <Text style={styles.kodlandSecondaryText}>Voltar turmas</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Vincular ${selectedGroup.title}`} style={styles.actionIconButton} onPress={() => setLinkingGroup(selectedGroup)}>
              <Link2 size={17} color={selectedGroup.localClassId ? '#4df6a5' : '#75d7ff'} />
            </Pressable>
          </View>
          <Text style={styles.sectionText}>{selectedGroup.title}</Text>
          <Text style={styles.listHint}>{visibleStudents.length} alunos nesta turma</Text>
          {visibleStudents.map((student, index) => (
            <StudentListItem key={`${student.id}-${student.externalClassId}`} student={student} rankPosition={studentRankPosition(student, index)} onPress={() => onOpenStudent(student)} />
          ))}
        </>
      )}
      <KodlandClassLinkModal
        group={linkingGroup}
        classes={classes}
        onClose={() => setLinkingGroup(null)}
        onSelect={(classId) => {
          if (!linkingGroup) return;
          linkKodlandGroup(linkingGroup.externalId, classId);
          setLinkingGroup(null);
          onRefresh();
        }}
        onCreate={() => {
          if (!linkingGroup) return;
          const group = linkingGroup;
          setLinkingGroup(null);
          onCreateClass(group);
        }}
      />
    </ScrollView>
  );
}

function KodlandClassLinkModal({
  group,
  classes,
  onClose,
  onSelect,
  onCreate,
}: {
  group: KodlandGroupRecord | null;
  classes: ClassRecord[];
  onClose: () => void;
  onSelect: (classId: string | null) => void;
  onCreate: () => void;
}) {
  const activeClasses = classes.filter((classRecord) => classRecord.active);
  const [classListOpen, setClassListOpen] = useState(false);
  const selectedClass = activeClasses.find((classRecord) => classRecord.id === group?.localClassId) ?? null;
  const linkedClassFieldValue = classListOpen ? 'Escolha uma turma abaixo' : selectedClass?.name ?? 'Selecionar turma cadastrada';

  useEffect(() => {
    setClassListOpen(false);
  }, [group?.externalId]);

  return (
    <Modal visible={Boolean(group)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.choicePanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Vincular turma</Text>
              {group && <Text style={styles.modalSubtitle}>{group.title}</Text>}
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Pressable style={styles.choiceItem} onPress={() => onSelect(null)}>
              <Text style={styles.choiceText}>Manter sem vínculo</Text>
            </Pressable>
            <Pressable style={styles.choiceItem} onPress={onCreate}>
              <Text style={styles.choiceText}>Cadastrar como nova turma</Text>
              <Plus size={16} color="#75d7ff" />
            </Pressable>
            <Pressable style={styles.linkedClassField} onPress={() => setClassListOpen((current) => !current)}>
              <View style={styles.linkedClassFieldTextBlock}>
                <Text style={styles.linkedClassLabel}>Turma cadastrada</Text>
                <Text numberOfLines={1} style={[styles.linkedClassValue, classListOpen && styles.linkedClassHintValue]}>{linkedClassFieldValue}</Text>
              </View>
              <ArrowRight size={17} color="#75d7ff" style={classListOpen ? styles.expandIconOpen : styles.expandIconClosed} />
            </Pressable>
            {classListOpen && activeClasses.length === 0 && (
              <Text style={styles.emptyText}>Nenhuma turma ativa cadastrada para vincular.</Text>
            )}
            {classListOpen && activeClasses.map((classRecord) => (
              <Pressable key={classRecord.id} style={[styles.choiceItem, group?.localClassId === classRecord.id && styles.choiceItemActive]} onPress={() => onSelect(classRecord.id)}>
                <Text style={[styles.choiceText, group?.localClassId === classRecord.id && styles.choiceTextActive]}>{classRecord.name}</Text>
                {group?.localClassId === classRecord.id && <Check size={16} color="#75d7ff" />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KodlandStudentDetailsModal({
  student,
  onClose,
  onEdit,
  onDelete,
  onCopyProfile,
  onOpenProfile,
  onOpenWhatsApp,
}: {
  student: StudentWithClass | null;
  onClose: () => void;
  onEdit: (student: StudentWithClass) => void;
  onDelete: (student: StudentWithClass) => void;
  onCopyProfile: (student: StudentWithClass) => void;
  onOpenProfile: (student: StudentWithClass) => void;
  onOpenWhatsApp: (student: StudentWithClass) => void;
}) {
  const whatsappPhone = student ? normalizeWhatsAppPhone(student.phone) : '';
  const statusLabel = student ? studentStatusLabel(student.status) : '';
  const pointsLabel = student ? studentPointsLabel(student.progressSummary) : '';
  return (
    <Modal visible={Boolean(student)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalPanel}>
          {student && (
            <>
              <View style={styles.modalHeader}>
                <View>
                  <View style={styles.studentTitleRow}>
                    <Text style={styles.modalTitle}>{student.name}</Text>
                    {statusLabel ? <Text style={styles.expelledBadge}>{statusLabel}</Text> : null}
                  </View>
                  <Text style={styles.modalSubtitle}>{student.externalClassName || 'Sem turma Kodland'}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <DetailRow label="E-mail" value={student.email || 'Sem e-mail'} />
                <DetailRow
                  label="Telefone"
                  value={student.phone || 'Sem telefone'}
                  actions={whatsappPhone ? (
                    <Pressable accessibilityLabel="Abrir WhatsApp" style={styles.inlineWhatsappButton} onPress={() => onOpenWhatsApp(student)}>
                      <MessageCircle size={16} color="#07130d" />
                    </Pressable>
                  ) : null}
                />
                <DetailRow label="Status" value={student.status || 'Sem status'} />
                <DetailRow label="Pontos" value={pointsLabel || 'Sem pontos'} />
                <DetailRow label="Turma local" value={student.classId ? 'Vinculado' : 'Sem vínculo'} />
                <DetailRow
                  label="Perfil Kodland"
                  value={student.profileUrl || 'Sem link'}
                  actions={student.profileUrl ? (
                    <View style={styles.inlineActions}>
                      <Pressable accessibilityLabel="Abrir perfil Kodland" style={styles.inlineIconButton} onPress={() => onOpenProfile(student)}>
                        <ExternalLink size={16} color="#75d7ff" />
                      </Pressable>
                      <Pressable accessibilityLabel="Copiar perfil Kodland" style={styles.inlineIconButton} onPress={() => onCopyProfile(student)}>
                        <Copy size={16} color="#75d7ff" />
                      </Pressable>
                    </View>
                  ) : null}
                />
                <DetailRow label="Observação" value={student.localNote || 'Sem observação'} />
              </ScrollView>
              <View style={styles.studentActionGrid}>
                <Pressable style={styles.studentSecondaryAction} onPress={() => onEdit(student)}>
                  <Edit3 size={16} color="#75d7ff" />
                  <Text numberOfLines={1} style={styles.kodlandSecondaryText}>Editar</Text>
                </Pressable>
                <Pressable style={styles.deleteStudentButton} onPress={() => onDelete(student)}>
                  <Trash2 size={16} color="#ff7b89" />
                  <Text numberOfLines={1} style={styles.resetDangerText}>Excluir</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function KodlandStudentEditModal({
  student,
  onClose,
  onSave,
}: {
  student: StudentWithClass | null;
  onClose: () => void;
  onSave: (student: StudentWithClass, input: { name: string; email: string; phone: string; status: string; profileUrl: string; localNote: string }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [localNote, setLocalNote] = useState('');

  useEffect(() => {
    if (!student) return;
    setName(student.name);
    setEmail(student.email);
    setPhone(student.phone);
    setStatus(student.status);
    setProfileUrl(student.profileUrl);
    setLocalNote(student.localNote);
  }, [student]);

  return (
    <FormModal
      open={Boolean(student)}
      title="Editar aluno"
      onClose={onClose}
      onSave={() => {
        if (!student) return;
        if (!name.trim()) {
          Alert.alert('Revise o aluno', 'Informe o nome do aluno.');
          return;
        }
        onSave(student, { name, email, phone, status, profileUrl, localNote });
      }}
    >
      <FormInput label="Nome" value={name} onChangeText={setName} />
      <FormInput label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <FormInput label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <FormInput label="Status" value={status} onChangeText={setStatus} />
      <FormInput label="Perfil Kodland" value={profileUrl} onChangeText={setProfileUrl} autoCapitalize="none" />
      <FormInput label="Observação" value={localNote} onChangeText={setLocalNote} multiline />
    </FormModal>
  );
}

function KodlandLessonMaterialsModal({
  lesson,
  onClose,
  onSave,
}: {
  lesson: KodlandLessonRecord | null;
  onClose: () => void;
  onSave: (lesson: KodlandLessonRecord, input: { slideUrl: string; scriptUrl: string }) => void;
}) {
  const [slideUrl, setSlideUrl] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');

  useEffect(() => {
    if (!lesson) return;
    setSlideUrl(lesson.slideUrl);
    setScriptUrl(lesson.scriptUrl);
  }, [lesson]);

  const save = () => {
    if (!lesson) return;
    if (!isMaterialUrl(slideUrl) || !isMaterialUrl(scriptUrl)) {
      Alert.alert('Revise os links', 'Use links http(s) ou slack://. Deixe em branco quando nao houver link.');
      return;
    }
    onSave(lesson, { slideUrl, scriptUrl });
  };

  const lessonLabel = lesson?.lessonNumber ? `Aula ${lesson.lessonNumber}` : 'Aula';
  return (
    <FormModal open={Boolean(lesson)} title="Materiais da aula" onClose={onClose} onSave={save}>
      <Text style={styles.formHint}>{lesson ? `${lessonLabel} do curso. Os links serao usados nas turmas que estiverem nesta mesma aula.` : ''}</Text>
      <FormInput label="Slide" value={slideUrl} onChangeText={setSlideUrl} autoCapitalize="none" keyboardType="url" placeholder="https://docs.google.com/presentation/..." />
      <FormInput label="Roteiro" value={scriptUrl} onChangeText={setScriptUrl} autoCapitalize="none" keyboardType="url" placeholder="https://...slack.com/... ou slack://..." />
    </FormModal>
  );
}

function isMaterialUrl(value: string) {
  const trimmed = value.trim();
  return !trimmed || /^https?:\/\//i.test(trimmed) || /^slack:\/\//i.test(trimmed);
}

function PaymentListItem({ payment, onPress }: { payment: PaymentView; onPress: () => void }) {
  return (
    <Pressable style={styles.paymentItem} onPress={onPress}>
      <View style={styles.paymentDateBlock}>
        <Text style={styles.paymentDate}>{formatDate(payment.paymentDate)}</Text>
        <Text style={styles.paymentPeriod}>{payment.period}</Text>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentTotal}>{formatCurrency(payment.total)}</Text>
        <Text style={styles.paymentMini}>{payment.lessonCount} aulas</Text>
      </View>
      <View style={styles.paymentMetaActions}>
        <StatusBadge status={payment.status} />
        <Eye size={17} color="#75d7ff" />
      </View>
    </Pressable>
  );
}

function LessonListItem({ lesson, onCancel }: { lesson: LessonView; onCancel?: () => void }) {
  return (
    <View style={styles.lessonItem}>
      <View style={styles.lessonDatePill}>
        <Text style={styles.lessonDate}>{formatDate(lesson.lessonDate)}</Text>
      </View>
      <View style={styles.lessonBody}>
        <Text style={styles.lessonTitle}>{lesson.className}{lesson.student ? ` / ${lesson.student}` : ''}</Text>
        <Text style={styles.lessonMeta}>{lesson.type} - {lesson.durationHours}h x {formatCurrency(lesson.hourlyRate)}</Text>
      </View>
      <Text style={styles.lessonValue}>{formatCurrency(lesson.lessonValue)}</Text>
      {onCancel && (
        <Pressable style={styles.tinyDanger} onPress={onCancel}>
          <X size={14} color="#ff7b89" />
        </Pressable>
      )}
    </View>
  );
}

function KodlandNextLessonsOverview({ lessons, onOpenMaterial, onEdit }: { lessons: KodlandLessonRecord[]; onOpenMaterial: (url: string) => void; onEdit: (lesson: KodlandLessonRecord) => void }) {
  return (
    <View style={styles.kodlandLessonsBlock}>
      {lessons.map((lesson) => (
        <KodlandLessonCard key={lesson.id} lesson={lesson} featured onOpenMaterial={onOpenMaterial} onEdit={onEdit} />
      ))}
    </View>
  );
}

function KodlandMaterialsLibrary({
  courses,
  refreshing,
  onRefreshMaterials,
  onOpenMaterial,
  onEdit,
}: {
  courses: ReturnType<typeof groupKodlandMaterialsByCourse>;
  refreshing: boolean;
  onRefreshMaterials: () => void;
  onOpenMaterial: (url: string) => void;
  onEdit: (lesson: KodlandLessonRecord) => void;
}) {
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [expandedModuleKey, setExpandedModuleKey] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const courseKeys = courses.map((course) => course.key).join('|');
  const selectedCourse = courses.length === 1
    ? courses[0]
    : courses.find((course) => course.key === selectedCourseKey) ?? courses[0];

  useEffect(() => {
    if (!courses.length) {
      setSelectedCourseKey('');
      setExpandedModuleKey(null);
      setExpandedLessonId(null);
      return;
    }
    if (!selectedCourseKey || !courses.some((course) => course.key === selectedCourseKey)) {
      setSelectedCourseKey(courses[0].key);
      setExpandedModuleKey(null);
      setExpandedLessonId(null);
    }
  }, [courseKeys, courses, selectedCourseKey]);

  return (
    <View style={styles.materialLibraryBlock}>
      <View style={styles.materialLibraryHeader}>
        <Text style={styles.sectionText}>Materiais do curso</Text>
        <Pressable
          accessibilityLabel="Atualizar materiais das aulas"
          disabled={refreshing}
          style={[styles.materialRefreshButton, refreshing && styles.materialRefreshButtonDisabled]}
          onPress={onRefreshMaterials}
        >
          <RotateCcw size={15} color={refreshing ? '#62789a' : '#75d7ff'} />
        </Pressable>
      </View>
      {!courses.length ? (
        <View style={styles.kodlandLessonEmpty}>
          <Text style={styles.lessonTitle}>Nenhum material sincronizado</Text>
          <Text style={styles.lessonMeta}>Sincronize a Kodland para ver aulas, slides e roteiros por modulo.</Text>
        </View>
      ) : (
        <>
          {courses.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.materialCourseTabs}>
              {courses.map((course) => {
                const active = course.key === selectedCourse?.key;
                return (
                  <Pressable
                    key={course.key}
                    style={[styles.materialCourseTab, active && styles.materialCourseTabActive]}
                    onPress={() => {
                      setSelectedCourseKey(course.key);
                      setExpandedModuleKey(null);
                      setExpandedLessonId(null);
                    }}
                  >
                    <Text numberOfLines={1} style={[styles.materialCourseTabText, active && styles.materialCourseTabTextActive]}>{course.title}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {selectedCourse ? (
            <View style={styles.materialModuleList}>
              {selectedCourse.modules.map((group) => {
                const expanded = expandedModuleKey === group.key;
                return (
                  <View key={group.key} style={styles.materialModuleBlock}>
                    <Pressable
                      style={styles.materialModuleHeader}
                      onPress={() => {
                        setExpandedModuleKey((current) => current === group.key ? null : group.key);
                        setExpandedLessonId(null);
                      }}
                    >
                      <View>
                        <Text style={styles.kodlandLessonsTitle}>{group.title}</Text>
                        <Text style={styles.lessonMeta}>{group.lessons.length} aulas</Text>
                      </View>
                      <Text style={styles.materialExpandIcon}>{expanded ? '-' : '+'}</Text>
                    </Pressable>
                    {expanded && (
                      <View style={styles.materialLessonList}>
                        {group.lessons.map((lesson) => (
                          <MaterialLessonRow
                            key={lesson.id}
                            lesson={lesson}
                            expanded={expandedLessonId === lesson.id}
                            onPress={() => setExpandedLessonId((current) => current === lesson.id ? null : lesson.id)}
                            onOpenMaterial={onOpenMaterial}
                            onEdit={onEdit}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function MaterialLessonRow({ lesson, expanded, onPress, onOpenMaterial, onEdit }: { lesson: KodlandLessonRecord; expanded: boolean; onPress: () => void; onOpenMaterial: (url: string) => void; onEdit: (lesson: KodlandLessonRecord) => void }) {
  const lessonLabel = lesson.lessonNumber ? `Aula ${lesson.lessonNumber}` : 'Aula';
  return (
    <View style={styles.materialLessonBlock}>
      <Pressable style={styles.materialLessonRow} onPress={onPress}>
        <View style={styles.lessonBody}>
          <Text numberOfLines={1} style={styles.lessonTitle}>{lesson.lessonTitle || lessonLabel}</Text>
          <Text numberOfLines={1} style={styles.lessonMeta}>{lessonLabel}</Text>
        </View>
        <Text style={styles.materialExpandIcon}>{expanded ? '-' : '+'}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.materialActionsExpanded}>
          <MaterialLinkButton label="Slide" url={lesson.slideUrl} onOpen={onOpenMaterial} />
          <MaterialLinkButton label="Roteiro" url={lesson.scriptUrl} onOpen={onOpenMaterial} />
          <Pressable accessibilityLabel="Editar materiais" style={styles.materialEditIconButton} onPress={() => onEdit(lesson)}>
            <Edit3 size={13} color="#75d7ff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function KodlandLessonCard({ lesson, featured = false, onOpenMaterial, onEdit }: { lesson: KodlandLessonRecord; featured?: boolean; onOpenMaterial: (url: string) => void; onEdit: (lesson: KodlandLessonRecord) => void }) {
  const lessonLabel = lesson.lessonNumber ? `Aula ${lesson.lessonNumber}` : 'Aula';
  return (
    <View style={[styles.kodlandLessonCard, featured && styles.kodlandLessonCardFeatured]}>
      {lesson.lessonDate ? (
        <View style={styles.lessonDatePill}>
          <Text style={styles.lessonDate}>{formatDate(lesson.lessonDate)}</Text>
        </View>
      ) : null}
      <View style={styles.lessonBody}>
        <Text numberOfLines={1} style={styles.lessonTitle}>{lesson.externalClassName}</Text>
        <Text numberOfLines={2} style={styles.lessonMeta}>{lessonLabel}{lesson.lessonTitle ? ` - ${lesson.lessonTitle}` : ''}</Text>
      </View>
      <View style={styles.materialActions}>
        <MaterialLinkButton label="Slide" url={lesson.slideUrl} onOpen={onOpenMaterial} />
        <MaterialLinkButton label="Roteiro" url={lesson.scriptUrl} onOpen={onOpenMaterial} />
        <Pressable accessibilityLabel="Editar materiais" style={styles.materialEditButton} onPress={() => onEdit(lesson)}>
          <Edit3 size={13} color="#75d7ff" />
          <Text numberOfLines={1} style={styles.materialEditText}>Editar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MaterialLinkButton({ label, url, onOpen }: { label: string; url: string; onOpen: (url: string) => void }) {
  const available = Boolean(url);
  return (
    <Pressable
      accessibilityLabel={available ? `Abrir ${label}` : `${label} indisponivel`}
      disabled={!available}
      style={[styles.materialButton, !available && styles.materialButtonDisabled]}
      onPress={() => onOpen(url)}
    >
      <ExternalLink size={13} color={available ? '#08111f' : '#62789a'} />
      <Text numberOfLines={1} style={[styles.materialButtonText, !available && styles.materialButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function ClassLessonHistoryCard({
  group,
  expanded,
  onPress,
  onCancelLesson,
}: {
  group: ClassLessonHistoryGroup;
  expanded: boolean;
  onPress: () => void;
  onCancelLesson: (lessonId: string) => void;
}) {
  return (
    <View style={styles.lessonGroupBlock}>
      <Pressable style={[styles.lessonGroupCard, expanded && styles.lessonGroupCardOpen]} onPress={onPress}>
        <View style={styles.lessonBody}>
          <Text numberOfLines={1} style={styles.lessonTitle}>{group.className}</Text>
          <Text style={styles.lessonMeta}>{group.lessonCount} aulas / {formatCurrency(group.total)}</Text>
          <Text style={styles.lessonMeta}>Mais recente: {formatDate(group.latestLessonDate)}</Text>
        </View>
        <View style={styles.lessonGroupRight}>
          <Text style={styles.lessonValue}>{formatCurrency(group.total)}</Text>
          <ArrowRight size={16} color="#75d7ff" style={expanded ? styles.expandIconOpen : styles.expandIconClosed} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.lessonGroupLessons}>
          {group.lessons.map((lesson) => (
            <LessonListItem key={lesson.id} lesson={lesson} onCancel={() => onCancelLesson(lesson.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function PaymentDetailsModal({ payment, onClose, onConfirm }: { payment: PaymentView | null; onClose: () => void; onConfirm: (paymentDate: string) => void }) {
  return (
    <Modal visible={Boolean(payment)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalPanel}>
          {payment && (
            <>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{labels.detailsLabel}</Text>
                  <Text style={styles.modalSubtitle}>{formatDate(payment.paymentDate)} - {payment.period}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
              </View>
              <View style={styles.detailSummary}>
                <MetricPill label={labels.normalLabel} value={`${payment.normalCount} / ${formatCurrency(payment.normalTotal)}`} />
                <MetricPill label={labels.extraLabel} value={`${payment.extraCount} / ${formatCurrency(payment.extraTotal)}`} />
                <MetricPill label="Total" value={formatCurrency(payment.total)} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {payment.lessons.map((lesson) => <LessonListItem key={lesson.id} lesson={lesson} />)}
              </ScrollView>
              <Pressable style={styles.confirmButton} onPress={() => onConfirm(payment.paymentDate)}>
                <Check size={18} color="#08111f" />
                <Text style={styles.confirmButtonText}>Marcar recebido</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ClassFormModal({
  open,
  initialClass,
  initialName = '',
  onClose,
  onSaved,
}: {
  open: boolean;
  initialClass: ClassRecord | null;
  initialName?: string;
  onClose: () => void;
  onSaved: (classId: string) => void;
}) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('19:00');
  const [firstLesson, setFirstLesson] = useState(todayIso());
  const [lessonCount, setLessonCount] = useState('40');
  const [durationHours, setDurationHours] = useState('1.5');
  const [hourlyRate, setHourlyRate] = useState('30');
  const weekDay = getWeekDayLabel(firstLesson);

  useEffect(() => {
    if (!open) return;
    setName(initialClass?.name ?? initialName);
    setTime(initialClass?.time ?? '19:00');
    setFirstLesson(initialClass?.firstLesson ?? todayIso());
    setLessonCount(String(initialClass?.lessonCount ?? 40));
    setDurationHours(String(initialClass?.durationHours ?? 1.5));
    setHourlyRate(String(initialClass?.hourlyRate ?? 30));
  }, [open, initialClass, initialName]);

  const save = () => {
    const input = { name, time, firstLesson, lessonCount, durationHours, hourlyRate };
    const error = validateClassForm(input);
    if (error) {
      Alert.alert('Revise a turma', error);
      return;
    }
    const derivedWeekDay = getWeekDayLabel(firstLesson);
    const classRecord = {
      id: initialClass?.id ?? `class-${Date.now()}`,
      name,
      weekDay: derivedWeekDay,
      time,
      firstLesson,
      lessonCount: Number(lessonCount) || 1,
      durationHours: parseDecimal(durationHours),
      hourlyRate: parseDecimal(hourlyRate),
      active: true,
    };
    if (initialClass) {
      updateClassFutureLessons(
        {
          ...classRecord,
          createdAt: initialClass.createdAt,
          updatedAt: new Date().toISOString(),
        },
        todayIso(),
      );
    } else {
      addClass(classRecord);
    }
    onSaved(classRecord.id);
    onClose();
  };

  return (
    <FormModal open={open} title={initialClass ? 'Editar turma' : 'Nova turma'} onClose={onClose} onSave={save}>
      <FormInput label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Segunda 19h" />
      <View style={styles.formPair}>
        <SelectField label="Hora" value={time} options={timeOptions.map((item) => ({ label: item, value: item }))} onChange={setTime} />
        <ReadOnlyField label="Dia" value={weekDay} />
      </View>
      <DateField label="Data de início" value={firstLesson} onChange={setFirstLesson} />
      <View style={styles.formPair}>
        <FormInput label="Aulas" value={lessonCount} onChangeText={setLessonCount} keyboardType="numeric" />
        <FormInput label="Duração" value={durationHours} onChangeText={setDurationHours} keyboardType="decimal-pad" />
      </View>
      <FormInput label="Valor/h" value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
    </FormModal>
  );
}

function ExtraLessonModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [participants, setParticipants] = useState('');
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [durationHours, setDurationHours] = useState('1');
  const [hourlyRate, setHourlyRate] = useState('30');

  useEffect(() => {
    if (!open) return;
    setParticipants('');
    setLessonDate(todayIso());
    setDurationHours('1');
    setHourlyRate('30');
  }, [open]);

  const save = () => {
    const input = { student: participants, lessonDate, durationHours, hourlyRate };
    const error = validateExtraLessonForm(input);
    if (error) {
      Alert.alert('Revise a aula extra', error);
      return;
    }
    addExtraLesson({
      student: participants.trim(),
      lessonDate,
      durationHours: parseDecimal(durationHours),
      hourlyRate: parseDecimal(hourlyRate),
    });
    onSaved();
    onClose();
  };

  return (
    <FormModal open={open} title="Aula extra" onClose={onClose} onSave={save}>
      <FormInput label="Participantes" value={participants} onChangeText={setParticipants} placeholder="Ex.: Lucas, Ana" />
      <DateField label="Data" value={lessonDate} onChange={setLessonDate} />
      <FormInput label="Duração" value={durationHours} onChangeText={setDurationHours} keyboardType="decimal-pad" />
      <FormInput label="Valor/h" value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
    </FormModal>
  );
}

function FormModal({ open, title, children, onClose, onSave }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  const content = (
    <View style={styles.modalOverlay}>
      <View style={styles.formPanel}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.formScrollContent}
        >
          {children}
        </ScrollView>
        <Pressable style={styles.confirmButton} onPress={onSave}>
          <Check size={18} color="#08111f" />
          <Text style={styles.confirmButtonText}>Salvar</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        {content}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selectedDate = toPickerDate(value);
  const handleChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
    }
    if (selected) {
      onChange(fromPickerDate(selected));
    }
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable style={styles.dateButton} onPress={() => setOpen(true)}>
        <View style={styles.dateButtonContent}>
          <View style={styles.dateIconBox}>
            <CalendarDays size={16} color="#75d7ff" />
          </View>
          <Text style={styles.dateButtonText}>{formatDate(value)}</Text>
        </View>
      </Pressable>
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          onValueChange={handleChange}
          onDismiss={() => setOpen(false)}
          mode="date"
          display="calendar"
          presentation="dialog"
          accentColor="#75d7ff"
        />
      )}
      {open && Platform.OS !== 'android' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerPanel}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <Pressable onPress={() => setOpen(false)} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
              </View>
              <View style={styles.datePickerSurface}>
                <DateTimePicker
                  value={selectedDate}
                  onValueChange={handleChange}
                  mode="date"
                  display="inline"
                  presentation="inline"
                  accentColor="#75d7ff"
                />
              </View>
              <Pressable style={styles.confirmButton} onPress={() => setOpen(false)}>
                <Check size={18} color="#08111f" />
                <Text style={styles.confirmButtonText}>Concluir</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.readOnlyField}>
        <Text style={styles.selectButtonText}>{value}</Text>
      </View>
    </View>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable style={styles.selectButton} onPress={() => setOpen(true)}>
        <Text style={styles.selectButtonText}>{selected?.label ?? value}</Text>
      </Pressable>
      {open && (
        <OptionModal
          title={label}
          value={value}
          options={options}
          onClose={() => setOpen(false)}
          onSelect={(nextValue) => {
            onChange(nextValue);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

function OptionModal({ title, value, options, onSelect, onClose }: { title: string; value: string; options: SelectOption[]; onSelect: (value: string) => void; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.choicePanel}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}><X size={20} color="#e8f3ff" /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable key={option.value} style={[styles.choiceItem, selected && styles.choiceItemActive]} onPress={() => onSelect(option.value)}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{option.label}</Text>
                  {selected && <Check size={16} color="#75d7ff" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormInput(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput {...props} placeholderTextColor="#5e789d" style={styles.input} />
    </View>
  );
}

function DetailRow({ label, value, actions }: { label: string; value: string; actions?: React.ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailTextBlock}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
      {actions ? <View style={styles.detailActions}>{actions}</View> : null}
    </View>
  );
}

function CompactInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.compactInfo}>
      {icon}
      <Text style={styles.compactLabel}>{label}</Text>
      <Text style={styles.compactValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Text style={[
      styles.statusBadge,
      status === 'Recebido' && styles.statusReceived,
      status === 'Pago/previsto' && styles.statusLate,
      status === 'Vence hoje' && styles.statusToday,
      status === 'Futuro' && styles.statusFuture,
    ]}>
      {status}
    </Text>
  );
}

function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionTitleLeft}>
        <BarChart3 size={17} color="#75d7ff" />
        <Text style={styles.sectionText}>{title}</Text>
      </View>
      {action && <Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text style={styles.metricPillValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050914',
  },
  shell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#7ba1d8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#f5fbff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#9fb7d8',
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 28,
  },
  primaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#75d7ff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  iconButtonText: {
    color: '#08111f',
    fontSize: 12,
    fontWeight: '900',
  },
  tabsFrame: {
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 18,
    overflow: 'hidden',
  },
  tabs: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: 12,
  },
  tabActive: {
    backgroundColor: '#123b62',
  },
  tabText: {
    color: '#7d94b6',
    fontSize: 12,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#e8f8ff',
  },
  scrollContent: {
    paddingBottom: 28,
    paddingTop: 16,
  },
  paymentGrid: {
    gap: 12,
  },
  highlightCard: {
    backgroundColor: '#0b1424',
    borderColor: '#1f3b5c',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  greenGlow: {
    shadowColor: '#4df6a5',
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  amberGlow: {
    shadowColor: '#ffbf5f',
    shadowOpacity: 0.24,
    shadowRadius: 14,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#e8f3ff',
    fontSize: 17,
    fontWeight: '900',
  },
  money: {
    fontSize: 32,
    fontWeight: '900',
    marginTop: 10,
  },
  greenText: {
    color: '#4df6a5',
  },
  amberText: {
    color: '#ffbf5f',
  },
  compactRows: {
    gap: 7,
    marginTop: 12,
  },
  compactInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  compactLabel: {
    color: '#7d94b6',
    fontSize: 12,
    minWidth: 58,
  },
  compactValue: {
    color: '#e8f3ff',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  statusBadge: {
    backgroundColor: '#15233a',
    borderColor: '#2b4d75',
    borderRadius: 999,
    borderWidth: 1,
    color: '#9fb7d8',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusReceived: {
    borderColor: '#4df6a5',
    color: '#4df6a5',
  },
  statusLate: {
    borderColor: '#ff7b89',
    color: '#ff7b89',
  },
  statusToday: {
    borderColor: '#75d7ff',
    color: '#75d7ff',
  },
  statusFuture: {
    borderColor: '#ffbf5f',
    color: '#ffbf5f',
  },
  metricGrid: {
    gap: 12,
    marginTop: 12,
  },
  metricCard: {
    backgroundColor: '#08111f',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    padding: 15,
  },
  metricTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
  },
  helpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 28,
  },
  metricRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  metricLabel: {
    color: '#90a7c8',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  metricValue: {
    color: '#f2f8ff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 9,
  },
  sectionTitleLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionText: {
    color: '#e8f3ff',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionAction: {
    color: '#75d7ff',
    fontSize: 12,
    fontWeight: '900',
  },
  classCard: {
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13,
  },
  className: {
    color: '#f2f8ff',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  classTitleBlock: {
    flex: 1,
    gap: 3,
    paddingRight: 10,
  },
  percent: {
    color: '#75d7ff',
    fontSize: 13,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#142238',
    borderRadius: 999,
    height: 8,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#75d7ff',
    height: '100%',
  },
  classStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 10,
  },
  smallStat: {
    color: '#90a7c8',
    fontSize: 11,
    fontWeight: '800',
  },
  paymentItem: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    padding: 13,
  },
  paymentDateBlock: {
    flex: 1,
    minWidth: 0,
  },
  paymentDate: {
    color: '#f2f8ff',
    fontSize: 15,
    fontWeight: '900',
  },
  paymentPeriod: {
    color: '#7d94b6',
    fontSize: 12,
    marginTop: 3,
  },
  paymentRight: {
    alignItems: 'flex-end',
    width: 98,
  },
  paymentTotal: {
    color: '#4df6a5',
    fontSize: 15,
    fontWeight: '900',
  },
  paymentMini: {
    color: '#7d94b6',
    fontSize: 11,
    marginTop: 3,
  },
  paymentMetaActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    width: 116,
  },
  dataSection: {
    alignItems: 'center',
    backgroundColor: '#08111f',
    borderColor: '#253249',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 18,
    padding: 13,
  },
  dataSectionTitle: {
    color: '#e8f3ff',
    fontSize: 14,
    fontWeight: '900',
  },
  dataSectionText: {
    color: '#7d94b6',
    fontSize: 11,
    marginTop: 3,
    maxWidth: 190,
  },
  resetDangerButton: {
    alignItems: 'center',
    borderColor: '#5a2635',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  resetDangerText: {
    color: '#ff7b89',
    fontSize: 11,
    fontWeight: '900',
  },
  copyrightText: {
    color: '#62789a',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 28,
    paddingTop: 16,
  },
  listHint: {
    color: '#7d94b6',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  kodlandPanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  kodlandText: {
    color: '#90a7c8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
    marginTop: 6,
  },
  kodlandActions: {
    flexDirection: 'row',
    gap: 8,
  },
  kodlandPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#75d7ff',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  kodlandPrimaryText: {
    color: '#08111f',
    fontSize: 13,
    fontWeight: '900',
  },
  kodlandSecondaryButton: {
    alignItems: 'center',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  kodlandSecondaryText: {
    color: '#75d7ff',
    fontSize: 13,
    fontWeight: '900',
  },
  kodlandClearButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6,
  },
  kodlandSubHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  studentItem: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 9,
    padding: 12,
  },
  studentItemExpelled: {
    borderColor: '#7a3c46',
    opacity: 0.76,
  },
  studentTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
  },
  expelledBadge: {
    backgroundColor: '#3a1820',
    borderColor: '#ff7b89',
    borderRadius: 999,
    borderWidth: 1,
    color: '#ff9aa6',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  studentStatus: {
    color: '#75d7ff',
    fontSize: 11,
    fontWeight: '900',
  },
  studentCard: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginBottom: 9,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studentCardExpelled: {
    backgroundColor: '#100f18',
    borderColor: '#6d3340',
  },
  studentCardRanked: {
    borderColor: '#ffbf5f',
  },
  studentAvatar: {
    alignItems: 'center',
    backgroundColor: '#123b62',
    borderColor: '#24517d',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  studentAvatarExpelled: {
    backgroundColor: '#311721',
    borderColor: '#7a3c46',
  },
  studentAvatarText: {
    color: '#e8f8ff',
    fontSize: 16,
    fontWeight: '900',
  },
  studentAvatarTextExpelled: {
    color: '#ffbac3',
  },
  studentCardBody: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  studentName: {
    color: '#f2f8ff',
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  rankBadge: {
    backgroundColor: '#12223a',
    borderColor: '#27415f',
    borderRadius: 999,
    borderWidth: 1,
    color: '#bdd2ee',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  rankBadgeHighlighted: {
    backgroundColor: '#2f2411',
    borderColor: '#ffbf5f',
    color: '#ffcf7a',
  },
  studentContact: {
    color: '#90a7c8',
    fontSize: 11,
    fontWeight: '700',
  },
  studentChips: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 18,
  },
  studentChip: {
    backgroundColor: '#102238',
    borderColor: '#1f3b5c',
    borderRadius: 999,
    borderWidth: 1,
    color: '#9fdcff',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reviewChip: {
    backgroundColor: '#2f2411',
    borderColor: '#6b4b1a',
    borderRadius: 999,
    borderWidth: 1,
    color: '#ffbf5f',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  studentActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  studentSecondaryAction: {
    alignItems: 'center',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 130,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 7,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  deleteStudentButton: {
    alignItems: 'center',
    borderColor: '#5a2635',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 130,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 7,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segmentedFilter: {
    backgroundColor: '#08111f',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    padding: 4,
  },
  segmentOption: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  segmentOptionActive: {
    backgroundColor: '#123b62',
  },
  segmentText: {
    color: '#7d94b6',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#e8f8ff',
  },
  rowCard: {
    marginBottom: 10,
  },
  classActions: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    marginTop: -4,
  },
  inlineClassActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionIconButton: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  dangerButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    marginTop: -4,
    padding: 8,
  },
  dangerText: {
    color: '#ff7b89',
    fontSize: 12,
    fontWeight: '900',
  },
  tinyDanger: {
    padding: 6,
  },
  lessonGroupBlock: {
    marginBottom: 9,
  },
  lessonGroupCard: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  lessonGroupCardOpen: {
    borderColor: '#75d7ff',
  },
  lessonGroupRight: {
    alignItems: 'flex-end',
    gap: 7,
  },
  lessonGroupLessons: {
    borderLeftColor: '#18314f',
    borderLeftWidth: 1,
    marginLeft: 14,
    marginTop: 8,
    paddingLeft: 10,
  },
  expandIconClosed: {
    transform: [{ rotate: '0deg' }],
  },
  expandIconOpen: {
    transform: [{ rotate: '90deg' }],
  },
  lessonItem: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 9,
    padding: 10,
  },
  kodlandLessonsBlock: {
    marginBottom: 12,
  },
  subTabHeader: {
    marginBottom: 10,
  },
  compactFilterBlock: {
    marginBottom: 8,
  },
  materialLibraryBlock: {
    marginTop: 8,
  },
  materialLibraryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  materialRefreshButton: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  materialRefreshButtonDisabled: {
    opacity: 0.55,
  },
  materialCourseTabs: {
    gap: 8,
    paddingBottom: 8,
  },
  materialCourseTab: {
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 160,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  materialCourseTabActive: {
    backgroundColor: '#132a45',
    borderColor: '#75d7ff',
  },
  materialCourseTabText: {
    color: '#7d94b6',
    fontSize: 12,
    fontWeight: '900',
  },
  materialCourseTabTextActive: {
    color: '#dff6ff',
  },
  materialModuleList: {
    gap: 8,
  },
  materialModuleBlock: {
    backgroundColor: '#10223a',
    borderColor: '#2b5f8c',
    borderRadius: 8,
    borderWidth: 1,
    padding: 6,
  },
  materialModuleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  kodlandLessonsTitle: {
    color: '#e8f3ff',
    fontSize: 14,
    fontWeight: '900',
  },
  materialExpandIcon: {
    color: '#75d7ff',
    fontSize: 20,
    fontWeight: '900',
    width: 24,
    textAlign: 'center',
  },
  materialLessonList: {
    backgroundColor: '#07101e',
    borderColor: '#18314f',
    borderRadius: 7,
    borderWidth: 1,
    gap: 6,
    padding: 6,
  },
  materialLessonBlock: {
    backgroundColor: '#0b1424',
    borderColor: '#1d3c62',
    borderLeftColor: '#75d7ff',
    borderLeftWidth: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  materialLessonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  materialActionsExpanded: {
    alignItems: 'center',
    borderTopColor: '#132a45',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  kodlandLessonCard: {
    alignItems: 'center',
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 9,
    minHeight: 72,
    padding: 10,
  },
  kodlandLessonCardFeatured: {
    borderColor: '#75d7ff',
  },
  kodlandLessonEmpty: {
    backgroundColor: '#08111f',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13,
  },
  materialActions: {
    gap: 6,
    width: 104,
  },
  materialButton: {
    alignItems: 'center',
    backgroundColor: '#75d7ff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 7,
    width: 104,
  },
  materialButtonDisabled: {
    backgroundColor: '#111c2d',
    borderColor: '#253249',
    borderWidth: 1,
  },
  materialButtonText: {
    color: '#08111f',
    fontSize: 11,
    fontWeight: '900',
  },
  materialButtonTextDisabled: {
    color: '#62789a',
  },
  materialEditButton: {
    alignItems: 'center',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 7,
    width: 104,
  },
  materialEditIconButton: {
    alignItems: 'center',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    height: 31,
    justifyContent: 'center',
    width: 38,
  },
  materialEditText: {
    color: '#75d7ff',
    fontSize: 11,
    fontWeight: '900',
  },
  lessonDatePill: {
    backgroundColor: '#132a45',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  lessonDate: {
    color: '#dff6ff',
    fontSize: 11,
    fontWeight: '900',
  },
  lessonBody: {
    flex: 1,
  },
  lessonTitle: {
    color: '#f2f8ff',
    fontSize: 13,
    fontWeight: '900',
  },
  lessonMeta: {
    color: '#7d94b6',
    fontSize: 11,
    marginTop: 3,
  },
  lessonValue: {
    color: '#4df6a5',
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    backgroundColor: 'rgba(1, 5, 14, 0.78)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  modalPanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '82%',
    padding: 16,
  },
  formPanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '86%',
    padding: 16,
  },
  formScrollContent: {
    paddingBottom: 18,
  },
  choicePanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '72%',
    padding: 16,
  },
  helpPanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '72%',
    padding: 16,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  helpTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
  },
  helpRows: {
    gap: 8,
  },
  helpInfoRow: {
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helpInfoLabel: {
    color: '#f2f8ff',
    fontSize: 13,
    fontWeight: '900',
  },
  helpInfoText: {
    color: '#90a7c8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  modalTitle: {
    color: '#f2f8ff',
    fontSize: 22,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: '#90a7c8',
    fontSize: 12,
    marginTop: 3,
  },
  closeButton: {
    padding: 7,
  },
  detailSummary: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricPill: {
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  metricPillLabel: {
    color: '#7d94b6',
    fontSize: 10,
    fontWeight: '900',
  },
  metricPillValue: {
    color: '#f2f8ff',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#75d7ff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 46,
  },
  confirmButtonText: {
    color: '#08111f',
    fontSize: 14,
    fontWeight: '900',
  },
  formPair: {
    flexDirection: 'row',
    gap: 10,
  },
  formHint: {
    color: '#90a7c8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
    marginBottom: 10,
  },
  inputLabel: {
    color: '#90a7c8',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f2f8ff',
    fontSize: 14,
    fontWeight: '700',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  selectButton: {
    alignItems: 'center',
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  selectButtonText: {
    color: '#f2f8ff',
    fontSize: 14,
    fontWeight: '800',
  },
  readOnlyField: {
    alignItems: 'center',
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  detailRow: {
    alignItems: 'center',
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    color: '#7d94b6',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#f2f8ff',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  detailActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  inlineIconButton: {
    alignItems: 'center',
    backgroundColor: '#12263d',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  inlineWhatsappButton: {
    alignItems: 'center',
    backgroundColor: '#4df6a5',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dateButton: {
    alignItems: 'center',
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  dateButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  dateIconBox: {
    alignItems: 'center',
    backgroundColor: '#132a45',
    borderColor: '#24517d',
    borderRadius: 7,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  dateButtonText: {
    color: '#f2f8ff',
    fontSize: 14,
    fontWeight: '800',
  },
  datePickerPanel: {
    backgroundColor: '#08111f',
    borderColor: '#24517d',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '78%',
    padding: 16,
  },
  datePickerSurface: {
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  choiceItem: {
    alignItems: 'center',
    backgroundColor: '#0d1b2e',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  choiceItemActive: {
    borderColor: '#75d7ff',
    backgroundColor: '#123b62',
  },
  linkedClassField: {
    alignItems: 'center',
    backgroundColor: '#091a2c',
    borderColor: '#24517d',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 54,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  linkedClassFieldTextBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  linkedClassLabel: {
    color: '#7d94b6',
    fontSize: 11,
    fontWeight: '800',
  },
  linkedClassValue: {
    color: '#f2f8ff',
    fontSize: 14,
    fontWeight: '900',
  },
  linkedClassHintValue: {
    color: '#90a7c8',
    fontWeight: '800',
  },
  choiceText: {
    color: '#d9e9ff',
    fontSize: 14,
    fontWeight: '800',
  },
  choiceTextActive: {
    color: '#ffffff',
  },
  emptyText: {
    color: '#7d94b6',
    fontSize: 13,
    marginTop: 12,
  },
});
