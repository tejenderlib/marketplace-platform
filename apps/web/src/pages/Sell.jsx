import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { findAuctionForListing } from "../api/auctions.js";
import {
  addImageRef,
  createAuction,
  createListing,
  deleteImageRef,
  listImageRefs,
  myListings,
  submitListing,
  updateImageRef,
  updateListing,
} from "../api/seller.js";
import BasicsStep from "../components/sell/BasicsStep.jsx";
import ImagesStep from "../components/sell/ImagesStep.jsx";
import PreviewStep from "../components/sell/PreviewStep.jsx";
import SaleStep from "../components/sell/SaleStep.jsx";
import SellerDashboard from "../components/sell/SellerDashboard.jsx";
import StepIndicator from "../components/sell/StepIndicator.jsx";
import {
  auctionCreateBody,
  fromMinor,
  listingCreateBody,
  listingPatchBody,
  toLocalInput,
  validateBasics,
  validateSale,
} from "../components/sell/shared.js";

function emptyForm() {
  return {
    title: "",
    description: "",
    category_id: "",
    condition: "",
    city: "",
    region: "",
    country_code: "IN",
    postal_code: "",
    sale_type: "FIXED_PRICE",
    price_rupees: "",
    offers_enabled: false,
    starting_rupees: "",
    increment_rupees: "",
    reserve_rupees: "",
    starts_at: "",
    ends_at: "",
  };
}

function describeSellerError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Session expired. Please sign in again.";
    const detail =
      typeof error.detail === "string"
        ? error.detail
        : error.detail
          ? JSON.stringify(error.detail)
          : null;
    if (error.status === 403) return detail ?? "You are not allowed to do that.";
    if (error.status === 404) return detail ?? "Not found. It may have been removed.";
    if (error.status === 409) return detail ?? "That conflicts with the current state.";
    if (error.status === 422) return detail ?? "Some values were rejected. Check the form.";
    return detail ?? `Request failed (${error.status}). Please retry.`;
  }
  return "Network error. Is the API running?";
}

function formFromListing(item) {
  return {
    title: item.title ?? "",
    description: item.description ?? "",
    category_id: item.category?.id ?? "",
    condition: item.condition ?? "",
    city: item.city ?? "",
    region: item.region ?? "",
    country_code: item.country_code ?? "IN",
    postal_code: item.postal_code ?? "",
    sale_type: item.sale_type ?? "FIXED_PRICE",
    price_rupees: fromMinor(item.fixed_price_minor),
    offers_enabled: Boolean(item.offers_enabled),
    starting_rupees: "",
    increment_rupees: "",
    reserve_rupees: "",
    starts_at: "",
    ends_at: "",
  };
}

/**
 * Sell page: seller dashboard (own listings, lifecycle-legal actions) +
 * linear create/edit wizard (Basics → Price → Images → Preview) wired to
 * the real seller APIs. No autosave timer — explicit Save Draft only.
 */
