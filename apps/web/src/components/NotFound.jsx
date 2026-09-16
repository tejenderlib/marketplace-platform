import Button from "./ui/Button.jsx";
import { EmptyState } from "./ui/States.jsx";

export default function NotFound() {
  return (
    <EmptyState
      title="Listing not found"
      hint="This ad may have been removed, or the link is incorrect."
      action={
        <Button variant="primary" href="#/">
          Back to listings
        </Button>
      }
    />
  );
}
