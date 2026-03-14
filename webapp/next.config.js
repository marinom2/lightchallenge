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
    config.resolve.alias["porto"] = false;

    if (!isServer) {
      config.resolve.alias["unzipper"] = false;
      config.resolve.alias["sax"] = false;
    }

    // Allow files outside webapp/ (e.g. ../offchain/) to resolve
    // packages from webapp/node_modules without overriding nested resolution
    if (!config.resolve.fallback) config.resolve.fallback = {};
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, "node_modules"),
    ];

    return config;
  },
};