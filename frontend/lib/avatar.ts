/**
 * Turning a raw ENS `avatar` text record into something an <img> can show.
 *
 * Deliberately NOT viem's `getEnsAvatar`. Measured against real hoodfi names
 * that do have avatar records:
 *
 *   getEnsText(name, 'avatar')  ->  "ipfs://Qm…"   in 1.8–5.0s
 *   getEnsAvatar(name)          ->  null           after 29.6s
 *
 * `getEnsAvatar` resolves the ipfs:// URI through a public gateway before
 * returning, and that gateway times out on pins it has no reason to hold — so
 * the names *with* avatars are exactly the ones that render blank, slowly. We
 * read the raw record and do the gateway work ourselves.
 *
 * Our dedicated gateway serves what we pinned in ~1s but 403s foreign CIDs, so
 * this returns an ordered candidate list rather than one URL: the consumer
 * advances on error. See <Avatar> for the render side.
 */

const OUR_GATEWAY = 'https://ipfs.onchain-id.id/ipfs/';
const PUBLIC_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Ordered URLs to try for one avatar record.
 *
 * `size` asks our Pinata gateway to resize on the way out — an unresized
 * record is routinely 10–30x the bytes the pixels need. The public gateway
 * has no such parameter, so it only ever gets the bare CID.
 */
export function avatarUrls(record: string | null | undefined, size = 96): string[] {
  const value = record?.trim();
  if (!value) return [];

  if (value.startsWith('ipfs://')) {
    const cid = value.slice('ipfs://'.length).replace(/^ipfs\//, '');
    if (!cid) return [];
    const q = `?img-width=${size}&img-height=${size}&img-fit=cover&img-format=png`;
    return [`${OUR_GATEWAY}${cid}${q}`, `${PUBLIC_GATEWAY}${cid}`];
  }

  // eip155 NFT-reference avatars need a token lookup we deliberately don't do
  // here — it is another multi-second round trip for a 40px circle.
  if (value.startsWith('eip155:')) return [];

  if (value.startsWith('http://') || value.startsWith('https://')) return [value];

  return [];
}
