"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const inputClass =
  "w-full rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20";

function ProfileContent() {
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
      setProfileMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
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
      setPasswordMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-lg">
          <h1 className="mb-1 text-2xl font-semibold text-ink">Your Profile</h1>
          <p className="mb-8 text-sm text-ink-muted">Update your account details.</p>

          <section className="mb-8 rounded-xl border border-line p-6">
            <h2 className="mb-4 text-sm font-medium text-ink">Account info</h2>
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
                <p className={`text-sm ${profileMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}>
                  {profileMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 text-sm font-medium text-ink">Change password</h2>
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
                <p className={`text-sm ${passwordMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}>
                  {passwordMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
              >
                {savingPassword ? "Saving..." : "Change password"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}
