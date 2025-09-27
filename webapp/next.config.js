/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = config.resolve.alias || {}

    // Prevent RN packages from sneaking into the bundle
    config.resolve.alias['@react-native-async-storage/async-storage'] = false
    config.resolve.alias['react-native'] = false

    return config
  },
}

module.exports = nextConfig