/**
 * Minimal pub/sub so CheckoutSyncGate can tell useAccess to re-fetch
 * after a background payment sync without needing a shared React context.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSubRefreshNeeded(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitSubRefreshNeeded(): void {
  listeners.forEach(fn => fn());
}
