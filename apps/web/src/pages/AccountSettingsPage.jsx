import { useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import { avatarColor } from "../components/account/EditProfileModal.jsx";
import EditProfileModal from "../components/account/EditProfileModal.jsx";
import Button from "../components/ui/Button.jsx";

function formatMemberSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Account settings for the authenticated user. Only real, supported
 * controls are rendered: read-only email, profile editing through the
 * existing Edit Profile modal (PATCH /users/me/profile), and logout
 * through the existing auth flow. There is no password-change,
 * preferences, or account-deletion endpoint in the backend, so those
 * sections are represented honestly instead of faked.
 */
export default function AccountSettingsPage() {
  const { user, authFetch, logout, reloadUser } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState(null);

  const profile = user?.profile ?? {};
  const email = user?.email ?? "—";
  const displayName =
    profile.display_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Account";
  const color = avatarColor(profile.avatar_url);

  async function handleSaveProfile(body) {
    await authFetch("/users/me/profile", { method: "PATCH", body });
    await reloadUser();
    setEditOpen(false);
    setNotice("Profile updated.");
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      window.location.hash = "#/";
    }
  }

  return (
    <div className="ce-stack">
      {notice && (
        <p className="ce-ok" role="status">
          {notice}
        </p>
      )}

      <section aria-labelledby="myacct-set-account">
        <h2 id="myacct-set-account" className="myacct-section-title">
          Account
        </h2>
        <div className="myacct-set-list">
          <div className="myacct-set-row">
            <div className="myacct-set-text">
              <strong>Email Address</strong>
              <span>{email}</span>
              <span className="ce-small ce-muted">Your email address is used for account login.</span>
            </div>
            <span className="myacct-readonly">Read-only</span>
          </div>
          <div className="myacct-set-row">
            <div className="myacct-set-profile">
              <span
                className="myacct-avatar"
                style={color ? { background: color } : undefined}
                aria-hidden="true"
              >
                {displayName.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="myacct-set-text">
                <strong>Profile</strong>
                <span>{displayName}</span>
                <span className="ce-small ce-muted">Update your name and avatar.</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              Edit →
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="myacct-set-security">
        <h2 id="myacct-set-security" className="myacct-section-title">
          Security
        </h2>
        <div className="myacct-set-list">
          <div className="myacct-set-row">
            <div className="myacct-set-text">
              <strong>Password</strong>
              <span className="ce-small ce-muted">Password changes are currently unavailable.</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="myacct-set-session">
        <h2 id="myacct-set-session" className="myacct-section-title">
          Session
        </h2>
        <div className="myacct-set-list">
          <div className="myacct-set-row">
            <div className="myacct-set-text">
              <strong>Log Out</strong>
              <span className="ce-small ce-muted">
                Signed in as {email} since {formatMemberSince(user?.created_at)}.
              </span>
            </div>
            <Button variant="secondary" size="sm" disabled={loggingOut} onClick={handleLogout}>
              {loggingOut ? "Logging out…" : "Log Out"}
            </Button>
          </div>
        </div>
      </section>

      {editOpen && (
        <EditProfileModal
          user={user}
          memberSince={formatMemberSince(user?.created_at)}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaveProfile}
        />
      )}
    </div>
  );
}
