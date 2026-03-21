'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { shortenAddress } from '@/lib/types'
import { algodClient, fetchRegistration } from '@/lib/algorand'
import { deregisterFromContract } from '@/lib/registry'

const EXODUS_EXTENSION_URL = 'https://www.exodus.com/web3-wallet'

interface Props {
  onEditUsername?: () => void
  onDeregistered?: () => void
}

export default function ConnectWallet({ onEditUsername, onDeregistered }: Props) {
  const { activeAddress, wallets, transactionSigner } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [username, setUsername] = useState<string | undefined>()
  const [deregistering, setDeregistering] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectError, setConnectError] = useState<{ walletId: string; message: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
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
    if (!activeAddress) { setUsername(undefined); return }
    fetchRegistration(activeAddress).then((reg) => {
      setUsername(reg?.name)
    })
  }, [activeAddress])

  if (!mounted) return null

  async function handleDeregister() {
    if (!activeAddress || !transactionSigner) return
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

  if (activeAddress) {
    const activeWallet = wallets?.find((w) => w.isActive)
    return (
      <div className="wallet-connected" ref={menuRef}>
        <div className="wallet-menu-trigger" onClick={() => setMenuOpen(prev => !prev)}>
          {username && <span className="wallet-username">{username}</span>}
          <div className="wallet-address-row">
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
            {username && (
              <button className="wallet-dropdown-item" onClick={() => { setMenuOpen(false); onEditUsername?.() }}>
                Edit Username
              </button>
            )}
            {username && (
              <button className="wallet-dropdown-item" onClick={() => { setMenuOpen(false); handleDeregister() }} disabled={deregistering}>
                {deregistering ? 'Deregistering...' : 'Deregister'}
              </button>
            )}
            <button className="wallet-dropdown-item" onClick={() => { setMenuOpen(false); activeWallet?.disconnect() }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  async function handleConnect(wallet: typeof wallets[number]) {
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
    <div className="wallet-options-wrap">
      <div className="wallet-options">
        {wallets?.map((wallet) => (
          <button
            key={wallet.id}
            className="btn btn-primary"
            onClick={() => handleConnect(wallet)}
          >
            Connect {wallet.metadata.name}
          </button>
        ))}
      </div>
      {connectError?.walletId === 'exodus' && !isExodusAvailable && (
        <p className="wallet-hint">
          Exodus browser extension required.{' '}
          <a href={EXODUS_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Install Exodus Web3 Wallet
          </a>
        </p>
      )}
      {connectError && !(connectError.walletId === 'exodus' && !isExodusAvailable) && (
        <p className="error-msg">{connectError.message}</p>
      )}
    </div>
  )
}
