import type { Avatar, ChatSession, FeedbackSummary, Message, PromptVariant, TopicMastery, User } from "./types";
import { formatErrorDetail } from "./errors";
import { createSseParser } from "./sse";

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

export class ApiError extends Error {
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

async function toApiError(res: Response): Promise<ApiError> {
  let detail: unknown = null;
  try {
    detail = (await res.json()).detail;
  } catch {
    // non-JSON error body
  }
  const fallback =
    res.status === 413
      ? "That file is too large."
      : res.status === 429
        ? "Too many attempts. Please wait a moment and try again."
        : res.status >= 500
          ? "The server hit an error. Please try again."
          : res.statusText || "Request failed.";
  return new ApiError(res.status, formatErrorDetail(detail, fallback));
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
    if (res.status === 401 && token && !skipAuthRedirect) {
      handleSessionExpired();
      // Navigation is in flight; don't let callers race it with an error UI.
      return new Promise<T>(() => {});
    }
    throw await toApiError(res);
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

export async function login(email: string, password: string) {
  return request<{ access_token: string; user: User }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    { skipAuthRedirect: true }
  );
}

export async function getMe() {
  return request<User>("/api/auth/me");
}

export async function updateProfile(data: {
  username?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}) {
  return request<User>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function forgotPassword(email: string) {
  return request<{ message: string }>(
    "/api/auth/forgot-password",
    { method: "POST", body: JSON.stringify({ email }) },
    { skipAuthRedirect: true }
  );
}

export async function resetPassword(token: string, newPassword: string) {
  return request<{ message: string }>(
    "/api/auth/reset-password",
    { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) },
    { skipAuthRedirect: true }
  );
}

// ---------- Avatars ----------
export interface AvatarFields {
  name: string;
  description: string;
  personality: string;
  speaking_style: string;
  expertise: string;
  topic_tags: string[];
}

export async function listAvatars() {
  return request<Avatar[]>("/api/avatars");
}

export async function getAvatar(id: number) {
  return request<Avatar>(`/api/avatars/${id}`);
}

export async function createAvatar(form: FormData) {
  return request<Avatar>("/api/avatars", { method: "POST", body: form });
}

export async function updateAvatar(id: number, fields: Partial<AvatarFields>) {
  return request<Avatar>(`/api/avatars/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
}

export async function replaceAvatarImage(id: number, image: File) {
  const form = new FormData();
  form.append("image", image);
  return request<Avatar>(`/api/avatars/${id}/image`, { method: "PUT", body: form });
}

export async function removeAvatarImage(id: number) {
  return request<Avatar>(`/api/avatars/${id}/image`, { method: "DELETE" });
}

export async function deleteAvatar(id: number) {
  return request<{ ok: boolean }>(`/api/avatars/${id}`, { method: "DELETE" });
}

// ---------- Chat sessions ----------
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

export async function renameSession(sessionId: number, title: string) {
  return request<ChatSession>(`/api/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(sessionId: number) {
  return request<{ ok: boolean }>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
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
  | { type: "user_saved"; message_id: number }
  | { type: "delta"; content: string }
  | {
      type: "message_done";
      message_id: number;
      prompt_variant?: { id: number; name: string };
      retrieved_sources?: string[];
      session_title?: string;
      truncated?: boolean;
    }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamChat(
  options: {
    sessionId: number;
    message?: string;
    files?: File[];
    regenerate?: boolean;
    signal?: AbortSignal;
  },
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const token = getToken();
  const form = new FormData();
  form.append("session_id", String(options.sessionId));
  form.append("message", options.message ?? "");
  if (options.regenerate) form.append("regenerate", "true");
  for (const file of options.files ?? []) form.append("files", file);

  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
    signal: options.signal,
  });

  if (res.status === 401 && token) {
    handleSessionExpired();
    return;
  }
  if (!res.ok || !res.body) {
    throw await toApiError(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSseParser<StreamEvent>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of feed(decoder.decode(value, { stream: true }))) onEvent(event);
  }
}

// ---------- Feedback ----------
export async function submitFeedback(messageId: number, rating: number) {
  return request<{ id: number; message_id: number; rating: number }>(
    `/api/feedback/${messageId}`,
    { method: "POST", body: JSON.stringify({ rating }) }
  );
}

export async function getFeedbackSummary() {
  return request<FeedbackSummary[]>("/api/feedback/summary");
}

// ---------- Prompt Variants ----------
export async function listPromptVariants(avatarId: number) {
  return request<PromptVariant[]>(`/api/avatars/${avatarId}/prompt-variants`);
}

export async function createPromptVariant(avatarId: number, name: string, promptModifier: string) {
  return request<PromptVariant>(`/api/avatars/${avatarId}/prompt-variants`, {
    method: "POST",
    body: JSON.stringify({ name, prompt_modifier: promptModifier }),
  });
}

export async function setPromptVariantActive(avatarId: number, variantId: number, isActive: boolean) {
  return request<PromptVariant>(`/api/avatars/${avatarId}/prompt-variants/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}
