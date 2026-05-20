import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import '../global.css';
import { IntentProvider } from '@/lib/intent';
import { SavedLocationsProvider } from '@/lib/locations';
import { UnitsProvider } from '@/lib/units';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 2,
            // Required for offline cache resurrection — query results
            // must survive app restarts.
            gcTime: 24 * 60 * 60 * 1000,
            // Don't fire a wave of refetches every time the user returns to
            // the app from being backgrounded — the per-query staleTimes
            // already trigger refetches when the cached data is genuinely
            // old. Cuts unnecessary network/CPU/radio for "I just unlocked
            // my phone to glance at Status" sessions.
            refetchOnWindowFocus: false,
            // Same logic for reconnect — staleTimes will catch up naturally.
            refetchOnReconnect: false,
          },
        },
      })
  );

  const [persister] = useState(() =>
    createAsyncStoragePersister({
      storage: AsyncStorage,
      key: 'wildfire.queryCache.v1',
      throttleTime: 1000,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        // Bump this when types or response shapes change so we discard
        // incompatible cached payloads on first launch after an upgrade.
        buster: 'v2-vpd-algo',
      }}
    >
      <ThemeProvider value={DarkTheme}>
        <UnitsProvider>
        <SavedLocationsProvider>
        <IntentProvider>
          <Stack screenOptions={{ contentStyle: { backgroundColor: '#0a0a0b' } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="fire-detail" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="locations" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
        </IntentProvider>
        </SavedLocationsProvider>
        </UnitsProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
