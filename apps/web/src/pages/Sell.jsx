import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import {
  createAuction,
  createListing,
  deleteImageRef,
  listImageRefs,
  submitListing,
  updateImageRef,
  updateListing,
  uploadImage,
} from "../api/seller.js";
import AddPhotosSection from "../components/sell/AddPhotosSection.jsx";
import ItemDetailsForm from "../components/sell/ItemDetailsForm.jsx";
import ListingRequirements from "../components/sell/ListingRequirements.jsx";
import PreviewStep from "../components/sell/PreviewStep.jsx";
import SellActions from "../components/sell/SellActions.jsx";
import SellStepper from "../components/sell/SellStepper.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import { EmptyState, Notice } from "../components/ui/States.jsx";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PHOTOS,
  auctionCreateBody,
  listingCreateBody,
  listingPatchBody,
  validateBasics,
  validateSale,
} from "../components/sell/shared.js";

const ACCEPT_HINT = IMAGE_TYPES.map((type) => type.split("/")[1].toUpperCase()).join(", ");
const MAX_MB = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);

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
    duration_days: "",
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

/**
 * Sell Item page: Add Details → Photos → Preview → Publish.
 * Form state lives here; child components are props-driven so the same
 * data flows unchanged into the API body builders (sell/shared.js).
 * Backend stays authoritative; image storage and auction APIs are
 * consumed through api/seller.js (provider-agnostic REST).
 */
