// webapp/app/components/ConnectButton.tsx
"use client"

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit"

const LIGHTCHAIN_ID = 504

function short(addr?: string) {
  if (!addr) return ""
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted
        const connected = ready && account && chain
        const onLightchain = chain?.id === LIGHTCHAIN_ID

        // Disconnected → big gradient CTA
        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="btn-connect"
            >
              Connect
            </button>
          )
        }

        // Connected → keep the same bold gradient footprint
        // Clicking opens the RainbowKit account modal.
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={openAccountModal}
              className="btn-connect"
              title={account?.address}
            >
              {account?.displayName || short(account?.address)}
            </button>

            {/* Only show chain chip if NOT Lightchain 504 or if unsupported */}
            {!onLightchain && (
              <button
                onClick={openChainModal}
                className="nav-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm"
                title={chain?.name}
              >
                {chain?.iconUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={chain?.name ?? "chain"}
                      src={chain.iconUrl}
                      className="h-4 w-4 rounded-full"
                    />
                    <span className="text-white/80">{chain?.name}</span>
                  </>
                ) : (
                  <span className="text-white/80">{chain?.name ?? "Network"}</span>
                )}
              </button>
            )}
          </div>
        )
      }}
    </RKConnectButton.Custom>
  )
}