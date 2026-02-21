import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import { supabase } from '../../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// For Google OAuth web flow
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  async function handleGoogleLogin() {
    const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'taskboard' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (data?.url) {
      await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>TB</Text>
        </View>
        <Text style={styles.title}>TASKBOARD</Text>
        <Text style={styles.subtitle}>Drag & drop task management</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable style={styles.googleButton} onPress={handleGoogleLogin}>
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    backgroundColor: colors.primary[500],
  },
  logoText: {
    color: colors.white,
    fontSize: 28,
    fontFamily: typography.fontFamily.black,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontFamily: typography.fontFamily.black,
    color: colors.gray[900],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[500],
    marginTop: spacing.sm,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.md,
  },
  googleButton: {
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  googleButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
  },
});
