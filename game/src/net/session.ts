// The one online arena connection, shared by the arena scenes (lobby → battle → victory).
import { ArenaClient, arenaServerUrl, type ClientOptions } from './client';

let current: ArenaClient | null = null;

function sessionStore(): ClientOptions['storage'] {
  try { return window.sessionStorage; } catch { return null; }
}

export function serverUrl(): string {
  const env = (import.meta.env?.VITE_ARENA_SERVER as string | undefined) || undefined;
  return arenaServerUrl(window.location, env);
}

/** Get the live client, creating a fresh one if needed. */
export function onlineClient(): ArenaClient {
  if (!current || current.status === 'closed' || current.status === 'failed') {
    current = new ArenaClient(serverUrl(), { storage: sessionStore() });
  }
  return current;
}

export function existingClient(): ArenaClient | null {
  return current;
}

/** Leave the room (if any) and drop the connection. */
export function endOnline() {
  current?.leave();
  current = null;
}

export function savedSeatStorage() {
  return sessionStore();
}
