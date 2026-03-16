'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import nacl from 'tweetnacl'
import { fetchIncomingDMs, fetchRegistrations, decodeNote } from '@/lib/algorand'
import { APP_PREFIX, shortenAddress, timeAgo } from '@/lib/types'
import { deriveEncryptionKeypair, decryptMessage, base64ToUint8, loadKeypair, saveKeypair, clearKeypair } from '@/lib/crypto'

const REFRESH_INTERVAL = 30_000

interface InboxMessage {
  txId: string
  sender: string
  senderName?: string
  text: string | null
  timestamp: number
  round: number
}

export default function Inbox() {
  const { activeAddress, signTransactions } = useWallet()
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [keypair, setKeypair] = useState<nacl.BoxKeyPair | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const keypairRef = useRef<nacl.BoxKeyPair | null>(null)

  // Keep ref in sync for interval callback
  keypairRef.current = keypair

  const loadMessages = useCallback(async (kp: nacl.BoxKeyPair | null) => {
    if (!activeAddress) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchIncomingDMs(activeAddress)
      const txns = result.transactions || []
      const msgs: InboxMessage[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const txn of txns as any[]) {
        if (!txn.note || !txn.id) continue
        try {
          const noteStr = decodeNote(txn.note)
          if (!noteStr || !noteStr.startsWith(APP_PREFIX)) continue
          const parsed = JSON.parse(noteStr.slice(APP_PREFIX.length))
          if (parsed.type !== 'dm') continue

          if (parsed.ct && parsed.n && parsed.ek) {
            let text: string | null = null
            if (kp) {
              text = decryptMessage(
                base64ToUint8(parsed.ct),
                base64ToUint8(parsed.n),
                base64ToUint8(parsed.ek),
                kp.secretKey
              )
            }
            msgs.push({
              txId: txn.id as string,
              sender: txn.sender as string,
              text,
              timestamp: (txn.roundTime ?? txn['round-time']) as number,
              round: Number(txn.confirmedRound ?? txn['confirmed-round'] ?? 0),
            })
          }
        } catch {
          // skip malformed
        }
      }

      // Resolve usernames for unique senders
      try {
        const senderAddrs = [...new Set(msgs.map(m => m.sender))]
        if (senderAddrs.length > 0) {
          const regs = await fetchRegistrations(senderAddrs)
          for (const m of msgs) {
            const reg = regs.get(m.sender)
            if (reg?.name) m.senderName = reg.name
          }
        }
      } catch {
        // username resolution failed — show messages without names
      }

      msgs.sort((a, b) => b.timestamp - a.timestamp)
      setMessages(msgs)
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [activeAddress])

  // Auto-restore keypair from localStorage
  useEffect(() => {
    if (!activeAddress) return
    const stored = loadKeypair(activeAddress)
    if (stored) {
      setKeypair(stored)
      loadMessages(stored)
    } else {
      loadMessages(null)
    }
  }, [activeAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!activeAddress) return
    const interval = setInterval(() => {
      loadMessages(keypairRef.current)
    }, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [activeAddress, loadMessages])

  async function handleUnlock() {
    if (!activeAddress) return
    setUnlocking(true)
    setError(null)
    try {
      const kp = await deriveEncryptionKeypair(
        (txns) => signTransactions(txns),
        activeAddress
      )
      setKeypair(kp)
      saveKeypair(activeAddress, kp)
      await loadMessages(kp)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock'
      setError(msg)
    } finally {
      setUnlocking(false)
    }
  }

  function toggleReveal(txId: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId)
      else next.add(txId)
      return next
    })
  }

  function handleCopyMessage(e: React.MouseEvent, text: string, txId: string) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedId(txId)
    setTimeout(() => setCopiedId(null), 1500)
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (!activeAddress) {
    return (
      <div className="inbox-empty">
        <p>Connect your wallet to see your messages.</p>
      </div>
    )
  }

  if (!keypair) {
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
          <p>Sign a transaction to unlock your encrypted inbox.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="inbox">
      <div className="inbox-header">
        <div>
          <h3>Inbox</h3>
          {lastUpdated && (
            <span className="last-updated">Last updated at {formatTime(lastUpdated)}</span>
          )}
        </div>
        <div className="inbox-actions">
          <button
            className="btn btn-secondary"
            onClick={() => loadMessages(keypair)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (activeAddress) clearKeypair(activeAddress)
              setKeypair(null)
              setMessages([])
            }}
          >
            Lock
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {messages.length === 0 && !loading && (
        <div className="inbox-empty">
          <p>No messages yet.</p>
        </div>
      )}

      <div className="message-list">
        {messages.map((msg) => (
          <div key={msg.txId} className="message-card" onClick={() => toggleReveal(msg.txId)}>
            <div className="message-header">
              <span className="message-sender">
                {msg.senderName ? (
                  <>{msg.senderName} <span className="message-sender-addr">{shortenAddress(msg.sender)}</span></>
                ) : (
                  shortenAddress(msg.sender)
                )}
              </span>
              <span className="message-time">{timeAgo(msg.timestamp)}</span>
            </div>
            {revealed.has(msg.txId) ? (
              <div className="message-revealed">
                <div className="message-code-block">
                  <pre className="message-code">{msg.text ?? '[Could not decrypt]'}</pre>
                  {msg.text && (
                    <button
                      className="btn-copy message-copy"
                      onClick={(e) => handleCopyMessage(e, msg.text!, msg.txId)}
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
                <div className="message-body">
                  <span />
                  <a
                    className="btn-action"
                    href={`https://explorer.perawallet.app/tx/${msg.txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on explorer
                  </a>
                </div>
              </div>
            ) : (
              <div className="message-body">
                <p className="message-hidden">Click to reveal</p>
                <a
                  className="btn-action"
                  href={`https://explorer.perawallet.app/tx/${msg.txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on explorer
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
