'use client'

import { useState } from 'react'
import { useWallet as useAlgorandWallet } from '@txnlab/use-wallet-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'

const EXODUS_EXTENSION_URL = 'https://www.exodus.com/web3-wallet'
const PHANTOM_EXTENSION_URL = 'https://phantom.app/'

/* Wallet logos as inline SVG/elements */
function PhantomLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#AB9FF2"/>
      <path d="M110.584 64.914H99.142C99.142 41.146 79.856 21.86 56.088 21.86C32.719 21.86 13.682 40.537 13.025 63.748C12.356 87.426 33.442 108.14 57.12 108.14H61.48C82.864 108.14 110.584 87.18 110.584 64.914Z" fill="url(#phantom_grad)"/>
      <path d="M77.39 60.427C77.39 64.061 74.624 67.007 71.214 67.007C67.804 67.007 65.038 64.061 65.038 60.427C65.038 56.793 67.804 53.847 71.214 53.847C74.624 53.847 77.39 56.793 77.39 60.427Z" fill="white"/>
      <path d="M95.39 60.427C95.39 64.061 92.624 67.007 89.214 67.007C85.804 67.007 83.038 64.061 83.038 60.427C83.038 56.793 85.804 53.847 89.214 53.847C92.624 53.847 95.39 56.793 95.39 60.427Z" fill="white"/>
      <defs>
        <linearGradient id="phantom_grad" x1="62" y1="22" x2="62" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#534BB1"/>
          <stop offset="1" stopColor="#551BF9"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function PeraLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#FFEE55"/>
      <path d="M64 28C44.118 28 28 44.118 28 64C28 83.882 44.118 100 64 100C83.882 100 100 83.882 100 64C100 44.118 83.882 28 64 28ZM64 88C50.745 88 40 77.255 40 64C40 50.745 50.745 40 64 40C77.255 40 88 50.745 88 64C88 77.255 77.255 88 64 88Z" fill="#1C1C1C"/>
      <circle cx="64" cy="64" r="12" fill="#1C1C1C"/>
    </svg>
  )
}

function DeflyLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#1F2937"/>
      <path d="M64 24L32 80H52L64 56L76 80H96L64 24Z" fill="#6EE7B7"/>
      <path d="M52 80L64 104L76 80H52Z" fill="#34D399"/>
    </svg>
  )
}

function ExodusLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#1B1133"/>
      <path d="M100 42H56L60.8 57.6H88.8L76 64L88.8 70.4H60.8L56 86H100L88 64L100 42Z" fill="url(#exodus_grad)"/>
      <path d="M28 42L40 64L28 86H44L56 64L44 42H28Z" fill="url(#exodus_grad2)"/>
      <defs>
        <linearGradient id="exodus_grad" x1="56" y1="42" x2="100" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6"/>
          <stop offset="1" stopColor="#3B82F6"/>
        </linearGradient>
        <linearGradient id="exodus_grad2" x1="28" y1="42" x2="56" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6"/>
          <stop offset="1" stopColor="#3B82F6"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function MetaMaskLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#2A2A2A"/>
      <path d="M98 34L72 52L76 42L98 34Z" fill="#E2761B"/>
      <path d="M30 34L55.6 52.2L52 42L30 34Z" fill="#E4761B"/>
      <path d="M88 82L80 94L96 98L100 82.4L88 82Z" fill="#E4761B"/>
      <path d="M28 82.4L32 98L48 94L40 82L28 82.4Z" fill="#E4761B"/>
      <path d="M47 60L42 68L56 68.6L55.6 54L47 60Z" fill="#E4761B"/>
      <path d="M81 60L72 53.6L72 68.6L86 68L81 60Z" fill="#E4761B"/>
      <path d="M48 94L55 86L49 82.4L48 94Z" fill="#E4761B"/>
      <path d="M73 86L80 94L79 82.4L73 86Z" fill="#E4761B"/>
      <path d="M80 94L73 86L73.6 92L73.4 97.4L80 94Z" fill="#D7C1B3"/>
      <path d="M48 94L54.6 97.4L54.4 92L55 86L48 94Z" fill="#D7C1B3"/>
    </svg>
  )
}

function SolanaChainLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 88L40 72H108L92 88H24Z" fill="url(#sol1)"/>
      <path d="M24 40L40 56H108L92 40H24Z" fill="url(#sol2)"/>
      <path d="M24 64L40 48H108L92 64H24Z" fill="url(#sol3)"/>
      <defs>
        <linearGradient id="sol1" x1="24" y1="80" x2="108" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
        </linearGradient>
        <linearGradient id="sol2" x1="24" y1="48" x2="108" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
        </linearGradient>
        <linearGradient id="sol3" x1="24" y1="56" x2="108" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function AlgorandChainLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M96 104H82L72 76L56 104H42L66 60L60 40L28 104H14L58 24H72L80 48L104 48L96 64H84L96 104Z" fill="white"/>
    </svg>
  )
}

function EthereumChainLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M64 8L64 50L98 64L64 8Z" fill="#8C8C8C"/>
      <path d="M64 8L30 64L64 50L64 8Z" fill="#BFBFBF"/>
      <path d="M64 88L64 120L98 72L64 88Z" fill="#8C8C8C"/>
      <path d="M64 120L64 88L30 72L64 120Z" fill="#BFBFBF"/>
      <path d="M64 80L98 64L64 50L64 80Z" fill="#5F5F5F"/>
      <path d="M30 64L64 80L64 50L30 64Z" fill="#8C8C8C"/>
    </svg>
  )
}

const WALLET_LOGOS: Record<string, () => JSX.Element> = {
  phantom: PhantomLogo,
  pera: PeraLogo,
  defly: DeflyLogo,
  exodus: ExodusLogo,
  metamask: MetaMaskLogo,
}

/**
 * Wallet selector shown on the main page when no wallet is connected.
 * Groups wallets by chain: Solana, Algorand, Ethereum (coming soon).
 */
export default function WalletSelector() {
  const { wallets: algorandWallets } = useAlgorandWallet()
  const { select: selectSolana, wallets: solanaWallets, connect: connectSolana } = useSolanaWallet()
  const [connectError, setConnectError] = useState<{ walletId: string; message: string } | null>(null)

  async function handleSolanaConnect() {
    setConnectError(null)
    try {
      const phantom = solanaWallets.find(w => w.adapter.name === 'Phantom')
      if (!phantom) {
        setConnectError({ walletId: 'phantom', message: 'Phantom wallet not found' })
        return
      }

      const isPhantomInstalled = typeof window !== 'undefined' && 'solana' in window
      if (!isPhantomInstalled) {
        setConnectError({ walletId: 'phantom', message: 'not_installed' })
        return
      }

      selectSolana(phantom.adapter.name)
      await new Promise(r => setTimeout(r, 100))
      await connectSolana()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectError({ walletId: 'phantom', message: msg })
    }
  }

  async function handleAlgorandConnect(wallet: typeof algorandWallets[number]) {
    setConnectError(null)
    try {
      await wallet.connect()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectError({ walletId: wallet.id, message: msg })
    }
  }

  const isExodusAvailable = typeof window !== 'undefined' && 'algorand' in window

  function getWalletLogo(id: string) {
    const key = id.toLowerCase()
    const Logo = WALLET_LOGOS[key]
    return Logo ? <Logo /> : null
  }

  return (
    <div className="wallet-selector">
      <div className="wallet-columns">
        {/* Solana column */}
        <div className="wallet-column">
          <div className="wallet-column-header">
            <SolanaChainLogo />
            <span className="wallet-column-chain">Solana</span>
          </div>
          <div className="wallet-column-list">
            <button className="wallet-card" onClick={handleSolanaConnect}>
              <div className="wallet-card-logo"><PhantomLogo /></div>
              <span className="wallet-card-name">Phantom</span>
            </button>
          </div>
        </div>

        {/* Algorand column */}
        <div className="wallet-column">
          <div className="wallet-column-header">
            <AlgorandChainLogo />
            <span className="wallet-column-chain">Algorand</span>
          </div>
          <div className="wallet-column-list">
            {algorandWallets?.map((wallet) => (
              <button
                key={wallet.id}
                className="wallet-card"
                onClick={() => handleAlgorandConnect(wallet)}
              >
                <div className="wallet-card-logo">{getWalletLogo(wallet.id)}</div>
                <span className="wallet-card-name">{wallet.metadata.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ethereum column */}
        <div className="wallet-column wallet-column-disabled">
          <div className="wallet-column-header">
            <EthereumChainLogo />
            <span className="wallet-column-chain">Ethereum</span>
            <span className="wallet-column-soon">Soon</span>
          </div>
          <div className="wallet-column-list">
            <button className="wallet-card" disabled>
              <div className="wallet-card-logo"><MetaMaskLogo /></div>
              <span className="wallet-card-name">MetaMask</span>
            </button>
          </div>
        </div>
      </div>

      {connectError?.walletId === 'phantom' && connectError.message === 'not_installed' && (
        <p className="wallet-hint">
          Phantom browser extension required.{' '}
          <a href={PHANTOM_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Install Phantom
          </a>
        </p>
      )}
      {connectError?.walletId === 'exodus' && !isExodusAvailable && (
        <p className="wallet-hint">
          Exodus browser extension required.{' '}
          <a href={EXODUS_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Install Exodus Web3 Wallet
          </a>
        </p>
      )}
      {connectError && connectError.message !== 'not_installed' && !(connectError.walletId === 'exodus' && !isExodusAvailable) && (
        <p className="error-msg">{connectError.message}</p>
      )}
    </div>
  )
}
