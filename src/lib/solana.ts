import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js'
import { uint8ToBase64 } from './crypto'

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

export const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed')

/** SPL Memo Program v2 */
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const APP_PREFIX = 'messagevault:'

// ---------- Address Validation ----------

export function validateSolanaAddress(address: string): boolean {
  try {
    const pk = new PublicKey(address)
    return PublicKey.isOnCurve(pk)
  } catch {
    return false
  }
}

// ---------- Registration ----------

export interface SolanaRegistration {
  pk: string      // encryption public key (base64)
  name?: string   // optional username
}

/**
 * Fetch the most recent registration for a Solana address.
 * Scans transaction history for messagevault registration memos.
 */
export async function fetchRegistration(address: string): Promise<SolanaRegistration | null> {
  try {
    const pubkey = new PublicKey(address)
    const signatures = await solanaConnection.getSignaturesForAddress(pubkey, { limit: 200 })

    for (const sigInfo of signatures) {
      try {
        const tx = await solanaConnection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        })
        if (!tx?.meta || tx.meta.err) continue

        const memo = extractMemo(tx)
        if (!memo || !memo.startsWith(APP_PREFIX)) continue

        const json = JSON.parse(memo.slice(APP_PREFIX.length))
        if (json.type === 'register' && json.pk) {
          return { pk: json.pk, name: json.name || undefined }
        }
      } catch {
        continue
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Fetch registrations for multiple addresses in parallel.
 */
export async function fetchRegistrations(addresses: string[]): Promise<Map<string, SolanaRegistration>> {
  const map = new Map<string, SolanaRegistration>()
  const results = await Promise.all(
    addresses.map(a => fetchRegistration(a).then(r => [a, r] as const))
  )
  for (const [addr, reg] of results) {
    if (reg) map.set(addr, reg)
  }
  return map
}

// ---------- DM Fetching ----------

export interface SolanaConversationMessage {
  txId: string
  sender: string
  receiver: string
  timestamp: number
  direction: 'sent' | 'received'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

/**
 * Fetch conversation between two Solana addresses.
 */
export async function fetchConversation(
  myAddress: string,
  peerAddress: string
): Promise<SolanaConversationMessage[]> {
  const [incoming, sent] = await Promise.all([
    fetchIncomingDMs(myAddress),
    fetchSentDMs(myAddress),
  ])

  const messages: SolanaConversationMessage[] = []

  // Filter incoming to only from peer
  for (const msg of incoming) {
    if (msg.sender === peerAddress) {
      messages.push({ ...msg, direction: 'received' })
    }
  }

  // Filter sent to only to peer
  for (const msg of sent) {
    if (msg.receiver === peerAddress) {
      messages.push({ ...msg, direction: 'sent' })
    }
  }

  // Sort chronologically (oldest first, like a chat)
  messages.sort((a, b) => a.timestamp - b.timestamp)
  return messages
}

interface RawDM {
  txId: string
  sender: string
  receiver: string
  timestamp: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

/**
 * Fetch incoming DMs for a Solana address.
 */
export async function fetchIncomingDMs(address: string): Promise<RawDM[]> {
  const pubkey = new PublicKey(address)
  const signatures = await solanaConnection.getSignaturesForAddress(pubkey, { limit: 200 })
  const dms: RawDM[] = []

  for (const sigInfo of signatures) {
    try {
      const tx = await solanaConnection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      })
      if (!tx?.meta || tx.meta.err) continue

      const memo = extractMemo(tx)
      if (!memo || !memo.startsWith(APP_PREFIX)) continue

      const json = JSON.parse(memo.slice(APP_PREFIX.length))
      if (json.type !== 'dm') continue

      // Determine sender and receiver from the transfer instruction
      const { sender, receiver } = extractTransferParties(tx)
      if (!sender || !receiver) continue

      // Only include if we're the receiver
      if (receiver !== address) continue

      dms.push({
        txId: sigInfo.signature,
        sender,
        receiver,
        timestamp: sigInfo.blockTime ?? 0,
        payload: json,
      })
    } catch {
      continue
    }
  }

  return dms
}

/**
 * Fetch sent DMs from a Solana address.
 */
export async function fetchSentDMs(address: string): Promise<RawDM[]> {
  const pubkey = new PublicKey(address)
  const signatures = await solanaConnection.getSignaturesForAddress(pubkey, { limit: 200 })
  const dms: RawDM[] = []

  for (const sigInfo of signatures) {
    try {
      const tx = await solanaConnection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      })
      if (!tx?.meta || tx.meta.err) continue

      const memo = extractMemo(tx)
      if (!memo || !memo.startsWith(APP_PREFIX)) continue

      const json = JSON.parse(memo.slice(APP_PREFIX.length))
      if (json.type !== 'dm') continue

      const { sender, receiver } = extractTransferParties(tx)
      if (!sender || !receiver) continue

      // Only include if we're the sender
      if (sender !== address) continue

      dms.push({
        txId: sigInfo.signature,
        sender,
        receiver,
        timestamp: sigInfo.blockTime ?? 0,
        payload: json,
      })
    } catch {
      continue
    }
  }

  return dms
}

