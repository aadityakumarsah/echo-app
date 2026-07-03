import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Clock, Mic } from 'lucide-react-native';
import { listSessions, type SessionDetailData } from '../lib/api';
import SessionReportModal from './SessionReportModal';
import { colors, fonts, cardShadow } from '../lib/theme';

// ─── helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDateLabel(d: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  } catch { return localDateKey(d); }
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch { return ''; }
}

function sessionListSummary(s: SessionDetailData) {
  const r = s.report;
  if (!r) return 'No report generated yet.';
  if (r.session_overview?.length) return r.session_overview[0];
  return r.one_word_summary ?? 'Session recorded';
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── MonthCalendar ────────────────────────────────────────────────────────────

function MonthCalendar({ year, month, selectedKey, sessionKeys, onSelectDate, onPrevMonth, onNextMonth }: {
  year: number; month: number; selectedKey: string;
  sessionKeys: Set<string>;
  onSelectDate: (d: Date) => void;
  onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const todayKey = localDateKey(new Date());

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)),
    [year, month]
  );

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  return (
    <View style={calStyles.root}>
      {/* Month nav */}
      <View style={calStyles.header}>
        <TouchableOpacity onPress={onPrevMonth} style={calStyles.navBtn} activeOpacity={0.7} hitSlop={8}>
          <ChevronLeft size={18} color={colors.cocoa} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={calStyles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNextMonth} style={calStyles.navBtn} activeOpacity={0.7} hitSlop={8}>
          <ChevronRight size={18} color={colors.cocoa} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* Weekday row */}
      <View style={calStyles.weekRow}>
        {WEEKDAYS.map(w => (
          <Text key={w} style={calStyles.weekday}>{w}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={calStyles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`blank-${i}`} style={calStyles.cell} />;
          const key = localDateKey(d);
          const isSelected = key === selectedKey;
          const isToday    = key === todayKey;
          const hasSession = sessionKeys.has(key);

          return (
            <TouchableOpacity
              key={key}
              style={calStyles.cell}
              onPress={() => onSelectDate(d)}
              activeOpacity={0.75}
            >
              <View style={[
                calStyles.cellInner,
                isSelected && calStyles.cellSelected,
                isToday && !isSelected && calStyles.cellToday,
              ]}>
                <Text style={[
                  calStyles.cellText,
                  isSelected && calStyles.cellTextSelected,
                  isToday && !isSelected && calStyles.cellTextToday,
                ]}>
                  {d.getDate()}
                </Text>
              </View>
              {hasSession && (
                <View style={[calStyles.dot, isSelected && calStyles.dotSelected]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  root: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    marginBottom: 16,
    ...cardShadow,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, paddingHorizontal: 2,
  },
  navBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.cream,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontFamily: fonts.serif, fontSize: 17, color: colors.cocoa },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1, textAlign: 'center',
    fontSize: 9, fontWeight: '700', letterSpacing: 0.8,
    color: colors.softGray, paddingVertical: 4,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as any,
    paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  cellInner: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  cellSelected: { backgroundColor: colors.cocoa },
  cellToday:    { backgroundColor: colors.amber },

  cellText:         { fontSize: 13, color: colors.warmGray, fontWeight: '400' },
  cellTextSelected: { color: colors.cream,  fontWeight: '700' },
  cellTextToday:    { color: colors.cocoa,  fontWeight: '700' },

  dot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.amberRich,
    marginTop: 2,
  },
  dotSelected: { backgroundColor: colors.cream },
});

// ─── SessionCard ──────────────────────────────────────────────────────────────

function SessionCard({ session, index, onPress }: {
  session: SessionDetailData; index: number; onPress: () => void;
}) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const mood = session.report?.average_mood_rating;
  const moodColor =
    mood == null ? colors.softGray :
    mood >= 7    ? colors.mossRich :
    mood >= 4    ? colors.amberRich :
                   colors.roseDeep;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <TouchableOpacity style={styles.sessionCard} onPress={onPress} activeOpacity={0.82}>
        {/* Left accent strip */}
        <View style={[styles.sessionAccent, { backgroundColor: moodColor }]} />

        <View style={styles.sessionContent}>
          {/* Top row */}
          <View style={styles.sessionMeta}>
            <View style={styles.sessionIconWrap}>
              <Mic size={14} color={colors.warmGray} strokeWidth={2} />
            </View>
            <Text style={styles.sessionTime}>{formatTime(session.created_at)}</Text>
            {session.duration_seconds != null && (
              <>
                <Text style={styles.sessionDot}>·</Text>
                <Clock size={11} color={colors.softGray} strokeWidth={2} />
                <Text style={styles.sessionDuration}>{formatDuration(session.duration_seconds)}</Text>
              </>
            )}
            {mood != null && (
              <View style={[styles.moodPill, { backgroundColor: moodColor + '18', borderColor: moodColor + '33' }]}>
                <Text style={[styles.moodText, { color: moodColor }]}>{mood}/10</Text>
              </View>
            )}
          </View>

          <Text style={styles.sessionSummary} numberOfLines={2}>
            {sessionListSummary(session)}
          </Text>

          {session.report && (
            <Text style={styles.tapHint}>View full report →</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export default function Journal() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [allSessions, setAllSessions]   = useState<SessionDetailData[]>([]);
  const [daySessions, setDaySessions]   = useState<SessionDetailData[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [dayLoading, setDayLoading]     = useState(true);
  const [dayError,   setDayError]       = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetailData | null>(null);

  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  const sessionDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of allSessions) {
      const d = new Date(s.created_at);
      if (!Number.isNaN(d.getTime()))
        keys.add(localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate())));
    }
    return keys;
  }, [allSessions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCalendarLoading(true);
      try {
        const all = await listSessions();
        if (!cancelled) setAllSessions(all);
      } catch {}
      finally { if (!cancelled) setCalendarLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDayLoading(true); setDayError(null);
      try {
        const rows = await listSessions({ date: localDateKey(selectedDate), tzOffsetMinutes: tzOffset });
        if (!cancelled) setDaySessions(rows);
      } catch (e) {
        if (!cancelled) setDayError(e instanceof Error ? e.message : 'Could not load sessions');
      } finally { if (!cancelled) setDayLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, tzOffset]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0);  setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  const selectedKey = localDateKey(selectedDate);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <Text style={styles.eyebrow}>YOUR SESSIONS</Text>
          <Text style={styles.title}>journal</Text>
          <Text style={styles.subtitle}>tap any highlighted date to review your sessions.</Text>
        </Animated.View>

        {/* Calendar */}
        <Animated.View style={{ opacity: fade }}>
          {calendarLoading && (
            <View style={styles.calLoading}>
              <ActivityIndicator size="small" color={colors.amberRich} />
            </View>
          )}
          <MonthCalendar
            year={calYear} month={calMonth}
            selectedKey={selectedKey}
            sessionKeys={sessionDayKeys}
            onSelectDate={d => setSelectedDate(d)}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </Animated.View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.cocoa }]} />
            <Text style={styles.legendText}>selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.amber }]} />
            <Text style={styles.legendText}>today</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.amberRich }]} />
            <Text style={styles.legendText}>has session</Text>
          </View>
        </View>

        {/* Day sessions */}
        <View style={styles.daySection}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle} numberOfLines={1}>{localDateLabel(selectedDate)}</Text>
            {!dayLoading && !dayError && (
              <View style={styles.countPill}>
                <Text style={styles.countText}>{daySessions.length}</Text>
              </View>
            )}
          </View>

          {dayLoading && (
            <View style={styles.centreRow}>
              <ActivityIndicator size="small" color={colors.amberRich} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          )}

          {!dayLoading && dayError && (
            <Text style={styles.errorText}>{dayError}</Text>
          )}

          {!dayLoading && !dayError && daySessions.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No sessions here</Text>
              <Text style={styles.emptyText}>Pick a highlighted date to view past reflections.</Text>
            </View>
          )}

          {!dayLoading && !dayError && daySessions.map((s, i) => (
            <SessionCard key={s.session_id} session={s} index={i} onPress={() => setSelectedSession(s)} />
          ))}
        </View>

      </ScrollView>

      <SessionReportModal
        session={selectedSession!}
        visible={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
      />
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 56, paddingTop: 8 },

  header:   { marginBottom: 24 },
  eyebrow:  { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 6 },
  title:    { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.warmGray, marginTop: 4 },

  calLoading: { alignItems: 'center', paddingVertical: 8 },

  legend: {
    flexDirection: 'row', gap: 16, marginBottom: 24,
    paddingHorizontal: 4,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { fontSize: 11, color: colors.warmGray, fontWeight: '500' },

  daySection: { gap: 10 },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  dayTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.cocoa, flex: 1 },
  countPill: {
    backgroundColor: colors.amber,
    borderRadius: 999, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontSize: 12, fontWeight: '700', color: colors.cocoa },

  centreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: colors.softGray },
  errorText:   { fontSize: 13, color: colors.roseDeep },

  emptyBox: {
    backgroundColor: colors.paper,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 28, alignItems: 'center', gap: 6,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.cocoa },
  emptyText:  { fontSize: 13, color: colors.warmGray, textAlign: 'center', lineHeight: 19 },

  // session card
  sessionCard: {
    backgroundColor: colors.paper,
    borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row',
    overflow: 'hidden',
    ...cardShadow,
  },
  sessionAccent:  { width: 4, borderRadius: 0 },
  sessionContent: { flex: 1, padding: 14, gap: 6 },

  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  sessionIconWrap: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.cream,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionTime:     { fontSize: 12, fontWeight: '600', color: colors.cocoa },
  sessionDot:      { fontSize: 12, color: colors.softGray },
  sessionDuration: { fontSize: 11, color: colors.softGray },
  moodPill: {
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4,
  },
  moodText: { fontSize: 10, fontWeight: '700' },

  sessionSummary: { fontSize: 13, color: colors.warmGray, lineHeight: 18 },
  tapHint:        { fontSize: 11, color: colors.amberRich, fontWeight: '600' },
});
