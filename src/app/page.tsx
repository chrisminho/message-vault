'use client'

import { useChain } from '@/lib/chain-context'
import ConnectWallet from '@/components/ConnectWallet'
import WalletSelector from '@/components/WalletSelector'
import Inbox from '@/components/Inbox'
import SendMessage from '@/components/SendMessage'
import RegisterButton from '@/components/RegisterButton'
import { useState, useEffect } from 'react'

export default function Home() {
  const { activeAddress, chain } = useChain()
  const [tab, setTab] = useState<'inbox' | 'send'>('inbox')
  const [mounted, setMounted] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [registrationKey, setRegistrationKey] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="logo">MessageVault</h1>
          <span className="tagline">Encrypted wallet-to-wallet messaging</span>
          <ConnectWallet
            onEditUsername={() => setEditingUsername(true)}
            onDeregistered={() => setRegistrationKey((k) => k + 1)}
          />
        </div>
        {mounted && activeAddress && (
          <nav className="tab-nav">
            <button
              className={`tab-btn ${tab === 'inbox' ? 'tab-active' : ''}`}
              onClick={() => setTab('inbox')}
            >
              Inbox
            </button>
            <button
              className={`tab-btn ${tab === 'send' ? 'tab-active' : ''}`}
              onClick={() => setTab('send')}
            >
              Send
            </button>
          </nav>
        )}
      </header>

      {mounted && activeAddress && (
        <RegisterButton
          key={registrationKey}
          forceEdit={editingUsername}
          onEditDone={() => setEditingUsername(false)}
        />
      )}

      <main className="main">
        {(!mounted || !activeAddress) && (
          <>
            <div className="hero">
              <h2>Encrypted messages, unlocked by your wallet</h2>
              <p>
                Send encrypted messages to any wallet. Only the
                receiver can open them by signing with their wallet.
                No servers, no passwords — your wallet is the key.
              </p>
            </div>
            {mounted && <WalletSelector />}
          </>
        )}

        {mounted && tab === 'inbox' && activeAddress && <Inbox />}

        {mounted && tab === 'send' && activeAddress && <SendMessage />}
      </main>

      <footer className="footer">
        <p>
          Messages are encrypted on-chain.
          <br />
          Only the receiver can unlock them with their wallet.
        </p>
      </footer>
    </div>
  )
}
