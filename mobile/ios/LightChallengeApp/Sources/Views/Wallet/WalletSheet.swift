// WalletSheet.swift
// Wallet connection sheet — AppKit modal for one-tap connect.

import SwiftUI

struct WalletSheet: View {
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LC.space24) {
                    if walletManager.isConnected {
                        connectedView
                    } else {
                        connectView
                    }
                }
                .padding(.horizontal, LC.space20)
                .padding(.top, LC.space8)
                .padding(.bottom, LC.space40)
            }
            .lcPageBackground()
            .navigationTitle(walletManager.isConnected ? "Wallet" : "Connect Wallet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if walletManager.isConnecting {
                            walletManager.isConnecting = false
                            walletManager.error = nil
                        }
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                            .frame(width: 36, height: 36)
                            .background(.regularMaterial, in: Circle())
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                            )
                    }
                }
            }
            .interactiveDismissDisabled(walletManager.isConnecting)
            .onChange(of: walletManager.isConnected) { _, connected in
                if connected {
                    appState.walletAddress = walletManager.connectedAddress
                }
            }
        }
    }

    // MARK: - Connected

    private var connectedView: some View {
        VStack(spacing: LC.space20) {
            ZStack {
                Circle()
                    .fill(.regularMaterial)
                    .frame(width: 80, height: 80)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(LC.success)
            }
            .padding(.top, LC.space16)

            Text("Connected")
                .font(.title3.weight(.bold))
                .foregroundStyle(LC.success)

            VStack(spacing: LC.space12) {
                Text(walletManager.connectedAddress)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(LC.textSecondary(scheme))
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: LC.space16) {
                    HStack(spacing: LC.space4) {
                        Circle()
                            .fill(LC.success)
                            .frame(width: 6, height: 6)
                        Text(LightChain.chainName)
                            .font(.caption2)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                    Text("Chain \(LightChain.chainId)")
                        .font(.caption2)
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
            .padding(LC.space16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .stroke(LC.success.opacity(0.2), lineWidth: 1)
            )

            Button(role: .destructive) {
                Task {
                    await walletManager.disconnect()
                    appState.walletAddress = ""
                }
            } label: {
                Text("Disconnect Wallet")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                            .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Connect View

    private var connectView: some View {
        VStack(spacing: LC.space24) {
            // Hero
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [LC.gradBlue.opacity(0.15), LC.gradLavender.opacity(0.10)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 88, height: 88)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                    )
                Image(systemName: "wallet.bifold.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.white, LC.goldLight],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            }
            .padding(.top, LC.space16)

            VStack(spacing: LC.space8) {
                Text("Connect Your Wallet")
                    .font(.title3.weight(.bold))

                Text("MetaMask, Phantom, Trust, Rainbow — tap to connect via WalletConnect.")
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
            }

            // Primary connect button
            Button {
                walletManager.connect()
            } label: {
                HStack(spacing: LC.space12) {
                    if walletManager.isConnecting {
                        ProgressView()
                            .tint(LC.ctaFg(scheme))
                    } else {
                        Image(systemName: "link.circle.fill")
                            .font(.system(size: 20))
                    }
                    Text(walletManager.isConnecting ? "Connecting..." : "Choose Wallet")
                        .font(.headline.weight(.semibold))
                }
            }
            .buttonStyle(LCGoldButton(isDisabled: walletManager.isConnecting))
            .disabled(walletManager.isConnecting)

            // Wallet logos
            VStack(spacing: LC.space8) {
                Text("Supports 300+ wallets")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))

                HStack(spacing: LC.space12) {
                    walletIcon(wallet: KnownWallet.metaMask)
                    walletIcon(wallet: KnownWallet.phantom)
                    walletIcon(wallet: KnownWallet.trust)
                    walletIcon(wallet: KnownWallet.rainbow)
                }
            }

            if let error = walletManager.error {
                HStack(spacing: LC.space8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(LC.warning)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                }
                .padding(LC.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(LC.warning.opacity(0.08))
                )
            }

            // Network info
            HStack(spacing: LC.space8) {
                Circle()
                    .fill(LC.success)
                    .frame(width: 6, height: 6)
                Text("LightChain Testnet")
                    .font(.caption2)
                    .foregroundStyle(LC.textTertiary(scheme))
                Text("(Chain \(LightChain.chainId))")
                    .font(.caption2)
                    .foregroundStyle(LC.textTertiary(scheme))
            }
        }
    }

    private func walletIcon(wallet: (id: String, name: String, color: Color)) -> some View {
        VStack(spacing: LC.space4) {
            RemoteWalletIcon(walletId: wallet.id, name: wallet.name, brandColor: wallet.color, size: 44)

            Text(wallet.name)
                .font(.system(size: 9))
                .foregroundStyle(LC.textTertiary(scheme))
        }
    }
}
