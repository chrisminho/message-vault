'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useChain } from '@/lib/chain-context'
import algosdk from 'algosdk'
import { PublicKey } from '@solana/web3.js'
import { algodClient, fetchRegistration as fetchAlgorandRegistration, fetchKnownSenders as fetchAlgorandKnownSenders, type KnownContact } from '@/lib/algorand'
import { fetchRegistration as fetchSolanaRegistration, fetchKnownSenders as fetchSolanaKnownSenders, sendDM as solanaSendDM, validateSolanaAddress, type SolanaKnownContact } from '@/lib/solana'
import { encryptForPeer, encryptForRegisteredKey, loadKeypair } from '@/lib/crypto'
import { shortenAddress } from '@/lib/types'

const MAX_MESSAGE_LENGTH = 600

export default function SendMessage() {
  const { activeAddress, chain } = useChain()
  const { transactionSigner } = useAlgorandWallet()
  const { signTransaction: solanaSignTransaction } = useSolanaWallet()
  const { connection: solanaConnection } = useConnection()
  const [recipient, setRecipient] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<(KnownContact | SolanaKnownContact)[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!activeAddress || !chain) return
    if (chain === 'solana') {
      fetchSolanaKnownSenders(activeAddress).then(setContacts)
    } else {
      fetchAlgorandKnownSenders(activeAddress).then(setContacts)
    }
  }, [activeAddress, chain])

  const explorerTxUrl = chain === 'solana'
    ? (id: string) => `https://solscan.io/tx/${id}`
    : (id: string) => `https://explorer.perawallet.app/tx/${id}`

  async function handleSend() {
    if (!text.trim() || !recipient.trim() || !activeAddress || !chain) return

    setSending(true)
    setError(null)
    setTxId(null)

    try {
      // Chain-aware address validation
      if (chain === 'algorand') {
        if (recipient.length !== 58) {
          throw new Error('Invalid Algorand address (must be 58 characters).')
        }
      } else if (chain === 'solana') {
        if (!validateSolanaAddress(recipient.trim())) {
          throw new Error('Invalid Solana address.')
        }
      }

      const fetchRegistration = chain === 'solana' ? fetchSolanaRegistration : fetchAlgorandRegistration
      const reg = await fetchRegistration(recipient.trim())
      if (!reg) {
        throw new Error('Recipient has not enabled messaging yet. They need to register first.')
      }

      const localKp = activeAddress ? loadKeypair(activeAddress) : null
      const note = localKp
        ? encryptForPeer(text.trim(), reg.pk, localKp.secretKey)
        : encryptForRegisteredKey(text.trim(), reg.pk)

      if (note.length > 1024) {
        throw new Error('Message too long for a single transaction note.')
      }

      let resultTxId: string

      if (chain === 'solana') {
        if (!solanaSignTransaction) throw new Error('Wallet does not support transaction signing')
        resultTxId = await solanaSendDM(
          new PublicKey(activeAddress),
          recipient.trim(),
          note,
          solanaSignTransaction,
          solanaConnection
        )
      } else {
        if (!transactionSigner) throw new Error('No transaction signer available')
        const suggestedParams = await algodClient.getTransactionParams().do()
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: activeAddress,
          receiver: recipient.trim(),
          amount: 0,
          suggestedParams,
          note,
        })
        const atc = new algosdk.AtomicTransactionComposer()
        atc.addTransaction({ txn, signer: transactionSigner })
        const result = await atc.execute(algodClient, 4)
        resultTxId = result.txIDs[0]
      }

      setTxId(resultTxId)
      setText('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  if (!activeAddress) {
    return (
      <div className="inbox-empty">
        <p>Connect your wallet to send messages.</p>
      </div>
    )
  }

  const addressPlaceholder = chain === 'solana'
    ? (contacts.length > 0 ? 'Select contact or enter Solana address' : 'Recipient Solana address')
    : (contacts.length > 0 ? 'Select contact or enter Algorand address' : 'Recipient Algorand address')

  return (
    <div className="send-message-page">
      <h3>Send Message</h3>
      <div className="send-form">
        <div className="recipient-field" ref={wrapperRef}>
          <input
            className="composer-input"
            type="text"
            placeholder={addressPlaceholder}
            value={recipient}
            onChange={(e) => { setRecipient(e.target.value); setShowDropdown(false) }}
            onFocus={() => { if (contacts.length > 0) setShowDropdown(true) }}
            disabled={sending}
          />
          {showDropdown && contacts.length > 0 && (
            <div className="recipient-dropdown">
              {contacts.map((c) => (
                <button
                  key={c.address}
                  className="recipient-option"
                  onClick={() => { setRecipient(c.address); setShowDropdown(false) }}
                >
                  <span className="recipient-option-name">
                    {c.name || shortenAddress(c.address)}
                  </span>
                  <span className="recipient-option-full">{c.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder="Write a message..."
          rows={3}
          disabled={sending}
        />
        <div className="composer-footer">
          <span className="char-count">{text.length}/{MAX_MESSAGE_LENGTH}</span>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!text.trim() || !recipient.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {txId && (
        <p className="success-msg">
          Sent!{' '}
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on explorer
          </a>
        </p>
      )}
    </div>
  )
}
