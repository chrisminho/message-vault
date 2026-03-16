'use client'

import { useFeed } from '@/hooks/useFeed'
import PostCard from './PostCard'

export default function Feed() {
  const { posts, loading, error, refresh } = useFeed()

  return (
    <div className="feed">
      <div className="feed-header">
        <h2>Global Feed</h2>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {!loading && posts.length === 0 && (
        <p className="empty-feed">
          No posts yet. Be the first to post on-chain!
        </p>
      )}
      {posts.map((item) => (
        <PostCard key={item.txId} item={item} onRefresh={refresh} />
      ))}
    </div>
  )
}
