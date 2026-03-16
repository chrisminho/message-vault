'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchSocialTransactions } from '@/lib/algorand'
import { decodeSocialNote, type FeedItem, type SocialPost } from '@/lib/types'

export function useFeed() {
  const [posts, setPosts] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSocialTransactions(100)
      const txns = result.transactions || []

      const allItems: FeedItem[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const txn of txns as any[]) {
        if (!txn.note || !txn.id) continue
        const post = decodeSocialNote(txn.note)
        if (!post) continue

        allItems.push({
          txId: txn.id as string,
          sender: txn.sender as string,
          post,
          confirmedRound: txn['confirmed-round'] as number,
          replies: [],
        })
      }

      // Build thread structure: attach replies to their parents
      const byTxId = new Map<string, FeedItem>()
      for (const item of allItems) {
        byTxId.set(item.txId, item)
      }

      const topLevel: FeedItem[] = []
      for (const item of allItems) {
        if (item.post.parent && byTxId.has(item.post.parent)) {
          byTxId.get(item.post.parent)!.replies.push(item)
        } else {
          topLevel.push(item)
        }
      }

      // Newest first
      topLevel.sort((a, b) => b.post.ts - a.post.ts)

      setPosts(topLevel)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load feed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  return { posts, loading, error, refresh: loadFeed }
}
