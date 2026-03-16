import { webpackFallback } from '@txnlab/use-wallet-react'

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Fix WalletConnect externals
    config.externals.push('pino-pretty', 'lokijs', 'encoding')

    // Provide empty modules for uninstalled optional wallet dependencies
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        ...webpackFallback,
      }
    }

    return config
  },
}

export default nextConfig
