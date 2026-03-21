import nacl from 'tweetnacl'

/**
 * Derive a NaCl box keypair from a Phantom wallet signature.
 *
 * Phantom supports signMessage natively, so we sign a fixed message
 * and use SHA-256(signature) → 32-byte seed → X25519 keypair.
 * This is much simpler than the Algorand approach (no dummy transaction needed).
 */
export async function deriveEncryptionKeypairSolana(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<nacl.BoxKeyPair> {
  const message = new TextEncoder().encode('messagevault-keygen-v1')
  const signature = await signMessage(message)
  if (!signature) throw new Error('Message signing was rejected')

  // SHA-256(signature) → 32-byte seed → X25519 keypair
  const hash = await crypto.subtle.digest('SHA-256', signature.buffer as ArrayBuffer)
  const seed = new Uint8Array(hash)

  return nacl.box.keyPair.fromSecretKey(seed)
}
