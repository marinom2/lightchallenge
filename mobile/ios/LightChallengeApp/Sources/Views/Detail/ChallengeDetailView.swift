// ChallengeDetailView.swift
// Full challenge detail with premium Cosmic-Glass design.

import SwiftUI
import UniformTypeIdentifiers

/// Tracks the state of a manual file evidence upload.
enum FileUploadStatus: Equatable {
    case idle
    case uploading
    case success(evidenceId: String?)
    case error(String)

    static func == (lhs: FileUploadStatus, rhs: FileUploadStatus) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.uploading, .uploading): return true
        case (.success(let a), .success(let b)): return a == b
        case (.error(let a), .error(let b)): return a == b
        default: return false
        }
    }
}

struct ChallengeDetailView: View {
    let challengeId: String

    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var notificationService: NotificationService
    @ObservedObject private var autoProofService = AutoProofService.shared
    @State private var detail: ChallengeDetail?
    @State private var progress: ChallengeProgress?
    @State private var participantStatus: ParticipantStatus?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showingProofFlow = false
    @State private var showingGamingHandoff = false
    @State private var showingWalletSheet = false
    @State private var showingVictory = false
    @State private var showingShareCard = false
    @State private var isJoining = false
    @State private var joinError: String?
    // Manual file upload state
    @State private var showingFileImporter = false
    @State private var fileUploadStatus: FileUploadStatus = .idle
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass

    /// Maximum content width on iPad — keeps detail readable on wide screens.
    private var maxContentWidth: CGFloat {
        sizeClass == .regular ? 680 : .infinity
    }

    private var category: ChallengeCategory {
        detail?.resolvedCategory ?? .unknown
    }

    var body: some View {
        ScrollView {
            if isLoading && detail == nil {
                loadingView
            } else if let error, detail == nil {
                errorView(error)
            } else if let detail {
                detailContent(detail)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(detail?.displayTitle ?? "Challenge #\(challengeId)")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        .refreshable { await loadData() }
        .sheet(isPresented: $showingProofFlow) {
            NavigationStack {
                FitnessProofView(
                    challengeId: challengeId,
                    modelHash: detail?.proof?.modelHash ?? detail?.modelHash ?? ServerConfig.appleStepsModelHash,
                    deepLinkToken: appState.deepLinkToken,
                    deepLinkExpires: appState.deepLinkExpires
                )
            }
        }
        .sheet(isPresented: $showingGamingHandoff) {
            GamingHandoffView(
                challengeId: challengeId,
                title: detail?.displayTitle ?? "",
                game: detail?.game
            )
        }
        .sheet(isPresented: $showingWalletSheet) {
            WalletSheet()
        }
        .fullScreenCover(isPresented: $showingVictory) {
            VictoryCelebrationView(
                challengeId: challengeId,
                title: detail?.displayTitle ?? "",
                earnings: detail?.poolDisplay,
                achievementType: "victory"
            )
        }
        .sheet(isPresented: $showingShareCard) {
            if let rep = _reputation {
                ChallengeShareSheet(
                    challengeId: challengeId,
                    title: detail?.displayTitle ?? "",
                    passed: participantStatus?.verdictPass == true,
                    earnings: participantStatus?.verdictPass == true ? detail?.poolDisplay : nil,
                    reputation: rep
                )
            }
        }
        .fileImporter(
            isPresented: $showingFileImporter,
            allowedContentTypes: [.json, .xml, .zip],
            allowsMultipleSelection: false
        ) { result in
            Task { await handleFileImport(result) }
        }
    }

    @State private var _reputation: Reputation?

    // MARK: - Detail Content

    @ViewBuilder
    private func detailContent(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space16) {
            // Hero — Apple Fitness-style progress
            ChallengeProgressHero(
                detail: detail,
                participantStatus: participantStatus,
                healthService: healthService
            )

            // Info card
            infoSection(detail)

            // Stats
            if let progress {
                statsSection(progress)
            }

            // Timeline
            if let events = detail.timeline, !events.isEmpty {
                timelineSection(events)
            }

            // Action area
            actionSection(detail)
        }
        .frame(maxWidth: maxContentWidth)
        .frame(maxWidth: .infinity) // Center on iPad
        .padding(.horizontal, LC.space16)
        .padding(.bottom, LC.space32)
    }

    // MARK: - Info Section

    private func infoSection(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: 0) {
            if let stake = detail.stakeDisplay {
                infoRow("Stake", value: stake, icon: "dollarsign.circle.fill", valueColor: LC.gold)
                Divider().padding(.leading, 44)
            }
            if let pool = detail.poolDisplay {
                infoRow("Prize Pool", value: pool, icon: "banknote.fill", valueColor: LC.gold)
                Divider().padding(.leading, 44)
            }
            if let end = detail.endsDate {
                infoRow("Ends", value: end.formatted(date: .abbreviated, time: .shortened), icon: "calendar")
                Divider().padding(.leading, 44)
            }
            if let deadline = detail.proofDeadlineDate {
                let isUrgent = deadline.timeIntervalSinceNow < 86400
                infoRow("Proof Deadline", value: deadline.formatted(date: .abbreviated, time: .shortened), icon: "exclamationmark.clock.fill", valueColor: isUrgent ? LC.danger : nil)
                Divider().padding(.leading, 44)
            }
            if let count = detail.participantsCount {
                infoRow("Participants", value: "\(count)", icon: "person.2.fill")
            }

            if let status = participantStatus {
                Divider().padding(.leading, 44)
                participantStatusRow(status)
            } else if detail.youJoined == true {
                Divider().padding(.leading, 44)
                infoRow("Your Status", value: "Joined", icon: "checkmark.circle.fill", valueColor: LC.success)
            }
        }
        .padding(.vertical, LC.space4)
        .lcCard()
    }

