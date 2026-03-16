import type { Metadata } from 'next'
import Providers from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'MessageVault - Encrypted On-Chain Messaging',
  description: 'Send encrypted messages to any Algorand wallet. End-to-end encrypted, stored on-chain, no servers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
