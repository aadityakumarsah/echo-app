/**
 * Paywall screen — warm cream light theme
 * Unauthenticated: social login (Google, Apple) then email form
 * Authenticated: plan cards + trial escape
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccess } from '../hooks/useAccess';
import { createCheckoutSession } from '../lib/subscription';
import { savePendingCheckout } from '../lib/subCache';
import AvatarPicker from '../components/AvatarPicker';
// Lazy-imported to avoid crashing Expo Go (ExpoCrypto native module not available)
const loadOAuth = () => import('../lib/oauth');
import { colors, fonts, cardShadow } from '../lib/theme';
import { validateEmail } from '../lib/validateEmail';

type Plan = 'weekly' | 'monthly' | 'yearly';
type AuthMode = 'signin' | 'signup';

const PLANS = [
  {
    id: 'weekly' as Plan,
    label: 'Weekly',
    price: '$3',
    period: 'per week',
    description: 'Try it out week by week',
    highlight: false,
  },
  {
    id: 'monthly' as Plan,
    label: 'Monthly',
    price: '$10',
    period: 'per month',
    description: 'The most popular choice',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    id: 'yearly' as Plan,
    label: 'Yearly',
    price: '$199',
    period: 'per year',
    description: 'Best value — save over 30%',
    highlight: false,
  },
];

// ─── AuthForm ─────────────────────────────────────────────────────────────────

function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    const check = validateEmail(email);
    if (!check.valid) {
      setError(check.reason ?? 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim(), avatar_url: avatarUrl ?? null } },
        });
        if (error) throw error;
        setSuccess('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    setError(null);
    try {
      const { signInWithGoogle, signInWithApple } = await loadOAuth();
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `${provider} sign-in failed`;
      if (!msg.includes('cancelled')) setError(msg);
    } finally {
      setSocialLoading(null);
    }
  };

  const busy = loading || socialLoading !== null;

  return (
    <View style={authStyles.container}>
      {/* Social login buttons */}
      <TouchableOpacity
        style={authStyles.googleBtn}
        onPress={() => handleSocial('google')}
        disabled={busy}
        activeOpacity={0.7}
      >
        <View style={authStyles.googleIconWrap}>
          <Text style={authStyles.googleG}>G</Text>
        </View>
        <Text style={authStyles.socialBtnText}>
          {socialLoading === 'google' ? 'Signing in…' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={authStyles.appleBtn}
          onPress={() => handleSocial('apple')}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={authStyles.appleIcon}>&#63743;</Text>
          <Text style={authStyles.appleBtnText}>
            {socialLoading === 'apple' ? 'Signing in…' : 'Continue with Apple'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Divider */}
      <View style={authStyles.dividerRow}>
        <View style={authStyles.dividerLine} />
        <Text style={authStyles.dividerText}>or continue with email</Text>
        <View style={authStyles.dividerLine} />
      </View>

      {/* Toggle */}
      <View style={authStyles.toggle}>
        {(['signup', 'signin'] as AuthMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[authStyles.toggleBtn, mode === m && authStyles.toggleBtnActive]}
            onPress={() => { setMode(m); setError(null); setSuccess(null); }}
            activeOpacity={0.8}
          >
            <Text style={[authStyles.toggleBtnText, mode === m && authStyles.toggleBtnTextActive]}>
              {m === 'signup' ? 'Create account' : 'Sign in'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Email form */}
      <View style={authStyles.form}>
        {mode === 'signup' && (
          <View style={authStyles.avatarRow}>
            <AvatarPicker
              currentAvatar={avatarUrl}
              size={60}
              onUploaded={setAvatarUrl}
            />
            <Text style={authStyles.avatarHint}>
              Profile photo{'\n'}
              <Text style={{ color: colors.warmGray, fontSize: 12 }}>optional</Text>
            </Text>
          </View>
        )}

        {mode === 'signup' && (
          <TextInput
            style={authStyles.input}
            placeholder="Your name"
            placeholderTextColor={colors.softGray}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
          />
        )}
        <TextInput
          style={authStyles.input}
          placeholder="Email"
          placeholderTextColor={colors.softGray}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />
        <TextInput
          style={authStyles.input}
          placeholder="Password"
          placeholderTextColor={colors.softGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {error && <Text style={authStyles.errorText}>{error}</Text>}
        {success && <Text style={authStyles.successText}>{success}</Text>}

        <TouchableOpacity
          style={[authStyles.submitBtn, busy && authStyles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={authStyles.submitBtnText}>
            {loading
              ? 'Please wait…'
              : mode === 'signup'
              ? 'Start 3-day free trial'
              : 'Sign in'}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'signup' && (
        <Text style={authStyles.trialNote}>
          3 days free, then choose a plan. No card required.
        </Text>
      )}
    </View>
  );
}

const authStyles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 14,
    ...cardShadow,
  },
  // Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.cocoa,
  },
  // Apple button
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  appleIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginTop: -2,
  },
  appleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.softGray },
  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: colors.cocoa },
  toggleBtnText: { fontSize: 13, fontWeight: '500', color: colors.warmGray },
  toggleBtnTextActive: { color: colors.paper },
  // Form
  form: { gap: 12 },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: colors.cocoa,
  },
  errorText: { fontSize: 12, color: colors.roseDeep, textAlign: 'center' },
  successText: { fontSize: 12, color: colors.mossRich, textAlign: 'center' },
  submitBtn: {
    backgroundColor: colors.cocoa,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: colors.paper, fontSize: 15, fontWeight: '600' },
  trialNote: { fontSize: 12, color: colors.softGray, textAlign: 'center', marginTop: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 2 },
  avatarHint: { fontSize: 13, color: colors.cocoa, fontWeight: '500', flex: 1, lineHeight: 20 },
});