export default function SellPage({ authFetch, categories, isAuthenticated, onRequireLogin }) {
  const [mode, setMode] = useState("dashboard");
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [stepErrors, setStepErrors] = useState({});
  const [draft, setDraft] = useState(null);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [dash, setDash] = useState({ items: [], total: 0, loading: true, error: null });
  const [statusFilter, setStatusFilter] = useState("");

  const categoryName = useMemo(
    () => categories.find((cat) => String(cat.id) === String(form.category_id))?.name ?? "—",
    [categories, form.category_id],
  );

  const loadDash = useCallback(
    async (status) => {
      setDash((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const page = await myListings(authFetch, { status: status || undefined, limit: 20, offset: 0 });
        setDash({ items: page.items ?? [], total: page.total ?? 0, loading: false, error: null });
      } catch (error) {
        setDash((prev) => ({ ...prev, loading: false, error: describeSellerError(error) }));
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (isAuthenticated) loadDash(statusFilter);
  }, [isAuthenticated, statusFilter, loadDash]);

  async function reloadImages(draftId) {
    try {
      const rows = await listImageRefs(authFetch, draftId);
      setImages(Array.isArray(rows) ? rows : []);
    } catch {
      setImages([]);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="content">
        <div className="empty-state">
          <p>Selling requires an account. Please sign in to create listings.</p>
          <button type="button" className="btn btn-primary" onClick={onRequireLogin}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStepErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function startNew() {
    setForm(emptyForm());
    setDraft(null);
    setImages([]);
    setStep(0);
    setMaxReached(0);
    setStepErrors({});
    setBanner(null);
    setMode("wizard");
    window.scrollTo(0, 0);
  }

  async function startEdit(item) {
    const next = formFromListing(item);
    // Best-effort auction prefill for AUCTION drafts; never blocks editing.
    if (item.sale_type === "AUCTION") {
      try {
        const auction = await findAuctionForListing(item.id);
        if (auction) {
          next.starting_rupees = fromMinor(auction.starting_bid_minor);
          next.increment_rupees = fromMinor(auction.minimum_increment_minor);
          next.reserve_rupees = fromMinor(auction.reserve_minor);
          next.starts_at = toLocalInput(auction.starts_at);
          next.ends_at = toLocalInput(auction.ends_at);
        }
      } catch {
        /* offline prefill is optional */
      }
    }
    setForm(next);
    setDraft(item);
    setStep(0);
    setMaxReached(0);
    setStepErrors({});
    setBanner(null);
    setMode("wizard");
    await reloadImages(item.id);
    window.scrollTo(0, 0);
  }

  async function ensureDraft() {
    const basics = validateBasics(form);
    const sale = validateSale(form);
    const errors = { ...basics, ...sale };
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      throw new Error("Fix the highlighted fields before saving.");
    }
    let saved;
    if (draft) {
      saved = await updateListing(authFetch, draft.id, listingPatchBody(form));
    } else {
      saved = await createListing(authFetch, listingCreateBody(form));
    }
    setDraft(saved);
    return saved;
  }

  async function ensureAuctionRow(draftId) {
    try {
      await createAuction(authFetch, auctionCreateBody(form, draftId));
      return true;
    } catch (error) {
      // 409 = a row already exists (e.g. retried submit) — safe to continue.
      if (error instanceof ApiError && error.status === 409) return true;
      throw error;
    }
  }

  async function runGuarded(key, fn) {
    if (busy) return null;
    setBusy(key);
    setBanner(null);
    try {
      return await fn();
    } catch (error) {
      setBanner({ error: error.message ?? describeSellerError(error) });
      return null;
    } finally {
      setBusy(null);
    }
  }

  function goContinue() {
    const errors = step === 0 ? validateBasics(form) : step === 1 ? validateSale(form) : {};
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }
    const next = step + 1;
    // Entering Images with no draft yet → persist one first (images need an id).
    if (next === 2 && !draft) {
      runGuarded("draft", async () => {
        const saved = await ensureDraft();
        await reloadImages(saved.id);
        setStep(next);
        setMaxReached((max) => Math.max(max, next));
        window.scrollTo(0, 0);
      });
      return;
    }
    setStep(next);
    setMaxReached((max) => Math.max(max, next));
    window.scrollTo(0, 0);
  }

  function goStep(index) {
    if (index > maxReached) return;
    setStep(index);
    window.scrollTo(0, 0);
  }

  async function handleSave() {
    await runGuarded("save", async () => {
      const saved = await ensureDraft();
      if (form.sale_type === "AUCTION") await ensureAuctionRow(saved.id);
      await reloadImages(saved.id);
      setBanner({ ok: `Draft saved (${saved.status}).` });
    });
  }

  async function handleSubmit() {
    const saved = await runGuarded("submit", async () => {
      const current = await ensureDraft();
      if (form.sale_type === "AUCTION") await ensureAuctionRow(current.id);
      const submitted = await submitListing(authFetch, current.id);
      setDraft(submitted);
      return submitted;
    });
    if (saved) {
      setBanner({
        ok: `Your listing is live — “${saved.title}” is now ACTIVE and visible to buyers.`,
      });
      await loadDash(statusFilter);
    }
  }

  async function handleImageAdd(body) {
    if (!draft) return false;
    const created = await runGuarded("images", async () => {
      await addImageRef(authFetch, draft.id, body);
      await reloadImages(draft.id);
      return true;
    });
    return created === true;
  }

  async function handleImageUpdate(imageId, body) {
    if (!draft) return false;
    const updated = await runGuarded("images", async () => {
      await updateImageRef(authFetch, draft.id, imageId, body);
      await reloadImages(draft.id);
      return true;
    });
    return updated === true;
  }

  async function handleImageDelete(imageId) {
    if (!draft) return;
    await runGuarded("images", async () => {
      await deleteImageRef(authFetch, draft.id, imageId);
      await reloadImages(draft.id);
    });
  }

  async function handleSubmitDirect(item) {
    setBusyId(item.id);
    setBanner(null);
    try {
      const published = await submitListing(authFetch, item.id);
      setBanner({ ok: `“${published.title ?? item.title}” is now live and visible to buyers.` });
      await loadDash(statusFilter);
    } catch (error) {
      setBanner({ error: describeSellerError(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(item) {
    setBusyId(item.id);
    setBanner(null);
    try {
      await updateListing(authFetch, item.id, { status: "ARCHIVED" });
      setBanner({ ok: `“${item.title}” archived.` });
      await loadDash(statusFilter);
    } catch (error) {
      setBanner({ error: describeSellerError(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="content sell-page">
      <div className="sell-head">
        <div>
          <p className="eyebrow">Seller hub</p>
          <h1>{mode === "wizard" ? "Create a listing" : "Sell"}</h1>
        </div>
        {mode === "wizard" && (
          <button type="button" className="btn btn-ghost" onClick={() => setMode("dashboard")}>
            ← My listings
          </button>
        )}
      </div>

      {banner?.error && (
        <p className="form-error" role="alert">
          {banner.error}
        </p>
      )}
      {banner?.ok && (
        <p className="form-ok" role="status">
          {banner.ok}
        </p>
      )}

      {mode === "dashboard" ? (
        <SellerDashboard
          items={dash.items}
          total={dash.total}
          loading={dash.loading}
          error={dash.error}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          onRetry={() => loadDash(statusFilter)}
          onNew={startNew}
          onEdit={startEdit}
          onSubmitDirect={handleSubmitDirect}
          onArchive={handleArchive}
          onView={(item) => {
            window.location.hash = `#/listing/${item.id}`;
          }}
          busyId={busyId}
        />
      ) : (
        <div className="sell-layout">
          <div className="sell-main">
            <StepIndicator step={step} maxReached={maxReached} onGo={goStep} />
            {step === 0 && (
              <BasicsStep form={form} errors={stepErrors} categories={categories} onChange={updateField} />
            )}
            {step === 1 && (
              <SaleStep form={form} errors={stepErrors} lockedSaleType={Boolean(draft)} onChange={updateField} />
            )}
            {step === 2 && (
              <ImagesStep
                draftId={draft?.id ?? null}
                images={images}
                busy={busy === "images" || busy === "draft"}
                onEnsureDraft={() =>
                  runGuarded("draft", async () => {
                    const saved = await ensureDraft();
                    await reloadImages(saved.id);
                  })
                }
                onAdd={handleImageAdd}
                onUpdate={handleImageUpdate}
                onDelete={handleImageDelete}
              />
            )}
            {step === 3 && (
              <PreviewStep
                form={form}
                categoryName={categoryName}
                images={images}
                busy={busy === "save" || busy === "submit"}
                submitState={null}
                onSave={handleSave}
                onSubmit={handleSubmit}
              />
            )}
            <div className="sell-nav">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={step === 0 || busy != null}
                onClick={() => goStep(step - 1)}
              >
                ← Back
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy != null}
                  onClick={goContinue}
                >
                  {busy ? "Working…" : "Continue →"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy != null}
                  onClick={handleSave}
                >
                  {busy === "save" ? "Saving…" : "Save Draft"}
                </button>
              )}
            </div>
          </div>
          <aside className="sell-side" aria-label="Selling progress">
            <div className="sell-side-card">
              <h2>How it works</h2>
              <ol>
                <li>Describe the item and pick a category.</li>
                <li>Set a fixed price or auction terms.</li>
                <li>Attach image references.</li>
                <li>Preview, save a draft, then publish — it goes live immediately.</li>
              </ol>
              <p className="muted small">
                {draft
                  ? `Draft ${draft.status} — edits are saved explicitly.`
                  : "Nothing is created until you save a draft."}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
