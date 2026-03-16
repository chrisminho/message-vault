'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import nacl from 'tweetnacl'
import { algodClient, HUB_ADDRESS, fetchRegistration } from '@/lib/algorand'
import { deriveEncryptionKeypair, encodeRegisterNote } from '@/lib/crypto'

interface Props {
  forceEdit?: boolean
  onEditDone?: () => void
}

export default function RegisterButton({ forceEdit, onEditDone }: Props) {
  const { activeAddress, signTransactions, transactionSigner } = useWallet()
  const [registered, setRegistered] = useState<boolean | null>(null)
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
      const note = encodeRegisterNote(keypairRef.current.publicKey, username.trim() || undefined)
      const suggestedParams = await algodClient.getTransactionParams().do()

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: HUB_ADDRESS,
        amount: 0,
        suggestedParams,
        note,
      })

      const atc = new algosdk.AtomicTransactionComposer()
      atc.addTransaction({ txn, signer: transactionSigner })
      await atc.execute(algodClient, 10)

      setCurrentName(username.trim() || undefined)
      setRegistered(true)
      stopEditing()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register'
      setError(msg)
      setStep('ready')
    }
  }

  if (!activeAddress || registered === null) return null

  // Already registered and not editing — status shown in header
  if (registered && !editing) return null

  return (
    <div className="register-banner">
      {step === 'idle' && (
        <>
          <span>{editing ? 'Sign to update your username' : 'Register to receive encrypted messages'}</span>
          <div className="register-actions">
            {editing && (
              <button className="btn btn-secondary" onClick={stopEditing}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" onClick={handleDeriveKey}>
              {editing ? 'Sign' : 'Register'}
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
