import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (width - 40 - CARD_GAP) / 2;

// Local images copied from web frontend public/breadth/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IMAGES: Record<string, any> = {
  anxiety: require('../../assets/breathe/anxiety.png'),
  anger: require('../../assets/breathe/anger.jpeg'),
  irritation: require('../../assets/breathe/irritation.jpeg'),
  sadness: require('../../assets/breathe/sadness.png'),
  fear: require('../../assets/breathe/fear.png'),
  worry: require('../../assets/breathe/worry.jpeg'),
  envy: require('../../assets/breathe/envy.png'),
};

const EMOTIONS = [
  { key: 'anxiety', label: 'Anxiety', tagline: 'Box breathing to reset', color: '#6B3FC7', minutes: 2 },
  { key: 'anger', label: 'Anger', tagline: 'Release the heat', color: '#B84A16', minutes: 3 },
  { key: 'irritation', label: 'Irritation', tagline: 'Soften the edges', color: '#265C28', minutes: 3 },
  { key: 'sadness', label: 'Sadness', tagline: 'Breathe through the weight', color: '#163464', minutes: 3 },
  { key: 'fear', label: 'Fear', tagline: 'Ground yourself', color: '#1A4420', minutes: 3 },
  { key: 'worry', label: 'Worry', tagline: 'Slow the spiral', color: '#42340C', minutes: 4 },
  { key: 'envy', label: 'Envy', tagline: 'Return to yourself', color: '#163448', minutes: 3 },
];

function EmotionCard({ emotion, isFull }: { emotion: (typeof EMOTIONS)[0]; isFull: boolean }) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Animated.View style={[isFull ? styles.cardFull : styles.card, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={styles.cardTouch}
        onPress={() => router.push(`/breathe/${emotion.key}`)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <ImageBackground
          source={IMAGES[emotion.key]}
          style={styles.cardBg}
          imageStyle={styles.cardBgImage}
          resizeMode="cover"
        >
          {/* Gradient overlay so text stays readable */}
          <View style={styles.cardOverlay} />
          <View style={styles.cardContent}>
            <View style={styles.cardBottom}>
              <Text style={styles.cardLabel}>{emotion.label}</Text>
              <View style={styles.minPill}>
                <Text style={styles.minText}>{emotion.minutes} min</Text>
              </View>
            </View>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Breathe() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12} activeOpacity={0.7}>
              <ChevronLeft size={22} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.headerSmall}>breathe</Text>
            <Text style={styles.title}>what do you want to{'\n'}release today?</Text>
          </View>

          {/* 2-column grid — last item spans full width if odd count */}
          <View style={styles.grid}>
            {EMOTIONS.map((emotion, i) => {
              const isLast = i === EMOTIONS.length - 1;
              const isOdd = EMOTIONS.length % 2 !== 0;
              return (
                <EmotionCard
                  key={emotion.key}
                  emotion={emotion}
                  isFull={isLast && isOdd}
                />
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060F1E' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },

  header: { paddingTop: 8, marginBottom: 28 },
  backBtn: { marginBottom: 16, alignSelf: 'flex-start', padding: 4 },
  headerSmall: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '500',
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 38,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },

  card: {
    width: CARD_W,
    height: CARD_W * 1.35,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardFull: {
    width: '100%',
    height: CARD_W * 0.75,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardTouch: { flex: 1 },
  cardBg: { flex: 1 },
  cardBgImage: { borderRadius: 20 },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  minPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  minText: { fontSize: 12, color: '#fff', fontWeight: '600' },
});
