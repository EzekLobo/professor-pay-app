/**
 * Offers the credential to the browser's password manager after a successful
 * Kodland sync. The app never persists the password itself.
 */
export async function rememberKodlandCredentials(form: HTMLFormElement) {
  if (typeof window === "undefined" || !navigator.credentials?.store) return;
  const PasswordCredential = (
    window as typeof window & {
      PasswordCredential?: new (form: HTMLFormElement) => Credential;
    }
  ).PasswordCredential;
  if (!PasswordCredential) return;
  try {
    await navigator.credentials.store(new PasswordCredential(form));
  } catch {
    // Saving remains optional: browser policy or user preference can deny it.
  }
}

/**
 * Reads a previously approved Kodland credential from the browser password
 * manager. The password is never copied to localStorage or Firebase.
 */
export async function restoreKodlandCredentials() {
  if (typeof window === "undefined" || !navigator.credentials?.get) return null;
  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: "optional",
    } as CredentialRequestOptions) as (Credential & {
      id?: string;
      password?: string;
    }) | null;
    if (!credential?.id || !credential.password) return null;
    return { username: credential.id, password: credential.password };
  } catch {
    return null;
  }
}
