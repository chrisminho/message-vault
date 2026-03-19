import algosdk from 'algosdk'
import { fetchRegistrationFromContract } from './registry'

const algodServer = process.env.NEXT_PUBLIC_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud'
const algodPort = process.env.NEXT_PUBLIC_ALGOD_PORT || '443'
const algodToken = process.env.NEXT_PUBLIC_ALGOD_TOKEN || ''

const indexerServer = process.env.NEXT_PUBLIC_INDEXER_SERVER || 'https://mainnet-idx.algonode.cloud'
const indexerPort = process.env.NEXT_PUBLIC_INDEXER_PORT || '443'
const indexerToken = process.env.NEXT_PUBLIC_INDEXER_TOKEN || ''

export const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort)
export const indexerClient = new algosdk.Indexer(indexerToken, indexerServer, indexerPort)

const notePrefixBytes = new TextEncoder().encode('messagevault:')

/**
 * Decode a transaction note to a string, handling both Uint8Array and base64 string formats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeNote(note: any): string | null {
  if (!note) return null
  if (note instanceof Uint8Array) return new TextDecoder().decode(note)
  if (typeof note === 'string') {
    // Could be base64 or already decoded — try base64 first
    try {
      const decoded = atob(note)
      if (decoded.startsWith('messagevault:')) return decoded
    } catch { /* not valid base64 */ }
    // Maybe it's already a plain string
    if (note.startsWith('messagevault:')) return note
  }
  return null
}

// Deterministic "hub" address: SHA-256("messagevault-hub-v1") encoded as Algorand address.
// Nobody controls this key. Registration txns are sent TO this address so the indexer
// can look up a user's encryption public key.
export const HUB_ADDRESS = 'A2CVJALDZQCNFDHPZWVRETC36MBOI6JAMN33AU24LINTHNSJPUTTCXFJIA'

export async function fetchSocialTransactions(limit = 50, nextToken?: string) {
  let query = indexerClient
    .searchForTransactions()
    .address(HUB_ADDRESS)
    .addressRole('receiver')
    .notePrefix(notePrefixBytes)
    .txType('pay')
    .limit(limit)

  if (nextToken) {
    query = query.nextToken(nextToken)
  }

  return query.do()
}

export async function fetchTransactionsByAddress(address: string, limit = 50) {
  return indexerClient
    .searchForTransactions()
    .address(address)
    .addressRole('sender')
    .notePrefix(notePrefixBytes)
    .txType('pay')
    .limit(limit)
    .do()
}

export interface Registration {
  pk: string        // encryption public key (base64)
  name?: string     // optional username
  source?: 'contract' | 'hub'  // where the registration was found
}

/**
 * Fetch the most recent registration for an address.
 * Tries smart contract box read first, falls back to hub-address indexer query.
 */
export async function fetchRegistration(address: string): Promise<Registration | null> {
  // Try contract first
  const contractReg = await fetchRegistrationFromContract(algodClient, address)
  if (contractReg) return { ...contractReg, source: 'contract' }

  // Fallback: hub-address indexer query (legacy registrations)
  const hubReg = await fetchRegistrationFromHub(address)
  if (hubReg) return { ...hubReg, source: 'hub' }

  return null
}

/**
 * Legacy: fetch registration from hub-address indexer query.
 */
async function fetchRegistrationFromHub(address: string): Promise<Registration | null> {
  try {
    let nextToken: string | undefined
    const MAX_PAGES = 10

    // Indexer returns newest transactions first, so the first
    // registration we find is the most recent one.
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = indexerClient
        .searchForTransactions()
        .address(address)
        .addressRole('sender')
        .notePrefix(notePrefixBytes)
        .txType('pay')
        .limit(100)

      if (nextToken) query = query.nextToken(nextToken)

      const result = await query.do()
      const txns = result.transactions || []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const txn of txns as any[]) {
        if (!txn.note) continue
        const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver
        if (receiver !== HUB_ADDRESS) continue
        try {
          const noteStr = decodeNote(txn.note)
          if (!noteStr || !noteStr.startsWith('messagevault:')) continue
          const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
          if (parsed.type === 'register' && parsed.pk) {
            return { pk: parsed.pk, name: parsed.name || undefined }
          }
        } catch {
          continue
        }
      }

      nextToken = result.nextToken
      if (!nextToken || txns.length === 0) break
    }

    return null
  } catch {
    return null
  }
}

