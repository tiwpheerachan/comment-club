/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ไลบรารีฝั่ง server เท่านั้น (อย่า bundle เข้า client)
  serverExternalPackages: ["@google-cloud/bigquery", "@anthropic-ai/sdk"],
};

export default nextConfig;
