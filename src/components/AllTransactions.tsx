'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchAllGlobalTransactions, HUB_ADDRESS, type GlobalTxn, type Registration } from '@/lib/algorand'
import { shortenAddress, timeAgo } from '@/lib/types'

interface TxnRow {
  txId: string
  type: string
  from: string
  fromName?: string
  to: string
  preview: string
  timestamp: number
}

const PAGE_SIZE = 20

function parseTxnRow(txn: GlobalTxn): TxnRow {
  const json = txn.payload
  let preview = ''

  if (txn.type === 'dm') {
    preview = '[encrypted]'
  } else if (txn.type === 'post' || txn.type === 'reply') {
    preview = json.text ? json.text.slice(0, 80) + (json.text.length > 80 ? '...' : '') : ''
  } else if (txn.type === 'register') {
    preview = json.name ? `Username: ${json.name}` : 'Key registration'
  }

  return {
    txId: txn.txId,
    type: txn.type,
    from: txn.from,
    to: txn.to,
    preview,
    timestamp: txn.timestamp,
  }
}

export default function AllTransactions() {
  const [allRows, setAllRows] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { txns, registrations } = await fetchAllGlobalTransactions()
      const rows = txns.map(parseTxnRow)

      // Apply usernames from registrations we already fetched
      for (const row of rows) {
        const reg = registrations.get(row.from)
        if (reg?.name) row.fromName = reg.name
      }

      setAllRows(rows)
      setPageIndex(0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const pageRows = allRows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  const typeBadge = (type: string) => {
    const cls = `txn-type-badge txn-type-${type}`
    return <span className={cls}>{type}</span>
  }

  return (
    <div className="all-txns">
      <div className="feed-header">
        <h2>All Transactions</h2>
        <button
          className="btn btn-secondary"
          onClick={loadAll}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading && allRows.length === 0 ? (
        <div className="empty-feed"><p>Loading transactions...</p></div>
      ) : allRows.length === 0 ? (
        <div className="empty-feed"><p>No transactions found.</p></div>
      ) : (
        <>
          <div className="txn-table-wrap">
            <table className="txn-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Preview</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.txId}>
                    <td>{typeBadge(row.type)}</td>
                    <td className="txn-addr">
                      {row.fromName ? (
                        <span title={row.from}>{row.fromName}</span>
                      ) : (
                        <span title={row.from}>{shortenAddress(row.from)}</span>
                      )}
                    </td>
                    <td className="txn-addr">
                      {row.to === HUB_ADDRESS ? (
                        <span className="txn-hub">Hub</span>
                      ) : (
                        <span title={row.to}>{shortenAddress(row.to)}</span>
                      )}
                    </td>
                    <td className="txn-preview">
                      {row.type === 'dm' ? (
                        <span className="txn-encrypted">[encrypted]</span>
                      ) : (
                        row.preview
                      )}
                    </td>
                    <td className="txn-time">{timeAgo(row.timestamp)}</td>
                    <td>
                      <a
                        className="btn-action"
                        href={`https://explorer.perawallet.app/tx/${row.txId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              className="btn btn-secondary"
              onClick={() => setPageIndex(p => p - 1)}
              disabled={pageIndex === 0}
            >
              Prev
            </button>
            <span className="pagination-info">Page {pageIndex + 1} of {totalPages}</span>
            <button
              className="btn btn-secondary"
              onClick={() => setPageIndex(p => p + 1)}
              disabled={pageIndex >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
