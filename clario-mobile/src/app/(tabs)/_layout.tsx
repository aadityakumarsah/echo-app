import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { CircleCheck, Mic, Smile, BookOpen, Settings } from 'lucide-react-native';
import { colors } from '../../lib/theme';
import UpgradeModal from '../../components/UpgradeModal';

const TAB_HEIGHT = Platform.OS === 'ios' ? 76 : 60;
const ICON_SIZE  = 24;

function TabIcon({ Icon, focused }: { Icon: React.ComponentType<any>; focused: boolean }) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Icon
        size={ICON_SIZE}
        color={focused ? colors.cocoa : colors.warmGray}
        strokeWidth={focused ? 2.4 : 1.8}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <>
    <UpgradeModal />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.footer,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          height: TAB_HEIGHT,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          paddingBottom: Platform.OS === 'ios' ? 12 : 4,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen name="daily-check" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={CircleCheck} focused={focused} /> }} />
      <Tabs.Screen name="dashboard"   options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Mic}         focused={focused} /> }} />
      <Tabs.Screen name="mood"        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Smile}       focused={focused} /> }} />
      <Tabs.Screen name="journal"     options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={BookOpen}    focused={focused} /> }} />
      <Tabs.Screen name="settings"    options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Settings}    focused={focused} /> }} />

      <Tabs.Screen name="check"      options={{ href: null }} />
      <Tabs.Screen name="breathe"    options={{ href: null }} />
      <Tabs.Screen name="relief"     options={{ href: null }} />
      <Tabs.Screen name="meditation" options={{ href: null }} />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 48,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.border + 'CC',
  },
});
