'use client'

import { WalletProvider, WalletManager, NetworkId } from '@txnlab/use-wallet-react'
import { WalletId } from '@txnlab/use-wallet-react'

const walletManager = new WalletManager({
  wallets: [
    WalletId.PERA,
    WalletId.DEFLY,
    WalletId.EXODUS,
  ],
  defaultNetwork: NetworkId.MAINNET,
})

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider manager={walletManager}>
      {children}
    </WalletProvider>
  )
}
