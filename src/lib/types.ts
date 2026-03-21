export type Chain = 'solana' | 'algorand'

export const APP_PREFIX = 'messagevault:'

export interface SocialPost {
  app: 'messagevault'
  type: 'post' | 'reply'
  text: string
  parent: string | null // parent tx ID for replies
  ts: number // unix timestamp (seconds)
}

export interface FeedItem {
  txId: string
  sender: string
  post: SocialPost
  confirmedRound: number
  replies: FeedItem[]
}

export function encodeSocialNote(post: SocialPost): Uint8Array {
  const json = JSON.stringify(post)
  return new TextEncoder().encode(`${APP_PREFIX}${json}`)
}

export function decodeSocialNote(note: string | Uint8Array): SocialPost | null {
  try {
    let str: string
    if (typeof note === 'string') {
      // Indexer returns base64
      str = atob(note)
    } else {
      str = new TextDecoder().decode(note)
    }

    if (!str.startsWith(APP_PREFIX)) return null

    const json = str.slice(APP_PREFIX.length)
    const parsed = JSON.parse(json)

    if (parsed.app !== 'messagevault') return null
    return parsed as SocialPost
  } catch {
    return null
  }
}

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
