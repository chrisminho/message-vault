'use client'

import { useState, useCallback } from 'react'
import nacl from 'tweetnacl'
import { fetchIncomingDMs } from '@/lib/algorand'
import { decryptMessage, base64ToUint8 } from '@/lib/crypto'
import { APP_PREFIX } from '@/lib/types'

export interface DecryptedDM {
  txId: string
  sender: string
  text: string | null // null if decryption failed
  timestamp: number
  round: number
}

export interface Conversation {
  address: string
  messages: DecryptedDM[]
  lastTimestamp: number
}

export function useInbox(keypair: nacl.BoxKeyPair | null) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInbox = useCallback(async (address: string) => {
    if (!keypair || !address) return

    setLoading(true)
    setError(null)
    try {
      const result = await fetchIncomingDMs(address)
      const txns = result.transactions || []
      const messages: DecryptedDM[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const txn of txns as any[]) {
        if (!txn.note || !txn.id) continue

        try {
          // Decode base64 note from indexer
          const noteStr = atob(txn.note)
          if (!noteStr.startsWith(APP_PREFIX)) continue

          const json = noteStr.slice(APP_PREFIX.length)
          const parsed = JSON.parse(json)
          if (parsed.type !== 'dm') continue

          const ciphertext = base64ToUint8(parsed.ct)
          const nonce = base64ToUint8(parsed.n)
          const ephemeralPubKey = base64ToUint8(parsed.ek)

          const text = decryptMessage(ciphertext, nonce, ephemeralPubKey, keypair.secretKey)

          messages.push({
            txId: txn.id as string,
            sender: txn.sender as string,
            text,
            timestamp: txn['round-time'] as number,
            round: txn['confirmed-round'] as number,
          })
        } catch {
          // Skip malformed messages
        }
      }

      // Group by sender
      const bySender = new Map<string, DecryptedDM[]>()
      for (const msg of messages) {
        const key = msg.sender
        if (!bySender.has(key)) bySender.set(key, [])
        bySender.get(key)!.push(msg)
      }

      // Build conversations sorted by most recent
      const convos: Conversation[] = []
      for (const [addr, msgs] of bySender) {
        msgs.sort((a, b) => a.timestamp - b.timestamp)
        convos.push({
          address: addr,
          messages: msgs,
          lastTimestamp: msgs[msgs.length - 1].timestamp,
        })
      }
      convos.sort((a, b) => b.lastTimestamp - a.lastTimestamp)

      setConversations(convos)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [keypair])

  return { conversations, loading, error, refresh: loadInbox }
}
