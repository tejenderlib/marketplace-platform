import { useEffect, useState } from "react";

import { ApiError } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";

const PRESET_AVATARS = [
  { key: "blue", color: "#2563eb" },
  { key: "green", color: "#16a34a" },
  { key: "red", color: "#dc2626" },
  { key: "purple", color: "#7c3aed" },
  { key: "orange", color: "#ea580c" },
  { key: "teal", color: "#0d9488" },
];

function AvatarItem({ avatar, selected, onSelect }) {
  return (
    <button
      type="button"
      className={selected ? "ce-avatar-pick is-selected" : "ce-avatar-pick"}
      style={{ background: avatar.color }}
      onClick={onSelect}
      aria-label={`Avatar color ${avatar.key}`}
      aria-pressed={selected}
      title={`Avatar color ${avatar.key}`}
    >
      {selected ? "✓" : ""}
    </button>
  );
}

/**
 * Settings workspace view: the currently supported profile editing
 * (display name + avatar) with an honest scope note. No invented
 * password/email/payment/notification backends.
 */
export default function AccountSettings() {
  const { authFetch, reloadUser, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: "" });
  const [selectedAvatarKey, setSelectedAvatarKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!user) return;
    setForm({ display_name: user.profile?.display_name ?? "" });
    setSelectedAvatarKey(user.profile?.avatar_url ?? null);
  }, [user]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const value = form.display_name.trim();
    try {
      await authFetch("/users/me/profile", {
        method: "PATCH",
        body: { display_name: value === "" ? null : value, avatar_key: selectedAvatarKey },
      });
      await reloadUser();
      setEditing(false);
      setFeedback({ kind: "ok", text: "Profile updated." });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof ApiError ? `Could not save profile (${err.status}): ${err.message}` : "Network error.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="acct-settings-heading" className="ce-stack">
      <h2 id="acct-settings-heading" className="ce-h2">Settings</h2>
      {feedback && (
        <p className={feedback.kind === "error" ? "ce-error" : "ce-ok"} role="status">
          {feedback.text}
        </p>
      )}
      {!editing ? (
        <Card>
          <dl className="ce-facts">
            <div>
              <dt>Display name</dt>
              <dd>{user?.profile?.display_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
          </dl>
          <p className="ce-small ce-muted">
            Only display name and avatar can be changed here today. Password, email
            preferences, and payment settings are not available yet.
          </p>
          <div>
            <Button variant="primary" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <form className="ce-form" onSubmit={saveProfile}>
            <label className="ce-field">
              <span>Display name</span>
              <input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                maxLength={120}
                placeholder="At least 2 characters"
              />
            </label>
            <div className="ce-field">
              <span id="avatar-label">Avatar</span>
              <div className="ce-avatar-grid" role="group" aria-labelledby="avatar-label">
                {PRESET_AVATARS.map((avatar) => (
                  <AvatarItem
                    key={avatar.key}
                    avatar={avatar}
                    selected={selectedAvatarKey === avatar.key}
                    onSelect={() => setSelectedAvatarKey(avatar.key)}
                  />
                ))}
              </div>
            </div>
            <div className="ce-cluster">
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
            <p className="ce-small ce-muted">Display name and avatar are editable. Changes apply instantly.</p>
          </form>
        </Card>
      )}
    </section>
  );
}
