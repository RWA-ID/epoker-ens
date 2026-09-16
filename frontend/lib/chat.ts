/**
 * MIRROR of worker/src/chat.ts — keep the two in sync.
 *
 * The worker is authoritative; this copy exists so the sender sees the same
 * result everyone else will, instead of watching their link vanish after a
 * round trip.
 */

/** Common TLDs a spam link would actually use. Deliberately not exhaustive. */
const BLOCKED_TLDS = [
  'com', 'net', 'org', 'io', 'co', 'xyz', 'app', 'dev', 'me', 'gg', 'tv',
  'link', 'live', 'online', 'site', 'shop', 'store', 'club', 'fun', 'top',
  'info', 'biz', 'ru', 'cn', 'uk', 'de', 'fr', 'nl', 'ly', 'to', 'cc', 'ws',
  'finance', 'exchange', 'wallet', 'claim', 'gift', 'win', 'cash', 'money',
];

const REPLACEMENT = '[link removed]';

/** Control chars and zero-width joiners: filter-evasion and name-spoofing tools. */
const CONTROL_AND_ZERO_WIDTH = new RegExp(
  '[\\u0000-\\u001f\\u007f\\u00ad\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\ufeff]',
  'g',
);

/** Anything with a scheme — http://, ipfs://, data:, javascript:, magnet:… */
const SCHEME_RE = /\b[a-z][a-z0-9+.-]{1,20}:\/\/\S+/gi;
const DATA_URI_RE = /\bdata:[^\s,]{0,64},\S+/gi;
const SCHEME_NO_SLASH_RE = /\b(?:javascript|vbscript|file|mailto|tel|magnet|blob):\S+/gi;

/** www.anything */
const WWW_RE = /\bwww\.\S+/gi;

/** Markdown image / link wrappers. */
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;

/**
 * host.tld, optionally with a path — but never a .eth name.
 *
 * The `(?!\.[a-z])` guard is what protects names: without it, `foo.com.eth`
 * would match its `foo.com` prefix and get replaced, mangling a legitimate
 * name. Refusing to match when another label follows leaves `.eth` intact
 * while still catching `example.com.` at the end of a sentence.
 */
const BARE_HOST_RE = new RegExp(
  String.raw`\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${BLOCKED_TLDS.join('|')})\b(?!\.[a-z])(?:\/\S*)?`,
  'gi',
);

/**
 * Strip every link-ish token from a chat line.
 * Returns plain text, already trimmed and length-capped.
 */
export function sanitizeChat(raw: unknown, maxLength = 280): string {
  let text = String(raw ?? '');

  // Zero-width and control characters are used to break naive filters and to
  // spoof names; they have no legitimate use in table chat.
  text = text.replace(CONTROL_AND_ZERO_WIDTH, '');

  // Keep the label from a markdown link, drop the target. Images go entirely.
  text = text.replace(MD_IMAGE_RE, '');
  text = text.replace(MD_LINK_RE, '$1');

  text = text.replace(SCHEME_RE, REPLACEMENT);
  text = text.replace(DATA_URI_RE, REPLACEMENT);
  text = text.replace(SCHEME_NO_SLASH_RE, REPLACEMENT);
  text = text.replace(WWW_RE, REPLACEMENT);

  text = text.replace(BARE_HOST_RE, (match) =>
    // A name is not a link. `gm.hoodfi.eth` and friends stay.
    /\.eth$/i.test(match) ? match : REPLACEMENT,
  );

  // Collapse the whitespace a stripped link leaves behind.
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text.slice(0, maxLength);
}
