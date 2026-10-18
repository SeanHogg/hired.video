import { useShouldRenderAppChrome } from "@/components/AppShell";
import AIChatPanel from "@/components/AIChatPanel";
import FloatingAIButton from "@/components/FloatingAIButton";
import ChatPanel from "@/components/ChatPanel";
import MobileBottomNav from "@/components/MobileBottomNav";

// Globally-mounted chrome that hangs off the app root (not inside any page).
// Inherits the same `useShouldRenderAppChrome` predicate as <AppShell> —
// renders only after auth has settled and the user is not in verification
// limbo. While auth bootstraps, returns null so the data-fetching hooks
// these components own (CommunicationHub → /api/inbox, AITokenPill →
// /api/Billing/token-budget, ChatPanel → conversations) never get a chance
// to fire optimistically and then bail. The hooks themselves also gate
// via `useApiReady` for any non-chrome consumer that might mount them.
export function GlobalChrome(): JSX.Element | null {
  if (!useShouldRenderAppChrome()) return null;
  return (
    <>
      {/* Self-hides (with its spacer) on the chrome-free studio editor. */}
      <MobileBottomNav />

      {/* Global AI Components - Available on all pages */}
      <FloatingAIButton />
      <AIChatPanel />
      {/* Global human-to-human chat mini-windows. Opened by the
          CommunicationHub bell in the Navigation header. */}
      <ChatPanel />
    </>
  );
}
