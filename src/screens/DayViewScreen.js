import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Modal,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShifts } from '../contexts/ShiftsContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { useOffers } from '../contexts/OffersContext';
import { useGroups } from '../contexts/GroupsContext';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { getFullShiftConfig, calculateShiftValueSync, roundCurrency, getShiftPeriod, shouldUseWeekendValue } from '../utils/ShiftValueCalculator';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import CederFlowSheet from './CederFlowSheet';
import TrocarFlowSheet from './TrocarFlowSheet';
import TrocaDetailSheet from './TrocaDetailSheet';
import CessaoDetailSheet from './CessaoDetailSheet';
import AddManualShiftModal from '../components/AddManualShiftModal';
import { AuthContext } from '../context/AuthContext';
import { getGroupColors } from '../utils/GroupColorConfig';
import { movementVisual } from '../utils/MovementColors';
import TodayCoworkersService from '../services/TodayCoworkersService';
import { deriveShiftStatus, SHIFT_STATUS_META, statusTone, SHIFT_STATUS } from '../utils/shiftStatus';

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const SHIFT_ACCENTS = ['#6cc1c0', '#97cafc', '#41b883', '#7096bb'];

const { width: W } = Dimensions.get('window');
const SPRING_FAB   = { damping: 15, stiffness: 380, mass: 0.7, useNativeDriver: true };
const EASING_CLOSE = Easing.bezier(0.4, 0, 1, 1);
const DURATION_CLOSE = 260;

