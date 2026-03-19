'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import nacl from 'tweetnacl'
import algosdk from 'algosdk'
import { algodClient, fetchConversation, fetchRegistration, type ConversationMessage } from '@/lib/algorand'
import { decryptDM, encryptForPeer, encryptForRegisteredKey, loadKeypair } from '@/lib/crypto'
import { shortenAddress, timeAgo } from '@/lib/types'

const MAX_MESSAGE_LENGTH = 600

interface ChatViewProps {
  activeAddress: string
  peerAddress: string
  keypair: nacl.BoxKeyPair
  onBack: () => void
}

export default function ChatView({ activeAddress, peerAddress, keypair, onBack }: ChatViewProps) {
  const { transactionSigner } = useWallet()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [peerName, setPeerName] = useState<string | null>(null)
  const [peerPk, setPeerPk] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Inline send state
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const timelineEndRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [msgs, reg] = await Promise.all([
          fetchConversation(activeAddress, peerAddress),
          fetchRegistration(peerAddress),
        ])
        setMessages(msgs)
        if (reg?.name) setPeerName(reg.name)
        if (reg?.pk) setPeerPk(reg.pk)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(async () => {
      try {
        const msgs = await fetchConversation(activeAddress, peerAddress)
        setMessages(msgs)
      } catch { /* silent */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeAddress, peerAddress])

  // Scroll to bottom when messages change
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function toggleReveal(txId: string) {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId)
      else next.add(txId)
      return next
    })
  }

  // Compute which messages can be decrypted (for "Reveal All")
  const decryptableIds = messages
    .filter(msg => msg.direction === 'received' || msg.payload?.v === 2)
    .map(msg => msg.txId)
  const allRevealed = decryptableIds.length > 0 && decryptableIds.every(id => revealed.has(id))

  function toggleRevealAll() {
    if (allRevealed) {
      setRevealed(new Set())
    } else {
      setRevealed(new Set(decryptableIds))
    }
    // Keep scroll at the bottom after content expands/collapses
    requestAnimationFrame(() => {
      timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight })
    })
  }

  function decryptMsg(msg: ConversationMessage): string | null {
    // For v2 messages, both sent and received can be decrypted via ECDH shared key
    // For v1 sent messages, we can't decrypt (ephemeral key is lost)
    const isV2 = msg.payload?.v === 2
    if (msg.direction === 'sent' && !isV2) return null

    // Determine peer public key for ECDH
    const peerKey = peerPk || undefined
    return decryptDM(msg.payload, keypair.secretKey, peerKey)
  }

  function handleCopy(e: React.MouseEvent, text: string, txId: string) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedId(txId)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function handleSend() {
    if (!text.trim() || !activeAddress || !transactionSigner) return
    setSending(true)
    setSendError(null)
    try {
      const reg = await fetchRegistration(peerAddress)
      if (!reg) throw new Error('Recipient has not enabled messaging yet.')

      // Use ECDH v2 encryption if we have our keypair, otherwise fall back to v1
      const localKp = loadKeypair(activeAddress)
      const note = localKp
        ? encryptForPeer(text.trim(), reg.pk, localKp.secretKey)
        : encryptForRegisteredKey(text.trim(), reg.pk)
      if (note.length > 1024) throw new Error('Message too long for a single transaction note.')

      const suggestedParams = await algodClient.getTransactionParams().do()
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: peerAddress,
        amount: 0,
        suggestedParams,
        note,
      })

      const atc = new algosdk.AtomicTransactionComposer()
      atc.addTransaction({ txn, signer: transactionSigner })
      await atc.execute(algodClient, 4)

      setText('')
      // Reload conversation to show the new message
      const msgs = await fetchConversation(activeAddress, peerAddress)
      setMessages(msgs)
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }


  return (
    <div className="chat-view">
      <div className="chat-header">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          &larr; Back
        </button>
        <div className="chat-header-info">
          <span className="chat-header-name">{peerName || shortenAddress(peerAddress)}</span>
          {peerName && <span className="chat-header-addr">{shortenAddress(peerAddress)}</span>}
        </div>
        {decryptableIds.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={toggleRevealAll} style={{ marginLeft: 'auto' }}>
            {allRevealed ? 'Hide All' : 'Reveal All'}
          </button>
        )}
      </div>

      <div className="chat-timeline" ref={timelineRef}>
        {loading ? (
          <div className="inbox-empty loading">
            <p>Loading messages...</p>
          </div>
        ) : (
          <>
          {messages.length === 0 && (
            <div className="inbox-empty">
              <p>No messages yet. Start the conversation below.</p>
            </div>
          )}
          {messages.map(msg => {
            const isSent = msg.direction === 'sent'
            const isV2 = msg.payload?.v === 2
            const bubbleClass = `chat-bubble ${isSent ? 'chat-bubble-sent' : 'chat-bubble-received'}`
            const isRevealed = revealed.has(msg.txId)
            const canDecryptSent = isSent && isV2
            const decryptedText = (isRevealed && !isSent) || (isRevealed && canDecryptSent) ? decryptMsg(msg) : null

            return (
              <div key={msg.txId} className={bubbleClass} onClick={() => toggleReveal(msg.txId)}>
                {isSent && !isRevealed ? (
                  canDecryptSent ? (
                    <p className="message-hidden">Click to reveal</p>
                  ) : (
                    <p className="chat-encrypted">[Encrypted message you sent]</p>
                  )
                ) : isRevealed ? (
                  <div className="message-revealed">
                    <div className="message-code-block">
                      <pre className="message-code">{decryptedText ?? '[Could not decrypt]'}</pre>
                      {decryptedText && (
                        <button
                          className="btn-copy message-copy"
                          onClick={(e) => handleCopy(e, decryptedText, msg.txId)}
                          title="Copy message"
                        >
                          {copiedId === msg.txId ? (
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
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="message-hidden">Click to reveal</p>
                )}
                <div className="chat-bubble-meta">
                  <span className="chat-bubble-time">{timeAgo(msg.timestamp)}</span>
                  <a
                    className="btn-action"
                    href={`https://explorer.perawallet.app/tx/${msg.txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    tx
                  </a>
                </div>
              </div>
            )
          })}

          <div ref={timelineEndRef} />
        </>
        )}
      </div>

      {/* Inline composer */}
      <div className="chat-composer">
        <textarea
          className="composer-input chat-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          rows={2}
          disabled={sending}
        />
        <div className="chat-composer-footer">
          <span className="char-count">{text.length}/{MAX_MESSAGE_LENGTH}</span>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        {sendError && <p className="error-msg">{sendError}</p>}
      </div>
    </div>
  )
}
