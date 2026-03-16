'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { shortenAddress } from '@/lib/types'
import { fetchRegistration } from '@/lib/algorand'

interface Props {
  onEditUsername?: () => void
}

export default function ConnectWallet({ onEditUsername }: Props) {
  const { activeAddress, wallets } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [username, setUsername] = useState<string | undefined>()

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

  function handleCopy() {
    if (!activeAddress) return
    navigator.clipboard.writeText(activeAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (activeAddress) {
    const activeWallet = wallets?.find((w) => w.isActive)
    return (
      <div className="wallet-connected">
        <div className="wallet-info">
          {username && (
            <div className="wallet-username-row">
              <span className="wallet-username">{username}</span>
              <button className="btn btn-secondary btn-sm" onClick={onEditUsername}>Edit</button>
            </div>
          )}
          <div className="wallet-address-row">
            <span className="wallet-address">{shortenAddress(activeAddress)}</span>
            <button
              className="btn-copy"
              onClick={handleCopy}
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
        <button
          className="btn btn-secondary"
          onClick={() => activeWallet?.disconnect()}
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-options">
      {wallets?.map((wallet) => (
        <button
          key={wallet.id}
          className="btn btn-primary"
          onClick={() => wallet.connect()}
        >
          Connect {wallet.metadata.name}
        </button>
      ))}
    </div>
  )
}
