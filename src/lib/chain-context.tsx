'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'

export type Chain = 'solana' | 'algorand' | null

interface ChainContextValue {
  chain: Chain
  activeAddress: string | null
}

const ChainContext = createContext<ChainContextValue>({
  chain: null,
  activeAddress: null,
})

export function ChainProvider({ children }: { children: ReactNode }) {
  const { activeAddress: algorandAddress } = useAlgorandWallet()
  const { publicKey: solanaPublicKey } = useSolanaWallet()

  const value = useMemo<ChainContextValue>(() => {
    if (solanaPublicKey) {
      return { chain: 'solana', activeAddress: solanaPublicKey.toBase58() }
    }
    if (algorandAddress) {
      return { chain: 'algorand', activeAddress: algorandAddress }
    }
    return { chain: null, activeAddress: null }
  }, [solanaPublicKey, algorandAddress])

  return (
    <ChainContext.Provider value={value}>
      {children}
    </ChainContext.Provider>
  )
}

export function useChain() {
  return useContext(ChainContext)
}
