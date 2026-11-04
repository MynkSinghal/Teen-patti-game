import Link from 'next/link';

export const metadata = { title: 'Privacy · Private Teen Patti' };

export default function Privacy() {
  return (
    <main className="prose-sm mx-auto max-w-md space-y-4 px-5 py-10 leading-relaxed text-paper/90">
      <Link href="/" className="text-sm text-gold underline">← Back</Link>
      <h1 className="font-display text-3xl text-gold">Privacy</h1>
      <p>Private Teen Patti is a hobby project for friends. It uses <b>virtual chips only</b>: there are no deposits, withdrawals, prizes or real-money play of any kind.</p>
      <h2 className="font-display text-xl text-gold-soft">What we store</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>An anonymous account ID created by Supabase Auth (no email or password). It is kept in your browser so a refresh keeps you at your seat.</li>
        <li>The display name you type, your chip balance and your seat in a room.</li>
        <li>Game events (bets, packs, results) for the rooms you play in.</li>
      </ul>
      <h2 className="font-display text-xl text-gold-soft">What we don’t do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No ads, no analytics trackers, no selling of data.</li>
        <li>Your cards are only ever sent to you. Other players, including the host, cannot read them.</li>
      </ul>
      <h2 className="font-display text-xl text-gold-soft">Retention</h2>
      <p>Rooms expire 12 hours after their last activity and are deleted a day later together with everything attached to them. Clearing your browser data creates a new anonymous identity.</p>
    </main>
  );
}
