import { FocusedLayout } from "@/components/layout/PageLayouts";
import AnthropicKeySettings from "@/components/settings/AnthropicKeySettings";
import { requireCurrentUser } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/security/secretBox";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const user = await requireCurrentUser();

  // Decrypted only to compute a last4 preview for display — the plaintext key
  // never leaves the server and is never sent to the client.
  let last4: string | null = null;
  if (user.anthropicApiKeyEncrypted) {
    try {
      last4 = decryptSecret(user.anthropicApiKeyEncrypted).slice(-4);
    } catch {
      last4 = null; // e.g. SETTINGS_ENCRYPTION_KEY rotated since this was saved
    }
  }

  return (
    <FocusedLayout>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        Personal to {user.name} — not shared with any other account.
      </p>
      <AnthropicKeySettings hasKey={user.anthropicApiKeyEncrypted != null} last4={last4} />
    </FocusedLayout>
  );
}
