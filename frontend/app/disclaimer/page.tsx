import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Clause, List, Callout } from '@/components/Legal';

export const metadata: Metadata = {
  title: 'Disclaimer — HoodPoker',
  description:
    'HoodPoker is a free play-chip game. No wagering, no payouts, no token, and no affiliation with Robinhood Markets, Inc.',
};

export default function DisclaimerPage() {
  return (
    <LegalPage
      current="/disclaimer/"
      eyebrow="04 — Disclaimer"
      title="Read this first"
      intro={
        <>
          HoodPoker is a free game played with virtual chips. It is not a casino, not a
          sportsbook, and not an investment. Nothing here can be bought, cashed out or
          redeemed for anything of value.
        </>
      }
    >
      <Clause n={1} title="No gambling, no wagering, no payouts">
        <p>
          Playing HoodPoker costs nothing and pays nothing. There is no buy-in, no deposit,
          no rake, no prize pool and no cash-out. Chips are issued free, claimed free, and
          exist only as a number in our database.
        </p>
        <Callout>
          Because no money or anything of value is ever staked and no prize of value can
          ever be won, HoodPoker is intended as a social game rather than gambling. If real-money
          play or games of this kind are restricted where you live, it is your responsibility
          to check your own local law before playing.
        </Callout>
      </Clause>

      <Clause n={2} title="Chips are not currency">
        <List
          items={[
            'Chips have no monetary value and no exchange rate to any currency, token or asset.',
            'Chips cannot be bought, sold, traded, gifted, withdrawn or redeemed.',
            'Chips are not stored on any blockchain. They are rows in our database, not tokens in your wallet.',
            'Balances, the daily claim amount and the leaderboard may be adjusted, reset or wiped at any time — including at the end of a season or after an exploit.',
          ]}
        />
      </Clause>

      <Clause n={3} title="There is no HoodPoker token">
        <p>
          There is no token, no coin, no NFT, no presale, no allocation, no airdrop and no
          holding requirement. We have never sold one and we are not planning one. Your
          leaderboard position confers no claim on anything.
        </p>
        <Callout>
          If you see a HoodPoker token, presale, giveaway or &ldquo;claim&rdquo; page anywhere, it is
          a scam and it is not us. Never sign a transaction or approval to claim HoodPoker
          chips — the game never asks for one.
        </Callout>
      </Clause>

      <Clause n={4} title="Not affiliated with Robinhood">
        <p>
          HoodPoker is an independent community project. It is not affiliated with, endorsed
          by, sponsored by or connected to Robinhood Markets, Inc. or any of its subsidiaries.
          The game runs on Robinhood Chain, a public network; referring to the network it runs
          on does not imply any relationship with its operators. All trademarks belong to
          their respective owners.
        </p>
      </Clause>

      <Clause n={5} title="Not financial advice">
        <p>
          Nothing on this site is financial, investment, legal or tax advice, an offer, or a
          solicitation to buy or sell anything. Connecting a wallet to play a free card game
          is not an investment decision, and we make no recommendation about any asset,
          network or name service mentioned here.
        </p>
      </Clause>

      <Clause n={6} title="Experimental software, provided as-is">
        <p>
          HoodPoker is a hobby project built in the open. It may contain bugs, may lose hands
          or balances, may be taken offline without notice, and may be discontinued entirely.
          It is provided without warranty of any kind. Do not treat your chip stack, your
          stats or your table as durable.
        </p>
        <p>
          The frontend is published to IPFS and served through public gateways we do not
          control. A gateway can be slow, stale or unavailable independently of the game
          itself. The source is public under the MIT licence, so you can always read exactly
          what the client does.
        </p>
      </Clause>

      <Clause n={7} title="On fairness">
        <p>
          Hole cards are dealt and held server-side and revealed only at showdown. Shuffles
          use the runtime&rsquo;s cryptographic random number generator, and every bet, side pot
          and payout is settled by the server rather than by your browser.
        </p>
        <p>
          That said: the shuffle is not independently audited, not certified by any gaming
          authority, and not provably fair in the cryptographic sense — there is no
          commit-reveal scheme you can verify after the fact. You are trusting the server.
          Since nothing of value is at stake, we think that is a reasonable trade; if it is
          not a trade you want to make, the code is public and so is the door.
        </p>
      </Clause>

      <Clause n={8} title="Play sensibly">
        <p>
          HoodPoker is for adults and it is meant to be fun. Free-chip poker can still eat an
          evening, and practising with chips that cost nothing is not preparation for playing
          with money that does. Take breaks. If gambling is or has been a problem for you,
          consider whether a poker table — even one with nothing at stake — is somewhere you
          want to spend time, and seek support from a qualified service in your country.
        </p>
      </Clause>

      <Clause n={9} title="Questions">
        <p>
          This disclaimer sits alongside our{' '}
          <Link href="/terms/" className="text-acid underline underline-offset-4">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy/" className="text-acid underline underline-offset-4">
            Privacy Policy
          </Link>
          . Reach us on X at{' '}
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
          .
        </p>
      </Clause>
    </LegalPage>
  );
}
