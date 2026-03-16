'use client'

import { useState, useCallback } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import nacl from 'tweetnacl'
import { algodClient, HUB_ADDRESS, fetchRegistration } from '@/lib/algorand'
import { deriveEncryptionKeypair, encodeRegisterNote } from '@/lib/crypto'

interface EncryptionState {
  keypair: nacl.BoxKeyPair | null
  registered: boolean
  loading: boolean
  error: string | null
}

export function useEncryption() {
  const { activeAddress, signTransactions, transactionSigner } = useWallet()
  const [state, setState] = useState<EncryptionState>({
    keypair: null,
    registered: false,
    loading: false,
    error: null,
  })

  /**
   * Unlock: derive encryption keypair from wallet signature,
   * then check if already registered on-chain.
   */
  const unlock = useCallback(async () => {
    if (!activeAddress) return

    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const keypair = await deriveEncryptionKeypair(
        (txns) => signTransactions(txns),
        activeAddress
      )

      // Check if already registered
      const existing = await fetchRegistration(activeAddress)
      const registered = existing !== null

      setState({ keypair, registered, loading: false, error: null })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock encryption'
      setState((s) => ({ ...s, loading: false, error: msg }))
    }
  }, [activeAddress, signTransactions])

  /**
   * Register: publish encryption public key on-chain as a note to HUB_ADDRESS.
   */
  const register = useCallback(async () => {
    if (!state.keypair || !activeAddress || !transactionSigner) return

    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const note = encodeRegisterNote(state.keypair.publicKey)
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
      await atc.execute(algodClient, 4)

      setState((s) => ({ ...s, registered: true, loading: false }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register'
      setState((s) => ({ ...s, loading: false, error: msg }))
    }
  }, [state.keypair, activeAddress, transactionSigner])

  const lock = useCallback(() => {
    setState({ keypair: null, registered: false, loading: false, error: null })
  }, [])

  return {
    keypair: state.keypair,
    registered: state.registered,
    loading: state.loading,
    error: state.error,
    unlock,
    register,
    lock,
    isUnlocked: state.keypair !== null,
  }
}
