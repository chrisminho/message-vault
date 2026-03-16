import algosdk from 'algosdk'

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
}

/**
 * Fetch the most recent registration for an address.
 * Returns the latest registration (users can re-register to update username).
 */
export async function fetchRegistration(address: string): Promise<Registration | null> {
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
export async function fetchAllGlobalTransactions(): Promise<GlobalTxn[]> {
  // Step 1: Get all hub transactions (registrations, posts, replies)
  const hubTxns: GlobalTxn[] = []
  let nextToken: string | undefined
  const registeredAddresses = new Set<string>()

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
        if (json.type === 'register') {
          registeredAddresses.add(txn.sender as string)
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
  return allTxns
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
