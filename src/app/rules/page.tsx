import Link from 'next/link';
import { VARIATION_LIST } from '@/engine/variations';

export const metadata = { title: 'Rules · Private Teen Patti' };

export default function Rules() {
  return (
    <main className="mx-auto max-w-md space-y-4 px-5 py-10 text-sm leading-relaxed text-paper/90">
      <Link href="/" className="text-gold underline">← Back</Link>
      <h1 className="font-display text-3xl text-gold">How to play</h1>
      <p>Each player gets three cards. Everyone pays the <b>boot</b> into the pot, then players take turns to bet, pack (fold), request a sideshow or ask for a show. The last player left, or the better hand at a show, wins the pot.</p>
      <h2 className="font-display text-xl text-gold-soft">Hand ranking (high to low)</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li><b>Trail</b> – three of a kind (A-A-A best)</li>
        <li><b>Pure sequence</b> – straight flush (A-K-Q best; A-2-3 ranks just below it by default)</li>
        <li><b>Sequence</b> – straight of mixed suits</li>
        <li><b>Color</b> – three cards of one suit</li>
        <li><b>Pair</b> – then the kicker decides</li>
        <li><b>High card</b></li>
      </ol>
      <p>Suits never break ties. Exactly equal hands follow the table’s tie rule (by default the player who asked for the show loses).</p>
      <h2 className="font-display text-xl text-gold-soft">Betting</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>The <b>stake</b> starts at the boot. A <b>blind</b> player (hasn’t looked) pays the stake; a <b>seen</b> player pays <b>double</b>.</li>
        <li>Doubling a bet (“×2”) doubles the stake for everyone, up to the table maximum.</li>
        <li>You can look at your cards at any time; you then play as seen.</li>
        <li>You can never bet more than you have. If you can’t afford any bet you’re packed automatically; you can top up between rounds.</li>
        <li><b>Show</b> – with exactly two players left, either may pay one chaal to compare hands. <b>Sideshow</b> – a seen player may pay a chaal and ask the previous (seen) player to compare hands privately; the weaker hand packs.</li>
        <li>Each turn lasts a set time (45s by default). Run out of time and you are packed.</li>
      </ul>
      <h2 className="font-display text-xl text-gold-soft">Variations</h2>
      <ul className="space-y-2">
        {VARIATION_LIST.map((v) => (
          <li key={v.id}><b className="text-gold-soft">{v.name}</b> – {v.description}</li>
        ))}
      </ul>
      <p className="text-muted">Chips are virtual and have no monetary value.</p>
    </main>
  );
}
