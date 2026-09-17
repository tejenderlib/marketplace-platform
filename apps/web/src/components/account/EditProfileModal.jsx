import { useState } from "react";

import { ApiError } from "../../api/client.js";
import Button from "../ui/Button.jsx";
import Modal from "../ui/Modal.jsx";

/** Avatar presets — the existing preset-key mechanism (see AccountSettings). */
export const PRESET_AVATARS = [
  { key: "blue", color: "#2563eb" },
  { key: "green", color: "#16a34a" },
  { key: "red", color: "#dc2626" },
  { key: "purple", color: "#7c3aed" },
  { key: "orange", color: "#ea580c" },
  { key: "teal", color: "#0d9488" },
];

export function avatarColor(key) {
  return PRESET_AVATARS.find((avatar) => avatar.key === key)?.color ?? null;
}

/**
 * EditProfileModal: edit display name + avatar (the only two fields the
 * profile API accepts), with live preview. Email is read-only from the
 * session; phone/location have no backend columns, so those inputs stay
 * disabled and are marked "Coming soon" instead of pretending to save.
 * Bio is shown read-only. Local state is discarded on Cancel/close.
 */
export default function EditProfileModal({ user, memberSince, onClose, onSaved }) {
  const profile = user?.profile ?? {};
  const [name, setName] = useState(profile.display_name ?? "");
  const [avatarKey, setAvatarKey] = useState(profile.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const email = user?.email ?? "—";
  const trimmed = name.trim();
  const initial = (trimmed || email).charAt(0).toUpperCase() || "?";
  const previewColor = avatarColor(avatarKey);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (trimmed.length === 0) {
      setError("Please enter your full name.");
      return;
    }
    if (trimmed.length < 2) {
      setError("Name needs at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSaved({ display_name: trimmed, avatar_key: avatarKey });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not save profile (${err.status}). Please try again.`
          : "Network error. Is the API running?",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Edit your profile" onClose={onClose} dismissable={!busy}>
      <div className="myacct-modal-head">
        <h2>Edit your profile</h2>
        <button
          type="button"
          className="ce-btn ce-btn--ghost ce-btn--sm"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="myacct-modal-grid">
        <form onSubmit={submit} className="ce-form">
          {error && (
            <p className="ce-error" role="alert">
              {error}
            </p>
          )}
          <label className="ce-field" htmlFor="myacct-name">
            <span>Full name</span>
            <input
              id="myacct-name"
              type="text"
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your display name"
              aria-invalid={error ? true : undefined}
            />
          </label>
          <div className="ce-field">
            <span id="myacct-avatar-label">Profile photo</span>
            <div className="ce-avatar-grid" role="group" aria-labelledby="myacct-avatar-label">
              {PRESET_AVATARS.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  className={avatarKey === avatar.key ? "ce-avatar-pick is-selected" : "ce-avatar-pick"}
                  style={{ background: avatar.color }}
                  disabled={busy}
                  onClick={() => setAvatarKey(avatar.key)}
                  aria-label={`Avatar color ${avatar.key}`}
                  aria-pressed={avatarKey === avatar.key}
                  title={`Avatar color ${avatar.key}`}
                >
                  {avatarKey === avatar.key ? "✓" : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="ce-field">
            <span>Email</span>
            <input type="text" value={email} disabled aria-describedby="myacct-email-hint" />
            <span className="ce-hint" id="myacct-email-hint">Email cannot be changed here.</span>
          </div>
          <div className="ce-field">
            <span>
              Phone number{" "}
              <span className="myacct-soon">Coming soon</span>
            </span>
            <input type="text" value="" disabled placeholder="—" />
          </div>
          <div className="ce-field">
            <span>
              Location{" "}
              <span className="myacct-soon">Coming soon</span>
            </span>
            <input type="text" value="" disabled placeholder="—" />
          </div>
          <div className="ce-modal-actions">
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              CANCEL
            </Button>
            <Button variant="primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "SAVE CHANGES"}
            </Button>
          </div>
        </form>
        <aside className="myacct-preview" aria-label="Profile preview">
          <h3>Preview</h3>
          <span
            className="myacct-avatar myacct-avatar--lg"
            style={previewColor ? { background: previewColor } : undefined}
            aria-hidden="true"
          >
            {initial}
          </span>
          <p className="myacct-preview-name">{trimmed || "Your name"}</p>
          <p className="ce-small ce-muted">{profile.bio?.trim() || "—"}</p>
          <dl className="myacct-preview-facts">
            <div>
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>—</dd>
            </div>
          </dl>
        </aside>
      </div>
      <p className="ce-small ce-muted">Member since {memberSince}</p>
    </Modal>
  );
}
