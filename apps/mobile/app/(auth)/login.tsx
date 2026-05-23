import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      // Firebase signInWithEmailAndPassword
      // const { signInWithEmailAndPassword } = await import('@react-native-firebase/auth');
      // await auth().signInWithEmailAndPassword(email, password);
      // Simulate for now:
      await new Promise(r => setTimeout(r, 1000));
      router.replace('/(tabs)');
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>م</Text>
            </View>
            <Text style={[styles.appName, isRtl && styles.rtlText]}>مسارات</Text>
            <Text style={[styles.appSubtitle, isRtl && styles.rtlText]}>Masarat ERP</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={[styles.title, isRtl && styles.rtlText]}>
              {t('auth.welcomeBack')}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRtl && styles.rtlText]}>
                {t('auth.email')}
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign={isRtl ? 'right' : 'left'}
                placeholder="you@agency.sa"
                placeholderTextColor="#94a3b8"
                style={[styles.input, isRtl && styles.rtlInput]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRtl && styles.rtlText]}>
                {t('auth.password')}
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign={isRtl ? 'right' : 'left'}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                style={[styles.input, isRtl && styles.rtlInput]}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.loginButton')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>مسارات © 2026</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  keyboardAvoid: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  logoText: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  appName: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 2 },
  appSubtitle: { fontSize: 13, color: '#94a3b8' },
  form: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 24, textAlign: 'left' },
  rtlText: { textAlign: 'right' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: '#475569', marginBottom: 6, textAlign: 'left' },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#0f172a', backgroundColor: '#f8fafc',
  },
  rtlInput: { textAlign: 'right' },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { fontSize: 13, color: '#dc2626', textAlign: 'center' },
  button: {
    backgroundColor: '#0284c7', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#0284c7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 32 },
});
