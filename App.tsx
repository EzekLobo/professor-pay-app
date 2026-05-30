import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
  Eye,
  Edit3,
  GraduationCap,
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
  relevantPayments,
  todayIso,
  toPickerDate,
  type LessonFilter,
} from './src/calculations';
import { clearKodlandCredentials, loadKodlandCredentials, saveKodlandCredentials } from './src/kodlandCredentials';
import { syncKodlandStudents } from './src/kodland';
import { labels } from './src/labels';
import {
  addClass,
  addExtraLesson,
  cancelLesson,
  confirmPayment,
  deactivateClass,
  initDatabase,
  loadClasses,
  loadConfirmations,
  loadLessons,
  loadStudents,
  resetDatabase,
  updateClassFutureLessons,
} from './src/storage';
import { ClassRecord, DashboardData, LessonView, PaymentView, StudentWithClass } from './src/types';
import { parseDecimal, validateClassForm, validateExtraLessonForm } from './src/validation';

type Tab = 'Resumo' | 'Pagamentos' | 'Turmas' | 'Aulas' | 'Kodland';
type SelectOption = { label: string; value: string };
type MetricHelp = {
  title: string;
  items: { label: string; description: string }[];
};

const tabs: Tab[] = ['Resumo', 'Pagamentos', 'Turmas', 'Aulas', 'Kodland'];
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

export default function App() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [activeTab, setActiveTab] = useState<Tab>('Resumo');
  const [selectedPayment, setSelectedPayment] = useState<PaymentView | null>(null);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>('Todas');
  const [activeHelp, setActiveHelp] = useState<MetricHelp | null>(null);

  const refresh = () => {
    const loadedClasses = loadClasses();
    const loadedLessons = loadLessons();
    const loadedConfirmations = loadConfirmations();
    const nextDashboard = buildDashboard(loadedClasses, loadedLessons, loadedConfirmations);
    setClasses(loadedClasses);
    setLessons(nextDashboard.lessons);
    setStudents(loadStudents());
    setDashboard(nextDashboard);
  };

  useEffect(() => {
    initDatabase();
    refresh();
  }, []);

  const filteredLessons = useMemo(() => filterLessonHistoryByKind(lessons, lessonFilter, dashboard.today), [lessons, lessonFilter, dashboard.today]);
  const visiblePayments = useMemo(() => relevantPayments(dashboard.payments, dashboard.today), [dashboard.payments, dashboard.today]);

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
            setClassModalOpen(true);
          }}
          onAddExtra={() => setExtraModalOpen(true)}
        />

        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
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
          <FlatList
            data={visiblePayments}
            keyExtractor={(item) => item.paymentDate}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <PaymentListItem payment={item} onPress={() => setSelectedPayment(item)} />}
          />
        )}

        {activeTab === 'Turmas' && (
          <FlatList
            data={dashboard.progress}
            keyExtractor={(item) => item.classId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ClassProgressCard
                progress={item}
                studentCount={students.filter((student) => student.classId === item.classId).length}
                onEdit={() => openClassEditor(item.classId)}
                onDelete={() => handleDeactivateClass(item.classId)}
              />
            )}
          />
        )}

        {activeTab === 'Aulas' && (
          <FlatList
            data={filteredLessons}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <LessonListItem lesson={item} onCancel={() => handleCancelLesson(item.id)} />}
            ListHeaderComponent={(
              <>
                <SegmentedFilter options={lessonFilters} value={lessonFilter} onChange={setLessonFilter} />
                <Text style={styles.listHint}>Histórico de aulas</Text>
              </>
            )}
          />
        )}

        {activeTab === 'Kodland' && (
          <KodlandScreen classes={classes} students={students} onRefresh={refresh} />
        )}
      </View>

      <PaymentDetailsModal
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onConfirm={(paymentDate) => handleConfirmPayment(paymentDate)}
      />
      <MetricHelpModal help={activeHelp} onClose={() => setActiveHelp(null)} />
      <ClassFormModal open={classModalOpen} initialClass={editingClass} onClose={closeClassModal} onSaved={refresh} />
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
  onEdit,
  onDelete,
}: {
  progress: DashboardData['progress'][number];
  studentCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.classCard}>
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
    </View>
  );
}

function KodlandScreen({ classes, students, onRefresh }: { classes: ClassRecord[]; students: StudentWithClass[]; onRefresh: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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
      const result = await syncKodlandStudents({ username, password });
      if (!result.ok) {
        Alert.alert('Sincronização Kodland', result.message);
        return;
      }
      onRefresh();
      Alert.alert('Sincronização Kodland', `${result.students.length} alunos recebidos.`);
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

      <Text style={styles.listHint}>{students.length} alunos importados em {classes.length} turmas locais</Text>
      {students.map((student) => (
        <View key={`${student.id}-${student.classId ?? 'unlinked'}`} style={styles.studentItem}>
          <View style={styles.lessonBody}>
            <Text style={styles.lessonTitle}>{student.name}</Text>
            <Text style={styles.lessonMeta}>{student.externalClassName || 'Sem turma vinculada'}</Text>
          </View>
          <Text style={styles.studentStatus}>{student.classId ? 'Vinculado' : 'Revisar'}</Text>
        </View>
      ))}
    </ScrollView>
  );
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
  onClose,
  onSaved,
}: {
  open: boolean;
  initialClass: ClassRecord | null;
  onClose: () => void;
  onSaved: () => void;
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
    setName(initialClass?.name ?? '');
    setTime(initialClass?.time ?? '19:00');
    setFirstLesson(initialClass?.firstLesson ?? todayIso());
    setLessonCount(String(initialClass?.lessonCount ?? 40));
    setDurationHours(String(initialClass?.durationHours ?? 1.5));
    setHourlyRate(String(initialClass?.hourlyRate ?? 30));
  }, [open, initialClass]);

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
    onSaved();
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
  tabs: {
    backgroundColor: '#0b1424',
    borderColor: '#18314f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 18,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
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
    flex: 1,
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
  studentStatus: {
    color: '#75d7ff',
    fontSize: 11,
    fontWeight: '900',
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
