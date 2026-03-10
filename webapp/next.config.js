// webapp/next.config.js
const path = require("path");

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: {
    // 👇 prevents ESLint errors from blocking production builds
    ignoreDuringBuilds: true,
  },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    config.resolve.alias["pino-pretty"] = false;

    if (!isServer) {
      config.resolve.alias["unzipper"] = false;
      config.resolve.alias["sax"] = false;
    }

    return config;
  },
};