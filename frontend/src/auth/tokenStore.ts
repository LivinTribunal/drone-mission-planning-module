let globalAccessToken: string | null = null;
let globalLogout: (() => void) | null = null;

export function getAccessToken(): string | null {
  return globalAccessToken;
}

export function setAccessToken(token: string | null): void {
  globalAccessToken = token;
}

export function triggerLogout(): void {
  globalLogout?.();
}

export function setLogoutHandler(handler: (() => void) | null): void {
  globalLogout = handler;
}