export default function SellPage({ authFetch, categories, isAuthenticated, onRequireLogin }) {
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [stepErrors, setStepErrors] = useState({});
  const [draft, setDraft] = useState(null);
  const [images, setImages] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);
  const [banner, setBanner] = useState(null);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const dirtyRef = useRef(false);
  const publishedRef = useRef(false);
  const pendingUrls = useRef([]);

  const categoryName = useMemo(
    () => categories.find((cat) => String(cat.id) === String(form.category_id))?.name ?? "—",
    [categories, form.category_id],
  );

  // Warn before refresh/tab-close with unsaved changes.
  useEffect(() => {
    function onBeforeUnload(event) {
      if (dirtyRef.current && !publishedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Revoke leftover local preview URLs on unmount.
  useEffect(
    () => () => {
      pendingUrls.current.forEach((url) => URL.revokeObjectURL(url));
      pendingUrls.current = [];
    },
    [],
  );

  async function reloadImages(draftId) {
    try {
      const rows = await listImageRefs(authFetch, draftId);
      setImages(Array.isArray(rows) ? rows : []);
    } catch {
      setImages([]);
    }
  }

  // Keep the preview selection on an existing image (cover by default).
  useEffect(() => {
    if (images.length === 0) {
      setSelectedImageId(null);
      return;
    }
    if (!images.some((img) => img.id === selectedImageId)) {
      const ordered = [...images].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)),
      );
      const cover = ordered.find((img) => img.is_primary) ?? ordered[0];
      setSelectedImageId(cover?.id ?? null);
    }
  }, [images, selectedImageId]);

  if (!isAuthenticated) {
    return (
      <div className="ce-scope">
        <div className="ce-container">
          <EmptyState
            title="Sign in to sell"
            hint="Selling requires an account."
            action={
              <Button variant="primary" onClick={onRequireLogin}>
                Sign In
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  function updateField(key, value) {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
    setStepErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Details-step validation: shared Basics + Sale rules plus required description. */
  function detailsErrors() {
    const errors = { ...validateBasics(form), ...validateSale(form) };
    if ((form.description ?? "").trim().length === 0) {
      errors.description = "Description is required.";
    }
    return errors;
  }

  async function ensureDraft() {
    const errors = detailsErrors();
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

  function goStep(index) {
    if (index > maxReached) return;
    setStep(index);
    window.scrollTo(0, 0);
  }

  function goContinue() {
    // Visual order: 0 Photos → 1 Details → 2 Preview → 3 Publish.
    // Photos needs no validation; Details validates and persists the
    // draft (images need a server id); Preview requires photos.
    if (step === 0) {
      advance(1);
      return;
    }
    if (step === 1) {
      const errors = detailsErrors();
      if (Object.keys(errors).length > 0) {
        setStepErrors(errors);
        return;
      }
      runGuarded("draft", async () => {
        const saved = await ensureDraft();
        if (form.sale_type === "AUCTION") await ensureAuctionRow(saved.id);
        await reloadImages(saved.id);
        advance(2);
      });
      return;
    }
    if (step === 2) {
      if (images.length === 0) {
        setBanner({ error: "Add at least one photo before publishing." });
        return;
      }
      advance(3);
    }
  }

  function advance(next) {
    setStep(next);
    setMaxReached((max) => Math.max(max, next));
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
      dirtyRef.current = false;
      publishedRef.current = true;
      setBanner({
        ok: `Your listing is live — “${saved.title}” is now ACTIVE and visible to buyers.`,
      });
    }
  }

  function handleBackToMarketplace() {
    if (dirtyRef.current && !publishedRef.current) {
      const ok = window.confirm("Leave without saving? Your entered details will be lost.");
      if (!ok) return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = "#/buy";
    }
  }

  function checkFile(file) {
    if (file.type && !IMAGE_TYPES.includes(file.type)) {
      return `“${file.name}” is not supported. Allowed: ${ACCEPT_HINT}.`;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return `“${file.name}” must be smaller than ${MAX_MB}MB.`;
    }
    return null;
  }

  async function updatePhoto(imageId, body) {
    if (!draft) return false;
    const updated = await runGuarded("images", async () => {
      await updateImageRef(authFetch, draft.id, imageId, body);
      await reloadImages(draft.id);
      return true;
    });
    return updated === true;
  }

  async function uploadPhoto(file) {
    if (!draft) return false;
    const created = await runGuarded("images", async () => {
      await uploadImage(authFetch, draft.id, file, {});
      await reloadImages(draft.id);
      return true;
    });
    return created === true;
  }

  async function handleFiles(files) {
    const list = Array.from(files ?? []).filter((item) => item instanceof File);
    if (list.length === 0) return;
    if (!draft) {
      setBanner({ error: "Save your details first — photos attach to a saved draft." });
      return;
    }
    const room = MAX_PHOTOS - images.length - pending.length;
    if (room <= 0) {
      setBanner({ error: `Maximum ${MAX_PHOTOS} photos per listing. Remove one to add another.` });
      return;
    }
    const accepted = list.slice(0, room);
    if (list.length > room) {
      setBanner({ error: `Only ${room} more photo${room === 1 ? "" : "s"} fit (maximum ${MAX_PHOTOS}).` });
    } else {
      setBanner(null);
    }
    let failed = 0;
    for (const file of accepted) {
      const problem = checkFile(file);
      if (problem) {
        setBanner({ error: problem });
        continue;
      }
      const url = URL.createObjectURL(file);
      pendingUrls.current.push(url);
      const key = `${url}`;
      setPending((prev) => [...prev, { key, url, name: file.name }]);
      dirtyRef.current = true;
      const ok = await uploadPhoto(file);
      setPending((prev) => prev.filter((item) => item.key !== key));
      pendingUrls.current = pendingUrls.current.filter((item) => item !== url);
      URL.revokeObjectURL(url);
      if (!ok) failed += 1;
    }
    if (failed > 0) {
      setBanner({ error: `${failed} photo${failed === 1 ? "" : "s"} could not be uploaded. Check the notice above and retry.` });
    }
  }

  async function handleDeletePhoto(imageId) {
    if (!draft) return;
    await runGuarded("images", async () => {
      await deleteImageRef(authFetch, draft.id, imageId);
      await reloadImages(draft.id);
    });
  }

  const detailsInvalid = Object.keys(detailsErrors()).length > 0;
  const photosInvalid = images.length === 0;

  return (
    <div className="ce-scope sell-item">
      <div className="sell-item-body ce-stack">
        <div className="sell-item-head">
          <div>
            <h1 className="ce-h1">Sell an Item</h1>
            <p className="ce-muted">
              {step === 0 ? "Add photos of your item" : "List your item in just a few steps"}
            </p>
          </div>
        </div>

        {banner?.error && (
          <Notice tone="error">{banner.error}</Notice>
        )}
        {banner?.ok && (
          <Notice>{banner.ok}</Notice>
        )}

        <div className="sell-item-main sell-item-main--full">
            {step === 0 && (
              <>
                <AddPhotosSection
                  draftReady={Boolean(draft)}
                  imageCount={images.length}
                  hasPhoto={images.length > 0}
                  busy={busy != null}
                  previewProps={{
                    listingId: draft?.id ?? null,
                    images,
                    selectedId: selectedImageId,
                    onSelect: setSelectedImageId,
                    onSetCover: (id) => updatePhoto(id, { is_primary: true }),
                    onRemove: handleDeletePhoto,
                  }}
                  onFiles={handleFiles}
                  onGoDetails={() => goStep(1)}
                />
                <SellStepper step={step} maxReached={maxReached} onGo={goStep} />
                <div className="sell-bottom-actions">
                  <Button
                    variant="ghost"
                    className="sell-cancel-btn"
                    disabled={busy != null}
                    onClick={handleBackToMarketplace}
                  >
                    CANCEL
                  </Button>
                  <Button
                    variant="primary"
                    className="sell-next-btn"
                    disabled={photosInvalid || busy != null}
                    onClick={goContinue}
                  >
                    {busy ? "Working…" : "NEXT →"}
                  </Button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Card>
                  <h2 className="ce-h2">Item Details</h2>
                  <p className="ce-muted">
                    Tell buyers what you are selling. Fields marked * are required.
                  </p>
                  {categories.length === 0 && (
                    <p className="ce-hint">Loading categories…</p>
                  )}
                  <ItemDetailsForm
                    form={form}
                    errors={stepErrors}
                    categories={categories}
                    lockedSaleType={Boolean(draft)}
                    onChange={updateField}
                  />
                </Card>
                <SellStepper step={step} maxReached={maxReached} onGo={goStep} />
                <SellActions
                  onBack={() => goStep(0)}
                  onNext={goContinue}
                  nextLabel="Next: Preview →"
                  nextDisabled={detailsInvalid}
                  busy={busy != null}
                />
              </>
            )}

            {step === 2 && (
              <>
                <Card>
                  <h2 className="ce-h2">Preview</h2>
                  <p className="ce-muted">
                    This is how buyers will see your listing.
                  </p>
                  <PreviewStep
                    form={form}
                    categoryName={categoryName}
                    images={images}
                    listingId={draft?.id ?? null}
                    busy={busy === "save" || busy === "submit"}
                    submitState={null}
                    onSave={handleSave}
                    onSubmit={handleSubmit}
                  />
                </Card>
                <SellStepper step={step} maxReached={maxReached} onGo={goStep} />
                <SellActions
                  onBack={() => goStep(1)}
                  onNext={goContinue}
                  nextLabel="Next: Publish →"
                  busy={busy != null}
                />
              </>
            )}

            {step === 3 && (
              <>
                <Card>
                  <h2 className="ce-h2">Publish</h2>
                  <p className="ce-muted">
                    Publishing makes the listing live immediately — buyers can see and purchase it right away.
                  </p>
                  <ListingRequirements form={form} images={images} />
                </Card>
                <SellStepper step={step} maxReached={maxReached} onGo={goStep} />
                <div className="sell-actions sell-actions--publish">
                  <Button variant="ghost" disabled={busy != null} onClick={() => goStep(2)}>
                    ← Back
                  </Button>
                  <span className="sell-actions-group">
                    <Button variant="secondary" disabled={busy != null} onClick={handleSave}>
                      {busy === "save" ? "Saving…" : "Save Draft"}
                    </Button>
                    <Button
                      variant="primary"
                      className="sell-publish-btn"
                      disabled={detailsInvalid || photosInvalid || busy != null}
                      onClick={handleSubmit}
                    >
                      {busy === "submit" ? "Publishing…" : draft?.status === "ACTIVE" ? "Published ✓" : "Publish Listing"}
                    </Button>
                  </span>
                </div>
                {draft?.status === "ACTIVE" && (
                  <p className="ce-small">
                    <a href={`#/listing/${draft.id}`}>View your live listing →</a>
                  </p>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
