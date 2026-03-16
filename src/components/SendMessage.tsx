'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { algodClient, fetchRegistration, fetchKnownSenders, type KnownContact } from '@/lib/algorand'
import { encryptForRegisteredKey } from '@/lib/crypto'
import { shortenAddress } from '@/lib/types'

const MAX_MESSAGE_LENGTH = 600

export default function SendMessage() {
  const { activeAddress, transactionSigner } = useWallet()
  const [recipient, setRecipient] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<KnownContact[]>([])
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
    if (activeAddress) {
      fetchKnownSenders(activeAddress).then(setContacts)
    }
  }, [activeAddress])

  async function handleSend() {
    if (!text.trim() || !recipient.trim() || !activeAddress || !transactionSigner) return

    setSending(true)
    setError(null)
    setTxId(null)

    try {
      if (recipient.length !== 58) {
        throw new Error('Invalid Algorand address (must be 58 characters).')
      }

      const reg = await fetchRegistration(recipient.trim())
      if (!reg) {
        throw new Error('Recipient has not enabled messaging yet. They need to register first.')
      }

      const note = encryptForRegisteredKey(text.trim(), reg.pk)

      if (note.length > 1024) {
        throw new Error('Message too long for a single transaction note.')
      }

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

      setTxId(result.txIDs[0])
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

  return (
    <div className="send-message-page">
      <h3>Send Message</h3>
      <div className="send-form">
        <div className="recipient-field" ref={wrapperRef}>
          <input
            className="composer-input"
            type="text"
            placeholder={contacts.length > 0 ? "Select contact or enter address" : "Recipient wallet address"}
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
            href={`https://explorer.perawallet.app/tx/${txId}`}
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
