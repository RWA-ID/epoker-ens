import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Clause, List, Callout } from '@/components/Legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — HoodPoker',
  description:
    'What HoodPoker stores: a wallet address, a handle and your chip stats. No email, no password, no cookies, no analytics.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/privacy/"
      eyebrow="06 — Privacy"
      title="Privacy policy"
      intro={
        <>
          We never asked for your name, your email or a password, so we do not have them.
          What we do hold is a wallet address, the handle attached to it, and how many
          hands it has won.
        </>
      }
    >
      <Clause n={1} title="The short version">
        <List
          items={[
            'No account, no email address, no password, no payment details — there is nothing to pay.',
            'No cookies, no analytics, no advertising, no third-party trackers or pixels.',
            'We store your wallet address, your chosen handle, your avatar record and your game stats.',
            'Chat is never written to our database. It lives in the table’s memory and dies with the table.',
            'Your wallet address is public by nature. Playing here ties this activity to it, permanently and in public.',
          ]}
        />
      </Clause>

      <Clause n={2} title="What we store, and where">
        <p>
          Our database (Cloudflare D1) holds one row per player, created the first time you
          sit down:
        </p>
        <List
          items={[
            'Your wallet address.',
            'Your handle — the hoodfi.eth subname or ENS name you picked — and a flag recording when we last re-verified that you still own it.',
            'The avatar record published on that name (a URL, not an uploaded image; we never host your picture).',
            'Your chip bankroll, net profit, hands played, hands won and biggest pot.',
            'The timestamp of your last daily chip claim, and when your row was created.',
          ]}
        />
        <p>
          We also store the public tables themselves: an id, a table name, the blind, the
          seat count and a status. Live game state — who is seated, the board, the pot — is
          held in the memory of the running table and is not archived once it closes.
        </p>
      </Clause>

      <Clause n={3} title="Chat is not logged">
        <Callout>
          Chat messages are held only in the running table&rsquo;s memory, capped at the most
          recent hundred, replayed to anyone who joins, and gone for good when the table
          closes. They are never written to our database and we keep no transcript.
        </Callout>
        <p>
          Links are stripped from messages server-side before anyone sees them. Other players
          at the table do see what you type, and nothing stops them keeping their own copy.
        </p>
      </Clause>

      <Clause n={4} title="What your browser keeps">
        <p>
          All of this is stored on your device, not sent to us as a profile, and cleared by
          clearing site data:
        </p>
        <List
          items={[
            'Your sign-in signature, in sessionStorage — it disappears when you close the tab.',
            'Which of your names you chose as a handle, and whether you muted the sounds, in localStorage.',
            'Your wallet connection state, kept by the wallet library in localStorage and IndexedDB.',
          ]}
        />
        <p>
          The Disconnect button clears the cached signature and resets that wallet session
          deliberately, rather than leaving a stale connection behind.
        </p>
      </Clause>

      <Clause n={5} title="Logs and infrastructure">
        <p>
          The game backend runs on Cloudflare Workers, which processes ordinary request
          metadata — including your IP address — as part of delivering and protecting the
          service. We do not build profiles from it, join it to your wallet address, or keep
          our own analytics on top of it.
        </p>
        <p>
          Our fonts are compiled into the site at build time and served from the same origin,
          so loading a page does not call Google Fonts or any other font host.
        </p>
      </Clause>

      <Clause n={6} title="Third parties who see something">
        <List
          items={[
            'Your wallet and its connection provider (Reown / WalletConnect) — they handle the connection and signature request under their own privacy policy.',
            'Public RPC endpoints — used to read names and avatar records; they see the requests and the IP making them.',
            'The IPFS gateway serving this page, such as eth.limo — it sees which pages you load.',
            'Name services — resolving a handle is a public lookup.',
          ]}
        />
        <p>
          We do not sell data, and we have nothing to sell: there is no customer list here.
        </p>
      </Clause>

      <Clause n={7} title="What is public forever">
        <p>
          A wallet address is a public identifier and a blockchain is permanent. If your
          address is linked to a name, a social account or an exchange withdrawal, then your
          presence on our leaderboard can be linked to that too. Play from a fresh address if
          you would rather it were not.
        </p>
        <p>
          The site itself is published to IPFS, which is content-addressed and replicated by
          gateways and pinning services we do not control. Published site files can be copied
          and served by anyone; that applies to the pages, not to your player data.
        </p>
      </Clause>

      <Clause n={8} title="Keeping and deleting it">
        <p>
          Your player row stays until you ask us to remove it. To have it deleted, contact us
          from the address in question — ask on X or open a GitHub issue, and we will remove
          the row and its stats. What we cannot delete is anything already on a public
          blockchain, or a copy of a page held by an IPFS gateway.
        </p>
        <p>
          Depending on where you live you may have further rights over your data, such as
          access or correction. Ask and we will do what we can, which given the size of the
          record above is not much work.
        </p>
      </Clause>

      <Clause n={9} title="Children">
        <p>
          HoodPoker is for adults — see clause 2 of the{' '}
          <Link href="/terms/" className="text-acid underline underline-offset-4">
            Terms
          </Link>
          . We do not knowingly collect anything from anyone under 18, and there is nothing
          to collect beyond a wallet address in any case.
        </p>
      </Clause>

      <Clause n={10} title="Changes and contact">
        <p>
          If this policy changes, the date at the top of the page changes with it. Questions
          go to{' '}
          <a
            href="https://x.com/hoodpokercasino"
            target="_blank"
            rel="noreferrer"
            className="text-acid underline underline-offset-4"
          >
            @hoodpokercasino
          </a>{' '}
          on X, or to an issue on{' '}
          <a
            href="https://github.com/RWA-ID/epoker-ens"
            target="_blank"
            rel="noreferrer"
            className="text-acid underline underline-offset-4"
          >
            GitHub
          </a>
          .
        </p>
      </Clause>
    </LegalPage>
  );
}
