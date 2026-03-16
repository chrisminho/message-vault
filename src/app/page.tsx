'use client'

import { useWallet } from '@txnlab/use-wallet-react'
import ConnectWallet from '@/components/ConnectWallet'
import Inbox from '@/components/Inbox'
import SendMessage from '@/components/SendMessage'
import AllTransactions from '@/components/AllTransactions'
import RegisterButton from '@/components/RegisterButton'
import { useState, useEffect } from 'react'

export default function Home() {
  const { activeAddress } = useWallet()
  const [tab, setTab] = useState<'inbox' | 'send' | 'feed'>(activeAddress ? 'inbox' : 'feed')
  const [mounted, setMounted] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setTab(activeAddress ? 'inbox' : 'feed')
  }, [activeAddress])

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="logo">MessageVault</h1>
          <span className="tagline">Encrypted wallet-to-wallet messaging</span>
          <ConnectWallet onEditUsername={() => setEditingUsername(true)} />
        </div>
        {mounted && (
          <nav className="tab-nav">
            {activeAddress && (
              <>
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
              </>
            )}
            <button
              className={`tab-btn ${tab === 'feed' ? 'tab-active' : ''}`}
              onClick={() => setTab('feed')}
            >
              Feed
            </button>
          </nav>
        )}
      </header>

      {mounted && activeAddress && (
        <RegisterButton
          forceEdit={editingUsername}
          onEditDone={() => setEditingUsername(false)}
        />
      )}

      <main className="main">
        {(!mounted || !activeAddress) && (
          <div className="hero">
            <h2>Encrypted messages, unlocked by your wallet</h2>
            <p>
              Send encrypted messages to any Algorand wallet. Only the
              receiver can open them by signing with their wallet.
              No servers, no passwords — your wallet is the key.
            </p>
          </div>
        )}

        {mounted && tab === 'inbox' && activeAddress && <Inbox />}

        {mounted && tab === 'send' && activeAddress && <SendMessage />}

        {mounted && (tab === 'feed' || !activeAddress) && <AllTransactions />}
      </main>

      <footer className="footer">
        <p>
          Messages are encrypted on Algorand MainNet.
          <br />
          Only the receiver can unlock them with their wallet.
        </p>
      </footer>
    </div>
  )
}