/**
 * Fetch registrations for multiple addresses in parallel.
 */
export async function fetchRegistrations(addresses: string[]): Promise<Map<string, Registration>> {
  const map = new Map<string, Registration>()
  const results = await Promise.all(addresses.map(a => fetchRegistration(a).then(r => [a, r] as const)))
  for (const [addr, reg] of results) {
    if (reg) map.set(addr, reg)
  }
  return map
}

/**
 * Fetch incoming DMs: transactions sent TO the given address with messagevault: note prefix.
 */
/**
 * Fetch ALL messagevault transactions globally by:
 * 1. Getting all registered addresses from the hub
 * 2. Querying each registered user's sent transactions
 * 3. Merging and sorting by timestamp (newest first)
 * Returns a flat list of all transactions across all users.
 */
export interface GlobalFeedResult {
  txns: GlobalTxn[]
  registrations: Map<string, Registration>
}

export async function fetchAllGlobalTransactions(): Promise<GlobalFeedResult> {
  // Step 1: Get all hub transactions (registrations, posts, replies)
  const hubTxns: GlobalTxn[] = []
  let nextToken: string | undefined
  const registeredAddresses = new Set<string>()
  const registrations = new Map<string, Registration>()

  // Paginate through all hub transactions
  for (let page = 0; page < 10; page++) {
    let query = indexerClient
      .searchForTransactions()
      .address(HUB_ADDRESS)
      .addressRole('receiver')
      .notePrefix(notePrefixBytes)
      .txType('pay')
      .limit(100)

    if (nextToken) query = query.nextToken(nextToken)
    const result = await query.do()
    const txns = result.transactions || []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const txn of txns as any[]) {
      if (!txn.note || !txn.id) continue
      const noteStr = decodeNote(txn.note)
      if (!noteStr || !noteStr.startsWith('messagevault:')) continue
      try {
        const json = JSON.parse(noteStr.slice('messagevault:'.length))
        const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver ?? ''
        hubTxns.push({
          txId: txn.id,
          type: json.type || 'unknown',
          from: txn.sender,
          to: receiver,
          payload: json,
          timestamp: txn.roundTime ?? txn['round-time'] ?? 0,
        })
        if (json.type === 'register' && json.pk) {
          registeredAddresses.add(txn.sender as string)
          // Keep latest registration per address (indexer returns newest first)
          if (!registrations.has(txn.sender as string)) {
            registrations.set(txn.sender as string, { pk: json.pk, name: json.name || undefined })
          }
        }
      } catch { continue }
    }

    nextToken = result.nextToken
    if (!nextToken || txns.length === 0) break
  }

  // Step 2: For each registered address, fetch their sent transactions (captures DMs)
  const hubTxIds = new Set(hubTxns.map(t => t.txId))
  const dmFetches = Array.from(registeredAddresses).map(async (addr) => {
    try {
      const result = await fetchTransactionsByAddress(addr, 100)
      const txns = result.transactions || []
      const dmTxns: GlobalTxn[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const txn of txns as any[]) {
        if (!txn.note || !txn.id) continue
        if (hubTxIds.has(txn.id)) continue // already have from hub query
        const noteStr = decodeNote(txn.note)
        if (!noteStr || !noteStr.startsWith('messagevault:')) continue
        try {
          const json = JSON.parse(noteStr.slice('messagevault:'.length))
          const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver ?? ''
          dmTxns.push({
            txId: txn.id,
            type: json.type || 'unknown',
            from: txn.sender,
            to: receiver,
            payload: json,
            timestamp: txn.roundTime ?? txn['round-time'] ?? 0,
          })
        } catch { continue }
      }
      return dmTxns
    } catch {
      return []
    }
  })

  const dmResults = await Promise.all(dmFetches)
  const allTxns = [...hubTxns, ...dmResults.flat()]

  // Sort newest first
  allTxns.sort((a, b) => b.timestamp - a.timestamp)

  // Supplement with contract-based registrations for addresses missing from hub
  const allAddrs = new Set(allTxns.map(t => t.from))
  const missingAddrs = [...allAddrs].filter(a => !registrations.has(a))
  if (missingAddrs.length > 0) {
    const contractRegs = await fetchRegistrations(missingAddrs)
    for (const [addr, reg] of contractRegs) {
      registrations.set(addr, reg)
    }
  }

  return { txns: allTxns, registrations }
}

export interface GlobalTxn {
  txId: string
  type: string
  from: string
  to: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  timestamp: number
}

