import { Alert, Linking } from 'react-native';

/**
 * Open an external URL with retry + alert fallback. Wraps Linking.openURL
 * (which returns a rejected promise that, uncaught, surfaces as a red-box
 * "Uncaught (in promise)" error to the user).
 *
 * The first call sometimes fails on iOS when the system browser isn't yet
 * ready (app just resumed from background, view still settling, etc.). A
 * short delay + retry resolves the common case without the user having to
 * tap again. If both attempts fail we show an Alert so the failure is at
 * least visible — better than a silent miss or a raw stack trace.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
    return;
  } catch {
    // first attempt failed — fall through to retry
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  try {
    await Linking.openURL(url);
    return;
  } catch {
    Alert.alert(
      "Couldn't open link",
      `The system couldn't open this URL:\n\n${url}`,
      [{ text: 'OK', style: 'cancel' }],
    );
  }
}
