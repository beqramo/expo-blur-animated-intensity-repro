import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// How many BlurViews animate at once. One is enough to hit the code path; more makes the
// main-thread cost easy to see on a fast machine (simulator on Apple silicon).
const BLUR_COUNT = 12;
const COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#8338ec', '#ffbe0b'];

type Stats = { fps: number; worstFrameMs: number; longFrames: number };

function AnimatedBlur({ progress }: { progress: SharedValue<number> }) {
  // A new `intensity` every frame: this is the prop update that re-creates the
  // UIViewPropertyAnimator inside expo-blur's BlurEffectView on each change.
  const animatedProps = useAnimatedProps(() => ({ intensity: 5 + progress.value * 90 }));
  return <AnimatedBlurView animatedProps={animatedProps} tint="light" style={styles.blur} />;
}

export default function App() {
  const progress = useSharedValue(0);
  const [animating, setAnimating] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (animating) {
      progress.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    } else {
      cancelAnimation(progress);
    }
  }, [animating, progress]);

  // UI-thread frame timing. Each frame callback runs on the main thread, so a long gap between
  // two callbacks is time the main thread spent elsewhere (here: in BlurEffectView).
  const frames = useSharedValue(0);
  const worst = useSharedValue(0);
  const longFrames = useSharedValue(0);
  const windowStart = useSharedValue(0);
  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 0;
    if (windowStart.value === 0) {
      windowStart.value = info.timestamp;
      return;
    }
    frames.value += 1;
    if (dt > worst.value) worst.value = dt;
    if (dt > 34) longFrames.value += 1; // more than two 60 Hz frames
    const elapsed = info.timestamp - windowStart.value;
    if (elapsed >= 2000) {
      const next = {
        fps: Math.round((frames.value * 1000) / elapsed),
        worstFrameMs: Math.round(worst.value),
        longFrames: longFrames.value,
      };
      frames.value = 0;
      worst.value = 0;
      longFrames.value = 0;
      windowStart.value = info.timestamp;
      scheduleOnRN(setStats, next);
    }
  });

  useEffect(() => {
    if (stats) {
      console.log(
        `[blur-repro] animating=${animating} blurs=${BLUR_COUNT} uiFps=${stats.fps} worstFrameMs=${stats.worstFrameMs} longFrames=${stats.longFrames}`
      );
    }
  }, [stats, animating]);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {Array.from({ length: BLUR_COUNT }, (_, i) => (
          <View key={i} style={[styles.cell, { backgroundColor: COLORS[i % COLORS.length] }]}>
            <Text style={styles.cellText}>Behind the blur {i + 1}</Text>
            <AnimatedBlur progress={progress} />
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.stats} testID="stats">
          {stats
            ? `UI thread: ${stats.fps} fps · worst frame ${stats.worstFrameMs} ms · ${stats.longFrames} long frames / 2 s`
            : 'Measuring…'}
        </Text>
        <Pressable
          testID="toggle"
          style={styles.button}
          onPress={() => setAnimating((value) => !value)}>
          <Text style={styles.buttonText}>
            {animating ? 'Stop animating intensity' : 'Animate intensity'}
          </Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  cell: {
    width: '31%',
    height: '22%',
    margin: '1%',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  blur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  panel: { padding: 16, paddingBottom: 40, gap: 12 },
  stats: { fontSize: 15, fontVariant: ['tabular-nums'] },
  button: { backgroundColor: '#222', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