export async function fetchIncomingDMs(address: string, limit = 100) {
  return indexerClient
    .searchForTransactions()
    .address(address)
    .addressRole('receiver')
    .notePrefix(notePrefixBytes)
    .txType('pay')
    .limit(limit)
    .do()
}

/**
 * Fetch DMs sent BY the given address (excludes registrations/posts sent to hub).
 */
export async function fetchSentDMs(address: string, limit = 100) {
  const result = await indexerClient
    .searchForTransactions()
    .address(address)
    .addressRole('sender')
    .notePrefix(notePrefixBytes)
    .txType('pay')
    .limit(limit)
    .do()

  const txns = result.transactions || []
  // Filter to only DMs (not registrations/posts sent to hub)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dmTxns = txns.filter((txn: any) => {
    if (!txn.note) return false
    const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver
    if (receiver === HUB_ADDRESS) return false
    try {
      const noteStr = decodeNote(txn.note)
      if (!noteStr || !noteStr.startsWith('messagevault:')) return false
      const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
      return parsed.type === 'dm'
    } catch {
      return false
    }
  })

  return { ...result, transactions: dmTxns }
}

export interface ConversationMessage {
  txId: string
  sender: string
  receiver: string
  timestamp: number
  direction: 'sent' | 'received'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

/**
 * Fetch both incoming and outgoing DMs between two addresses, merged into a sorted timeline.
 */
export async function fetchConversation(myAddress: string, peerAddress: string): Promise<ConversationMessage[]> {
  const [incomingResult, sentResult] = await Promise.all([
    fetchIncomingDMs(myAddress, 200),
    fetchSentDMs(myAddress, 200),
  ])

  const messages: ConversationMessage[] = []

  // Process incoming: filter to only from peer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const txn of (incomingResult.transactions || []) as any[]) {
    if (!txn.note || !txn.id) continue
    if (txn.sender !== peerAddress) continue
    try {
      const noteStr = decodeNote(txn.note)
      if (!noteStr || !noteStr.startsWith('messagevault:')) continue
      const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
      if (parsed.type !== 'dm') continue
      messages.push({
        txId: txn.id,
        sender: txn.sender,
        receiver: myAddress,
        timestamp: txn.roundTime ?? txn['round-time'] ?? 0,
        direction: 'received',
        payload: parsed,
      })
    } catch { continue }
  }

  // Process sent: filter to only to peer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const txn of (sentResult.transactions || []) as any[]) {
    if (!txn.note || !txn.id) continue
    const receiver = txn.paymentTransaction?.receiver ?? txn['payment-transaction']?.receiver
    if (receiver !== peerAddress) continue
    try {
      const noteStr = decodeNote(txn.note)
      if (!noteStr || !noteStr.startsWith('messagevault:')) continue
      const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
      if (parsed.type !== 'dm') continue
      messages.push({
        txId: txn.id,
        sender: myAddress,
        receiver: peerAddress,
        timestamp: txn.roundTime ?? txn['round-time'] ?? 0,
        direction: 'sent',
        payload: parsed,
      })
    } catch { continue }
  }

  // Sort chronologically (oldest first, like a chat)
  messages.sort((a, b) => a.timestamp - b.timestamp)
  return messages
}

export interface KnownContact {
  address: string
  name?: string
}

/**
 * Fetch unique sender addresses from incoming DMs, with usernames resolved.
 */
export async function fetchKnownSenders(address: string): Promise<KnownContact[]> {
  try {
    const result = await fetchIncomingDMs(address, 200)
    const txns = result.transactions || []
    const senderAddrs = new Set<string>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const txn of txns as any[]) {
      if (!txn.note || !txn.sender) continue
      try {
        const noteStr = txn.note instanceof Uint8Array
          ? new TextDecoder().decode(txn.note)
          : typeof txn.note === 'string' ? atob(txn.note) : null
        if (!noteStr || !noteStr.startsWith('messagevault:')) continue
        const parsed = JSON.parse(noteStr.slice('messagevault:'.length))
        if (parsed.type === 'dm') {
          senderAddrs.add(txn.sender as string)
        }
      } catch {
        continue
      }
    }

    const addrs = Array.from(senderAddrs)
    const regs = await fetchRegistrations(addrs)

    return addrs.map(addr => ({
      address: addr,
      name: regs.get(addr)?.name,
    }))
  } catch {
    return []
  }
}
