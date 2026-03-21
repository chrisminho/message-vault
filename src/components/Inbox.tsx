'use client'

import { useState, useEffect } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useChain } from '@/lib/chain-context'
import nacl from 'tweetnacl'
import { deriveEncryptionKeypair, loadKeypair, saveKeypair, clearKeypair } from '@/lib/crypto'
import { deriveEncryptionKeypairSolana } from '@/lib/solana-crypto'
import ConversationList from './ConversationList'
import ChatView from './ChatView'

export default function Inbox() {
  const { activeAddress, chain } = useChain()
  const { signTransactions } = useAlgorandWallet()
  const { signMessage } = useSolanaWallet()
  const [keypair, setKeypair] = useState<nacl.BoxKeyPair | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null)

  // Auto-restore keypair from localStorage
  useEffect(() => {
    if (!activeAddress) return
    const stored = loadKeypair(activeAddress)
    if (stored) setKeypair(stored)
  }, [activeAddress])

  async function handleUnlock() {
    if (!activeAddress || !chain) return
    setUnlocking(true)
    setError(null)
    try {
      let kp: nacl.BoxKeyPair
      if (chain === 'solana') {
        if (!signMessage) throw new Error('Wallet does not support message signing')
        kp = await deriveEncryptionKeypairSolana(signMessage)
      } else {
        kp = await deriveEncryptionKeypair(
          (txns) => signTransactions(txns),
          activeAddress
        )
      }
      setKeypair(kp)
      saveKeypair(activeAddress, kp)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock'
      setError(msg)
    } finally {
      setUnlocking(false)
    }
  }

  if (!activeAddress) {
    return (
      <div className="inbox-empty">
        <p>Connect your wallet to see your messages.</p>
      </div>
    )
  }

  if (!keypair) {
    const unlockLabel = chain === 'solana' ? 'Sign a message to unlock your encrypted inbox.' : 'Sign a transaction to unlock your encrypted inbox.'
    return (
      <div className="inbox">
        <div className="inbox-header">
          <h3>Inbox</h3>
          <button
            className="btn btn-primary"
            onClick={handleUnlock}
            disabled={unlocking}
          >
            {unlocking ? 'Signing...' : 'Unlock'}
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="inbox-empty">
          <p>{unlockLabel}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="inbox">
      {selectedPeer ? (
        <ChatView
          activeAddress={activeAddress}
          peerAddress={selectedPeer}
          keypair={keypair}
          onBack={() => setSelectedPeer(null)}
        />
      ) : (
        <>
          <div className="inbox-header">
            <h3>Conversations</h3>
            <div className="inbox-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (activeAddress) clearKeypair(activeAddress)
                  setKeypair(null)
                }}
              >
                Lock
              </button>
            </div>
          </div>
          <ConversationList
            activeAddress={activeAddress}
            onSelectPeer={setSelectedPeer}
          />
        </>
      )}
    </div>
  )
}
