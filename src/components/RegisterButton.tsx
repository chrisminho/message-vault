'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useChain } from '@/lib/chain-context'
import nacl from 'tweetnacl'
import { PublicKey } from '@solana/web3.js'
import { algodClient, fetchRegistration as fetchAlgorandRegistration } from '@/lib/algorand'
import { fetchRegistration as fetchSolanaRegistration, register as solanaRegister } from '@/lib/solana'
import { deriveEncryptionKeypair } from '@/lib/crypto'
import { deriveEncryptionKeypairSolana } from '@/lib/solana-crypto'
import { registerOnContract } from '@/lib/registry'

interface Props {
  forceEdit?: boolean
  onEditDone?: () => void
}

export default function RegisterButton({ forceEdit, onEditDone }: Props) {
  const { activeAddress, chain } = useChain()
  const { signTransactions, transactionSigner } = useAlgorandWallet()
  const { signMessage, signTransaction: solanaSignTransaction } = useSolanaWallet()
  const { connection: solanaConnection } = useConnection()
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [currentName, setCurrentName] = useState<string | undefined>()
  const [step, setStep] = useState<'idle' | 'signing' | 'ready' | 'publishing'>('idle')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const keypairRef = useRef<nacl.BoxKeyPair | null>(null)

  const checkRegistration = useCallback(async () => {
    if (!activeAddress || !chain) return
    const fetchRegistration = chain === 'solana' ? fetchSolanaRegistration : fetchAlgorandRegistration
    const existing = await fetchRegistration(activeAddress)
    setRegistered(existing !== null)
    setNeedsMigration(chain === 'algorand' && (existing as any)?.source === 'hub')
    setCurrentName(existing?.name)
    if (existing?.name) setUsername(existing.name)
  }, [activeAddress, chain])

  useEffect(() => {
    checkRegistration()
  }, [checkRegistration])

  useEffect(() => {
    if (forceEdit && registered) {
      setEditing(true)
      setStep('idle')
    }
  }, [forceEdit, registered])

  function stopEditing() {
    setEditing(false)
    setStep('idle')
    onEditDone?.()
  }

  async function handleDeriveKey() {
    if (!activeAddress || !chain) return
    setError(null)
    setStep('signing')
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
      keypairRef.current = kp
      setStep('ready')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to derive key'
      setError(msg)
      setStep('idle')
    }
  }

  async function handlePublish() {
    if (!keypairRef.current || !activeAddress || !chain) return
    setError(null)
    setStep('publishing')
    try {
      if (chain === 'solana') {
        if (!solanaSignTransaction) throw new Error('Wallet does not support transaction signing')
        await solanaRegister(
          new PublicKey(activeAddress),
          keypairRef.current.publicKey,
          username.trim() || undefined,
          solanaSignTransaction,
          solanaConnection
        )
      } else {
        if (!transactionSigner) throw new Error('No transaction signer available')
        await registerOnContract(
          algodClient,
          transactionSigner,
          activeAddress,
          keypairRef.current.publicKey,
          username.trim() || undefined
        )
      }

      setCurrentName(username.trim() || undefined)
      setRegistered(true)
      setNeedsMigration(false)
      stopEditing()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register'
      setError(msg)
      setStep('ready')
    }
  }

  if (!activeAddress || !chain || registered === null) return null

  // Already registered and not editing
  if (registered && !needsMigration && !editing) return null

  const depositMessage = chain === 'algorand'
    ? ' (0.042 ALGO refundable deposit)'
    : ''

  const bannerMessage = editing
    ? 'Sign to update your username'
    : needsMigration
      ? `Upgrade to on-chain registry${depositMessage}`
      : `Register to receive encrypted messages${depositMessage}`

  return (
    <div className="register-banner">
      {step === 'idle' && (
        <>
          <span>{bannerMessage}</span>
          <div className="register-actions">
            {editing && (
              <button className="btn btn-secondary" onClick={stopEditing}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" onClick={handleDeriveKey}>
              {editing ? 'Sign' : needsMigration ? 'Upgrade' : 'Register'}
            </button>
          </div>
        </>
      )}
      {step === 'signing' && (
        <>
          <span>Check your wallet...</span>
          <button className="btn btn-primary" disabled>
            Signing...
          </button>
        </>
      )}
      {step === 'ready' && (
        <>
          <div className="register-form">
            <input
              className="register-name-input"
              type="text"
              placeholder="Username (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value.slice(0, 32))}
              maxLength={32}
            />
            {editing && (
              <button className="btn btn-secondary" onClick={stopEditing}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" onClick={handlePublish}>
              {editing ? 'Update' : 'Publish Key'}
            </button>
          </div>
        </>
      )}
      {step === 'publishing' && (
        <>
          <span>Publishing on-chain...</span>
          <button className="btn btn-primary" disabled>
            Confirming...
          </button>
        </>
      )}
      {error && <p className="error-msg">{error}</p>}
    </div>
  )
}
