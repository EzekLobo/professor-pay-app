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
