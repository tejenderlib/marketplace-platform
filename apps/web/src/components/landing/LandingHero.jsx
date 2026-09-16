import { BuyerPanel, SellerPanel } from "./Panels.jsx";
import EnterButton from "./EnterButton.jsx";

export default function LandingHero() {
  return (
    <section className="lp-hero" aria-label="Buy and sell introduction">
      <BuyerPanel />
      <span className="lp-divide" aria-hidden="true" />
      <SellerPanel />
      <EnterButton />
    </section>
  );
}
