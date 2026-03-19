'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import nacl from 'tweetnacl'
import { algodClient, fetchRegistration } from '@/lib/algorand'
import { deriveEncryptionKeypair } from '@/lib/crypto'
import { registerOnContract, deregisterFromContract } from '@/lib/registry'

interface Props {
  forceEdit?: boolean
  onEditDone?: () => void
}

export default function RegisterButton({ forceEdit, onEditDone }: Props) {
  const { activeAddress, signTransactions, transactionSigner } = useWallet()
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [currentName, setCurrentName] = useState<string | undefined>()
  const [step, setStep] = useState<'idle' | 'signing' | 'ready' | 'publishing'>('idle')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const keypairRef = useRef<nacl.BoxKeyPair | null>(null)

  const checkRegistration = useCallback(async () => {
    if (!activeAddress) return
    const existing = await fetchRegistration(activeAddress)
    setRegistered(existing !== null)
    setNeedsMigration(existing?.source === 'hub')
    setCurrentName(existing?.name)
    if (existing?.name) setUsername(existing.name)
  }, [activeAddress])

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
    if (!activeAddress) return
    setError(null)
    setStep('signing')
    try {
      const kp = await deriveEncryptionKeypair(
        (txns) => signTransactions(txns),
        activeAddress
      )
      keypairRef.current = kp
      setStep('ready')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to derive key'
      setError(msg)
      setStep('idle')
    }
  }

  async function handlePublish() {
    if (!keypairRef.current || !activeAddress || !transactionSigner) return
    setError(null)
    setStep('publishing')
    try {
      await registerOnContract(
        algodClient,
        transactionSigner,
        activeAddress,
        keypairRef.current.publicKey,
        username.trim() || undefined
      )

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

  if (!activeAddress || registered === null) return null

  // Already registered on contract and not editing — status shown in header
  if (registered && !needsMigration && !editing) return null

  const bannerMessage = editing
    ? 'Sign to update your username'
    : needsMigration
      ? 'Upgrade to on-chain registry (0.042 ALGO refundable deposit)'
      : 'Register to receive encrypted messages (0.042 ALGO refundable deposit)'

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
