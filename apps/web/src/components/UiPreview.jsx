/**
 * CE visual-foundation sign-off page (private preview, excluded from nav).
 * Renders every Step-1 primitive: type, tokens, buttons, fields, cards,
 * pills, modal/sheet, tabs, table, skeleton/empty/error/notice, price,
 * countdown. Route: #/ui-preview.
 */

import { useState } from "react";

import Button from "./ui/Button.jsx";
import Card from "./ui/Card.jsx";
import Countdown from "./ui/Countdown.jsx";
import DataTable from "./ui/DataTable.jsx";
import Field from "./ui/Field.jsx";
import Modal from "./ui/Modal.jsx";
import Pill from "./ui/Pill.jsx";
import Price from "./ui/Price.jsx";
import Skeleton from "./ui/Skeleton.jsx";
import { EmptyState, ErrorState, LoadingState, Notice } from "./ui/States.jsx";
import Tabs from "./ui/Tabs.jsx";

const SWATCHES = [
  ["--ce-paper", "#f6f4ee"],
  ["--ce-card", "#fffdf9"],
  ["--ce-well", "#efebe1"],
  ["--ce-brand", "#0b3b39"],
  ["--ce-highlight", "#ffce32"],
  ["--ce-success", "#0c6b3f"],
  ["--ce-warning", "#b45309"],
  ["--ce-danger", "#b3261e"],
  ["--ce-auction", "#5a2ea6"],
];

const STATUSES = [
  "ACTIVE", "PENDING_PAYMENT", "RESERVED", "SHIPPED", "DELIVERED", "PAID",
  "AWAITING_CHECKOUT", "OPEN", "IN_PROGRESS", "UNDER_REVIEW", "RESOLVED",
  "CANCELLED", "REMOVED", "AUCTION", "LIVE", "ENDING", "NO_BIDS",
];