const DAY_ITEM_TOTAL = 52;
const DAY_PADDING    = Spacing.md;

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite', FN: 'Sex. Noite' };
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF', FN: '#E08A00' };

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return null;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const parseShiftTime = (timeStr) => {
  if (!timeStr) return null;
  const norm = s => s.replace(/h/i, ':').replace(/\s*\([^)]*\)/, '').trim();
  let parts = timeStr.split(' – ');
  if (parts.length !== 2) parts = timeStr.split(' - ');
  if (parts.length !== 2) return null;
  return `${norm(parts[0])}–${norm(parts[1])}`;
};

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const buildWeekDays = (centerDate) => {
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(centerDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

// ── DayViewScreen ──────────────────────────────────────────────────────────────

const DayViewScreen = ({ navigation, initialDate, initialFocusShiftId }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { daysWithShifts, hoursReport } = useShifts();
  const { myCededOpenings, refresh: refreshOpenings, cancelCedeOpening } = useOpenings();
  const { swapsSent, swapsReceived, offersSent, cancelSwap, cancelOffer } = useOffers();
  const { coworkersById } = useGroups();
  const { deleteManualShift, restoreShiftLocally } = useShifts();
  const { user } = useContext(AuthContext);

  useEffect(() => { refreshOpenings?.(true); }, [refreshOpenings]);

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const [groupColors, setGroupColors] = useState({});
  const [savedValues, setSavedValues] = useState(null);
  const [fullConfig, setFullConfig] = useState(null);
  const [dayRealHours, setDayRealHours] = useState({});

  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);
  const [bsInitialIdx, setBsInitialIdx] = useState(0);
  const [cedeShift, setCedeShift] = useState(null);
  const [trocarShift, setTrocarShift] = useState(null);

  const [shiftPickerVisible, setShiftPickerVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  // Foco + lista (mockup Aurora · Dia + Detalhe · variação C).
  // Só o plantão em foco exibe ações; os demais ficam como linhas compactas.
  // null = nenhum em foco (todos colapsados). Pode ser controlado externamente
  // pelo caller (ex: HomeScreen.navigate('DayView', { focusShiftId })).
  const [focusedShiftId, setFocusedShiftId] = useState(initialFocusShiftId || null);
  // Confirmação que SEMPRE nomeia o plantão exato (turno · dia · hospital).
  const [confirmIntent, setConfirmIntent] = useState(null); // { action, shift }
  // Detalhe da troca/cessão aberto ao tocar no status banner.
  const [detailSwap, setDetailSwap] = useState(null); // { swap, mode }
  const [detailCessao, setDetailCessao] = useState(null); // opening
  // Toast pós-ação.
  const [doneAction, setDoneAction] = useState(null);
  const doneTimerRef = useRef(null);
  const fireDone = (action) => {
    setDoneAction(action);
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => setDoneAction(null), 2200);
  };
  useEffect(() => () => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); }, []);

  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 60) {
        setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
      } else if (g.dx < -60) {
        setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
      }
    },
  })).current;

  const daySelectorRef  = useRef(null);
  const fabEntryScale   = useRef(new Animated.Value(0)).current;
  const fabPressScale   = useRef(new Animated.Value(1)).current;
  const fabAnimatedOnce = useRef(false);
  const pickerSlideY    = useRef(new Animated.Value(500)).current;

  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);

  const shiftsMap = useMemo(() => {
    const map = {};
    (daysWithShifts || []).forEach(d => { map[d.date] = d.shifts || []; });
    return map;
  }, [daysWithShifts]);

  const selectedDateStr = toDateStr(selectedDate);
  const baseDayShifts = shiftsMap[selectedDateStr] || [];

  // Cede ao grupo remove o plantão do calendário. Reinjetamos como "virtual shift"
  // marcado com _pendingCede pra renderizar amarelo + permitir cancelar inline.
  // Adicionalmente anotamos pendências de troca (swap) e cessão direcionada (offer)
  // nos plantões que continuam visíveis — mesmo padrão visual.
  const dayShifts = useMemo(() => {
    const cededToday = (myCededOpenings || []).filter(o => {
      const k = o.dateKey || (o.startISO || '').slice(0, 10);
      return k === selectedDateStr && o.status === 'active';
    });
    const ceded = cededToday.map(o => {
      const snap = o.originShiftSnapshot || {};
      return {
        ...snap,
        _pendingCede: o,
        id: snap.id || `pending_${o.id}`,
        label: snap.label || o.label,
        date: snap.date || o.dateKey,
        startISO: snap.startISO || o.startISO,
        endISO: snap.endISO || o.endISO,
        time: snap.time,
        group: snap.group || o.group,
        monthKey: snap.monthKey || o.monthKey,
      };
    });

    // Index swaps and direct offers by the user's own shift id (shiftA for swaps initiated by me).
    const sentSwapByShiftId = {};
    (swapsSent || []).forEach(sw => {
      if (sw?.status !== 'pending' || !sw.shiftA?.id) return;
      sentSwapByShiftId[String(sw.shiftA.id)] = sw;
    });
    const sentOfferByShiftId = {};
    (offersSent || []).forEach(o => {
      if (o?.status !== 'pending' || !o.shiftSnapshot?.id) return;
      sentOfferByShiftId[String(o.shiftSnapshot.id)] = o;
    });
    const recvSwapByShiftId = {};
    (swapsReceived || []).forEach(sw => {
      if (sw?.status !== 'pending' || !sw.shiftB?.id) return;
      recvSwapByShiftId[String(sw.shiftB.id)] = sw;
    });

    const annotated = baseDayShifts.map(sh => {
      const id = sh?.id != null ? String(sh.id) : '';
      const pendingSwap = sentSwapByShiftId[id] || recvSwapByShiftId[id] || null;
      const pendingOffer = sentOfferByShiftId[id] || null;
      if (!pendingSwap && !pendingOffer) return sh;
      return {
        ...sh,
        _pendingSwap: pendingSwap || undefined,
        _pendingSwapRole: pendingSwap
          ? (sentSwapByShiftId[id] ? 'initiator' : 'target')
          : undefined,
        _pendingOffer: pendingOffer || undefined,
      };
    });

    // Dedup por id — evita renderizar o mesmo plantão duas vezes (e o warning
    // "two children with the same key"). Pode ocorrer se um ghost de cessão
    // coincidir com o shift base, ou se daysWithShifts trouxer duplicata.
    const seen = new Set();
    return [...annotated, ...ceded].filter((sh, i) => {
      const k = sh?.id != null ? String(sh.id) : `idx_${i}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [baseDayShifts, myCededOpenings, selectedDateStr, swapsSent, swapsReceived, offersSent]);

  useEffect(() => {
    if (!fabAnimatedOnce.current) {
      fabAnimatedOnce.current = true;
      fabEntryScale.setValue(0);
      const t = setTimeout(() => Animated.spring(fabEntryScale, { toValue: 1, ...SPRING_FAB }).start(), 200);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const itemCenter = DAY_PADDING + 3 * DAY_ITEM_TOTAL + DAY_ITEM_TOTAL / 2;
    daySelectorRef.current?.scrollTo({ x: Math.max(0, itemCenter - W / 2), animated: true });
  }, [selectedDateStr]);

  // Auto-foco do shift pedido via prop (Home → DayView com shift específico).
  // Roda 1x quando dayShifts ficar pronto pra esse id.
  const initialFocusAppliedRef = useRef(false);
  useEffect(() => {
    if (initialFocusAppliedRef.current) return;
    if (!initialFocusShiftId || !dayShifts.length) return;
    if (dayShifts.some(sh => String(sh.id) === String(initialFocusShiftId))) {
      setFocusedShiftId(initialFocusShiftId);
      initialFocusAppliedRef.current = true;
    }
  }, [dayShifts, initialFocusShiftId]);

  // Reseta foco quando o shift atual sai do dia (mudou de data, etc.).
  // NÃO faz auto-foco do primeiro — todos podem ficar colapsados.
  useEffect(() => {
    if (!focusedShiftId) return;
    const stillValid = dayShifts.some(sh => String(sh.id) === String(focusedShiftId));
    if (!stillValid) setFocusedShiftId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayShifts]);

  useEffect(() => {
    if (shiftPickerVisible) {
      pickerSlideY.setValue(500);
      Animated.spring(pickerSlideY, { toValue: 0, damping: 20, stiffness: 300, mass: 0.8, useNativeDriver: true }).start();
    } else {
      Animated.timing(pickerSlideY, { toValue: 500, duration: DURATION_CLOSE, easing: EASING_CLOSE, useNativeDriver: true }).start();
    }
  }, [shiftPickerVisible]);

  useEffect(() => {
    const userId = user?.id;
    getFullShiftConfig().then(cfg => { setSavedValues(cfg.hourValues); setFullConfig(cfg); }).catch(() => {});
    if (userId) getGroupColors(userId).then(colors => setGroupColors(colors || {}));
  }, [user?.id]);

  useEffect(() => {
    const uid = String(user?.id || '');
    // Chave escopada por uid (legada sem uid como fallback).
    (async () => {
      try {
        const raw = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${selectedDateStr}`))
          || await SecureStore.getItemAsync(`real_hours_${selectedDateStr}`);
        setDayRealHours(raw ? JSON.parse(raw) : {});
      } catch { setDayRealHours({}); }
    })();
  }, [selectedDateStr, user?.id]);

  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const shiftTypeKey = (shift) => {
    if (shift.carryover) return 'D';
    if (shift.label === 'FN') return 'FN';
    return shift.label?.charAt(0) || 'M';
  };

  const openShiftDetail = (shift) => {
    // Use the annotated dayShifts (with _pendingSwap / _pendingCede / _pendingOffer)
    // instead of the raw daysWithShifts, so the bottom sheet sees the pending state.
    const allShifts = dayShifts.length > 0 ? dayShifts : [shift];
    const idx = allShifts.findIndex(s => String(s.id) === String(shift.id));
    setBsShifts(allShifts);
    setBsDate(new Date(shift.date + 'T00:00:00'));
    setBsInitialIdx(idx >= 0 ? idx : 0);
    setBsVisible(true);
  };

  const handleFAB = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddModalVisible(true);
  };

  const dateLabel = () => {
    const wd = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][selectedDate.getDay()];
    return `${wd}, ${selectedDate.getDate()} de ${MONTHS_FULL_PT[selectedDate.getMonth()]}`;
  };

  // Cálculo de valor reaproveitado pelo FocusCard e pelo CompactRow.
  // Mantém regras de loyalty/bonus/horas-extras como antes.
  const computeShiftValue = (shift, index) => {
    const baseValue = calculateShiftValueSync(shift, shift.date, savedValues);
    return (() => {
      let mult = 1;
      const monthlyHours = hoursReport?.realHours || 0;
      if (fullConfig?.loyaltyEnabled && fullConfig.loyaltyOptions?.length) {
        const tier = fullConfig.loyaltyOptions
          .filter(o => o.minHours <= monthlyHours)
          .sort((a, b) => b.minHours - a.minHours)[0];
        if (tier) mult += tier.percentage / 100;
      }
      if (fullConfig?.bonusEnabled && fullConfig.bonus) {
        const month = new Date(shift.date + 'T00:00:00').getMonth() + 1;
        if (month >= fullConfig.bonus.startMonth && month <= fullConfig.bonus.endMonth) {
          mult += (parseFloat(fullConfig.bonus.percentage) || 0) / 100;
        }
      }
      // extra hours from registered real hours
      const realEntry = dayRealHours[index];
      let extraValue = 0;
      if (realEntry?.startTime && realEntry?.endTime) {
        const toMin = t => { const [h, m] = t.replace('h', ':').split(':').map(Number); return h * 60 + (m || 0); };
        const scheduledMin = (() => {
          const parts = (shift.time || '').split(/\s*[–-]\s*/);
          if (parts.length < 2) return 0;
          const s = toMin(parts[0].replace(/\s*\([^)]*\)/, '').trim());
          let e = toMin(parts[1].replace(/\s*\([^)]*\)/, '').trim());
          if (e < s) e += 1440;
          return e - s;
        })();
        const realStart = toMin(realEntry.startTime);
        let realEnd = toMin(realEntry.endTime);
        if (realEnd < realStart) realEnd += 1440;
        const extraMin = (realEnd - realStart) - scheduledMin;
        if (extraMin > 0 && savedValues) {
          const period = getShiftPeriod(shift.label);
          const useWe = shouldUseWeekendValue(shift.date, shift.label, fullConfig?.fridayNightAsWeekend);
          const hourly = parseFloat((useWe ? savedValues.weekend : savedValues.weekday)?.[period]) || 0;
          extraValue = roundCurrency((extraMin / 60) * hourly * mult);
        }
      }
      return roundCurrency(baseValue * mult) + extraValue;
    })();
  };

  // Handler central: roteia ações do FocusCard pro fluxo certo.
  // Pra ações de risco (ceder/trocar/excluir + cancelar pendentes), abre
  // ConfirmSheet que nomeia o plantão antes. Pra "registrar horas" e
  // "ver interessados", dispara direto.
  const handleShiftAction = (shift, action) => {
    if (action === 'registrar_horas' || action === 'confirmar_presenca') {
      openShiftDetail(shift);
      return;
    }
    if (action === 'ver_interessados') {
      // TODO: rotear pra TrocasAbertasScreen filtrada pela cessão deste shift.
      fireDone('ver_interessados');
      return;
    }
    // Ações de risco: ceder/trocar/excluir + cancelar pendentes — passam pela
    // ConfirmActionSheet que sempre nomeia o plantão exato (turno · dia · hospital).
    setConfirmIntent({ action, shift });
  };

  const executeConfirmedAction = async () => {
    if (!confirmIntent) return;
    const { action, shift } = confirmIntent;
    setConfirmIntent(null);
    try {
      if (action === 'ceder') {
        setCedeShift(shift);
        return;
      }
      if (action === 'trocar') {
        setTrocarShift(shift);
        return;
      }
      if (action === 'excluir') {
        if (shift.isManual) await deleteManualShift?.(shift.id, shift.monthKey);
        fireDone('excluir');
        return;
      }
      if (action === 'cancelar_troca') {
        const swap = shift._pendingSwap;
        if (swap) await cancelSwap?.(swap);
        fireDone('cancelar_troca');
        return;
      }
      if (action === 'cancelar_oferta') {
        const offer = shift._pendingOffer;
        if (offer) await cancelOffer?.(offer);
        fireDone('cancelar_oferta');
        return;
      }
      if (action === 'cancelar_cessao') {
        const opening = shift._pendingCede;
        if (opening) {
          const r = await cancelCedeOpening?.(opening.id);
          if (r?.success && r.restoredShift) restoreShiftLocally?.(r.restoredShift);
        }
        fireDone('cancelar_cessao');
        return;
      }
    } catch (_) {
      // ação falha silenciosa — toast genérico é OK
    }
  };

  // Descrição dinâmica do status — usa nomes/contagens do pending state em vez
  // do texto estático. Retorna também handler de tap pra abrir o detalhe certo.
  const describeStatus = (shift, status) => {
    const swap = shift?._pendingSwap;
    const offer = shift?._pendingOffer;
    const opening = shift?._pendingCede;
    if (status === SHIFT_STATUS.EM_TROCA && swap) {
      const target = swap.targetUserName || 'colega';
      return { text: `Você e ${target} estão trocando`, onPress: () => setDetailSwap({ swap, mode: 'sent' }) };
    }
    if (status === SHIFT_STATUS.EM_TROCA && offer) {
      const to = offer.toUserName || 'colega';
      return { text: `Oferecido a ${to} — aguardando resposta`, onPress: null };
    }
    if (status === SHIFT_STATUS.TROCA_RECEBIDA && swap) {
      const initiator = swap.initiatorUserName || 'Um colega';
      return { text: `${initiator} quer trocar com você`, onPress: () => setDetailSwap({ swap, mode: 'received' }) };
    }
    if (status === SHIFT_STATUS.CEDIDO && opening) {
      const interested = Array.isArray(opening.interests) ? opening.interests.length : 0;
      const txt = interested > 0 ? `${interested} interessado${interested === 1 ? '' : 's'}` : 'Aguardando interessado';
      return { text: txt, onPress: () => setDetailCessao(opening) };
    }
    if (status === SHIFT_STATUS.COBRINDO) {
      const origin = shift?.originUserName || coworkersById?.[shift?.originUserId]?.name || 'colega';
      return { text: `Recebido de ${origin}`, onPress: null };
    }
    return { text: SHIFT_STATUS_META[status]?.desc || '', onPress: null };
  };

  // ── Status banner (top do FocusCard) ─────────────────────────────────────
  const renderStatusBanner = (shift, status) => {
    const meta = SHIFT_STATUS_META[status];
    if (!meta) return null;
    const t = statusTone(meta.tone, C);
    const iconName = ({
      check: 'checkmark-circle', clock: 'time-outline',
      swap: 'swap-horizontal', cede: 'megaphone-outline', login: 'enter-outline', x: 'close-circle',
    })[meta.icon] || 'ellipse';
    const { text: descText, onPress } = describeStatus(shift, status);
    const baseStyle = [s.statusBanner, { backgroundColor: t.bg }];
    const inner = (
      <>
        <View style={[s.statusBannerIcon, { backgroundColor: t.fg + '22' }]}>
          <Ionicons name={iconName} size={13} color={t.fg} />
        </View>
        <Text style={[s.statusBannerLabel, { color: t.fg, fontFamily: Typography.fontFamily.bold }]} numberOfLines={1}>
          {meta.label.toUpperCase()}
        </Text>
        <Text style={[s.statusBannerDesc, { color: t.fg }]} numberOfLines={1}>· {descText}</Text>
        {onPress && <Ionicons name="chevron-forward" size={14} color={t.fg} style={{ opacity: 0.7 }} />}
      </>
    );
    if (onPress) {
      return (
        <Pressable onPress={onPress} style={({ pressed }) => [baseStyle, pressed && { opacity: 0.85 }]}>
          {inner}
        </Pressable>
      );
    }
    return <View style={baseStyle}>{inner}</View>;
  };

  // ── Status chip (linha compacta) ─────────────────────────────────────────
  const renderStatusChip = (status) => {
    const meta = SHIFT_STATUS_META[status];
    if (!meta) return null;
    const t = statusTone(meta.tone, C);
    return (
      <View style={[s.statusChip, { backgroundColor: t.bg }]}>
        <Text style={[s.statusChipText, { color: t.fg, fontFamily: Typography.fontFamily.bold }]} numberOfLines={1}>
          {meta.label.toUpperCase()}
        </Text>
      </View>
    );
  };

  // ── Linha compacta (plantão fora de foco) ────────────────────────────────
  const renderCompactRow = ({ shift, value, status, index = 0 }) => {
    const groupColor = resolveGroupColor(shift);
    const typeKey = shiftTypeKey(shift);
    const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;
    const timeStr = parseShiftTime(shift.time) || `${shift.startTime || ''}${shift.endTime ? '–' + shift.endTime : ''}`;
    const labelTxt = LABEL_MAP[shift.label] || LABEL_MAP[typeKey] || shift.label || 'Plantão';
    return (
      <Pressable
        key={`c-${shift.id ?? 'x'}-${index}`}
        onPress={() => setFocusedShiftId(shift.id)}
        style={({ pressed }) => [s.compactRow, { backgroundColor: C.background.card, borderColor: C.border.light }, pressed && { opacity: 0.85 }]}
      >
        <View style={[s.leftBar, { backgroundColor: groupColor }]} />
        <View style={[s.shiftTypeBadge, { backgroundColor: badgeColor + '1f', marginLeft: 6 }]}>
          <Text style={[s.shiftTypeBadgeText, { color: badgeColor }]}>{labelTxt}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[s.compactRowTitle, { color: C.text.primary }]} numberOfLines={1}>
            {labelTxt} · {timeStr}
          </Text>
          {status && <View style={{ marginTop: 4 }}>{renderStatusChip(status)}</View>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {value > 0 ? <Text style={[s.compactRowValue, { color: C.money }]}>{fmtBRLk(value)}</Text> : null}
          <Ionicons name="chevron-down" size={14} color={C.text.tertiary} style={{ marginTop: 2 }} />
        </View>
      </Pressable>
    );
  };

  // ── Action row do FocusCard (ações dependem do status) ───────────────────
  const renderActionsRow = (shift, status) => {
    if (status === SHIFT_STATUS.EM_TROCA) {
      const info = statusTone('info', C);
      return (
        <Pressable
          onPress={() => handleShiftAction(shift, shift._pendingOffer ? 'cancelar_oferta' : 'cancelar_troca')}
          style={({ pressed }) => [s.actionBtnSecondary, { borderColor: info.line }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="swap-horizontal" size={15} color={info.fg} />
          <Text style={[s.actionBtnSecondaryText, { color: info.fg }]}>Cancelar {shift._pendingOffer ? 'cessão' : 'troca'}</Text>
        </Pressable>
      );
    }
    if (status === SHIFT_STATUS.TROCA_RECEBIDA) {
      // Quem decide é o destinatário — abrindo bottom sheet existente p/ aceitar/recusar
      return (
        <Pressable onPress={() => openShiftDetail(shift)} style={({ pressed }) => [s.actionBtnPrimary, { backgroundColor: C.primary }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="open-outline" size={16} color="#fff" />
          <Text style={s.actionBtnPrimaryText}>Ver proposta</Text>
        </Pressable>
      );
    }
    if (status === SHIFT_STATUS.CEDIDO) {
      const opening = shift._pendingCede;
      const interested = Array.isArray(opening?.interests) ? opening.interests.length : 0;
      return (
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Pressable
            onPress={() => handleShiftAction(shift, 'ver_interessados')}
            style={({ pressed }) => [s.actionBtnPrimary, { flex: 1.3, backgroundColor: C.primary }, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.actionBtnPrimaryText}>
              Ver interessados{interested > 0 ? ` · ${interested}` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleShiftAction(shift, 'cancelar_cessao')}
            style={({ pressed }) => [s.actionBtnSecondary, { flex: 1, borderColor: C.border.light }, pressed && { opacity: 0.8 }]}
          >
            <Text style={[s.actionBtnSecondaryText, { color: C.text.secondary }]}>Cancelar cessão</Text>
          </Pressable>
        </View>
      );
    }
    // confirmado / cobrindo / a_confirmar — primário "Registrar horas" + menu 3-pontos
    const primaryConfirm = status === SHIFT_STATUS.A_CONFIRMAR;
    return (
      <FocusActionPrimary
        shift={shift}
        primaryConfirm={primaryConfirm}
        onPrimary={() => handleShiftAction(shift, primaryConfirm ? 'confirmar_presenca' : 'registrar_horas')}
        onMenuAction={(act) => handleShiftAction(shift, act)}
        C={C}
        s={s}
      />
    );
  };

  // ── Focus card (plantão expandido com detalhes + ações) ─────────────────
  const renderFocusCard = ({ shift, index, value, status }) => {
    const groupColor = resolveGroupColor(shift);
    const typeKey = shiftTypeKey(shift);
    const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;
    const labelTxt = LABEL_MAP[shift.label] || LABEL_MAP[typeKey] || shift.label || 'Plantão';
    const timeStr = parseShiftTime(shift.time) || `${shift.startTime || ''}${shift.endTime ? '–' + shift.endTime : ''}`;
    const hours = Math.round((shift.durationMinutes || 0) / 60 * 10) / 10;
    const rate = hours > 0 && value > 0 ? roundCurrency(value / hours) : null;
    const hospitalName = shift.group?.institution?.name || shift.group?.institutionName || shift.hospitalName || '';
    const groupName = shift.group?.name || '';
    const originName = shift.originUserName
      || coworkersById?.[shift.originUserId]?.name
      || (shift.originUserId ? `Doutor#${String(shift.originUserId).slice(0, 6)}` : null);

    return (
      <View
        key={`f-${shift.id ?? 'x'}-${index}`}
        style={[s.focusCard, { backgroundColor: C.background.card, borderColor: C.primary + '40' }]}
      >
        <View style={[s.leftBar, { backgroundColor: groupColor, zIndex: 2 }]} />
        {renderStatusBanner(shift, status)}
        <View style={s.focusCardBody}>
          {/* Topo: tag tempo · hospital · grupo / valor previsto */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.shiftTypeBadge, { backgroundColor: badgeColor + '1f' }]}>
                  <Text style={[s.shiftTypeBadgeText, { color: badgeColor }]}>{labelTxt}</Text>
                </View>
                <Text style={[s.focusTimeText, { color: C.text.secondary }]}>{timeStr}</Text>
              </View>
              {!!hospitalName && (
                <Text style={[s.focusHospital, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]} numberOfLines={2}>
                  {hospitalName}
                </Text>
              )}
              {!!groupName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: groupColor }} />
                  <Text style={[s.focusGroupName, { color: groupColor }]} numberOfLines={1}>{groupName}</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              {value > 0 ? (
                <>
                  <Text style={[s.focusValueLabel, { color: C.text.tertiary }]}>VALOR PREVISTO</Text>
                  <Text style={[s.focusValueText, { color: C.money, fontFamily: Typography.fontFamily.display }]} numberOfLines={1}>
                    {fmtBRLk(value)}
                  </Text>
                </>
              ) : null}
              {/* Collapse — só faz sentido com 2+ plantões (com 1 ele é sempre
                  focado e não recolhe). */}
              {dayShifts.length > 1 && (
                <Pressable
                  onPress={() => setFocusedShiftId(null)}
                  hitSlop={8}
                  style={({ pressed }) => [s.collapseBtn, { borderColor: C.border.light }, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name="chevron-up" size={15} color={C.text.tertiary} />
                </Pressable>
              )}
            </View>
          </View>

          <View style={[s.hairline, { backgroundColor: C.border.light }]} />

          {/* Linha "Horário" */}
          <View style={s.focusInfoRow}>
            <Ionicons name="time-outline" size={16} color={C.text.secondary} />
            <Text style={[s.focusInfoLabel, { color: C.text.secondary }]}>Horário</Text>
            <Text style={[s.focusInfoValue, { color: C.text.primary }]} numberOfLines={1}>
              {timeStr} {hours > 0 ? <Text style={{ color: C.text.tertiary }}>({typeKey}) {hours}h</Text> : null}
            </Text>
          </View>

          {/* "Recebido de" se aplicável */}
          {originName && (
            <View style={s.focusInfoRow}>
              <Ionicons name="enter-outline" size={16} color={C.text.secondary} />
              <Text style={[s.focusInfoLabel, { color: C.text.secondary }]}>Recebido de</Text>
              <Text style={[s.focusInfoValue, { color: C.text.primary }]} numberOfLines={1}>{originName}</Text>
            </View>
          )}

          {/* Composição do valor */}
          {value > 0 && rate && hours > 0 && (
            <View style={[s.compositionCard, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
              <Text style={[s.compositionLabel, { color: C.text.tertiary }]}>COMPOSIÇÃO DO VALOR</Text>
              <View style={s.compositionRow}>
                <Text style={[s.compositionLine, { color: C.text.secondary }]}>{fmtBRLk(rate)}/h × {hours}h</Text>
                <Text style={[s.compositionLine, { color: C.text.primary }]}>+ {fmtBRLk(value)}</Text>
              </View>
              <View style={[s.hairline, { backgroundColor: C.border.light, marginVertical: 9 }]} />
              <View style={s.compositionRow}>
                <Text style={[s.compositionTotal, { color: C.text.primary }]}>Total</Text>
                <Text style={[s.compositionTotalValue, { color: C.money }]}>{fmtBRLk(value)}</Text>
              </View>
            </View>
          )}

          <View style={[s.hairline, { backgroundColor: C.border.light, marginVertical: 13 }]} />

          {renderActionsRow(shift, status)}
        </View>
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]} {...swipePan.panHandlers}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm, backgroundColor: C.background.primary }]}>
        <Pressable onPress={() => navigation?.goBack?.()} style={s.backBtn} hitSlop={Spacing.md}>
          <Ionicons name="chevron-back" size={22} color={C.text.primary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerLabel, { color: C.text.tertiary }]}>Dia</Text>
          <Text style={[s.headerDate, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>{dateLabel()}</Text>
        </View>
        <Pressable onPress={() => setSelectedDate(today)} style={s.todayBtn} hitSlop={Spacing.sm}>
          <Text style={[s.todayBtnText, { color: C.primary }]}>Hoje</Text>
        </Pressable>
      </View>

      {/* Day selector */}
      <View style={[s.daySelector, { backgroundColor: C.background.primary, borderBottomColor: C.border.light }]}>
        <ScrollView
          ref={daySelectorRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.daySelectorContent}
          decelerationRate={0.92}
          scrollEventThrottle={16}
        >
          {weekDays.map((d, i) => {
            const ds = toDateStr(d);
            const isSelected = ds === selectedDateStr;
            const isToday = ds === toDateStr(today);
            const count = (shiftsMap[ds] || []).length;
            return (
              <Pressable key={i} style={s.dayItem} onPress={() => setSelectedDate(d)}>
                <Text style={[s.dayWeekday, { color: isSelected ? C.primary : C.text.tertiary }]}>
                  {WEEKDAYS_PT[d.getDay()]}
                </Text>
                <View style={[s.dayNumWrap, isSelected && { backgroundColor: C.primary }]}>
                  <Text style={[s.dayNum, { color: isSelected ? '#fff' : isToday ? C.primary : C.text.primary, fontFamily: Typography.fontFamily.bold }]}>
                    {d.getDate()}
                  </Text>
                </View>
                <View style={s.dayDots}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                    <View key={di} style={[s.dayDot, { backgroundColor: SHIFT_ACCENTS[di] }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Shift list — padrão Foco + Lista (mockup Aurora · Dia + Detalhe · C) */}
      <ScrollView
        style={s.listArea}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        overScrollMode="never"
        bounces={Platform.OS === 'ios'}
      >
        {dayShifts.length === 0 ? (
          <View style={[s.empty, { borderColor: C.border.light }]}>
            <Ionicons name="calendar-outline" size={40} color={C.interactive.inactive} />
            <Text style={[s.emptyTitle, { color: C.text.primary, fontFamily: Typography.fontFamily.semiBold }]}>Nenhum plantão</Text>
            <Text style={[s.emptySubtitle, { color: C.text.secondary }]}>Sem turnos para este dia</Text>
          </View>
        ) : (() => {
          // Computa valor + status uma vez por shift; FocusCard usa tudo, CompactRow só value + status.
          const enriched = dayShifts.map((sh, idx) => ({
            shift: sh,
            index: idx,
            value: computeShiftValue(sh, idx),
            status: deriveShiftStatus(sh, user?.id),
          }));
          const total = enriched.reduce((acc, e) => acc + (e.value || 0), 0);
          const hours = enriched.reduce((acc, e) => acc + ((e.shift?.durationMinutes || 0) / 60), 0);
          // NÃO reordena: cada card abre/fecha NA POSIÇÃO dele. Fallback foca o
          // primeiro. (Reordenar fazia os cards "trocarem de lugar".)
          const focusedId = focusedShiftId || enriched[0]?.shift?.id;
          return (
            <>
              {/* DaySummary — N plantões · Xh / Total previsto */}
              <View style={[s.daySummary, { backgroundColor: C.background.card, borderColor: C.border.light }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.daySummaryEyebrow, { color: C.text.tertiary }]}>SEU DIA</Text>
                  <Text style={[s.daySummaryTitle, { color: C.text.primary }]} numberOfLines={1}>
                    {enriched.length} plant{enriched.length > 1 ? 'ões' : 'ão'} · {Math.round(hours)}h
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.daySummaryEyebrow, { color: C.text.tertiary }]}>TOTAL PREVISTO</Text>
                  <Text style={[s.daySummaryTotal, { color: C.money }]} numberOfLines={1}>
                    {fmtBRLk(total) || 'R$ 0,00'}
                  </Text>
                </View>
              </View>

              <View style={{ height: Spacing.md }} />

              {enriched.map(({ shift, index, value, status }) => (
                String(shift.id) === String(focusedId)
                  ? renderFocusCard({ shift, index, value, status })
                  : renderCompactRow({ shift, value, status, index })
              ))}

              <View style={s.footerHint}>
                <Ionicons name="shield-outline" size={11} color={C.text.tertiary} />
                <Text style={[s.footerHintText, { color: C.text.tertiary }]}>Só o plantão aberto tem ações</Text>
              </View>
            </>
          );
        })()}
      </ScrollView>

      {/* FAB — always visible, adds a manual shift */}
      <Animated.View style={[s.fabWrap, { bottom: insets.bottom + Spacing.lg }, { transform: [{ scale: fabEntryScale }, { scale: fabPressScale }] }]}>
        <Pressable
          style={[s.fab, { backgroundColor: C.primary }]}
          onPress={handleFAB}
          onPressIn={() => Animated.spring(fabPressScale, { toValue: 0.88, ...SPRING_FAB }).start()}
          onPressOut={() => Animated.spring(fabPressScale, { toValue: 1, ...SPRING_FAB }).start()}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* Shift picker (multi-shift FAB) */}
      <Modal visible={shiftPickerVisible} transparent animationType="fade" onRequestClose={() => setShiftPickerVisible(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShiftPickerVisible(false)} />
        <Animated.View style={[s.pickerSheet, { backgroundColor: C.background.elevated, transform: [{ translateY: pickerSlideY }] }]}>
          <View style={[s.sheetHandle, { backgroundColor: C.border.light }]} />
          <Text style={[s.pickerTitle, { color: C.text.primary }]}>Ver detalhes de qual plantão?</Text>
          {dayShifts.map((shift, index) => {
            const label = LABEL_MAP[shift.label?.charAt(0)] || shift.label || 'Plantão';
            const accent = SHIFT_ACCENTS[index % SHIFT_ACCENTS.length];
            return (
              <Pressable
                key={index}
                style={[s.pickerItem, { borderBottomColor: C.border.light }]}
                onPress={() => { setShiftPickerVisible(false); openShiftDetail(shift); }}
              >
                <View style={[s.pickerDot, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.pickerItemLabel, { color: C.text.primary }]}>Plantão {label}</Text>
                  {shift.time ? <Text style={[s.pickerItemSub, { color: C.text.secondary }]}>{shift.time}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
              </Pressable>
            );
          })}
        </Animated.View>
      </Modal>

      <ShiftBottomSheet
        isVisible={bsVisible}
        onClose={() => setBsVisible(false)}
        shifts={bsShifts}
        selectedDate={bsDate}
        initialShiftIndex={bsInitialIdx}
        onCede={(sh) => { setBsVisible(false); setCedeShift(sh); }}
        onTrocar={(sh) => { setBsVisible(false); setTrocarShift(sh); }}
      />
      {cedeShift && <CederFlowSheet key={`cede-${cedeShift.id}`} visible shift={cedeShift} onClose={() => setCedeShift(null)} />}
      {trocarShift && <TrocarFlowSheet key={`trocar-${trocarShift.id}`} visible shift={trocarShift} onClose={() => setTrocarShift(null)} />}

      <AddManualShiftModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        date={selectedDateStr}
      />

      <ConfirmActionSheet
        intent={confirmIntent}
        C={C}
        onCancel={() => setConfirmIntent(null)}
        onConfirm={executeConfirmedAction}
      />
      <DoneActionToast action={doneAction} C={C} insetsBottom={insets.bottom} />

      {detailSwap && (
        <TrocaDetailSheet
          visible
          swap={detailSwap.swap}
          mode={detailSwap.mode}
          onClose={() => setDetailSwap(null)}
        />
      )}
      {detailCessao && (
        <CessaoDetailSheet
          visible
          opening={detailCessao}
          onClose={() => setDetailCessao(null)}
        />
      )}
    </View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares — escopo do módulo, sem closures sobre estado.
// ────────────────────────────────────────────────────────────────────────────

// Primário "Registrar horas" (ou "Confirmar presença" se a_confirmar) + menu 3-pontos.
function FocusActionPrimary({ shift, primaryConfirm, onPrimary, onMenuAction, C, s }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isManual = shift?.isManual === true;
  return (
    <View style={{ position: 'relative' }}>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Pressable
          onPress={onPrimary}
          style={({ pressed }) => [s.actionBtnPrimary, { flex: 1, backgroundColor: primaryConfirm ? C.warning : C.primary }, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name={primaryConfirm ? 'checkmark' : 'add'} size={16} color="#fff" />
          <Text style={s.actionBtnPrimaryText}>
            {primaryConfirm ? 'Confirmar presença' : 'Registrar horas'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMenuOpen(v => !v)}
          style={({ pressed }) => [s.actionBtnDots, { backgroundColor: menuOpen ? C.background.secondary : C.background.card, borderColor: C.border.light }, pressed && { opacity: 0.85 }]}
          hitSlop={6}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={C.text.secondary} />
        </Pressable>
      </View>
      {menuOpen && (
        <>
          <Pressable onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFillObject} />
          <View style={[s.actionMenu, { backgroundColor: C.background.card, borderColor: C.border.light }]}>
            <Text style={[s.actionMenuTitle, { color: C.text.tertiary, borderBottomColor: C.border.light }]}>
              Ações neste plantão
            </Text>
            {[
              { id: 'trocar',  label: 'Trocar plantão', icon: 'swap-horizontal', danger: false },
              { id: 'ceder',   label: 'Ceder ao grupo', icon: 'megaphone-outline', danger: false },
              ...(isManual ? [{ id: 'excluir', label: 'Excluir', icon: 'trash-outline', danger: true }] : []),
            ].map((a, i) => (
              <Pressable
                key={a.id}
                onPress={() => { setMenuOpen(false); onMenuAction(a.id); }}
                style={({ pressed }) => [
                  s.actionMenuItem,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border.light },
                  pressed && { backgroundColor: C.background.secondary },
                ]}
              >
                <Ionicons name={a.icon} size={17} color={a.danger ? C.error : C.text.secondary} />
                <Text style={[s.actionMenuItemText, { color: a.danger ? C.error : C.text.primary }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// Confirmação que NOMEIA o plantão exato.
function ConfirmActionSheet({ intent, C, onCancel, onConfirm }) {
  if (!intent) return null;
  const { action, shift } = intent;
  const meta = {
    ceder:           { label: 'Ceder plantão',   desc: 'O plantão será oferecido ao grupo.',                color: C.primary, btn: 'Ceder' },
    trocar:          { label: 'Trocar plantão',  desc: 'Você vai propor a troca a um colega.',              color: C.primary, btn: 'Trocar' },
    excluir:         { label: 'Excluir plantão', desc: 'Remove o plantão da sua escala. Não pode desfazer.', color: C.error,  btn: 'Excluir' },
    cancelar_troca:  { label: 'Cancelar troca',  desc: 'A proposta é desfeita e o plantão volta a ser seu.', color: C.error,  btn: 'Cancelar troca' },
    cancelar_oferta: { label: 'Cancelar cessão', desc: 'A oferta direcionada é desfeita.',                  color: C.error,  btn: 'Cancelar cessão' },
    cancelar_cessao: { label: 'Cancelar cessão', desc: 'O plantão sai do grupo e volta a ser seu.',         color: C.error,  btn: 'Cancelar cessão' },
  }[action];
  if (!meta) return null;
  const typeKey = (shift?.label || '').charAt(0).toUpperCase();
  const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;
  const labelTxt = LABEL_MAP[shift?.label] || LABEL_MAP[typeKey] || shift?.label || 'Plantão';
  const dtStr = (() => {
    if (!shift?.date) return '';
    const d = new Date(shift.date + 'T00:00:00');
    const wd = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
    return `${wd}, ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const timeStr = parseShiftTime(shift?.time) || `${shift?.startTime || ''}${shift?.endTime ? '–' + shift.endTime : ''}`;
  const hospital = shift?.group?.institution?.name || shift?.group?.name || '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(15,20,26,0.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{
          backgroundColor: C.background.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 20, paddingBottom: 30,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.light, alignSelf: 'center', marginBottom: 14 }} />
          <Text style={{ fontSize: 18, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.3 }}>
            {meta.label}?
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12,
            padding: 11, borderRadius: 12, backgroundColor: C.background.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border.light,
          }}>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: badgeColor + '1f' }}>
              <Text style={{ fontSize: 9.5, fontFamily: Typography.fontFamily.bold, color: badgeColor, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {labelTxt}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary }} numberOfLines={1}>
                {labelTxt} · {dtStr}
              </Text>
              <Text style={{ fontSize: 11, color: C.text.tertiary, marginTop: 1 }} numberOfLines={1}>
                {hospital}{timeStr ? ' · ' + timeStr : ''}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12.5, color: C.text.secondary, marginVertical: 14 }}>{meta.desc}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [{
                flex: 1, padding: 13, borderRadius: 999,
                borderWidth: StyleSheet.hairlineWidth, borderColor: C.border.light,
                backgroundColor: C.background.card, alignItems: 'center',
              }, pressed && { opacity: 0.85 }]}
            >
              <Text style={{ fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [{
                flex: 1.3, padding: 13, borderRadius: 999,
                backgroundColor: meta.color, alignItems: 'center',
              }, pressed && { opacity: 0.9 }]}
            >
              <Text style={{ fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#fff' }}>{meta.btn}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Toast pós-ação (2.2s).
function DoneActionToast({ action, C, insetsBottom = 0 }) {
  if (!action) return null;
  const label = ({
    ceder:           'Plantão cedido ao grupo',
    trocar:          'Proposta de troca enviada',
    excluir:         'Plantão removido',
    cancelar_troca:  'Troca cancelada',
    cancelar_oferta: 'Cessão cancelada',
    cancelar_cessao: 'Cessão cancelada',
    ver_interessados:'Abrindo interessados…',
    confirmar_presenca: 'Presença confirmada',
  })[action] || 'Feito';
  return (
    <View pointerEvents="none" style={{
      position: 'absolute', left: 16, right: 16, bottom: 22 + insetsBottom,
      flexDirection: 'row', alignItems: 'center', gap: 9,
      padding: 12, paddingHorizontal: 14, borderRadius: 12,
      backgroundColor: C.text.primary,
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
    }}>
      <Ionicons name="checkmark" size={15} color="#fff" />
      <Text style={{ fontSize: 13, color: '#fff', fontFamily: Typography.fontFamily.semiBold }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  backBtn: { marginRight: Spacing.sm, paddingBottom: 2 },
  headerCenter: { flex: 1 },
  todayBtn: { paddingLeft: Spacing.sm, paddingBottom: 2 },
  todayBtnText: { fontSize: Typography.fontSize.subhead, fontWeight: '600' },
  headerLabel: { fontSize: Typography.fontSize.caption1, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  headerDate: { fontSize: Typography.fontSize.title3, fontWeight: '700', letterSpacing: -0.3 },

  daySelector: { borderBottomWidth: StyleSheet.hairlineWidth },
  daySelectorContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  dayItem: { alignItems: 'center', width: 44, marginHorizontal: 4, paddingVertical: 4 },
  dayWeekday: { fontSize: Typography.fontSize.caption3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  dayNumWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: Typography.fontSize.callout, fontWeight: '700' },
  dayDots: { flexDirection: 'row', gap: 3, marginTop: 4, height: 6, alignItems: 'center' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },

  listArea: { flex: 1 },

  // ── Compact Shift Card (matches HomeScreen) ──────────────────────────────────
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
    ...Shadows.small,
  },
  shiftAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  shiftDateCol: { alignItems: 'center', width: 54, paddingLeft: 16, paddingRight: 12 },
  shiftDay: { fontSize: 22, fontFamily: Typography.fontFamily.display, fontWeight: 'bold', letterSpacing: -0.6, lineHeight: 24 },
  shiftWday: { fontSize: 10, fontFamily: Typography.fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  shiftInfoCol: { flex: 1, paddingLeft: 2, paddingRight: 4 },
  shiftTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  shiftTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  shiftTypeBadgeText: { fontSize: 9.5, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  shiftTime: { fontSize: 12, fontFamily: Typography.fontFamily.regular },
  shiftInstitution: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, marginBottom: 4 },
  shiftMeta: { flexDirection: 'row', alignItems: 'center' },
  shiftGroupDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5, flexShrink: 0 },
  shiftGroupName: { fontSize: 11, fontFamily: Typography.fontFamily.regular, fontWeight: 'bold', maxWidth: 100 },
  coworkerStack: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  coworkerAvatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, overflow: 'hidden' },
  coworkerAvatarImg: { width: 18, height: 18, borderRadius: 9 },
  coworkerAvatarFallback: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  coworkerAvatarInitial: { fontSize: 8, fontWeight: '700' },
  coworkerAvatarOverflow: { alignItems: 'center', justifyContent: 'center' },
  coworkerAvatarOverflowText: { fontSize: 8, fontWeight: '600' },
  coworkerAvatarVacancy: { alignItems: 'center', justifyContent: 'center' },
  shiftValueCol: { alignItems: 'flex-end', gap: 2 },
  shiftValue: { fontSize: 13, fontWeight: '700', fontFamily: Typography.fontFamily.semiBold },
  // ─────────────────────────────────────────────────────────────────────────────

  cedeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
    overflow: 'hidden',
    ...Shadows.small,
  },
  cedeBannerStrip: { width: 4, alignSelf: 'stretch' },
  cedeBannerTitle: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, fontWeight: '700' },
  cedeBannerSub: { fontSize: 11, marginTop: 2 },
  cedeBannerBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
  },
  cedeBannerBtnText: { fontSize: 12, fontWeight: '700' },

  empty: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: { fontSize: Typography.fontSize.body, marginTop: Spacing.sm },
  emptySubtitle: { fontSize: Typography.fontSize.subhead, textAlign: 'center' },

  fabWrap: { position: 'absolute', right: Spacing.lg },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingBottom: 32,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: BorderRadius.pill, alignSelf: 'center', marginTop: 14, marginBottom: 6 },
  pickerTitle: { fontSize: Typography.fontSize.body, fontWeight: '600', paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerItemLabel: { fontSize: Typography.fontSize.body, fontWeight: '500' },
  pickerItemSub: { fontSize: Typography.fontSize.footnote, marginTop: 1 },

  // ── Foco + Lista (novo design Dia + Detalhe · variação C) ──────────────
  daySummary: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  daySummaryEyebrow: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8 },
  daySummaryTitle: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  daySummaryTotal: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, marginTop: 1 },

  leftBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },

  focusCard: {
    borderRadius: 18, borderWidth: 1, position: 'relative', overflow: 'hidden',
    marginBottom: 11,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 4 },
    }),
  },
  focusCardBody: { paddingHorizontal: 16, paddingVertical: 14, paddingLeft: 18 },
  focusTimeText: { fontSize: 12.5, fontWeight: '600' },
  focusHospital: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.3, marginTop: 9, lineHeight: 20 },
  focusGroupName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  focusValueLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  focusValueText: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginTop: 3 },
  collapseBtn: {
    marginTop: 6,
    width: 26, height: 22, borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  hairline: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  focusInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  focusInfoLabel: { flex: 1, fontSize: 13 },
  focusInfoValue: { fontSize: 13, fontWeight: '700' },

  compositionCard: {
    marginTop: 14, padding: 13, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  compositionLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, marginBottom: 9 },
  compositionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  compositionLine: { fontSize: 12.5 },
  compositionTotal: { fontSize: 13, fontWeight: '700' },
  compositionTotalValue: { fontSize: 15, fontWeight: '700' },

  // Status banner (cabeça do FocusCard)
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingHorizontal: 14, paddingLeft: 18 },
  statusBannerIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statusBannerLabel: { fontSize: 11, letterSpacing: 0.6, fontWeight: '800' },
  statusBannerDesc: { flex: 1, fontSize: 11.5, fontWeight: '600' },

  // Status chip (linha compacta)
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusChipText: { fontSize: 9.5, letterSpacing: 0.4, fontWeight: '800' },

  // CompactRow
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative', overflow: 'hidden',
    marginBottom: 11,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  compactRowTitle: { fontSize: 13.5, fontWeight: '700' },
  compactRowValue: { fontSize: 14, fontWeight: '800' },

  // Action buttons / menu
  actionBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 999,
  },
  actionBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  actionBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnSecondaryText: { fontSize: 13.5, fontWeight: '700' },
  actionBtnDots: {
    width: 46, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  actionMenu: {
    position: 'absolute', bottom: 52, right: 0, width: 220, zIndex: 9,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 8 },
    }),
  },
  actionMenuTitle: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5,
    padding: 9, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionMenuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    padding: 12, paddingHorizontal: 13,
  },
  actionMenuItemText: { fontSize: 13.5, fontWeight: '600' },

  footerHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16,
  },
  footerHintText: { fontSize: 10.5 },
});

export default DayViewScreen;
