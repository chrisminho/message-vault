import nacl from 'tweetnacl'
import algosdk from 'algosdk'

/**
 * Derive a NaCl box keypair by signing a deterministic transaction.
 *
 * Ed25519 signatures are deterministic — the same key signing the same
 * bytes always produces the same 64-byte signature. We build a fixed
 * 0-ALGO transaction (never submitted) and ask the wallet to sign it.
 * SHA-256(signature) → 32-byte seed → X25519 keypair.
 *
 * This works with ALL wallets (Pera, Defly, etc.) since every wallet
 * supports signTransactions, unlike signData which many don't.
 */
export async function deriveEncryptionKeypair(
  signTransactions: (txns: algosdk.Transaction[]) => Promise<(Uint8Array | null)[]>,
  address: string
): Promise<nacl.BoxKeyPair> {
  // Use real mainnet genesis info so the wallet accepts it.
  // firstValid/lastValid are in the past so this can never be submitted.
  const MAINNET_GENESIS_HASH = base64ToUint8('wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=')
  const fixedParams: algosdk.SuggestedParams = {
    fee: 0,
    firstValid: 1,
    lastValid: 2,
    genesisID: 'mainnet-v1.0',
    genesisHash: MAINNET_GENESIS_HASH,
    flatFee: true,
    minFee: 0,
  }

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    suggestedParams: fixedParams,
    note: new TextEncoder().encode('messagevault-keygen-v1'),
  })

  const signed = await signTransactions([txn])
  const signedBytes = signed[0]
  if (!signedBytes) throw new Error('Transaction signing was rejected')

  // Extract the 64-byte Ed25519 signature from the signed transaction
  const decoded = algosdk.decodeSignedTransaction(signedBytes)
  const signature = decoded.sig
  if (!signature) throw new Error('No signature found in signed transaction')

  // SHA-256(signature) → 32-byte seed → X25519 keypair
  const hash = await crypto.subtle.digest(
    'SHA-256',
    (signature as Uint8Array).buffer as ArrayBuffer
  )
  const seed = new Uint8Array(hash)

  return nacl.box.keyPair.fromSecretKey(seed)
}

/**
 * Encrypt a message for a recipient using NaCl box (X25519 + XSalsa20-Poly1305).
 * Uses an ephemeral keypair for forward secrecy.
 */
export function encryptMessage(
  plaintext: string,
  receiverPubKey: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array; ephemeralPubKey: Uint8Array } {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const messageBytes = new TextEncoder().encode(plaintext)

  const ciphertext = nacl.box(messageBytes, nonce, receiverPubKey, ephemeral.secretKey)
  if (!ciphertext) throw new Error('Encryption failed')

  return { ciphertext, nonce, ephemeralPubKey: ephemeral.publicKey }
}

/**
 * Decrypt a message using the recipient's derived secret key.
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  ephemeralPubKey: Uint8Array,
  mySecretKey: Uint8Array
): string | null {
  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPubKey, mySecretKey)
  if (!plaintext) return null
  return new TextDecoder().decode(plaintext)
}

/**
 * Encode an encrypted DM payload as a transaction note.
 * Format: "messagevault:" + JSON with base64-encoded fields
 */
export function encodeDMNote(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  ephemeralPubKey: Uint8Array
): Uint8Array {
  const payload = {
    app: 'messagevault',
    type: 'dm',
    ct: uint8ToBase64(ciphertext),
    n: uint8ToBase64(nonce),
    ek: uint8ToBase64(ephemeralPubKey),
  }
  return new TextEncoder().encode(`messagevault:${JSON.stringify(payload)}`)
}

/**
 * Encode a registration note (publishes encryption public key on-chain).
 */
export function encodeRegisterNote(encryptionPubKey: Uint8Array, username?: string): Uint8Array {
  const payload: Record<string, string> = {
    app: 'messagevault',
    type: 'register',
    pk: uint8ToBase64(encryptionPubKey),
  }
  if (username) payload.name = username
  return new TextEncoder().encode(`messagevault:${JSON.stringify(payload)}`)
}

/**
 * Encrypt a message for a recipient using their registered public key (base64).
 * Uses ephemeral keypair for forward secrecy.
 */
export function encryptForRegisteredKey(
  plaintext: string,
  receiverPubKeyB64: string
): Uint8Array {
  const receiverPubKey = base64ToUint8(receiverPubKeyB64)
  const { ciphertext, nonce, ephemeralPubKey } = encryptMessage(plaintext, receiverPubKey)
  return encodeDMNote(ciphertext, nonce, ephemeralPubKey)
}

// --- Keypair persistence (localStorage) ---

const STORAGE_KEY_PREFIX = 'messagevault-keypair-'

export function saveKeypair(address: string, kp: nacl.BoxKeyPair) {
  const data = {
    pk: uint8ToBase64(kp.publicKey),
    sk: uint8ToBase64(kp.secretKey),
  }
  localStorage.setItem(STORAGE_KEY_PREFIX + address, JSON.stringify(data))
}

export function loadKeypair(address: string): nacl.BoxKeyPair | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + address)
    if (!raw) return null
    const data = JSON.parse(raw)
    const publicKey = base64ToUint8(data.pk)
    const secretKey = base64ToUint8(data.sk)
    return { publicKey, secretKey }
  } catch {
    return null
  }
}

export function clearKeypair(address: string) {
  localStorage.removeItem(STORAGE_KEY_PREFIX + address)
}

// --- Base64 helpers ---

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
