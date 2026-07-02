/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the site can be pinned to IPFS and served from
  // epoker.eth (via contenthash + eth.limo), or hosted on Vercel/CF Pages.
  output: 'export',
  images: { unoptimized: true },
  // IPFS gateways serve from a path, so keep asset URLs relative-safe.
  trailingSlash: true,
  webpack: (config) => {
    // WalletConnect's logger optionally requires pino-pretty (dev-only).
    config.externals.push('pino-pretty');
    // wagmi ships optional Tempo-chain connectors that import the
    // (unpublished-for-us) `accounts` package — we never use Tempo,
    // so resolve it to an empty module.
    config.resolve.alias = { ...config.resolve.alias, accounts: false };
    return config;
  },
};

export default nextConfig;
