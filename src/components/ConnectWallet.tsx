'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useChain } from '@/lib/chain-context'
import { shortenAddress } from '@/lib/types'
import { algodClient, fetchRegistration as fetchAlgorandRegistration } from '@/lib/algorand'
import { fetchRegistration as fetchSolanaRegistration } from '@/lib/solana'
import { deregisterFromContract } from '@/lib/registry'

interface Props {
  onEditUsername?: () => void
  onDeregistered?: () => void
}

/**
 * Header wallet display — only shown when connected.
 * Shows address, username, dropdown menu with disconnect/deregister.
 */
export default function ConnectWallet({ onEditUsername, onDeregistered }: Props) {
  const { chain, activeAddress } = useChain()
  const { wallets: algorandWallets, transactionSigner } = useAlgorandWallet()
  const { disconnect: disconnectSolana } = useSolanaWallet()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [username, setUsername] = useState<string | undefined>()
  const [deregistering, setDeregistering] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [menuOpen])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!activeAddress || !chain) { setUsername(undefined); return }
    if (chain === 'algorand') {
      fetchAlgorandRegistration(activeAddress).then((reg) => setUsername(reg?.name))
    } else if (chain === 'solana') {
      fetchSolanaRegistration(activeAddress).then((reg) => setUsername(reg?.name))
    }
  }, [activeAddress, chain])

  if (!mounted || !activeAddress) return null

  async function handleDeregister() {
    if (!activeAddress || !transactionSigner || chain !== 'algorand') return
    if (!confirm('Deregister and reclaim your 0.042 ALGO deposit? You will no longer be able to receive encrypted messages.')) return
    setDeregistering(true)
    try {
      await deregisterFromContract(algodClient, transactionSigner, activeAddress)
      setUsername(undefined)
      onDeregistered?.()
    } catch (err) {
      console.error('Deregistration failed:', err)
    } finally {
      setDeregistering(false)
    }
  }

  function handleCopy() {
    if (!activeAddress) return
    navigator.clipboard.writeText(activeAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDisconnect() {
    setMenuOpen(false)
    if (chain === 'solana') {
      disconnectSolana()
    } else if (chain === 'algorand') {
      const activeWallet = algorandWallets?.find((w) => w.isActive)
      activeWallet?.disconnect()
    }
  }

  return (
    <div className="wallet-connected" ref={menuRef}>
      <div className="wallet-menu-trigger" onClick={() => setMenuOpen(prev => !prev)}>
        {username && <span className="wallet-username">{username}</span>}
        <div className="wallet-address-row">
          <span className="wallet-chain-badge">{chain === 'solana' ? 'SOL' : 'ALGO'}</span>
          <span className="wallet-address">{shortenAddress(activeAddress)}</span>
          <button
            className="btn-copy"
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            title="Copy address"
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="wallet-dropdown">
          {username && chain === 'algorand' && (
            <button className="wallet-dropdown-item" onClick={() => { setMenuOpen(false); onEditUsername?.() }}>
              Edit Username
            </button>
          )}
          {username && chain === 'algorand' && (
            <button className="wallet-dropdown-item" onClick={() => { setMenuOpen(false); handleDeregister() }} disabled={deregistering}>
              {deregistering ? 'Deregistering...' : 'Deregister'}
            </button>
          )}
          <button className="wallet-dropdown-item" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
