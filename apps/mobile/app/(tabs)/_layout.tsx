import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

function TabBarIcon({ name, color }: { name: string; color: string }) {
  // Using text emoji as icon placeholder — in production use @expo/vector-icons
  const icons: Record<string, string> = {
    dashboard: '📊', bookings: '📋', customers: '👥', invoices: '🧾', settings: '⚙️',
  };
  return null; // Icons rendered by Expo Router
}

export default function TabsLayout() {
  const { t, i18n } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopColor: '#e2e8f0',
          paddingBottom: Platform.OS === 'ios' ? 4 : 8,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          fontFamily: i18n.language === 'ar' ? 'System' : 'System',
        },
        headerStyle: { backgroundColor: '#0284c7' },
        headerTintColor: 'white',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.dashboard'), tabBarLabel: t('nav.dashboard') }} />
      <Tabs.Screen name="bookings" options={{ title: t('nav.bookings'), tabBarLabel: t('nav.bookings') }} />
      <Tabs.Screen name="customers" options={{ title: t('nav.customers'), tabBarLabel: t('nav.customers') }} />
      <Tabs.Screen name="invoices" options={{ title: t('nav.invoices'), tabBarLabel: t('nav.invoices') }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings'), tabBarLabel: t('nav.settings') }} />
    </Tabs>
  );
}
