"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";
import UserBadge from "@/components/UserBadge";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/errors";

const inputClass = "field";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email);
    }
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const payload: { username?: string; email?: string } = {};
      if (user && username.trim() && username.trim() !== user.username) payload.username = username.trim();
      if (user && email.trim() && email.trim() !== user.email) payload.email = email.trim();

      if (Object.keys(payload).length === 0) {
        setProfileMessage({ type: "ok", text: "Nothing changed." });
        return;
      }

      const updated = await api.updateProfile(payload);
      updateUser(updated);
      setProfileMessage({ type: "ok", text: "Profile updated." });
    } catch (err) {
      setProfileMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords don't match." });
      return;
    }

    setSavingPassword(true);
    try {
      const updated = await api.updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "ok", text: "Password changed." });
    } catch (err) {
      setPasswordMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setSavingPassword(false);
    }
  }

  const joined = user ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" }) : "";

  return (
    <PageScroll width="max-w-lg">
          <PageHeader eyebrow="Account" title="Your Profile" subtitle="Update your account details." />

          {user && (
            <section className="card mb-6 flex animate-fade-in items-center gap-4 p-5">
              <UserBadge name={user.username} className="h-14 w-14 text-2xl" />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold text-ink">{user.username}</p>
                <p className="truncate text-sm text-ink-muted">{user.email}</p>
                {joined && <p className="mt-0.5 text-xs text-ink-muted">Member since {joined}</p>}
              </div>
            </section>
          )}

          <section className="card mb-6 p-6">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Account info</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className={inputClass}
                />
              </div>

              {profileMessage && (
                <p className={`text-sm ${profileMessage.type === "error" ? "text-danger" : "text-success"}`} role="status">
                  {profileMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="btn-primary"
              >
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
            </form>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Change password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Current password</label>
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type="password"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">New password</label>
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Confirm new password</label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className={inputClass}
                />
              </div>

              {passwordMessage && (
                <p className={`text-sm ${passwordMessage.type === "error" ? "text-danger" : "text-success"}`} role="status">
                  {passwordMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className="btn-primary"
              >
                {savingPassword ? "Saving..." : "Change password"}
              </button>
            </form>
          </section>
    </PageScroll>
  );
}

