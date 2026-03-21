'use client'

import { useState, useEffect } from 'react'
import { useChain } from '@/lib/chain-context'
import { fetchIncomingDMs as fetchAlgorandIncomingDMs, fetchSentDMs as fetchAlgorandSentDMs, fetchRegistrations as fetchAlgorandRegistrations, decodeNote, type Registration } from '@/lib/algorand'
import { fetchIncomingDMs as fetchSolanaIncomingDMs, fetchSentDMs as fetchSolanaSentDMs, fetchRegistrations as fetchSolanaRegistrations } from '@/lib/solana'
import { shortenAddress, timeAgo } from '@/lib/types'

interface ConversationSummary {
  peerAddress: string
  peerName?: string
  lastTimestamp: number
}

interface ConversationListProps {
  activeAddress: string
  onSelectPeer: (peerAddress: string) => void
}

export default function ConversationList({ activeAddress, onSelectPeer }: ConversationListProps) {
  const { chain } = useChain()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const peerTimestamps = new Map<string, number>()

        if (chain === 'solana') {
          const [incoming, sent] = await Promise.all([
            fetchSolanaIncomingDMs(activeAddress),
            fetchSolanaSentDMs(activeAddress),
          ])

          for (const dm of incoming) {
            const existing = peerTimestamps.get(dm.sender) ?? 0
            if (dm.timestamp > existing) peerTimestamps.set(dm.sender, dm.timestamp)
          }

          for (const dm of sent) {
            const existing = peerTimestamps.get(dm.receiver) ?? 0
            if (dm.timestamp > existing) peerTimestamps.set(dm.receiver, dm.timestamp)
          }

          const peerAddresses = Array.from(peerTimestamps.keys())
          const regs = peerAddresses.length > 0 ? await fetchSolanaRegistrations(peerAddresses) : new Map()

          const convos: ConversationSummary[] = peerAddresses
            .map(addr => ({
              peerAddress: addr,
              peerName: regs.get(addr)?.name,
              lastTimestamp: peerTimestamps.get(addr) ?? 0,
            }))
            .sort((a, b) => b.lastTimestamp - a.lastTimestamp)

          setConversations(convos)
        } else {
          // Algorand path (existing logic)
          const [incomingResult, sentResult] = await Promise.all([
            fetchAlgorandIncomingDMs(activeAddress, 200),
            fetchAlgorandSentDMs(activeAddress, 200),
          ])

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const txn of (incomingResult.transactions || []) as any[]) {
            if (!txn.note || !txn.sender) continue
            try {
              const noteStr = decodeNote(txn.note)
              if (!noteStr || !noteStr.startsWith('messagevault:')) continue
              const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
              if (parsed.type !== 'dm') continue
              const ts = txn.roundTime ?? txn['round-time'] ?? 0
              const existing = peerTimestamps.get(txn.sender) ?? 0
              if (ts > existing) peerTimestamps.set(txn.sender, ts)
            } catch { continue }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const txn of (sentResult.transactions || []) as any[]) {
            if (!txn.note || !txn.id) continue
            const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver
            if (!receiver) continue
            const ts = txn.roundTime ?? txn['round-time'] ?? 0
            const existing = peerTimestamps.get(receiver) ?? 0
            if (ts > existing) peerTimestamps.set(receiver, ts)
          }

          const peerAddresses = Array.from(peerTimestamps.keys())
          let regs = new Map<string, Registration>()
          if (peerAddresses.length > 0) {
            regs = await fetchAlgorandRegistrations(peerAddresses)
          }

          const convos: ConversationSummary[] = peerAddresses
            .map(addr => ({
              peerAddress: addr,
              peerName: regs.get(addr)?.name,
              lastTimestamp: peerTimestamps.get(addr) ?? 0,
            }))
            .sort((a, b) => b.lastTimestamp - a.lastTimestamp)

          setConversations(convos)
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [activeAddress, chain])

  if (loading) {
    return (
      <div className="inbox-empty loading">
        <p>Loading conversations...</p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="inbox-empty">
        <p>No conversations yet.</p>
      </div>
    )
  }

  return (
    <div className="conversation-list">
      {conversations.map(convo => (
        <div
          key={convo.peerAddress}
          className="conversation-item"
          onClick={() => onSelectPeer(convo.peerAddress)}
        >
          <div className="conversation-info">
            <span className="conversation-name">
              {convo.peerName || shortenAddress(convo.peerAddress)}
            </span>
            {convo.peerName && (
              <span className="conversation-addr">{shortenAddress(convo.peerAddress)}</span>
            )}
          </div>
          <span className="conversation-time">{timeAgo(convo.lastTimestamp)}</span>
        </div>
      ))}
    </div>
  )
}
