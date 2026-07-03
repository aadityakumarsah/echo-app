/**
 * Space Blocks — a timing / stacking game.
 * A block moves left-right; tap to place it on the growing stack.
 * Overhanging parts are cut; no overlap = game over.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const { width: SW } = Dimensions.get('window');

const BOARD_W = SW - 48; // horizontal playfield width (px)
const BLOCK_H = 32;
const STACK_MAX = 8; // how many blocks shown before shifting view
const INITIAL_BLOCK_W = BOARD_W * 0.55;
const MIN_BLOCK_W = 18;
const BASE_SPEED = BOARD_W * 0.0028; // blocks/ms
const SPEED_INC = 0.00004; // extra per score point

// colour palette cycles by level
const BLOCK_COLORS = [
  '#A78BFA', '#60A5FA', '#34D399', '#FBBF24', '#F472B6',
  '#F87171', '#38BDF8', '#A3E635', '#FB923C',
];

interface Block {
  x: number; // left edge relative to BOARD_W
  w: number;
  color: string;
}

type GameState = 'idle' | 'playing' | 'over';

const FRAME_MS = 16; // ~60 fps

export default function ReliefBlocks() {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [stack, setStack] = useState<Block[]>([]);
  const [movingX, setMovingX] = useState(0);
  const [movingW, setMovingW] = useState(INITIAL_BLOCK_W);
  const [movingColor, setMovingColor] = useState(BLOCK_COLORS[0]);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cutFlash = useRef(new Animated.Value(0)).current;

  const dirRef = useRef(1);
  const posRef = useRef(0);
  const scoreRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wRef = useRef(INITIAL_BLOCK_W);
  const stackRef = useRef<Block[]>([]);

  React.useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, []);

  const startGame = useCallback(() => {
    const firstBlock: Block = { x: (BOARD_W - INITIAL_BLOCK_W) / 2, w: INITIAL_BLOCK_W, color: BLOCK_COLORS[0] };
    stackRef.current = [firstBlock];
    setStack([firstBlock]);
    scoreRef.current = 0;
    setScore(0);
    wRef.current = INITIAL_BLOCK_W;
    posRef.current = 0;
    dirRef.current = 1;
    setMovingX(0);
    setMovingW(INITIAL_BLOCK_W);
    setMovingColor(BLOCK_COLORS[1]);
    setGameState('playing');

    loopRef.current = setInterval(() => {
      const speed = BASE_SPEED + SPEED_INC * scoreRef.current;
      posRef.current += speed * FRAME_MS * dirRef.current;
      if (posRef.current + wRef.current >= BOARD_W) {
        posRef.current = BOARD_W - wRef.current;
        dirRef.current = -1;
      } else if (posRef.current <= 0) {
        posRef.current = 0;
        dirRef.current = 1;
      }
      setMovingX(posRef.current);
    }, FRAME_MS);
  }, []);

  const place = useCallback(() => {
    if (gameState !== 'playing') return;
    if (loopRef.current) clearInterval(loopRef.current);

    const top = stackRef.current[stackRef.current.length - 1];
    const mX = posRef.current;
    const mW = wRef.current;

    // Calculate overlap
    const overlapLeft = Math.max(mX, top.x);
    const overlapRight = Math.min(mX + mW, top.x + top.w);
    const overlapW = overlapRight - overlapLeft;

    if (overlapW <= 0) {
      // Game over
      setGameState('over');
      setBestScore(prev => Math.max(prev, scoreRef.current));
      return;
    }

    const perfect = Math.abs(overlapW - top.w) < 3 && Math.abs(overlapW - mW) < 3;

    const newBlock: Block = {
      x: overlapLeft,
      w: perfect ? top.w : overlapW, // perfect = same width bonus
      color: BLOCK_COLORS[(stackRef.current.length + 1) % BLOCK_COLORS.length],
    };

    // Flash if cut
    if (!perfect && overlapW < mW * 0.9) {
      Animated.sequence([
        Animated.timing(cutFlash, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(cutFlash, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }

    const nextW = newBlock.w;
    const nextScore = scoreRef.current + 1;
    scoreRef.current = nextScore;
    setScore(nextScore);
    wRef.current = nextW;

    const nextStack = [...stackRef.current, newBlock];
    stackRef.current = nextStack;
    setStack(nextStack);

    // Next mover
    posRef.current = 0;
    dirRef.current = 1;
    setMovingX(0);
    setMovingW(nextW);
    setMovingColor(BLOCK_COLORS[(nextStack.length) % BLOCK_COLORS.length]);

    loopRef.current = setInterval(() => {
      const sp = BASE_SPEED + SPEED_INC * scoreRef.current;
      posRef.current += sp * FRAME_MS * dirRef.current;
      if (posRef.current + nextW >= BOARD_W) {
        posRef.current = BOARD_W - nextW;
        dirRef.current = -1;
      } else if (posRef.current <= 0) {
        posRef.current = 0;
        dirRef.current = 1;
      }
      setMovingX(posRef.current);
    }, FRAME_MS);
  }, [gameState, cutFlash]);

  // Visible stack slice (show last STACK_MAX blocks)
  const visibleStack = stack.slice(-STACK_MAX);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.container, { opacity: fadeIn }]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { if (loopRef.current) clearInterval(loopRef.current); router.back(); }} activeOpacity={0.7}>
              <Text style={styles.backText}>← back</Text>
            </TouchableOpacity>
            <View style={styles.scoreArea}>
              <Text style={styles.scoreNum}>{score}</Text>
              {bestScore > 0 && (
                <Text style={styles.bestText}>best {bestScore}</Text>
              )}
            </View>
          </View>

          {gameState === 'idle' && (
            <View style={styles.centeredArea}>
              <Text style={styles.gameTitle}>Space Blocks</Text>
              <Text style={styles.gameSub}>
                Tap to place each block on the stack.{'\n'}Perfect timing = wider block.
              </Text>
              <TouchableOpacity style={styles.playBtn} onPress={startGame} activeOpacity={0.85}>
                <Text style={styles.playBtnText}>Play</Text>
              </TouchableOpacity>
            </View>
          )}

          {gameState === 'over' && (
            <View style={styles.centeredArea}>
              <Text style={styles.gameOverTitle}>You stacked</Text>
              <Text style={styles.gameOverScore}>{score}</Text>
              <Text style={styles.gameOverSub}>block{score !== 1 ? 's' : ''} high!</Text>
              {score >= bestScore && score > 0 && (
                <Text style={styles.newBest}>✨ new best!</Text>
              )}
              <TouchableOpacity style={styles.playBtn} onPress={startGame} activeOpacity={0.85}>
                <Text style={styles.playBtnText}>Play again</Text>
              </TouchableOpacity>
            </View>
          )}

          {gameState === 'playing' && (
            <TouchableOpacity
              style={styles.playfield}
              onPress={place}
              activeOpacity={1}
            >
              {/* Cut flash overlay */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: '#fff', opacity: cutFlash, borderRadius: 20 },
                ]}
                pointerEvents="none"
              />

              {/* Stacked blocks (bottom slice) */}
              <View style={styles.stackContainer}>
                {visibleStack.map((b, i) => (
                  <View
                    key={i}
                    style={[
                      styles.block,
                      {
                        left: b.x,
                        width: b.w,
                        backgroundColor: b.color,
                        bottom: i * (BLOCK_H + 2),
                        opacity: 0.5 + i * 0.06,
                      },
                    ]}
                  />
                ))}

                {/* Moving block — sits on top */}
                <View
                  style={[
                    styles.block,
                    styles.movingBlock,
                    {
                      left: movingX,
                      width: movingW,
                      backgroundColor: movingColor,
                      bottom: visibleStack.length * (BLOCK_H + 2),
                    },
                  ]}
                />
              </View>

              <Text style={styles.tapHint}>TAP TO PLACE</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060F1E' },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 16,
  },
  backText: { fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  scoreArea: { alignItems: 'flex-end' },
  scoreNum: { fontSize: 28, fontWeight: '900', color: '#fff' },
  bestText: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },

  centeredArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  gameTitle: { fontSize: 36, fontWeight: '900', color: '#fff' },
  gameSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  playBtn: {
    backgroundColor: '#A78BFA',
    borderRadius: 16,
    paddingHorizontal: 48,
    paddingVertical: 16,
    marginTop: 8,
  },
  playBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },

  gameOverTitle: { fontSize: 20, color: 'rgba(255,255,255,0.55)' },
  gameOverScore: { fontSize: 80, fontWeight: '900', color: '#fff', lineHeight: 88 },
  gameOverSub: { fontSize: 16, color: 'rgba(255,255,255,0.4)' },
  newBest: { fontSize: 15, color: '#FBBF24', fontWeight: '700' },

  playfield: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 24,
    position: 'relative',
  },
  stackContainer: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    width: BOARD_W,
    height: (STACK_MAX + 2) * (BLOCK_H + 2),
  },
  block: {
    position: 'absolute',
    height: BLOCK_H,
    borderRadius: 8,
  },
  movingBlock: {
    opacity: 1,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  tapHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.2)',
  },
});