export interface SolanaKnownContact {
  address: string
  name?: string
}

/**
 * Fetch unique sender addresses from incoming DMs, with usernames resolved.
 */
export async function fetchKnownSenders(address: string): Promise<SolanaKnownContact[]> {
  try {
    const incoming = await fetchIncomingDMs(address)
    const senderAddrs = new Set<string>()

    for (const dm of incoming) {
      senderAddrs.add(dm.sender)
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

// ---------- Transaction Building ----------

/**
 * Build and send a DM transaction on Solana.
 * Uses SystemProgram.transfer(0 lamports) + SPL Memo instruction.
 */
export async function sendDM(
  senderPubkey: PublicKey,
  recipientAddress: string,
  noteBytes: Uint8Array,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  connection: Connection
): Promise<string> {
  const recipientPubkey = new PublicKey(recipientAddress)

  const tx = new Transaction()

  // 0-lamport transfer to establish sender→receiver relationship
  tx.add(
    SystemProgram.transfer({
      fromPubkey: senderPubkey,
      toPubkey: recipientPubkey,
      lamports: 0,
    })
  )

  // SPL Memo instruction with encrypted payload
  tx.add(
    new TransactionInstruction({
      keys: [{ pubkey: senderPubkey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(noteBytes),
    })
  )

  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = senderPubkey

  const signed = await signTransaction(tx)
  const signature = await connection.sendRawTransaction(signed.serialize())
  await connection.confirmTransaction(signature, 'confirmed')

  return signature
}

/**
 * Build and send a registration memo transaction on Solana.
 */
export async function register(
  senderPubkey: PublicKey,
  encryptionPubKey: Uint8Array,
  username: string | undefined,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  connection: Connection
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    app: 'messagevault',
    type: 'register',
    pk: uint8ToBase64(encryptionPubKey),
  }
  if (username) payload.name = username

  const memoData = new TextEncoder().encode(`${APP_PREFIX}${JSON.stringify(payload)}`)

  const tx = new Transaction()
  tx.add(
    new TransactionInstruction({
      keys: [{ pubkey: senderPubkey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoData),
    })
  )

  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = senderPubkey

  const signed = await signTransaction(tx)
  const signature = await connection.sendRawTransaction(signed.serialize())
  await connection.confirmTransaction(signature, 'confirmed')

  return signature
}

// ---------- Helpers ----------

/**
 * Extract memo string from a parsed Solana transaction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMemo(tx: any): string | null {
  const instructions = tx.transaction?.message?.instructions || []
  for (const ix of instructions) {
    // Parsed memo instruction
    if (ix.program === 'spl-memo' && ix.parsed) {
      return typeof ix.parsed === 'string' ? ix.parsed : null
    }
    // Raw instruction with memo program ID
    if (ix.programId?.toString() === MEMO_PROGRAM_ID.toString() && ix.data) {
      try {
        return Buffer.from(ix.data, 'base64').toString('utf-8')
      } catch {
        return null
      }
    }
  }

  // Check inner instructions too
  const innerInstructions = tx.meta?.innerInstructions || []
  for (const inner of innerInstructions) {
    for (const ix of inner.instructions || []) {
      if (ix.program === 'spl-memo' && ix.parsed) {
        return typeof ix.parsed === 'string' ? ix.parsed : null
      }
    }
  }

  return null
}

/**
 * Extract sender and receiver from a parsed transaction's transfer instruction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTransferParties(tx: any): { sender: string | null; receiver: string | null } {
  const instructions = tx.transaction?.message?.instructions || []
  for (const ix of instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      return {
        sender: ix.parsed.info?.source || null,
        receiver: ix.parsed.info?.destination || null,
      }
    }
  }
  // If no transfer, use fee payer as sender
  const accountKeys = tx.transaction?.message?.accountKeys || []
  const feePayer = accountKeys[0]?.pubkey?.toString() || null
  return { sender: feePayer, receiver: null }
}
