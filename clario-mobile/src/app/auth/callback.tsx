import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/lib/theme';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/paywall');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.cocoa} size="large" />
    </View>
  );
}
