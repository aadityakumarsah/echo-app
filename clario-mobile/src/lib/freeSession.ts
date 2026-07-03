import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'clario_free_voice_used';

export async function hasFreeSessionBeenUsed(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === '1';
}

export async function markFreeSessionUsed(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}