    private func infoRow(_ label: String, value: String, icon: String, valueColor: Color? = nil) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(valueColor ?? LC.textTertiary(scheme))
                .frame(width: 24)
            Text(label)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(valueColor ?? LC.textPrimary(scheme))
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    private func participantStatusRow(_ status: ParticipantStatus) -> some View {
        VStack(alignment: .leading, spacing: LC.space8) {
            HStack(spacing: LC.space12) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .foregroundStyle(LC.gradBlue)
                    .frame(width: 24)
                Text("Your Progress")
                    .font(.subheadline.weight(.medium))
                Spacer()
            }

            HStack(spacing: LC.space8) {
                Spacer().frame(width: 24)
                statusPill("Joined", active: true)
                statusPill("Evidence", active: status.hasEvidence == true)
                statusPill(
                    status.verdictPass == true ? "Passed" : status.verdictPass == false ? "Failed" : "Verdict",
                    active: status.verdictPass != nil,
                    color: status.verdictPass == true ? LC.success : status.verdictPass == false ? LC.danger : .secondary
                )
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    private func statusPill(_ label: String, active: Bool, color: Color = LC.info) -> some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(active ? color.opacity(0.12) : Color.secondary.opacity(0.06))
            .foregroundStyle(active ? color : .secondary)
            .clipShape(Capsule())
    }

    // MARK: - Stats

    private func statsSection(_ progress: ChallengeProgress) -> some View {
        HStack(spacing: LC.space12) {
            statCard("Joined", value: "\(progress.participantCount ?? 0)", icon: "person.2.fill", color: LC.info)
            statCard("Proofs", value: "\(progress.evidenceCount ?? 0)", icon: "doc.text.fill", color: LC.warning)
            statCard("Passed", value: "\(progress.passCount ?? 0)", icon: "checkmark.circle.fill", color: LC.success)
        }
    }

    private func statCard(_ label: String, value: String, icon: String, color: Color) -> some View {
        VStack(spacing: LC.space6) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(color)
            Text(value)
                .font(.title3.weight(.bold))
            Text(label)
                .font(.caption2)
                .foregroundStyle(LC.textTertiary(scheme))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space16)
        .lcCard()
    }

    // MARK: - Timeline

