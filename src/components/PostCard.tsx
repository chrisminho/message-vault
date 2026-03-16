'use client'

import { useState } from 'react'
import type { FeedItem } from '@/lib/types'
import { shortenAddress, timeAgo } from '@/lib/types'
import PostComposer from './PostComposer'

interface PostCardProps {
  item: FeedItem
  onRefresh?: () => void
  depth?: number
}

export default function PostCard({ item, onRefresh, depth = 0 }: PostCardProps) {
  const [showReply, setShowReply] = useState(false)

  return (
    <div className={`post-card ${depth > 0 ? 'post-reply' : ''}`}>
      <div className="post-header">
        <span className="post-author">{shortenAddress(item.sender)}</span>
        <span className="post-time">{timeAgo(item.post.ts)}</span>
      </div>
      <p className="post-text">{item.post.text}</p>
      <div className="post-actions">
        <button
          className="btn-action"
          onClick={() => setShowReply(!showReply)}
        >
          {showReply ? 'Cancel' : 'Reply'}
        </button>
        <a
          className="btn-action"
          href={`https://explorer.perawallet.app/tx/${item.txId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Tx
        </a>
        <span className="post-round">Round #{item.confirmedRound}</span>
      </div>
      {showReply && (
        <PostComposer
          parentTxId={item.txId}
          placeholder={`Reply to ${shortenAddress(item.sender)}...`}
          onPostSuccess={() => {
            setShowReply(false)
            onRefresh?.()
          }}
        />
      )}
      {item.replies.length > 0 && (
        <div className="replies">
          {item.replies.map((reply) => (
            <PostCard
              key={reply.txId}
              item={reply}
              onRefresh={onRefresh}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