// ─── PlanCards ────────────────────────────────────────────────────────────────

function PlanCards() {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [wakingUp, setWakingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (plan: Plan) => {
    setLoadingPlan(plan);
    setWakingUp(false);
    setError(null);

    const wakeTimer = setTimeout(() => setWakingUp(true), 5000);
    try {
      const { url, sessionId } = await createCheckoutSession(plan);
      clearTimeout(wakeTimer);
      await savePendingCheckout(sessionId);
      setLoadingPlan(null);
      setWakingUp(false);
      await Linking.openURL(url);
    } catch (err: unknown) {
      clearTimeout(wakeTimer);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      const isFetch = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      setError(isFetch ? 'Server is still starting up. Please try again in a moment.' : msg);
      setLoadingPlan(null);
      setWakingUp(false);
    }
  };

  return (
    <View style={planStyles.container}>
      <View style={planStyles.grid}>
        {PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              planStyles.card,
              plan.highlight ? planStyles.cardHighlight : planStyles.cardDefault,
            ]}
            onPress={() => handleSelect(plan.id)}
            disabled={loadingPlan !== null}
            activeOpacity={0.85}
          >
            {plan.badge && (
              <View style={planStyles.badgeContainer}>
                <Text style={planStyles.badgeText}>{plan.badge}</Text>
              </View>
            )}
            <Text style={[planStyles.planLabel, plan.highlight && { color: colors.cocoa }]}>
              {plan.label}
            </Text>
            <Text style={planStyles.planPrice}>{plan.price}</Text>
            <Text style={planStyles.planPeriod}>{plan.period}</Text>
            <Text style={planStyles.planDesc}>{plan.description}</Text>
            <View
              style={[
                planStyles.ctaBtn,
                plan.highlight ? planStyles.ctaBtnHighlight : planStyles.ctaBtnDefault,
              ]}
            >
              <Text
                style={[
                  planStyles.ctaBtnText,
                  { color: plan.highlight ? colors.paper : colors.warmGray },
                ]}
              >
                {loadingPlan === plan.id ? (wakingUp ? 'Starting server…' : 'Please wait…') : 'Get started'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {wakingUp && !error && (
        <Text style={planStyles.wakingText}>
          Server is starting up — this takes up to 30 seconds, please wait…
        </Text>
      )}

      {error && (
        <View style={planStyles.errorContainer}>
          <Text style={planStyles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={planStyles.dismissText}>Dismiss and try again</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={planStyles.stripeNote}>Cancel anytime. Secure payment via Stripe.</Text>
    </View>
  );
}

const planStyles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: 20 },
  grid: { flexDirection: 'row', gap: 10, width: '100%' },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    position: 'relative',
  },
  cardHighlight: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.cocoa,
    ...cardShadow,
  },
  cardDefault: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeContainer: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    backgroundColor: colors.cocoa,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.paper },
  planLabel: { fontSize: 13, fontWeight: '600', color: colors.warmGray, marginBottom: 4, marginTop: 8 },
  planPrice: { fontSize: 26, fontWeight: '700', color: colors.cocoa, marginBottom: 2 },
  planPeriod: { fontSize: 11, color: colors.softGray, marginBottom: 8 },
  planDesc: { fontSize: 11, color: colors.warmGray, textAlign: 'center', marginBottom: 14, lineHeight: 16 },
  ctaBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaBtnHighlight: { backgroundColor: colors.cocoa },
  ctaBtnDefault: { backgroundColor: colors.cream },
  ctaBtnText: { fontSize: 13, fontWeight: '600' },
  errorContainer: { alignItems: 'center', gap: 8 },
  errorText: { fontSize: 13, color: colors.roseDeep, textAlign: 'center' },
  dismissText: { fontSize: 11, color: colors.warmGray, textDecorationLine: 'underline' },
  wakingText: { fontSize: 12, color: colors.warmGray, textAlign: 'center', opacity: 0.9 },
  stripeNote: { fontSize: 11, color: colors.softGray, textAlign: 'center' },
});

