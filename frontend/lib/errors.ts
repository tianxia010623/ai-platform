const FIELD_LABELS: Record<string, string> = {
  username: "Username",
  email: "Email",
  password: "Password",
  new_password: "New password",
  current_password: "Current password",
  name: "Name",
  title: "Title",
};

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
  ctx?: Record<string, unknown>;
}

function describeIssue(issue: ValidationIssue): string {
  const field = String(issue.loc?.[issue.loc.length - 1] ?? "");
  const label = FIELD_LABELS[field] ?? (field ? field.replace(/_/g, " ") : "Input");
  const ctx = issue.ctx ?? {};
  switch (issue.type) {
    case "string_too_short":
      return `${label} must be at least ${ctx.min_length} characters.`;
    case "string_too_long":
      return `${label} must be at most ${ctx.max_length} characters.`;
    case "missing":
      return `${label} is required.`;
    case "value_error":
      if (field === "email") return "Please enter a valid email address.";
      break;
  }
  const msg = (issue.msg ?? "is invalid").replace(/^Value error, /, "");
  return `${label}: ${msg}`;
}

/** Turn a FastAPI error body's `detail` (a string, or a list of pydantic
 * validation issues) into one readable sentence. */
export function formatErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return Array.from(new Set(detail.map((d) => describeIssue(d as ValidationIssue)))).join(" ");
  }
  return fallback;
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof TypeError) return "Can't reach the server. Check that the backend is running.";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
