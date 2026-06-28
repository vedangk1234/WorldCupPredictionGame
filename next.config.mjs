/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    return [{ source: "/predictions", destination: "/", permanent: true }];
  },
};
export default nextConfig;
