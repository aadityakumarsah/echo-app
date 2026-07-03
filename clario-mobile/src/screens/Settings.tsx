import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, Switch, Animated, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Mail, Globe, Bell, Shield, LogOut, Check, X,
  Pencil, Sparkles, ChevronRight, Clock,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAccess } from '../hooks/useAccess';
import { supabase } from '../lib/supabase';
import { createCheckoutSession } from '../lib/subscription';
import { savePendingCheckout } from '../lib/subCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, cardShadow } from '../lib/theme';
import {
  loadNotifPrefs, saveNotifPrefs, applyNotifPrefs,
  requestNotifPermission, getNotifPermission,
  type NotifPrefs,
} from '../lib/notifications';
import AvatarPicker from '../components/AvatarPicker';

const LANGUAGES = [
  { code: 'en', native: 'English' },
];

const PLANS = [
  { id: 'weekly'  as const, label: 'Weekly',  price: '$3',   sub: 'per week',  highlight: false },
  { id: 'monthly' as const, label: 'Monthly', price: '$10',  sub: 'per month', highlight: true  },
  { id: 'yearly'  as const, label: 'Yearly',  price: '$199', sub: 'per year',  highlight: false },
];

// ─── Section container ────────────────────────────────────────────────────────

function Section({ title, Icon, children, delay = 0 }: {
  title: string;
  Icon: React.ComponentType<any>;
  children: React.ReactNode;
  delay?: number;
}) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[sStyles.card, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <View style={sStyles.cardHeader}>
        <View style={sStyles.iconWrap}>
          <Icon size={14} color={colors.cocoa} strokeWidth={2.2} />
        </View>
        <Text style={sStyles.cardTitle}>{title}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

const sStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: 24, borderWidth: 1, borderColor: colors.border,
    padding: 20, marginBottom: 14,
    ...cardShadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.cocoa },
});

// ─── Row helpers ──────────────────────────────────────────────────────────────

function InfoRow({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[rStyles.row, !last && rStyles.rowBorder]}>
      <Text style={rStyles.label}>{label}</Text>
      <Text style={rStyles.value} numberOfLines={1}>{value ?? '—'}</Text>
    </View>
  );
}

const rStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 12, color: colors.softGray, fontWeight: '500' },
  value: { fontSize: 13, color: colors.cocoa, fontWeight: '500', maxWidth: 220 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { user, signOut } = useAuth();
  const { isPremium, trialDaysLeft, plan: subPlan, expiresAt, startedAt } = useAccess();

  const [currentLang,    setCurrentLang]    = useState('en');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradingPlan,  setUpgradingPlan]  = useState<string | null>(null);

  const [editingField,  setEditingField]  = useState<'name' | 'email' | null>(null);
  const [nameDraft,     setNameDraft]     = useState('');
  const [emailDraft,    setEmailDraft]    = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError,  setProfileError]  = useState<string | null>(null);
  const [profileSuccess,setProfileSuccess]= useState<'name' | 'email' | null>(null);

  const [notifPermission, setNotifPermission] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    morning: false, refill: false, night: false,
    morningHour: 8,  morningMin: 0,
    refillHour:  12, refillMin:  0,
    nightHour:   21, nightMin:   0,
  });

  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(14)).current;
  const trialActive = trialDaysLeft > 0 && !isPremium;

  useEffect(() => {
    if (user) {
      setNameDraft(user.user_metadata?.full_name ?? '');
      setEmailDraft(user.email ?? '');
    }
    Animated.parallel([
      Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    AsyncStorage.getItem('clario-lang').then(l => { if (l) setCurrentLang(l); });
    getNotifPermission().then(setNotifPermission);
    loadNotifPrefs().then(setNotifPrefs);
  }, [user]);

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    AsyncStorage.setItem('clario-lang', code);
  };

  const handleUpgrade = async (plan: 'weekly' | 'monthly' | 'yearly') => {
    setUpgradingPlan(plan); setUpgradeLoading(true);
    try {
      const { url, sessionId } = await createCheckoutSession(plan);
      await savePendingCheckout(sessionId);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not start checkout');
    } finally { setUpgradeLoading(false); setUpgradingPlan(null); }
  };

  const validateAndSaveName = async () => {
    const value = nameDraft.trim();
    if (!value) return setProfileError('Name cannot be empty');
    if (value.length < 2) return setProfileError('Name must be at least 2 characters');
    if (value.length > 60) return setProfileError('Name is too long');
    setProfileSaving(true); setProfileError(null);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: value } });
      if (error) throw error;
      setProfileSuccess('name'); setEditingField(null);
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err) { setProfileError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setProfileSaving(false); }
  };

  const validateAndSaveEmail = async () => {
    const value = emailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setProfileError('Enter a valid email address');
    if (value === user?.email) { setEditingField(null); return; }
    setProfileSaving(true); setProfileError(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: value });
      if (error) throw error;
      Alert.alert('Check your inbox', 'A confirmation link was sent to the new address.');
      setProfileSuccess('email'); setEditingField(null);
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err) { setProfileError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setProfileSaving(false); }
  };

  const updateNotifPref = async (patch: Partial<NotifPrefs>) => {
    // If enabling any reminder, ensure we have permission first
    const needsPermission = Object.entries(patch).some(
      ([k, v]) => (k === 'morning' || k === 'refill' || k === 'night') && v === true
    );
    if (needsPermission && !notifPermission) {
      const granted = await requestNotifPermission();
      setNotifPermission(granted);
      if (!granted) {
        Alert.alert(
          'Notifications blocked',
          'Please allow notifications in your device Settings to receive daily reminders.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
    const next: NotifPrefs = { ...notifPrefs, ...patch };
    setNotifPrefs(next);
    await saveNotifPrefs(next);
    await applyNotifPrefs(next);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.title}>hey, {firstName}</Text>
          <Text style={styles.subtitle}>manage your profile, plan, and preferences.</Text>
        </Animated.View>

        {/* ── Account ── */}
        <Section title="Account" Icon={User} delay={60}>
          {/* Status badge */}
          <View style={styles.statusRow}>
            {isPremium ? (
              <View style={[styles.statusPill, { backgroundColor: colors.sage, borderColor: colors.mossRich + '44' }]}>
                <Sparkles size={11} color={colors.mossRich} strokeWidth={2.5} />
                <Text style={[styles.statusText, { color: colors.mossRich }]}>
                  {subPlan ? subPlan.charAt(0).toUpperCase() + subPlan.slice(1) + ' Plan' : 'Premium'}
                </Text>
              </View>
            ) : trialActive ? (
              <View style={[styles.statusPill, { backgroundColor: colors.amber, borderColor: colors.amberRich + '44' }]}>
                <Clock size={11} color={colors.amberRich} strokeWidth={2.5} />
                <Text style={[styles.statusText, { color: colors.amberRich }]}>Trial · {trialDaysLeft}d left</Text>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: colors.blush, borderColor: colors.roseDeep + '33' }]}>
                <Text style={[styles.statusText, { color: colors.roseDeep }]}>No active plan</Text>
              </View>
            )}
            {isPremium && expiresAt && (
              <Text style={styles.renewsText}>
                Renews {new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>

          <InfoRow label="Email" value={user?.email} />
          {isPremium && startedAt && (
            <InfoRow
              label="Subscribed since"
              value={new Date(startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            />
          )}
          <InfoRow label="Member since" value={user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : undefined} last />

          <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.7}>
            <LogOut size={15} color={colors.roseDeep} strokeWidth={2} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </Section>

        {/* ── Upgrade ── */}
        {!isPremium && (
          <Animated.View style={[styles.upgradeCard, { opacity: headerFade }]}>
            <View style={styles.upgradeTopRow}>
              <Sparkles size={16} color={colors.amberRich} strokeWidth={2} />
              <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
            </View>
            <Text style={styles.upgradeDesc}>
              {trialActive
                ? `Your trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}. Pick a plan to keep access.`
                : 'Your trial has ended. Subscribe to continue your wellness journey.'}
            </Text>
            <View style={styles.plansRow}>
              {PLANS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planCard, p.highlight && styles.planCardHighlight]}
                  onPress={() => handleUpgrade(p.id)}
                  disabled={upgradeLoading}
                  activeOpacity={0.85}
                >
                  {p.highlight && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>popular</Text>
                    </View>
                  )}
                  <Text style={[styles.planPrice, p.highlight && styles.planPriceHighlight]}>{p.price}</Text>
                  <Text style={[styles.planPeriod, p.highlight && { color: colors.cream + 'CC' }]}>
                    {upgradingPlan === p.id ? '…' : p.sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Profile ── */}
        <Section title="Profile" Icon={User} delay={120}>
          {profileError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{profileError}</Text>
            </View>
          )}

          {/* Avatar */}
          <View style={styles.avatarRow}>
            <AvatarPicker
              currentAvatar={user?.user_metadata?.avatar_url}
              currentPublicId={user?.user_metadata?.avatar_public_id}
              size={72}
              onUploaded={() => {/* Supabase metadata updated inside AvatarPicker */}}
            />
            <View>
              <Text style={styles.avatarName}>{user?.user_metadata?.full_name ?? 'Your name'}</Text>
              <Text style={styles.avatarSub}>tap photo to change</Text>
            </View>
          </View>

          {/* Name field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>NAME</Text>
            {editingField === 'name' ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.textInput}
                  value={nameDraft}
                  onChangeText={v => { setNameDraft(v); setProfileError(null); }}
                  placeholder="Your name"
                  placeholderTextColor={colors.softGray}
                  returnKeyType="done"
                  onSubmitEditing={validateAndSaveName}
                  autoFocus
                />
                <TouchableOpacity style={styles.iconBtn} onPress={validateAndSaveName} disabled={profileSaving}>
                  {profileSaving
                    ? <ActivityIndicator size="small" color={colors.mossRich} />
                    : <Check size={16} color={colors.mossRich} strokeWidth={2.5} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtnGhost} onPress={() => { setEditingField(null); setProfileError(null); setNameDraft(user?.user_metadata?.full_name ?? ''); }}>
                  <X size={16} color={colors.softGray} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.displayRow}>
                <Text style={styles.displayValue}>
                  {user?.user_metadata?.full_name ?? '—'}
                  {profileSuccess === 'name' && <Text style={styles.savedLabel}> · saved</Text>}
                </Text>
                <TouchableOpacity onPress={() => setEditingField('name')} hitSlop={8}>
                  <Pencil size={14} color={colors.softGray} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Email field */}
          <View style={[styles.fieldGroup, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            {editingField === 'email' ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.textInput}
                  value={emailDraft}
                  onChangeText={v => { setEmailDraft(v); setProfileError(null); }}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.softGray}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={validateAndSaveEmail}
                  autoFocus
                />
                <TouchableOpacity style={styles.iconBtn} onPress={validateAndSaveEmail} disabled={profileSaving}>
                  {profileSaving
                    ? <ActivityIndicator size="small" color={colors.mossRich} />
                    : <Check size={16} color={colors.mossRich} strokeWidth={2.5} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtnGhost} onPress={() => { setEditingField(null); setProfileError(null); setEmailDraft(user?.email ?? ''); }}>
                  <X size={16} color={colors.softGray} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.displayRow}>
                <Text style={styles.displayValue} numberOfLines={1}>
                  {user?.email ?? '—'}
                  {profileSuccess === 'email' && <Text style={styles.savedLabel}> · saved</Text>}
                </Text>
                <TouchableOpacity onPress={() => setEditingField('email')} hitSlop={8}>
                  <Pencil size={14} color={colors.softGray} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Section>

        {/* ── Language ── */}
        <Section title="Language" Icon={Globe} delay={180}>
          <View style={styles.langRow}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langBtn, currentLang === lang.code && styles.langBtnActive]}
                onPress={() => handleLanguageChange(lang.code)}
                activeOpacity={0.8}
              >
                <Text style={[styles.langBtnText, currentLang === lang.code && styles.langBtnTextActive]}>
                  {lang.native}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications" Icon={Bell} delay={240}>
          {!notifPermission && (
            <TouchableOpacity
              style={styles.permBanner}
              onPress={async () => {
                const granted = await requestNotifPermission();
                setNotifPermission(granted);
                if (!granted) Alert.alert('Permission denied', 'Enable notifications in your device Settings.');
              }}
              activeOpacity={0.8}
            >
              <Bell size={13} color={colors.amberRich} strokeWidth={2.2} />
              <Text style={styles.permBannerText}>Tap to enable notifications</Text>
              <ChevronRight size={13} color={colors.amberRich} strokeWidth={2} />
            </TouchableOpacity>
          )}

          {([
            {
              key: 'morning' as const,
              emoji: '🌅',
              label: 'Morning Check-In',
              desc: `Daily at ${String(notifPrefs.morningHour).padStart(2,'0')}:${String(notifPrefs.morningMin).padStart(2,'0')} — breathe & set intentions`,
              value: notifPrefs.morning,
            },
            {
              key: 'refill' as const,
              emoji: '💪',
              label: 'Day Refill',
              desc: `Daily at ${String(notifPrefs.refillHour).padStart(2,'0')}:${String(notifPrefs.refillMin).padStart(2,'0')} — reminder to do your squats`,
              value: notifPrefs.refill,
            },
            {
              key: 'night' as const,
              emoji: '🌙',
              label: 'Night Summary',
              desc: `Daily at ${String(notifPrefs.nightHour).padStart(2,'0')}:${String(notifPrefs.nightMin).padStart(2,'0')} — reflect on your day`,
              value: notifPrefs.night,
            },
          ] as const).map((item, i, arr) => (
            <View key={item.key} style={[styles.notifRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={styles.notifEmoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifLabel}>{item.label}</Text>
                <Text style={styles.notifDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={item.value}
                onValueChange={v => updateNotifPref({ [item.key]: v })}
                trackColor={{ false: colors.border, true: colors.cocoa }}
                thumbColor={colors.cream}
                ios_backgroundColor={colors.border}
              />
            </View>
          ))}

          <Text style={styles.notifFooter}>
            Reminders are scheduled locally on your device — no account required.
          </Text>
        </Section>

        {/* ── Privacy ── */}
        <Section title="Privacy & Security" Icon={Shield} delay={300}>
          <Text style={styles.privacyText}>
            Your voice sessions are processed securely. Audio is transcribed and then discarded.
            Only the generated report and metadata are stored in your account.
          </Text>
          <TouchableOpacity style={styles.linkRow} activeOpacity={0.7}>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <ChevronRight size={14} color={colors.softGray} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkRow, { borderTopWidth: 1, borderTopColor: colors.border }]} activeOpacity={0.7}>
            <Text style={styles.linkText}>Terms of Service</Text>
            <ChevronRight size={14} color={colors.softGray} strokeWidth={2} />
          </TouchableOpacity>
        </Section>

        <Text style={styles.version}>Clario · v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 56, paddingTop: 8 },

  header:   { marginBottom: 28 },
  eyebrow:  { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 6 },
  title:    { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.warmGray, marginTop: 4 },

  // account status
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  renewsText:  { fontSize: 11, color: colors.softGray },
  signOutRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { fontSize: 13, color: colors.roseDeep, fontWeight: '500' },

  // upgrade card
  upgradeCard: {
    backgroundColor: colors.cocoa,
    borderRadius: 24, padding: 20, marginBottom: 14,
  },
  upgradeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  upgradeTitle:  { fontFamily: fonts.serif, fontSize: 20, color: colors.cream },
  upgradeDesc:   { fontSize: 13, color: colors.cream + 'AA', lineHeight: 19, marginBottom: 18 },
  plansRow:      { flexDirection: 'row', gap: 8 },
  planCard: {
    flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  planCardHighlight: { backgroundColor: colors.amberRich, borderColor: colors.amber },
  popularBadge: {
    backgroundColor: colors.cream + '22', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6,
  },
  popularText:      { fontSize: 9, color: colors.cream, fontWeight: '700', letterSpacing: 1 },
  planPrice:        { fontFamily: fonts.serif, fontSize: 22, color: colors.cream + 'CC' },
  planPriceHighlight: { color: colors.cocoa },
  planPeriod:       { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  // avatar
  avatarRow:  { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  avatarName: { fontFamily: fonts.serif, fontSize: 17, color: colors.cocoa, marginBottom: 2 },
  avatarSub:  { fontSize: 11, color: colors.softGray },

  // profile fields
  fieldGroup:   { paddingVertical: 12 },
  fieldLabel:   { fontSize: 9, letterSpacing: 2.5, fontWeight: '700', color: colors.softGray, marginBottom: 8 },
  editRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1,
    backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.cocoa,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.sage, borderWidth: 1, borderColor: colors.moss,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnGhost: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  displayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, gap: 12,
  },
  displayValue: { flex: 1, fontSize: 14, color: colors.cocoa },
  savedLabel:   { fontSize: 12, color: colors.mossRich },

  errorBanner: {
    backgroundColor: colors.blush, borderWidth: 1, borderColor: colors.roseDeep + '33',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  errorText: { fontSize: 12, color: colors.roseDeep },

  // language
  langRow:         { flexDirection: 'row', gap: 10 },
  langBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.cream,
  },
  langBtnActive:    { backgroundColor: colors.cocoa, borderColor: colors.cocoa },
  langBtnText:      { fontSize: 14, color: colors.warmGray, fontWeight: '500' },
  langBtnTextActive:{ color: colors.cream, fontWeight: '700' },

  // notifications
  permBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.amber, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
  },
  permBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.amberRich },
  notifRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  notifEmoji:  { fontSize: 20, width: 28, textAlign: 'center' },
  notifLabel:  { fontSize: 13, fontWeight: '600', color: colors.cocoa, marginBottom: 2 },
  notifDesc:   { fontSize: 11, color: colors.warmGray, lineHeight: 16 },
  notifFooter: { fontSize: 10, color: colors.softGray, textAlign: 'center', marginTop: 8, lineHeight: 15 },

  // privacy
  privacyText: { fontSize: 13, color: colors.warmGray, lineHeight: 21, marginBottom: 8 },
  linkRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  linkText:    { fontSize: 13, color: colors.cocoa, fontWeight: '500' },

  version: { textAlign: 'center', fontSize: 11, color: colors.softGray, marginTop: 8 },
});