    private func timelineSection(_ events: [TimelineEvent]) -> some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            Text("Timeline")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, LC.space16)

            ForEach(events.suffix(6)) { event in
                HStack(spacing: LC.space12) {
                    Circle()
                        .fill(LC.gradBlue.opacity(0.4))
                        .frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: LC.space2) {
                        Text(event.label ?? event.name ?? "Event")
                            .font(.caption.weight(.medium))
                        if let date = event.date {
                            Text(date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2)
                                .foregroundStyle(LC.textTertiary(scheme))
                        }
                    }
                    Spacer()
                }
            }
            .padding(.horizontal, LC.space16)
        }
        .padding(.vertical, LC.space16)
        .lcCard()
    }

    // MARK: - Action Section

    @ViewBuilder
    private func actionSection(_ detail: ChallengeDetail) -> some View {
        if !appState.hasWallet {
            walletPrompt
        } else if category.isFitness || category == .unknown {
            fitnessActionCard(detail)
        } else {
            genericInfoCard
        }
    }

    private var walletPrompt: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "wallet.bifold")
                .font(.system(size: 32))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("Connect Your Wallet")
                .font(.subheadline.weight(.semibold))
            Text("Connect a wallet to participate in this challenge.")
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
            Button {
                showingWalletSheet = true
            } label: {
                Label("Connect Wallet", systemImage: "wallet.bifold")
            }
            .buttonStyle(LCGoldButton())
        }
        .padding(LC.space24)
        .lcCard()
    }

    private func fitnessActionCard(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space16) {
            if detail.youJoined == true || participantStatus != nil {
                if participantStatus?.hasEvidence == true {
                    if let pass = participantStatus?.verdictPass {
                        // Verdict received
                        Image(systemName: pass ? "checkmark.seal.fill" : "xmark.seal.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(pass ? LC.success : LC.danger)
                        Text(pass ? "Challenge Passed!" : "Challenge Failed")
                            .font(.headline.weight(.bold))
                        if pass && walletManager.isConnected {
                            Button {
                                appState.selectedTab = .challenges
                            } label: {
                                Label("Claim Reward", systemImage: "gift.fill")
                            }
                            .buttonStyle(LCGoldButton())
                        }

                        Button {
                            showingShareCard = true
                        } label: {
                            Label("Share Result", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(LCSecondaryButton())

                        ShareLink(
                            item: URL(string: "https://app.lightchallenge.app/challenge/\(challengeId)")!,
                            subject: Text("Challenge a Friend"),
                            message: Text("Think you can beat me? Join \"\(detail.displayTitle)\" on LightChallenge!")
                        ) {
                            Label("Challenge a Friend", systemImage: "person.badge.plus")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(LC.accent)
                        }

                        if detail.status == "Finalized" {
                            Divider().padding(.vertical, LC.space4)
                            Button {} label: {
                                Label("Rematch", systemImage: "arrow.counterclockwise")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(LC.accent)
                            }
                        }
                    } else {
                        // Evidence submitted, awaiting verdict
                        Image(systemName: "hourglass")
                            .font(.system(size: 36))
                            .foregroundStyle(LC.warning)
                        Text("Proof Under Review")
                            .font(.subheadline.weight(.semibold))
                        Text("Your evidence is being evaluated by AI verification.")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .multilineTextAlignment(.center)
                    }
                } else {
                    // Joined, no evidence yet — show phase-appropriate UI
                    let meta = detail.toChallengeMeta()
                    let heroPhase = ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
                    let challengeEnded = !heroPhase.isActive
                    let proofDeadlinePassed: Bool = {
                        if case .ended = heroPhase { return true }
                        if case .finalized = heroPhase { return true }
                        return false
                    }()
                    let proofStatus = autoProofService.status[challengeId]

                    if !challengeEnded {
                        // Challenge period still running
                        Image(systemName: "figure.run")
                            .font(.system(size: 36))
                            .foregroundStyle(LC.accent)
                        Text("Challenge In Progress")
                            .font(.subheadline.weight(.semibold))
                        if let endDate = detail.endsDate {
                            Text("Complete your activity by \(endDate.formatted(date: .abbreviated, time: .shortened)). Proof will be auto-submitted after the challenge ends.")
                                .font(.caption)
                                .foregroundStyle(LC.textSecondary(scheme))
                                .multilineTextAlignment(.center)
                        }
                    } else if proofDeadlinePassed {
                        // Proof window closed
                        Image(systemName: "clock.badge.xmark")
                            .font(.system(size: 36))
                            .foregroundStyle(LC.danger)
                        Text("Proof Deadline Passed")
                            .font(.subheadline.weight(.semibold))
                        Text("The submission window has closed.")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .multilineTextAlignment(.center)
                    } else if let proofStatus {
                        // Auto-proof in progress — show live status
                        Image(systemName: proofStatus.icon)
                            .font(.system(size: 36))
                            .foregroundStyle(proofStatus.color)
                            .symbolEffect(.pulse, isActive: proofStatus == .pending || proofStatus == .collectingHealth || proofStatus == .submitting)
                        Text(proofStatus.label)
                            .font(.subheadline.weight(.semibold))

                        switch proofStatus {
                        case .pending, .collectingHealth, .submitting:
                            Text("Collecting your fitness data for the challenge period and submitting.")
                                .font(.caption)
                                .foregroundStyle(LC.textSecondary(scheme))
                                .multilineTextAlignment(.center)
                            ProgressView()
                                .tint(LC.accent)
                        case .submitted:
                            Text("Your proof has been submitted and is queued for evaluation.")
                                .font(.caption)
                                .foregroundStyle(LC.textSecondary(scheme))
                                .multilineTextAlignment(.center)
                        case .error(let msg):
                            Text(msg)
                                .font(.caption)
                                .foregroundStyle(LC.danger)
                                .multilineTextAlignment(.center)
                            Button {
                                showingProofFlow = true
                            } label: {
                                Label("Submit Manually", systemImage: "heart.fill")
                            }
                            .buttonStyle(LCSecondaryButton())

                            // Manual file upload fallback
                            manualUploadSection
                        default:
                            EmptyView()
                        }
                    } else {
                        // In proof window, no status yet — trigger auto-proof
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 36))
                            .foregroundStyle(LC.accent)
                            .symbolEffect(.pulse)
                        Text("Auto-submitting proof...")
                            .font(.subheadline.weight(.semibold))
                        Text("Collecting fitness data for the challenge period.")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .multilineTextAlignment(.center)
                        ProgressView()
                            .tint(LC.accent)
                            .onAppear {
                                autoProofService.triggerAutoProof(
                                    challengeId: challengeId,
                                    challenge: meta,
                                    appState: appState,
                                    healthService: healthService
                                )
                            }

                        // Manual file upload fallback
                        manualUploadSection
                    }
                }
            } else if detail.isActive {
                // Join section
                Image(systemName: "figure.run")
                    .font(.system(size: 36))
                    .foregroundStyle(LC.accent)
                Text("Join This Challenge")
                    .font(.headline.weight(.bold))

                if walletManager.isConnected {
                    if let stake = detail.stakeDisplay {
                        Text("Stake \(stake) to join and compete.")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }

                    if let joinError {
                        Text(joinError)
                            .font(.caption)
                            .foregroundStyle(LC.danger)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task { await joinChallenge(detail) }
                    } label: {
                        if isJoining {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Label("Join Challenge", systemImage: "bolt.fill")
                        }
                    }
                    .buttonStyle(LCGoldButton(isDisabled: isJoining))
                    .disabled(isJoining)
                } else {
                    Text("Connect your wallet to join.")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))

                    Button {
                        showingWalletSheet = true
                    } label: {
                        Label("Connect Wallet", systemImage: "wallet.bifold")
                    }
                    .buttonStyle(LCGoldButton())

                    Button {
                        showingGamingHandoff = true
                    } label: {
                        Label("Join on Desktop", systemImage: "arrow.up.forward.square")
                    }
                    .buttonStyle(LCSecondaryButton())
                }

                if appState.deepLinkToken != nil {
                    Button {
                        showingProofFlow = true
                    } label: {
                        Label("Submit Proof Now", systemImage: "heart.fill")
                    }
                    .buttonStyle(LCSecondaryButton())
                }
            } else {
                // Challenge ended
                Image(systemName: "flag.checkered")
                    .font(.system(size: 36))
                    .foregroundStyle(LC.textTertiary(scheme))
                Text("Challenge Ended")
                    .font(.subheadline.weight(.semibold))
                Text("This challenge is no longer accepting participants.")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
            }
        }
        .padding(LC.space24)
        .frame(maxWidth: .infinity)
        .lcCard()
    }

    private var genericInfoCard: some View {
        VStack(spacing: LC.space12) {
            Image(systemName: "info.circle")
                .font(.system(size: 28))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("View this challenge on desktop for full options.")
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
        }
        .padding(LC.space24)
        .frame(maxWidth: .infinity)
        .lcCard()
    }

    // MARK: - Join Challenge

    private func joinChallenge(_ detail: ChallengeDetail) async {
        isJoining = true
        joinError = nil

        do {
            guard let idNum = UInt64(challengeId) else {
                joinError = "Invalid challenge ID"
                isJoining = false
                return
            }
            _ = try await ContractService.shared.joinChallengeNative(
                challengeId: idNum,
                stakeWei: detail.money?.stakeWei ?? "0",
                baseURL: appState.serverURL
            )
            await loadData()
            // Note: auto-proof is NOT triggered at join time.
            // It triggers during the proof window (after challenge ends).
        } catch {
            joinError = error.localizedDescription
        }

        isJoining = false
    }

    // MARK: - Manual File Upload

    /// Whether the manual upload option should be available.
    private var canShowManualUpload: Bool {
        guard appState.hasWallet else { return false }
        guard detail?.youJoined == true || participantStatus != nil else { return false }
        guard participantStatus?.hasEvidence != true else { return false }
        guard let detail else { return false }
        let phase = ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
        let challengeEnded = !phase.isActive
        let proofDeadlinePassed: Bool = {
            if case .ended = phase { return true }
            if case .finalized = phase { return true }
            return false
        }()
        return challengeEnded && !proofDeadlinePassed
    }

    /// Upload button + status display for manual file evidence.
    @ViewBuilder
    private var manualUploadSection: some View {
        if canShowManualUpload {
            Divider().padding(.vertical, LC.space4)

            VStack(spacing: LC.space8) {
                Text("Or upload an exported file")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))

                switch fileUploadStatus {
                case .idle:
                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Upload Evidence File", systemImage: "doc.badge.arrow.up")
                    }
                    .buttonStyle(LCSecondaryButton())

                    Text("Supports TCX, GPX, JSON (Garmin, Google Fit Takeout), or ZIP exports.")
                        .font(.caption2)
                        .foregroundStyle(LC.textTertiary(scheme))
                        .multilineTextAlignment(.center)

                case .uploading:
                    ProgressView("Uploading...")
                        .tint(LC.accent)

                case .success(let evidenceId):
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(LC.success)
                    Text("File uploaded successfully")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.success)
                    if let eid = evidenceId {
                        Text("Evidence ID: \(eid)")
                            .font(.caption2)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }

                case .error(let msg):
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(LC.warning)
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(LC.danger)
                        .multilineTextAlignment(.center)
                    Button {
                        fileUploadStatus = .idle
                        showingFileImporter = true
                    } label: {
                        Label("Try Again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(LCSecondaryButton())
                }
            }
        }
    }

    /// Handle the file importer result: read file data and upload via APIClient.
    private func handleFileImport(_ result: Result<[URL], Error>) async {
        switch result {
        case .failure(let err):
            fileUploadStatus = .error("Could not select file: \(err.localizedDescription)")
            return

        case .success(let urls):
            guard let fileURL = urls.first else {
                fileUploadStatus = .error("No file selected.")
                return
            }

            // Gain security-scoped access
            guard fileURL.startAccessingSecurityScopedResource() else {
                fileUploadStatus = .error("Unable to access the selected file.")
                return
            }
            defer { fileURL.stopAccessingSecurityScopedResource() }

            let fileName = fileURL.lastPathComponent
            let ext = fileURL.pathExtension.lowercased()

            // Determine MIME type from extension
            let mimeType: String
            switch ext {
            case "json":
                mimeType = "application/json"
            case "xml", "tcx", "gpx":
                mimeType = "application/xml"
            case "zip":
                mimeType = "application/zip"
            default:
                mimeType = "application/octet-stream"
            }

            // Read file data
            let fileData: Data
            do {
                fileData = try Data(contentsOf: fileURL)
            } catch {
                fileUploadStatus = .error("Failed to read file: \(error.localizedDescription)")
                return
            }

            guard !fileData.isEmpty else {
                fileUploadStatus = .error("Selected file is empty.")
                return
            }

            // Upload
            fileUploadStatus = .uploading
            let modelHash = detail?.proof?.modelHash ?? detail?.modelHash ?? ServerConfig.appleStepsModelHash

            do {
                let result = try await APIClient.shared.uploadEvidenceFile(
                    baseURL: appState.serverURL,
                    challengeId: challengeId,
                    subject: appState.walletAddress,
                    modelHash: modelHash,
                    fileData: fileData,
                    fileName: fileName,
                    mimeType: mimeType,
                    evidenceToken: appState.deepLinkToken,
                    evidenceExpires: appState.deepLinkExpires
                )

                if result.ok {
                    fileUploadStatus = .success(evidenceId: result.evidenceId)
                    // Refresh participant status to reflect evidence submission
                    await loadParticipantStatus()
                } else {
                    fileUploadStatus = .error("Upload was not accepted by the server.")
                }
            } catch {
                fileUploadStatus = .error("Upload failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Helpers

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "Active": LC.success
        case "Finalized": LC.info
        case "Canceled": LC.danger
        default: .secondary
        }
    }

    // MARK: - Loading / Error

    private var loadingView: some View {
        VStack(spacing: LC.space16) {
            ShimmerView().frame(height: 200)
            ShimmerView().frame(height: 120)
            ShimmerView().frame(height: 80)
        }
        .padding(.horizontal, LC.space16)
        .padding(.top, LC.space16)
    }

    private func errorView(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Unable to Load", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") {
                Task { await loadData() }
            }
            .buttonStyle(.bordered)
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        isLoading = true
        error = nil

        if detail == nil, let cached = await CacheService.shared.loadCachedDetail(id: challengeId) {
            detail = cached
        }

        // Fetch DB metadata (fast, ~100ms) and chain detail (slow, 5-15s) in parallel.
        // DB meta provides title, description, dates. Chain adds on-chain state.
        let metaTask = Task { try? await APIClient.shared.fetchChallengeMeta(baseURL: appState.serverURL, id: challengeId) }

        do {
            let viewer = appState.hasWallet ? appState.walletAddress : nil
            var fresh = try await APIClient.shared.fetchChallengeDetail(
                baseURL: appState.serverURL,
                id: challengeId,
                viewer: viewer
            )

            // Merge DB metadata for any fields the chain endpoint didn't provide
            if let meta = await metaTask.value {
                fresh.mergeFromMeta(meta)
            }

            detail = fresh
            await CacheService.shared.cacheDetail(fresh, id: challengeId)

            // Schedule proof window reminder if challenge is in progress
            if let endDate = fresh.endsDate, endDate > Date() {
                notificationService.scheduleProofWindowReminder(
                    challengeId: challengeId,
                    title: fresh.displayTitle,
                    endDate: endDate
                )
            }

            async let progressTask: () = loadProgress()
            async let participantTask: () = loadParticipantStatus()
            async let reputationTask: () = loadReputation()
            _ = await (progressTask, participantTask, reputationTask)
        } catch {
            // If chain fetch failed, try meta-only as fallback
            if detail == nil, let meta = await metaTask.value {
                detail = ChallengeDetail.fromMeta(meta)
            }
            if detail == nil {
                self.error = error.localizedDescription
            }
        }

        isLoading = false
    }

    private func loadProgress() async {
        progress = try? await APIClient.shared.fetchProgress(
            baseURL: appState.serverURL,
            challengeId: challengeId
        )
    }

    private func loadParticipantStatus() async {
        guard appState.hasWallet else { return }
        let prevPass = participantStatus?.verdictPass
        participantStatus = try? await APIClient.shared.fetchParticipantStatus(
            baseURL: appState.serverURL,
            challengeId: challengeId,
            subject: appState.walletAddress
        )
        // Trigger victory celebration when verdict first arrives as pass
        if prevPass == nil, participantStatus?.verdictPass == true {
            await MainActor.run { showingVictory = true }
        }
    }

    private func loadReputation() async {
        guard appState.hasWallet else { return }
        _reputation = try? await APIClient.shared.fetchReputation(
            baseURL: appState.serverURL,
            address: appState.walletAddress
        )
    }
}
