const AUTH_KEY = 'ai-tutor-auth';

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTH_KEY) !== null;
}

export function login(email: string) {
  localStorage.setItem(AUTH_KEY, email);
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

export function getCurrentEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_KEY);
}