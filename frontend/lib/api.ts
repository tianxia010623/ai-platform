import type { Avatar, ChatSession, Message, TopicMastery, User } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TOKEN_KEY = "ai_avatar_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function avatarImageUrl(avatar: Avatar): string | null {
  if (!avatar.image_path) return null;
  return `${API_URL}${avatar.image_path}`;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function handleSessionExpired() {
  clearToken();
  localStorage.removeItem("ai_avatar_user");
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  { skipAuthRedirect = false }: { skipAuthRedirect?: boolean } = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // ignore
    }
    if (res.status === 401 && token && !skipAuthRedirect) {
      handleSessionExpired();
      // Navigation is in flight; don't let callers race it with an error UI.
      return new Promise<T>(() => {});
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- Auth ----------
export async function register(username: string, email: string, password: string) {
  return request<{ access_token: string; user: User }>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ username, email, password }) },
    { skipAuthRedirect: true }
  );
}

export async function login(username: string, password: string) {
  return request<{ access_token: string; user: User }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    { skipAuthRedirect: true }
  );
}

// ---------- Avatars ----------
export async function listAvatars() {
  return request<Avatar[]>("/api/avatars");
}

export async function getAvatar(id: number) {
  return request<Avatar>(`/api/avatars/${id}`);
}

export async function createAvatar(form: FormData) {
  return request<Avatar>("/api/avatars", { method: "POST", body: form });
}

export async function deleteAvatar(id: number) {
  return request<{ ok: boolean }>(`/api/avatars/${id}`, { method: "DELETE" });
}

// ---------- Chat ----------
export async function createSession(avatarId: number, title = "New Chat") {
  return request<ChatSession>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ avatar_id: avatarId, title }),
  });
}

export async function listSessions(avatarId?: number) {
  const query = avatarId ? `?avatar_id=${avatarId}` : "";
  return request<ChatSession[]>(`/api/chat/sessions${query}`);
}

export async function getSessionMessages(sessionId: number) {
  return request<Message[]>(`/api/chat/sessions/${sessionId}/messages`);
}

// ---------- Mastery ----------
export async function getAllMastery() {
  return request<TopicMastery[]>("/api/mastery");
}

export async function getAvatarMastery(avatarId: number) {
  return request<TopicMastery[]>(`/api/mastery/${avatarId}`);
}

// ---------- Streaming chat ----------
export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "message_done"; message_id: number }
  | { type: "mastery_update"; topics: { topic: string; mastery_score: number; interaction_count: number }[] }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamChat(
  sessionId: number,
  message: string,
  files: File[],
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const token = getToken();
  const form = new FormData();
  form.append("session_id", String(sessionId));
  form.append("message", message);
  for (const file of files) form.append("files", file);

  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok || !res.body) {
    throw new ApiError(res.status, "Failed to start chat stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice("data:".length).trim();
      try {
        const event = JSON.parse(jsonStr) as StreamEvent;
        onEvent(event);
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
