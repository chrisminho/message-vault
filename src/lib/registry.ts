import algosdk from 'algosdk'
import { uint8ToBase64 } from './crypto'
import type { Registration } from './algorand'

const REGISTRY_APP_ID = Number(process.env.NEXT_PUBLIC_REGISTRY_APP_ID || '0')

// Box MBR: 2500 + 400 * (32 + 66) = 41700 microALGO
const BOX_MBR = 41700

/**
 * Check if the contract registry is configured (app ID is set).
 */
export function isRegistryConfigured(): boolean {
  return REGISTRY_APP_ID > 0
}

/**
 * Register on the smart contract registry.
 * Groups an MBR payment (for new registrations) + ABI app call.
 */
export async function registerOnContract(
  algodClient: algosdk.Algodv2,
  signer: algosdk.TransactionSigner,
  address: string,
  pk: Uint8Array,
  username?: string
): Promise<string> {
  const suggestedParams = await algodClient.getTransactionParams().do()
  const atc = new algosdk.AtomicTransactionComposer()

  // Check if already registered (box exists)
  const alreadyRegistered = await isRegisteredOnContract(algodClient, address)

  if (!alreadyRegistered) {
    // New registration: prepend MBR payment to the app address
    const appAddr = algosdk.getApplicationAddress(REGISTRY_APP_ID)
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: address,
      receiver: appAddr,
      amount: BOX_MBR,
      suggestedParams,
    })
    atc.addTransaction({ txn: payTxn, signer })
  }

  // ABI method call: register(byte[32], string)
  const contract = new algosdk.ABIContract({
    name: 'MessageVaultRegistry',
    methods: [
      {
        name: 'register',
        args: [
          { type: 'byte[32]', name: 'pk' },
          { type: 'string', name: 'username' },
        ],
        returns: { type: 'void' },
      },
    ],
  })

  const method = contract.getMethodByName('register')

  // Encode the 32-byte public key as a Uint8Array
  const pkArg = pk
  const usernameArg = username || ''

  // Box reference: sender's address (32 bytes)
  const senderPk = algosdk.decodeAddress(address).publicKey

  atc.addMethodCall({
    appID: REGISTRY_APP_ID,
    method,
    methodArgs: [pkArg, usernameArg],
    sender: address,
    signer,
    suggestedParams,
    boxes: [{ appIndex: REGISTRY_APP_ID, name: senderPk }],
  })

  const result = await atc.execute(algodClient, 4)
  return result.txIDs[result.txIDs.length - 1]
}

/**
 * Deregister from the smart contract registry.
 * Deletes the sender's box and refunds the MBR deposit.
 */
export async function deregisterFromContract(
  algodClient: algosdk.Algodv2,
  signer: algosdk.TransactionSigner,
  address: string
): Promise<string> {
  const suggestedParams = await algodClient.getTransactionParams().do()
  const atc = new algosdk.AtomicTransactionComposer()

  const contract = new algosdk.ABIContract({
    name: 'MessageVaultRegistry',
    methods: [
      {
        name: 'deregister',
        args: [],
        returns: { type: 'void' },
      },
    ],
  })

  const method = contract.getMethodByName('deregister')
  const senderPk = algosdk.decodeAddress(address).publicKey

  atc.addMethodCall({
    appID: REGISTRY_APP_ID,
    method,
    methodArgs: [],
    sender: address,
    signer,
    suggestedParams,
    boxes: [{ appIndex: REGISTRY_APP_ID, name: senderPk }],
  })

  const result = await atc.execute(algodClient, 4)
  return result.txIDs[result.txIDs.length - 1]
}

/**
 * Fetch a registration from the contract via direct box read.
 * Returns null if the box doesn't exist.
 */
export async function fetchRegistrationFromContract(
  algodClient: algosdk.Algodv2,
  address: string
): Promise<Registration | null> {
  if (!isRegistryConfigured()) return null

  try {
    const senderPk = algosdk.decodeAddress(address).publicKey
    const boxName = senderPk
    const boxResponse = await algodClient
      .getApplicationBoxByName(REGISTRY_APP_ID, boxName)
      .do()

    const boxValue = boxResponse.value as Uint8Array
    if (!boxValue || boxValue.length < 34) return null

    // Parse box value:
    // bytes 0-31: encryption public key
    // bytes 32-33: username length (big-endian uint16)
    // bytes 34+: username
    const pk = boxValue.slice(0, 32)
    const nameLen = (boxValue[32] << 8) | boxValue[33]
    let name: string | undefined
    if (nameLen > 0 && boxValue.length >= 34 + nameLen) {
      name = new TextDecoder().decode(boxValue.slice(34, 34 + nameLen))
    }

    return { pk: uint8ToBase64(pk), name }
  } catch {
    // Box not found or other error
    return null
  }
}

/**
 * Check if an address is registered on the contract.
 */
export async function isRegisteredOnContract(
  algodClient: algosdk.Algodv2,
  address: string
): Promise<boolean> {
  if (!isRegistryConfigured()) return false

  try {
    const senderPk = algosdk.decodeAddress(address).publicKey
    await algodClient
      .getApplicationBoxByName(REGISTRY_APP_ID, senderPk)
      .do()
    return true
  } catch {
    return false
  }
}
