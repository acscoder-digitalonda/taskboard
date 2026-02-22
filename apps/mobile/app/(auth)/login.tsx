import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import { supabase } from '../../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useState } from 'react';
import { useRouter } from 'expo-router';

// Complete any pending auth session on app resume
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGoogleLogin() {
    try {
      setLoading(true);
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'taskboard' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert('Login Error', error.message);
        setLoading(false);
        return;
      }

      if (!data?.url) {
        Alert.alert('Login Error', 'Could not get login URL. Check your Supabase Google OAuth config.');
        setLoading(false);
        return;
      }

      // Open the browser for OAuth
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Extract tokens from the callback URL
        const url = new URL(result.url);

        // Supabase returns tokens in the URL fragment (hash)
        const hashParams = new URLSearchParams(url.hash.replace('#', ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            Alert.alert('Auth Error', sessionError.message);
          }
          // AuthProvider will detect the session change and redirect
        } else {
          // Try query params as fallback (some flows use code exchange)
          const code = url.searchParams.get('code');
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              Alert.alert('Auth Error', exchangeError.message);
            }
          }
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled — do nothing
      }
    } catch (e: any) {
      Alert.alert('Login Error', e?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
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
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          )}
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
    minHeight: 52,
    justifyContent: 'center',
  },
  googleButtonPressed: {
    backgroundColor: colors.primary[600],
  },
  googleButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
  },
});
