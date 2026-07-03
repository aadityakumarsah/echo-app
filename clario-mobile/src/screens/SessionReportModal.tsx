import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Modal,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { type SessionDetailData, type CallReportData, deleteSession } from '../lib/api';
import { colors, fonts, cardShadow } from '../lib/theme';

const { width: SW } = Dimensions.get('window');
const CHART_W = SW - 32 - 40;
const CHART_H = 140;
const PAD = { top: 16, bottom: 32, left: 4, right: 4 };

const SvgLib = (() => {
  try {
    const m = require('react-native-svg');
    return { Svg: m.Svg, Path: m.Path, Circle: m.Circle, Defs: m.Defs, LinearGradient: m.LinearGradient, Stop: m.Stop, SvgText: m.Text };
  } catch { return null; }
})();

// ─── helpers ──────────────────────────────────────────────────────────────────

function moodWeatherIcon(score: number): string {
  if (score >= 7.5) return '☀️';
  if (score >= 5)   return '⛅';
  if (score >= 3)   return '🌧️';
  return '⛈️';
}

function sentimentColor(s: string): string {
  if (s === 'positive') return colors.moss;
  if (s === 'negative') return colors.roseDeep;
  return colors.warmGray;
}

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    work: '💼', social: '👥', health: '🏃', personal: '🌿', other: '✦',
  };
  return map[cat] ?? '✦';
}

function insightIcon(type: string): string {
  if (type === 'pattern') return '🔄';
  if (type === 'moment')  return '💡';
  return '💬';
}

