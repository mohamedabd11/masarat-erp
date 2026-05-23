import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { I18nManager } from 'react-native';
import i18n from '@/i18n';
import { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => {
    // Force RTL for Arabic
    const isAr = i18n.language === 'ar';
    if (I18nManager.isRTL !== isAr) {
      I18nManager.forceRTL(isAr);
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
