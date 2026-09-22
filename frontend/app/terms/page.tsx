import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { LegalPage, Clause, List, Callout } from '@/components/Legal';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Use — HoodPoker',
  description:
    'The rules for playing HoodPoker: eligibility, fair play, virtual chips, and the limits of what we promise.',
  path: '/terms/',
});

export default function TermsPage() {
  return (
    <LegalPage
      current="/terms/"
      eyebrow="05 — Terms of use"
      title="Terms of use"
      intro={
        <>
          The rules of the house. Short version: it is a free game, play it straight, and
          do not expect guarantees from a hobby project.
        </>
      }
    >
      <Clause n={1} title="Agreeing to these terms">
        <p>
          By opening HoodPoker, connecting a wallet, taking a seat or watching a table, you
          agree to these terms, to our{' '}
          <Link href="/privacy/" className="text-acid underline underline-offset-4">
            Privacy Policy
          </Link>{' '}
          and to the{' '}
          <Link href="/disclaimer/" className="text-acid underline underline-offset-4">
            Disclaimer
          </Link>
          . If you do not agree, do not use the site.
        </p>
      </Clause>

      <Clause n={2} title="Who can play">
        <List
          items={[
            'You must be 18 or older.',
            'You must be legally able to agree to these terms where you live.',
            'You must not be barred from using the site by any applicable law or sanctions programme.',
            'You are responsible for checking your own local law before playing.',
          ]}
        />
      </Clause>

      <Clause n={3} title="What HoodPoker is">
        <p>
          A free multiplayer Texas Hold&rsquo;em game played with virtual chips. Public tables
          deal at four seated players; private tables are sized by their host between two and
          eight seats. There is no buy-in and no payout of any kind — see the{' '}
          <Link href="/disclaimer/" className="text-acid underline underline-offset-4">
            Disclaimer
          </Link>{' '}
          for the full statement.
        </p>
      </Clause>

      <Clause n={4} title="Your wallet is your account">
        <p>
          There is no signup, no password and no account recovery. Your identity is the wallet
          address you connect, and a Sign-In with Ethereum signature proves you control it for
          the next 24 hours. That signature costs no gas, moves no funds and grants no token
          approvals.
        </p>
        <List
          items={[
            'You are responsible for the security of your wallet, its keys and its seed phrase. We can never recover them and will never ask for them.',
            'Anyone who can sign with your address can play as you. Lose the wallet and you lose the stack and the stats attached to it.',
            'Do not share a private table link with anyone you would not seat at the table.',
          ]}
        />
        <Callout>
          HoodPoker will never ask you to approve a token, send a transaction, or sign
          anything other than the plain-text sign-in message shown in your wallet &mdash; and
          that message always names the site you are on. If the domain your wallet shows
          isn&rsquo;t the one in your address bar, don&rsquo;t sign. Anything else claiming to be
          us is not us.
        </Callout>
      </Clause>

      <Clause n={5} title="Handles and avatars">
        <p>
          Your display name comes from a hoodfi.eth subname or ENS name you control, and your
          avatar from that name&rsquo;s avatar record. We re-check ownership periodically. If a
          name moves to someone else, the handle follows the name, not you.
        </p>
        <p>
          We may hide or replace any handle or avatar that is impersonating someone, hateful,
          sexual, or otherwise abusive — on a table shared with other people, your name is
          part of the room.
        </p>
      </Clause>

      <Clause n={6} title="Virtual chips">
        <p>
          Chips are a revocable licence to use a number inside the game. They are not your
          property, not a balance you hold, and not redeemable for anything. We may grant,
          adjust, reset or remove them at any time, for any reason, without notice or
          compensation — including clawing back chips gained through a bug or an exploit.
        </p>
      </Clause>

      <Clause n={7} title="Fair play">
        <p>Do not do any of the following:</p>
        <List
          items={[
            'Play with bots, scripts, solvers or any automated assistance.',
            'Collude with other players, share hole card information, or soft-play a confederate.',
            'Chip dump — deliberately losing a stack to another account.',
            'Run multiple accounts at one table, or play a seat on someone else’s behalf.',
            'Exploit a bug rather than reporting it, including anything that reveals cards early or creates chips.',
            'Harass, threaten, impersonate, spam or post hateful content in chat.',
            'Scrape, overload, reverse-engineer for attack, or otherwise interfere with the service or other players’ use of it.',
          ]}
        />
        <p>
          We can remove a player from a table, void a hand, reset a stack, wipe leaderboard
          history or block an address at our discretion. There is no appeals process — it is a
          free card game, not a court.
        </p>
      </Clause>

      <Clause n={8} title="Chat">
        <p>
          Chat is open to everyone connected to a table, seated or watching. Links are
          stripped automatically before a message reaches anyone, while .eth names are kept.
          Messages live in the table&rsquo;s memory only, are capped at the most recent hundred,
          and disappear when the table closes — so treat chat as unlogged and unmoderated in
          real time, and post accordingly. You are responsible for what you send.
        </p>
      </Clause>

      <Clause n={9} title="Private tables">
        <p>
          A private table is controlled by whoever created it: they set the seat count and
          the guest list. Private tables never appear in the public lobby, but a table link
          is a key — anyone holding it who is on the guest list can join. Do not treat a
          private table as a confidential channel.
        </p>
      </Clause>

      <Clause n={10} title="Availability and changes">
        <p>
          We may change, suspend, break or shut down any part of HoodPoker at any time
          without notice, including tables in progress. We may also update these terms; the
          date at the top of this page changes when we do, and continuing to play means you
          accept the current version.
        </p>
      </Clause>

      <Clause n={11} title="Code and content">
        <p>
          The HoodPoker source is published under the MIT licence at{' '}
          <a
            href="https://github.com/RWA-ID/epoker-ens"
            target="_blank"
            rel="noreferrer"
            className="text-acid underline underline-offset-4"
          >
            github.com/RWA-ID/epoker-ens
          </a>{' '}
          and you are free to use it on those terms. The HoodPoker name, wordmark and visual
          design are not covered by that licence — please do not use them to pass off another
          service as this one. Third-party trademarks belong to their owners.
        </p>
      </Clause>

      <Clause n={12} title="Third-party services">
        <p>
          Playing involves services we do not operate: your wallet and its connection
          provider, public RPC endpoints, name services, and the IPFS gateway serving this
          page. Each has its own terms and its own view of your activity, and we are not
          responsible for what they do or for their downtime.
        </p>
      </Clause>

      <Clause n={13} title="No warranty">
        <p>
          HoodPoker is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
          express or implied, including merchantability, fitness for a particular purpose,
          non-infringement, uninterrupted availability, or that the game is free of bugs or
          that any hand will be dealt or settled correctly.
        </p>
      </Clause>

      <Clause n={14} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect,
          incidental, special, consequential or punitive damages, or for any loss of chips,
          stats, standing, data, wallet contents or goodwill, arising from your use of
          HoodPoker. Nothing in these terms limits liability that cannot be limited by law.
        </p>
        <Callout>
          Since HoodPoker is free and nothing of value changes hands, our total liability to
          you for any claim is limited to the amount you have paid us, which is nothing.
        </Callout>
      </Clause>

      <Clause n={15} title="Contact">
        <p>
          Reach us on X at{' '}
          <a
            href="https://x.com/hoodpokercasino"
            target="_blank"
            rel="noreferrer"
            className="text-acid underline underline-offset-4"
          >
            @hoodpokercasino
          </a>{' '}
          or open an issue on{' '}
          <a
            href="https://github.com/RWA-ID/epoker-ens"
            target="_blank"
            rel="noreferrer"
            className="text-acid underline underline-offset-4"
          >
            GitHub
          </a>
          . Bug reports beat exploits.
        </p>
      </Clause>
    </LegalPage>
  );
}
