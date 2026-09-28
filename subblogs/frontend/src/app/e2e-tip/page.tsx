import NibgateTip from '@/components/NibgateTip';
import { NibgateTipCard } from '@nibgate/wallet/react';

// E2E-only harness (not linked anywhere): renders the tip surfaces against
// fixture data so Playwright can assert + screenshot them without a wallet.
export default function E2ETipPage() {
  const resource = { id: 'e2e', title: 'E2E Tip Post', type: 'writing', price: '0.5', path: '/e2e' };
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1>E2E Tip Harness</h1>
      <section data-testid="tip-card-funded">
        <NibgateTipCard
          resource={resource}
          recipient="0x7e27afba45d880ba94b0c08efd1523d2dee627fe"
          amounts={[0.25, 1, 5]}
          apiBase="http://localhost:3005"
        />
      </section>
      <section data-testid="tip-card-site">
        <NibgateTip resource={resource} />
      </section>
    </main>
  );
}
