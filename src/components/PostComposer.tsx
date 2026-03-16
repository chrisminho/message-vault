'use client'

import { useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { algodClient, HUB_ADDRESS } from '@/lib/algorand'
import { encodeSocialNote, type SocialPost } from '@/lib/types'

interface PostComposerProps {
  onPostSuccess?: () => void
  parentTxId?: string | null
  placeholder?: string
}

export default function PostComposer({
  onPostSuccess,
  parentTxId = null,
  placeholder = "What's happening on-chain?",
}: PostComposerProps) {
  const { activeAddress, transactionSigner } = useWallet()
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  if (!activeAddress) return null

  const maxLength = 800 // Leave room for JSON overhead in 1KB note

  async function handlePost() {
    if (!text.trim() || !activeAddress || !transactionSigner) return

    setPosting(true)
    setError(null)
    setTxId(null)

    try {
      const post: SocialPost = {
        app: 'messagevault',
        type: parentTxId ? 'reply' : 'post',
        text: text.trim(),
        parent: parentTxId,
        ts: Math.floor(Date.now() / 1000),
      }

      const note = encodeSocialNote(post)

      const suggestedParams = await algodClient.getTransactionParams().do()

      // 0-ALGO payment to hub address with message in note field
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: HUB_ADDRESS,
        amount: 0,
        suggestedParams,
        note,
      })

      const atc = new algosdk.AtomicTransactionComposer()
      atc.addTransaction({ txn, signer: transactionSigner })
      const result = await atc.execute(algodClient, 4)

      setTxId(result.txIDs[0])
      setText('')
      onPostSuccess?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post'
      setError(msg)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={3}
        disabled={posting}
      />
      <div className="composer-footer">
        <span className="char-count">
          {text.length}/{maxLength}
        </span>
        <button
          className="btn btn-primary"
          onClick={handlePost}
          disabled={!text.trim() || posting}
        >
          {posting ? 'Signing...' : parentTxId ? 'Reply' : 'Post to Chain'}
        </button>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {txId && (
        <p className="success-msg">
          Posted!{' '}
          <a
            href={`https://explorer.perawallet.app/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on explorer
          </a>
        </p>
      )}
    </div>
  )
}
