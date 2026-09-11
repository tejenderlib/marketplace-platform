export default function NotFound() {
  return (
    <div className="content">
      <div className="empty-state not-found">
        <h1>Listing not found</h1>
        <p>This ad may have been removed, or the link is incorrect.</p>
        <a className="btn btn-primary" href="#/">
          Back to listings
        </a>
      </div>
    </div>
  );
}