// ─── Main Paywall ─────────────────────────────────────────────────────────────

export default function Paywall() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { trialDaysLeft, loading: accessLoading } = useAccess();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  const loading = authLoading || accessLoading;
  const showPlans = !loading && !!user;
  const stillInTrial = !loading && !!user && trialDaysLeft > 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <Animated.View style={[styles.logoArea, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.logo}>Clario</Text>
            <Text style={styles.tagline}>your calm companion</Text>
          </Animated.View>

          {/* Heading */}
          <Animated.View style={[styles.headingArea, { opacity: fadeAnim }]}>
            <Text style={styles.heading}>
              {showPlans
                ? stillInTrial
                  ? 'Upgrade your plan'
                  : 'Your free trial has ended'
                : 'Feel better, starting today'}
            </Text>
            <Text style={styles.subheading}>
              {showPlans
                ? stillInTrial
                  ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in your trial — upgrade anytime`
                  : 'Continue your wellness journey with a Clario subscription'
                : 'Create a free account and get 3 days on us'}
            </Text>
          </Animated.View>

          {/* Content */}
          <View style={styles.bodyArea}>
            {loading ? (
              <ActivityIndicator color={colors.cocoa} size="large" />
            ) : showPlans ? (
              <>
                <PlanCards />
                <View style={styles.escapeArea}>
                  {stillInTrial && (
                    <TouchableOpacity
                      style={styles.notYetBtn}
                      onPress={() => router.back()}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.notYetText}>Not yet, continue my trial</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={signOut} activeOpacity={0.7}>
                    <Text style={styles.signOutLink}>Sign out</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <AuthForm />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    gap: 24,
  },

  logoArea: { alignItems: 'center', gap: 4 },
  logo: {
    fontFamily: fonts.serif,
    fontSize: 38,
    fontWeight: '700',
    color: colors.cocoa,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: colors.warmGray,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },

  headingArea: { alignItems: 'center', gap: 8 },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '600',
    color: colors.cocoa,
    textAlign: 'center',
    lineHeight: 32,
  },
  subheading: {
    fontSize: 14,
    color: colors.warmGray,
    textAlign: 'center',
    lineHeight: 22,
  },

  bodyArea: { width: '100%', alignItems: 'center', gap: 16 },

  escapeArea: { alignItems: 'center', gap: 12, marginTop: 4 },
  notYetBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notYetText: { fontSize: 13, fontWeight: '500', color: colors.warmGray },
  signOutLink: {
    fontSize: 12,
    color: colors.softGray,
    textDecorationLine: 'underline',
  },
});
