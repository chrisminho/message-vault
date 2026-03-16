# MessageVault

Encrypted wallet-to-wallet messaging on Algorand. Send messages to any wallet — only the receiver can unlock them by signing with their wallet.

## How It Works

1. **Register** — Sign a transaction to derive an encryption keypair, then publish your public key on-chain. Optionally set a username.
2. **Send** — Look up the recipient's public key, encrypt the message with NaCl box (X25519 + XSalsa20-Poly1305), and send it as a 0-ALGO transaction note.
3. **Receive** — Sign to derive the same keypair and decrypt incoming messages. Your keypair is cached in localStorage so you only sign once per session.

### Encryption

- **Key derivation**: Sign a deterministic dummy transaction with your wallet. Ed25519 signatures are deterministic, so `SHA-256(signature)` always produces the same 32-byte seed, which generates a NaCl box keypair.
- **Forward secrecy**: Each message uses an ephemeral keypair. Even if a sender's key is compromised, past messages remain secure.
- **On-chain storage**: Messages are stored as encrypted transaction notes on Algorand MainNet. Sender/receiver addresses are public; only the content is encrypted.

### Constraints

- Messages are limited by the 1024-byte transaction note field (~600 characters after encryption overhead)
- Sender cannot read their own sent messages (encrypted to recipient only)
- Public social graph — sender and receiver addresses are visible on-chain

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your Algorand wallet (Pera Wallet supported).

### Environment Variables (optional)

Defaults to Algorand MainNet via AlgoNode. Override with:

```
NEXT_PUBLIC_ALGOD_SERVER=https://mainnet-api.algonode.cloud
NEXT_PUBLIC_ALGOD_PORT=443
NEXT_PUBLIC_INDEXER_SERVER=https://mainnet-idx.algonode.cloud
NEXT_PUBLIC_INDEXER_PORT=443
```

## Tech Stack

- [Next.js](https://nextjs.org/) — React framework
- [algosdk](https://github.com/algorand/js-algorand-sdk) — Algorand SDK
- [tweetnacl](https://tweetnacl.js.org/) — NaCl cryptography
- [@txnlab/use-wallet-react](https://github.com/TxnLab/use-wallet) — Wallet connection
- [@perawallet/connect](https://github.com/perawallet/connect) — Pera Wallet adapter

## License

[MIT](LICENSE)
