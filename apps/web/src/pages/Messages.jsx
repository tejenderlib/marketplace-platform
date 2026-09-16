import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchListing, fetchPublicProfile } from "../api/catalog.js";
import {
  getConversation,
  listConversations,
  sendMessage,
  startConversation,
} from "../api/messages.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ConversationRow from "../components/chat/ConversationRow.jsx";
import MessageBubble from "../components/chat/MessageBubble.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

const LIMIT = 50;
const POLL_MS = 8000;

function readHashParams() {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return {};
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  return {
    listingId: params.get("listing"),
    recipientId: params.get("recipient"),
  };
}

function clearHashParams() {
  const hash = window.location.hash;
  if (!hash.includes("?")) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/messages`);
}

export default function MessagesPage() {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [conversations, setConversations] = useState({ loading: true, error: null, items: [] });
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState({ loading: false, error: null, messages: [] });
  const [compose, setCompose] = useState(null); // { recipientId, listingId, listingTitle, recipientName }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [note, setNote] = useState(null);
  const threadEndRef = useRef(null);
  const sentinelRef = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const data = await listConversations(authFetch, { limit: 50, offset: 0 });
      const enriched = await Promise.all(
        data.items.map(async (conv) => {
          const otherId = conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id;
          let listingTitle = "Listing";
          let recipientName = "User";
          try {
            const [listing, profile] = await Promise.all([
              fetchListing(conv.listing_id),
              fetchPublicProfile(otherId),
            ]);
            listingTitle = listing.title ?? "Listing";
            recipientName = profile.display_name ?? "User";
          } catch {
            /* fall back to placeholders */
          }
          return { ...conv, listingTitle, recipientName, otherId };
        }),
      );
      setConversations({ loading: false, error: null, items: enriched });
      return enriched;
    } catch (err) {
      setConversations({
        loading: false,
        error: err instanceof ApiError ? `Could not load conversations (${err.status}).` : "Network error.",
        items: [],
      });
      return [];
    }
  }, [authFetch, user.id]);

  const loadThread = useCallback(
    async (conversationId) => {
      setThread({ loading: true, error: null, messages: [] });
      try {
        const data = await getConversation(authFetch, conversationId, { limit: LIMIT, offset: 0 });
        setThread({ loading: false, error: null, messages: data.items });
      } catch (err) {
        setThread({
          loading: false,
          error: err instanceof ApiError ? `Could not load messages (${err.status}).` : "Network error.",
          messages: [],
        });
      }
    },
    [authFetch],
  );

  const openConversation = useCallback(
    (conversation) => {
      clearHashParams();
      setActiveId(conversation.id);
      setCompose(null);
      setSendError(null);
      setNote(null);
      loadThread(conversation.id);
    },
    [loadThread],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    (async () => {
      const params = readHashParams();
      const list = await loadConversations();
      if (params.listingId && params.recipientId) {
        const match = list.find(
          (conv) =>
            String(conv.listing_id) === String(params.listingId) &&
            String(conv.otherId) === String(params.recipientId),
        );
        if (match) {
          openConversation(match);
        } else {
          clearHashParams();
          const [listing, profile] = await Promise.all([
            fetchListing(params.listingId).catch(() => null),
            fetchPublicProfile(params.recipientId).catch(() => null),
          ]);
          setCompose({
            listingId: params.listingId,
            recipientId: params.recipientId,
            listingTitle: listing?.title ?? "this listing",
            recipientName: profile?.display_name ?? "this seller",
          });
        }
      }
    })();
  }, [isAuthenticated, loadConversations, openConversation, redirectToLogin]);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [thread.messages, activeId, compose]);

  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setInterval(() => {
      loadThread(activeId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, loadThread]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = setInterval(() => {
      loadConversations();
    }, POLL_MS * 3);
    return () => clearInterval(timer);
  }, [isAuthenticated, loadConversations]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  async function handleSend(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (compose) {
        await startConversation(authFetch, {
          listing_id: compose.listingId,
          recipient_id: compose.recipientId,
          body,
        });
        setCompose(null);
        setDraft("");
        sentinelRef.current += 1;
        const list = await loadConversations();
        const created = list.find(
          (conv) =>
            String(conv.listing_id) === String(compose.listingId) &&
            String(conv.otherId) === String(compose.recipientId),
        );
        if (created) openConversation(created);
      } else if (activeId) {
        const sent = await sendMessage(authFetch, activeId, body);
        setDraft("");
        setThread((t) => ({ ...t, messages: [...t.messages, sent] }));
      }
      sentinelRef.current += 1;
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  const active =
    conversations.items.find((conv) => conv.id === activeId) ?? null;
  const threadTitle = active ? active.listingTitle : compose?.listingTitle;

  function closeThread() {
    setActiveId(null);
    setCompose(null);
    setSendError(null);
    setNote(null);
  }

  return (
    <div className="ce-stack">
      <div>
        <p className="ce-micro ce-muted">Direct messages</p>
        <h1 className="ce-h1">Messages</h1>
      </div>
      {note && (
        <p className="ce-ok" role="status">{note}</p>
      )}
      {conversations.loading && <LoadingState label="Loading conversations…" />}
      {!conversations.loading && conversations.error && (
        <ErrorState message={conversations.error} onRetry={loadConversations} />
      )}
      <div className="ce-msg-layout">
        <aside aria-label="Conversations">
          <h2 className="ce-h3">Conversations</h2>
          {!conversations.loading && !conversations.error && conversations.items.length === 0 && (
            <p className="ce-small ce-muted">No conversations yet. Message a seller from a listing.</p>
          )}
          <ul className="ce-conv-list">
            {conversations.items.map((conv) => (
              <li key={conv.id}>
                <ConversationRow
                  conv={conv}
                  active={activeId === conv.id}
                  onOpen={openConversation}
                />
              </li>
            ))}
          </ul>
        </aside>

        <section className="ce-thread" aria-label="Conversation">
          {threadTitle ? (
            <>
              <header className="ce-thread-head">
                <Button variant="ghost" size="sm" onClick={closeThread}>
                  ← Back
                </Button>
                <div>
                  <strong>{threadTitle}</strong>
                  {active && (
                    <a className="ce-small ce-muted" href={`#/listing/${active.listing_id}`}>View listing</a>
                  )}
                </div>
                <span className="ce-small ce-muted">
                  {active
                    ? `Chatting with ${active.recipientName}`
                    : compose
                      ? `New conversation with ${compose.recipientName}`
                      : ""}
                </span>
              </header>

              {!active && compose && (
                <p className="ce-small ce-muted">
                  This starts a private conversation about {compose.listingTitle}. Seller won&apos;t see your offer details here.
                </p>
              )}

              <div className="ce-bubbles" role="log" aria-label="Messages" aria-live="off">
                {thread.loading && <LoadingState label="Loading messages…" />}
                {!thread.loading && thread.error && (
                  <p className="ce-error ce-small" role="alert">{thread.error}</p>
                )}
                {thread.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mine={message.sender_id === user.id}
                  />
                ))}
                {compose && thread.messages.length === 0 && (
                  <p className="ce-small ce-muted">No messages yet — say hello.</p>
                )}
                <div ref={threadEndRef} />
              </div>

              <form className="ce-compose" onSubmit={handleSend}>
                {sendError && <p className="ce-error" role="alert">{sendError}</p>}
                <label className="ce-field">
                  <span className="ce-visually-hidden">Write a message</span>
                  <textarea
                    id="message-draft"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message… (2000 characters max)"
                    rows={2}
                    maxLength={2000}
                    required
                  />
                </label>
                <Button variant="primary" type="submit" disabled={sending || !draft.trim()}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </form>
            </>
          ) : (
            <EmptyState
              title="No conversation selected"
              hint="Select a conversation to start messaging."
            />
          )}
        </section>
      </div>
    </div>
  );
}