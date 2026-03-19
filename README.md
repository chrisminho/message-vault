# MessageVault

Encrypted wallet-to-wallet messaging on Algorand. Send messages to any wallet — only the receiver can unlock them by signing with their wallet.

## How It Works

1. **Browse** — View the public feed of all messages without connecting a wallet.
2. **Register** — Connect your wallet and sign a transaction to derive an encryption keypair, then register your public key on the smart contract registry. Optionally set a username.
3. **Send** — Look up the recipient's public key, encrypt the message, and send it as a 0-ALGO transaction note.
4. **Receive** — Sign to derive the same keypair and decrypt incoming messages. Your keypair is cached in localStorage so you only sign once per session.

## Encryption

### Key Derivation

Sign a deterministic dummy transaction (never submitted) with your wallet. Ed25519 signatures are deterministic, so `SHA-256(signature)` always produces the same 32-byte seed, which generates a NaCl box keypair (X25519).

This works with all wallets (Pera, Defly, etc.) since every wallet supports `signTransactions`.

### v1 — Ephemeral Key Encryption

Each message uses an ephemeral X25519 keypair. The sender encrypts with NaCl box (X25519 + XSalsa20-Poly1305) using the ephemeral secret key and the recipient's public key. The ephemeral public key, nonce, and ciphertext are stored in the transaction note.

- Forward secrecy — compromising the sender's long-term key doesn't reveal past messages.
- One-way — the sender cannot decrypt their own sent messages (the ephemeral key is discarded).

### v2 — ECDH Shared Key Encryption

Both parties derive a shared symmetric key via X25519 ECDH (`nacl.box.before`). Messages are encrypted with XSalsa20-Poly1305 (`nacl.secretbox`). Only the nonce and ciphertext are stored (no ephemeral key needed).

- Both sender and receiver can decrypt the message.
- Shared keys are cached in memory for the session to avoid recomputation.
- v2 is used automatically when the sender has a registered keypair.

### Note Format

Messages are stored as Algorand transaction notes prefixed with `messagevault:` followed by JSON:

```
v1: { type: "dm", ct, n, ek }        — ciphertext, nonce, ephemeral public key
v2: { type: "dm", v: 2, ct, n }      — ciphertext, nonce (no ephemeral key)
```

### Constraints

- Messages are limited by the 1024-byte transaction note field (~600 characters after encryption overhead).
- Public social graph — sender and receiver addresses are visible on-chain; only message content is encrypted.

## Smart Contract Registry

Public keys and usernames are stored on-chain via a PyTeal smart contract using [box storage](https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/#box-storage).

Each registered user gets a box keyed by their 32-byte address:

```
Box value layout (66 bytes max):
  bytes 0-31:   encryption public key (32 bytes)
  bytes 32-33:  username length (uint16, big-endian)
  bytes 34-65:  username (up to 32 bytes)
```

### ABI Methods

| Method | Args | Description |
|--------|------|-------------|
| `register(byte[32], string)` | public key, username | Register or update. New registrations require a 0.0417 ALGO MBR payment. |
| `deregister()` | — | Delete your box and reclaim the MBR deposit. |
| `get_public_key(address)` | address | Read-only: returns the encryption public key. |
| `get_username(address)` | address | Read-only: returns the username. |
| `is_registered(address)` | address | Read-only: returns bool. |

The contract falls back to a legacy hub-address indexer lookup for users who registered before the contract was deployed.

### Compiling the Contract

```bash
cd contracts
python registry.py
```

Outputs `approval.teal`, `clear.teal`, and `abi.json`.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your Algorand wallet (Pera and Defly supported).

### Environment Variables

Defaults to Algorand MainNet via AlgoNode. Override with:

```
NEXT_PUBLIC_ALGOD_SERVER=https://mainnet-api.algonode.cloud
NEXT_PUBLIC_ALGOD_PORT=443
NEXT_PUBLIC_INDEXER_SERVER=https://mainnet-idx.algonode.cloud
NEXT_PUBLIC_INDEXER_PORT=443
NEXT_PUBLIC_REGISTRY_APP_ID=<your deployed app ID>
```

## Tech Stack

- [Next.js](https://nextjs.org/) — React framework
- [algosdk](https://github.com/algorand/js-algorand-sdk) — Algorand SDK
- [tweetnacl](https://tweetnacl.js.org/) — NaCl cryptography (X25519, XSalsa20-Poly1305)
- [PyTeal](https://pyteal.readthedocs.io/) — Smart contract (box storage registry)
- [@txnlab/use-wallet-react](https://github.com/TxnLab/use-wallet) — Wallet connection
- [@perawallet/connect](https://github.com/perawallet/connect) — Pera Wallet adapter
- [@blockshake/defly-connect](https://github.com/blockshake-io/defly-connect) — Defly Wallet adapter

## License

[MIT](LICENSE)