function insightAccent(type: string): string {
  if (type === 'pattern') return colors.lavender;
  if (type === 'moment')  return colors.amber;
  return colors.sage;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s > 0 ? `${s}s` : ''}`.trim() : `${s}s`;
}

// ─── Mood line chart ──────────────────────────────────────────────────────────

function MoodChart({ points }: { points: { score: number; label: string }[] }) {
  if (!points || points.length === 0) {
    return <Text style={chartSt.empty}>No mood data recorded.</Text>;
  }

  const cW = CHART_W;
  const cH = CHART_H;
  const innerW = cW - PAD.left - PAD.right;
  const innerH = cH - PAD.top - PAD.bottom;
  const n = points.length;

  const toX = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const toY = (s: number) => PAD.top + innerH - (s / 10) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.score).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${toX(n - 1).toFixed(1)},${(cH - PAD.bottom).toFixed(1)} L${toX(0).toFixed(1)},${(cH - PAD.bottom).toFixed(1)} Z`;

  if (!SvgLib) {
    // fallback bar chart
    return (
      <View style={chartSt.barRoot}>
        {points.map((p, i) => (
          <View key={i} style={chartSt.col}>
            <View style={chartSt.barBg}>
              <View style={[chartSt.barFill, {
                height: `${(p.score / 10) * 100}%` as any,
                backgroundColor: p.score >= 7 ? colors.moss : p.score >= 4 ? colors.amberRich : colors.roseDeep,
              }]} />
            </View>
            <Text style={chartSt.barLabel} numberOfLines={1}>{p.label.slice(0, 4)}</Text>
          </View>
        ))}
      </View>
    );
  }

  const { Svg, Path, Circle, Defs, LinearGradient, Stop, SvgText } = SvgLib;

  return (
    <View style={{ height: cH }}>
      <Svg width={cW} height={cH} viewBox={`0 0 ${cW} ${cH}`}>
        <Defs>
          <LinearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.lavenderDeep} stopOpacity="0.25" />
            <Stop offset="1" stopColor={colors.lavenderDeep} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[2, 4, 6, 8, 10].map(v => (
          <Path
            key={v}
            d={`M${PAD.left},${toY(v).toFixed(1)} L${(cW - PAD.right).toFixed(1)},${toY(v).toFixed(1)}`}
            stroke={colors.border}
            strokeWidth="1"
          />
        ))}
        <Path d={areaPath} fill="url(#mg)" />
        <Path d={linePath} stroke={colors.lavenderDeep} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <React.Fragment key={i}>
            <Circle cx={toX(i)} cy={toY(p.score)} r={5} fill={colors.lavenderDeep} />
            <Circle cx={toX(i)} cy={toY(p.score)} r={3} fill={colors.cream} />
            <SvgText x={toX(i)} y={toY(p.score) - 9} textAnchor="middle" fontSize="9" fill={colors.warmGray} fontWeight="600">
              {p.score}
            </SvgText>
            <SvgText x={toX(i)} y={cH - 4} textAnchor="middle" fontSize="8" fill={colors.softGray}>
              {p.label.slice(0, 5)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const chartSt = StyleSheet.create({
  empty: { fontSize: 13, color: colors.softGray, paddingVertical: 16 },
  barRoot: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4, marginTop: 8 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: { flex: 1, width: '100%', backgroundColor: colors.border, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { borderRadius: 4 },
  barLabel: { fontSize: 9, color: colors.softGray, textAlign: 'center' },
});

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <View style={[sectionSt.card, cardShadow]}>
      <View style={[sectionSt.titleRow, accent ? { borderLeftColor: accent } : {}]}>
        <Text style={sectionSt.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const sectionSt = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 12,
  },
  titleRow: {
    borderLeftWidth: 3,
    borderLeftColor: colors.lavenderDeep,
    paddingLeft: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.warmGray,
    fontFamily: fonts.sans,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  session: SessionDetailData;
  visible: boolean;
  onClose: () => void;
  onDeleted?: (sessionId: string) => void;
}

export default function SessionReportModal({ session, visible, onClose, onDeleted }: Props) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 26,
        stiffness: 280,
      }).start();
    } else {
      slideAnim.setValue(600);
      setShowFullTranscript(false);
    }
  }, [visible]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Session',
      'This will permanently delete this session and its report. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteSession(session.session_id);
              onClose();
              onDeleted?.(session.session_id);
            } catch {
              Alert.alert('Error', 'Could not delete session. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!session) return null;

  const report: CallReportData | null = session.report ?? null;
  const transcriptTurns = showFullTranscript
    ? session.conversation
    : session.conversation.slice(-3);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      {/* flex column: top Pressable (tap-to-close) + bottom sheet */}
      <View style={st.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* Drag pill + header */}
          <View style={st.header}>
            <View style={st.dragPill} />
            <View style={st.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.headerTitle}>Session Report</Text>
                <Text style={st.headerDate}>
                  {new Date(session.created_at).toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                  {'  ·  '}
                  {new Date(session.created_at).toLocaleTimeString(undefined, {
                    hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={st.closeBtn} activeOpacity={0.7}>
                <Text style={st.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={st.scroll}
            contentContainerStyle={st.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* One-word summary */}
            {report?.one_word_summary && (
              <View style={st.wordBadge}>
                <Text style={st.wordBadgeText}>"{report.one_word_summary}"</Text>
              </View>
            )}

            {/* Quick stats */}
            <View style={st.statsRow}>
              <View style={[st.statCard, { backgroundColor: colors.lavender + '44' }]}>
                <Text style={st.statIcon}>{report ? moodWeatherIcon(report.average_mood_rating) : '—'}</Text>
                <Text style={st.statVal}>{report ? report.average_mood_rating.toFixed(1) : '—'}</Text>
                <Text style={st.statLabel}>Mood</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.amber + '66' }]}>
                <Text style={st.statIcon}>⚡</Text>
                <Text style={st.statVal}>{report ? `${report.energy_level}/10` : '—'}</Text>
                <Text style={st.statLabel}>Energy</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.sage + '99' }]}>
                <Text style={st.statIcon}>🕐</Text>
                <Text style={st.statVal}>{formatDuration(session.duration_seconds)}</Text>
                <Text style={st.statLabel}>Duration</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.blush }]}>
                <Text style={st.statIcon}>💬</Text>
                <Text style={st.statVal}>{report ? `${report.user_words_spoken}` : '—'}</Text>
                <Text style={st.statLabel}>Words</Text>
              </View>
            </View>

            {!report && (
              <View style={st.noReport}>
                <Text style={st.noReportText}>Report not yet generated for this session.</Text>
              </View>
            )}

            {report && (
              <>
                {/* Session overview */}
                {report.session_overview?.length > 0 && (
                  <Section title="SESSION OVERVIEW" accent={colors.lavenderDeep}>
                    {report.session_overview.map((line, i) => (
                      <Text key={i} style={st.overviewLine}>{line}</Text>
                    ))}
                  </Section>
                )}

                {/* Mood progression */}
                {report.mood_across_session?.length > 0 && (
                  <Section title="MOOD PROGRESSION" accent={colors.lavenderDeep}>
                    <MoodChart points={report.mood_across_session} />
                  </Section>
                )}

                {/* Themes discussed */}
                {report.themes_discussed?.length > 0 && (
                  <Section title="THEMES DISCUSSED" accent={colors.amberRich}>
                    <View style={st.tagRow}>
                      {report.themes_discussed.map((t, i) => (
                        <View key={i} style={st.themeTag}>
                          <Text style={st.themeTagText}>{t.label}</Text>
                        </View>
                      ))}
                    </View>
                    {report.themes_discussed.map((t, i) =>
                      t.summary ? (
                        <Text key={i} style={st.themeSummary}>
                          <Text style={st.themeSummaryLabel}>{t.label}: </Text>
                          {t.summary}
                        </Text>
                      ) : null
                    )}
                  </Section>
                )}

                {/* Things you did today */}
                {report.things_you_did_today?.length > 0 && (
                  <Section title="THINGS YOU DID TODAY" accent={colors.moss}>
                    {report.things_you_did_today.map((thing, i) => (
                      <View key={i} style={st.thingRow}>
                        <View style={st.thingIconBadge}>
                          <Text style={{ fontSize: 16 }}>{categoryEmoji(thing.category)}</Text>
                        </View>
                        <View style={st.thingBody}>
                          <Text style={st.thingNarrative}>{thing.narrative}</Text>
                          <View style={st.thingMeta}>
                            <Text style={st.thingCategory}>{thing.category}</Text>
                            <Text style={[st.thingSentiment, { color: sentimentColor(thing.sentiment) }]}>
                              {thing.sentiment}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </Section>
                )}

                {/* Key insights */}
                {report.insights?.length > 0 && (
                  <Section title="KEY INSIGHTS" accent={colors.rose}>
                    {report.insights.map((ins, i) => (
                      <View key={i} style={[st.insightRow, { backgroundColor: insightAccent(ins.type) + '55', borderRadius: 12, padding: 12, marginBottom: 8 }]}>
                        <Text style={st.insightIcon}>{insightIcon(ins.type)}</Text>
                        <View style={st.insightBody}>
                          <Text style={st.insightType}>{ins.type.toUpperCase()}</Text>
                          <Text style={st.insightText}>{ins.body}</Text>
                        </View>
                      </View>
                    ))}
                  </Section>
                )}

                {/* Gratitude */}
                {report.gratitude?.length > 0 && (
                  <Section title="GRATITUDE" accent={colors.mossRich}>
                    {report.gratitude.map((g, i) => (
                      <View key={i} style={st.gratRow}>
                        <Text style={st.gratBullet}>🌿</Text>
                        <Text style={st.gratText}>{g}</Text>
                      </View>
                    ))}
                  </Section>
                )}

                {/* Suggestions */}
                {report.suggestions?.length > 0 && (
                  <Section title="GENTLE NEXT STEPS" accent={colors.amberRich}>
                    {report.suggestions.map((s, i) => (
                      <View key={i} style={st.gratRow}>
                        <Text style={st.gratBullet}>✦</Text>
                        <Text style={st.gratText}>{s}</Text>
                      </View>
                    ))}
                  </Section>
                )}

                {/* Personal reflection */}
                {report.personal_reflection ? (
                  <Section title="PERSONAL REFLECTION" accent={colors.lavenderDeep}>
                    <View style={st.reflectionBox}>
                      <Text style={st.reflectionText}>{report.personal_reflection}</Text>
                    </View>
                  </Section>
                ) : null}
              </>
            )}

            {/* Conversation transcript */}
            {session.conversation?.length > 0 && (
              <Section title="CONVERSATION" accent={colors.softGray}>
                {transcriptTurns.map((turn, i) => (
                  <View
                    key={i}
                    style={[
                      st.turnRow,
                      turn.role === 'user' ? st.turnUser : st.turnAssistant,
                    ]}
                  >
                    <Text style={[st.turnRole, turn.role === 'user' ? { color: colors.lavenderDeep } : { color: colors.warmGray }]}>
                      {turn.role === 'user' ? 'You' : 'Clario'}
                    </Text>
                    <Text style={[st.turnMsg, turn.role === 'user' ? { color: colors.cocoa } : { color: colors.warmGray }]}>
                      {turn.message}
                    </Text>
                  </View>
                ))}
                {session.conversation.length > 3 && !showFullTranscript && (
                  <TouchableOpacity style={st.loadMoreBtn} onPress={() => setShowFullTranscript(true)} activeOpacity={0.7}>
                    <Text style={st.loadMoreText}>Load full transcript ({session.conversation.length} turns)</Text>
                  </TouchableOpacity>
                )}
              </Section>
            )}

            {/* Delete */}
            <TouchableOpacity style={st.deleteBtn} onPress={handleDelete} disabled={deleting} activeOpacity={0.7}>
              {deleting
                ? <ActivityIndicator size="small" color={colors.roseDeep} />
                : <Text style={st.deleteBtnText}>🗑  Delete this session</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 48 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(58,46,42,0.4)', flexDirection: 'column' },

  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    borderWidth: 1,
    borderColor: colors.border,
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dragPill: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.cocoa, fontFamily: fonts.serif },
  headerDate: { fontSize: 12, color: colors.softGray, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 13, color: colors.warmGray },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18 },

  wordBadge: {
    alignSelf: 'center',
    backgroundColor: colors.lavender,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.lavenderDeep + '44',
  },
  wordBadgeText: {
    fontSize: 15, color: colors.cocoa, fontStyle: 'italic',
    fontWeight: '600', fontFamily: fonts.serif,
  },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 12, alignItems: 'center', gap: 3,
  },
  statIcon: { fontSize: 18 },
  statVal: { fontSize: 15, fontWeight: '800', color: colors.cocoa },
  statLabel: { fontSize: 9, color: colors.warmGray, fontWeight: '600', letterSpacing: 0.5 },

  noReport: {
    backgroundColor: colors.paper, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  noReportText: { fontSize: 13, color: colors.softGray, textAlign: 'center' },

  overviewLine: {
    fontSize: 14, color: colors.cocoa, lineHeight: 22, marginBottom: 8,
    fontFamily: fonts.serif,
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  themeTag: {
    backgroundColor: colors.amber + '55', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberRich + '44',
  },
  themeTagText: { fontSize: 13, color: colors.cocoa, fontWeight: '600' },
  themeSummary: { fontSize: 13, color: colors.warmGray, lineHeight: 19, marginBottom: 6 },
  themeSummaryLabel: { fontWeight: '700', color: colors.cocoa },

  thingRow: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  thingIconBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  thingBody: { flex: 1 },
  thingNarrative: { fontSize: 14, color: colors.cocoa, lineHeight: 20, marginBottom: 4 },
  thingMeta: { flexDirection: 'row', gap: 10 },
  thingCategory: { fontSize: 11, color: colors.softGray, fontWeight: '600', letterSpacing: 0.5 },
  thingSentiment: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  insightRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  insightIcon: { fontSize: 18, marginTop: 1 },
  insightBody: { flex: 1 },
  insightType: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.warmGray, marginBottom: 3 },
  insightText: { fontSize: 14, color: colors.cocoa, lineHeight: 20 },

  gratRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  gratBullet: { fontSize: 14, marginTop: 1, color: colors.mossRich },
  gratText: { flex: 1, fontSize: 14, color: colors.cocoa, lineHeight: 20 },

  reflectionBox: {
    backgroundColor: colors.lavender + '33',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: colors.lavenderDeep,
  },
  reflectionText: { fontSize: 14, color: colors.cocoa, lineHeight: 22, fontFamily: fonts.serif, fontStyle: 'italic' },

  turnRow: { borderRadius: 12, padding: 10, marginBottom: 6 },
  turnUser: { backgroundColor: colors.lavender + '44', alignSelf: 'flex-end', maxWidth: '88%' },
  turnAssistant: { backgroundColor: colors.paper, alignSelf: 'flex-start', maxWidth: '88%', borderWidth: 1, borderColor: colors.border },
  turnRole: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  turnMsg: { fontSize: 13, lineHeight: 19 },

  loadMoreBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  loadMoreText: { fontSize: 13, color: colors.lavenderDeep, fontWeight: '600' },

  deleteBtn: {
    marginTop: 8, marginBottom: 4,
    alignItems: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1,
    borderColor: colors.roseDeep + '44',
    backgroundColor: colors.blush,
  },
  deleteBtnText: { fontSize: 14, color: colors.roseDeep, fontWeight: '600' },
});
