import * as SecureStore from 'expo-secure-store';
import { KodlandCredentials } from './kodland';

const usernameKey = 'kodland_username';
const passwordKey = 'kodland_password';

export async function loadKodlandCredentials(): Promise<KodlandCredentials> {
  const [username, password] = await Promise.all([
    SecureStore.getItemAsync(usernameKey),
    SecureStore.getItemAsync(passwordKey),
  ]);
  return { username: username ?? '', password: password ?? '' };
}

export async function saveKodlandCredentials(credentials: KodlandCredentials) {
  await Promise.all([
    SecureStore.setItemAsync(usernameKey, credentials.username.trim()),
    SecureStore.setItemAsync(passwordKey, credentials.password),
  ]);
}

export async function clearKodlandCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(usernameKey),
    SecureStore.deleteItemAsync(passwordKey),
  ]);
}
