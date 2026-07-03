// Meditation is a tab — this file is intentionally empty to avoid route conflicts.
// Navigate to /(tabs)/meditation via the tab bar.
import { Redirect } from 'expo-router';
export default function MeditationRedirect() {
  return <Redirect href="/(tabs)/meditation" />;
}