export default function UiPreview() {
  const [tab, setTab] = useState("one");
  const [modalOpen, setModalOpen] = useState(false);
  const soon = new Date(Date.now() + 90 * 60 * 1000).toISOString();

  return (
    <div className="ce-scope">
      <div className="ce-container ce-preview">
        <header className="ce-stack">
          <p className="ce-micro">Curated Exchange · Step 1 foundation</p>
          <h1 className="ce-display">Design system preview</h1>
          <p className="ce-body ce-muted">
            Private sign-off artifact for the Step-2+ recompositions. Not
            linked from site navigation.
          </p>
        </header>

        <section className="ce-stack" aria-label="Typography">
          <h2 className="ce-h2">Typography</h2>
          <Card>
            <p className="ce-display">Display serif 123</p>
            <h3 className="ce-h1">H1 title example</h3>
            <h3 className="ce-h2">H2 section example</h3>
            <h4 className="ce-h3">H3 block example</h4>
            <p className="ce-body">Body copy with a <span className="ce-tnum">₹42,000 tabular price</span>.</p>
            <p className="ce-small ce-muted">Small muted meta line.</p>
          </Card>
        </section>

        <section className="ce-stack" aria-label="Tokens">
          <h2 className="ce-h2">Tokens</h2>
          <div className="ce-preview-grid">
            {SWATCHES.map(([name, hex]) => (
              <Card key={name} pad="sm">
                <div className="ce-swatch" style={{ background: hex }} />
                <p className="ce-small"><code>{name}</code></p>
                <p className="ce-small ce-muted ce-tnum">{hex}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="ce-stack" aria-label="Buttons">
          <h2 className="ce-h2">Buttons</h2>
          <Card pad="sm">
            <div className="ce-stack">
              <div>
                <p className="ce-micro">Default</p>
                <div className="ce-preview-row">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>
              <div>
                <p className="ce-micro">Small</p>
                <div className="ce-preview-row">
                  <Button variant="primary" size="sm">Primary</Button>
                  <Button variant="secondary" size="sm">Secondary</Button>
                  <Button variant="ghost" size="sm">Ghost</Button>
                  <Button variant="danger" size="sm">Danger</Button>
                </div>
              </div>
              <div>
                <p className="ce-micro">Disabled</p>
                <div className="ce-preview-row">
                  <Button variant="primary" disabled>Primary</Button>
                  <Button variant="secondary" disabled>Secondary</Button>
                  <Button variant="ghost" disabled>Ghost</Button>
                  <Button variant="danger" disabled>Danger</Button>
                </div>
              </div>
              <div>
                <p className="ce-micro">Block</p>
                <Button variant="primary" block>Full-width primary</Button>
              </div>
              <div>
                <p className="ce-micro">Dialog pair</p>
                <div className="ce-modal-actions">
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="primary">Confirm</Button>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="ce-stack" aria-label="Fields">
          <h2 className="ce-h2">Fields</h2>
          <Card pad="sm">
            <form className="ce-form" onSubmit={(e) => e.preventDefault()}>
              <Field label="Offer amount (₹)" hint="Whole rupees or paise, e.g. 20000.50">
                {(props) => <input inputMode="decimal" placeholder="e.g. 20000" aria-describedby={props.describedBy} />}
              </Field>
              <Field label="Reason" error="Choose a reason for the report.">
                {(props) => (
                  <select aria-describedby={props.describedBy} aria-invalid={props.invalid} defaultValue="">
                    <option value="">Select a reason…</option>
                    <option value="SPAM">SPAM</option>
                  </select>
                )}
              </Field>
            </form>
          </Card>
        </section>

        <section className="ce-stack" aria-label="Cards and pills">
          <h2 className="ce-h2">Cards + pills</h2>
          <div className="ce-preview-grid">
            <Card><h3 className="ce-h3">Standard card</h3><p className="ce-small ce-muted">Hairline, subtle shadow.</p></Card>
            <Card variant="soft"><h3 className="ce-h3">Soft card</h3></Card>
            <Card variant="warm"><h3 className="ce-h3">Warm card</h3></Card>
          </div>
          <div className="ce-preview-row">
            {STATUSES.map((s) => (
              <Pill key={s} status={s} />
            ))}
          </div>
        </section>

        <section className="ce-stack" aria-label="Modal">
          <h2 className="ce-h2">Modal / sheet</h2>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open dialog
          </Button>
          {modalOpen ? (
            <Modal label="Preview dialog" onClose={() => setModalOpen(false)}>
              <h2>Preview dialog</h2>
              <p className="ce-small ce-muted">Focus is trapped; Escape closes; ≤640px becomes a sheet.</p>
              <div className="ce-modal-actions">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Done</Button>
              </div>
            </Modal>
          ) : null}
        </section>

        <section className="ce-stack" aria-label="Tabs">
          <h2 className="ce-h2">Tabs</h2>
          <Tabs
            label="Preview tabs"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "one", label: "Sent" },
              { id: "two", label: "Received" },
            ]}
          />
          <p className="ce-small ce-muted">Active: {tab} (arrow keys move, roving tabindex).</p>
        </section>

        <section className="ce-stack" aria-label="Table">
          <h2 className="ce-h2">Table</h2>
          <DataTable
            caption="Preview bids"
            columns={[
              { key: "bidder", label: "Bidder" },
              { key: "amount", label: "Amount", numeric: true },
              { key: "when", label: "Placed" },
            ]}
            rows={[
              { bidder: "Aarav", amount: "₹42,000", when: "2m ago" },
              { bidder: "Meera", amount: "₹41,000", when: "9m ago" },
            ]}
          />
        </section>

        <section className="ce-stack" aria-label="States">
          <h2 className="ce-h2">Skeleton / loading / empty / error / notice</h2>
          <Card pad="sm">
            <div className="ce-stack">
              <Skeleton width="60%" />
              <Skeleton width="40%" />
              <LoadingState label="Loading listings…" />
              <EmptyState title="No results" hint="Try clearing filters." action={<Button variant="secondary" size="sm">Clear filters</Button>} />
              <ErrorState message="Could not load. (500)" />
              <Notice tone="warning">Auction ends soon — reserve not met.</Notice>
            </div>
          </Card>
        </section>

        <section className="ce-stack" aria-label="Commerce">
          <h2 className="ce-h2">Price + countdown</h2>
          <Card pad="sm">
            <Price minor={4200000} note="Current bid" size="lg" />
            <Countdown endsAt={soon} />
          </Card>
        </section>
      </div>
    </div>
  );
}
