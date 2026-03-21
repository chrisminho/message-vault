'use client'

import { useState } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'

const EXODUS_EXTENSION_URL = 'https://www.exodus.com/web3-wallet'
const PHANTOM_EXTENSION_URL = 'https://phantom.app/'

/**
 * Wallet selector shown on the main page when no wallet is connected.
 * Groups wallets by chain: Solana, Algorand, Ethereum (coming soon).
 */
export default function WalletSelector() {
  const { wallets: algorandWallets } = useAlgorandWallet()
  const { select: selectSolana, wallets: solanaWallets, connect: connectSolana } = useSolanaWallet()
  const [connectError, setConnectError] = useState<{ walletId: string; message: string } | null>(null)

  async function handleSolanaConnect() {
    setConnectError(null)
    try {
      const phantom = solanaWallets.find(w => w.adapter.name === 'Phantom')
      if (!phantom) {
        setConnectError({ walletId: 'phantom', message: 'Phantom wallet not found' })
        return
      }

      // Check if Phantom extension is installed
      const isPhantomInstalled = typeof window !== 'undefined' && 'solana' in window
      if (!isPhantomInstalled) {
        setConnectError({ walletId: 'phantom', message: 'not_installed' })
        return
      }

      selectSolana(phantom.adapter.name)
      // select() doesn't auto-connect — need to call connect() after
      // Small delay to let the adapter initialize after selection
      await new Promise(r => setTimeout(r, 100))
      await connectSolana()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectError({ walletId: 'phantom', message: msg })
    }
  }

  async function handleAlgorandConnect(wallet: typeof algorandWallets[number]) {
    setConnectError(null)
    try {
      await wallet.connect()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectError({ walletId: wallet.id, message: msg })
    }
  }

  const isExodusAvailable = typeof window !== 'undefined' && 'algorand' in window

  return (
    <div className="wallet-selector">
      <div className="wallet-groups">
        {/* Solana */}
        <div className="wallet-group">
          <span className="wallet-group-label">Solana</span>
          <div className="wallet-group-buttons">
            <button className="btn btn-primary" onClick={handleSolanaConnect}>
              Phantom
            </button>
          </div>
        </div>

        {/* Algorand */}
        <div className="wallet-group">
          <span className="wallet-group-label">Algorand</span>
          <div className="wallet-group-buttons">
            {algorandWallets?.map((wallet) => (
              <button
                key={wallet.id}
                className="btn btn-primary"
                onClick={() => handleAlgorandConnect(wallet)}
              >
                {wallet.metadata.name}
              </button>
            ))}
          </div>
        </div>

        {/* Ethereum */}
        <div className="wallet-group wallet-group-disabled">
          <span className="wallet-group-label">Ethereum</span>
          <span className="wallet-group-coming-soon">Coming Soon</span>
        </div>
      </div>

      {connectError?.walletId === 'phantom' && connectError.message === 'not_installed' && (
        <p className="wallet-hint">
          Phantom browser extension required.{' '}
          <a href={PHANTOM_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Install Phantom
          </a>
        </p>
      )}
      {connectError?.walletId === 'exodus' && !isExodusAvailable && (
        <p className="wallet-hint">
          Exodus browser extension required.{' '}
          <a href={EXODUS_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Install Exodus Web3 Wallet
          </a>
        </p>
      )}
      {connectError && connectError.message !== 'not_installed' && !(connectError.walletId === 'exodus' && !isExodusAvailable) && (
        <p className="error-msg">{connectError.message}</p>
      )}
    </div>
  )
}
