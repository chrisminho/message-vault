'use client'

import { useMemo } from 'react'
import { WalletProvider as AlgorandWalletProvider, WalletManager, NetworkId } from '@txnlab/use-wallet-react'
import { WalletId } from '@txnlab/use-wallet-react'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { ChainProvider } from '@/lib/chain-context'

const walletManager = new WalletManager({
  wallets: [
    WalletId.PERA,
    WalletId.DEFLY,
    WalletId.EXODUS,
  ],
  defaultNetwork: NetworkId.MAINNET,
})

const solanaEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

export default function Providers({ children }: { children: React.ReactNode }) {
  const solanaWallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={solanaEndpoint}>
      <SolanaWalletProvider wallets={solanaWallets} autoConnect>
        <AlgorandWalletProvider manager={walletManager}>
          <ChainProvider>
            {children}
          </ChainProvider>
        </AlgorandWalletProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
