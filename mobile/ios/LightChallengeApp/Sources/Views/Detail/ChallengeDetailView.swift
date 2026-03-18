// ChallengeDetailView.swift
// Challenge detail: hero card + milestone timeline + contextual actions.

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
    @State private var showingTrackerNudge = false
    @State private var showingProgressMetrics = false
    @State private var participantLoaded = false
    @State private var showingFileImporter = false
    @State private var fileUploadStatus: FileUploadStatus = .idle
    @State private var _reputation: Reputation?
    @State private var tokenPrice: Double?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass

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
        .background(LC.pageBg(scheme))
        .navigationTitle(detail?.displayTitle ?? "Challenge #\(challengeId)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let priceTask: () = loadTokenPrice()
            async let dataTask: () = loadData()
            _ = await (priceTask, dataTask)
        }
        .refreshable { await loadData() }
        .sheet(isPresented: $showingProofFlow) {
            NavigationStack {
                FitnessProofView(
                    challengeId: challengeId,
                    modelHash: detail?.proof?.modelHash ?? detail?.modelHash ?? ServerConfig.defaultFitnessModelHash,
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
                earningsUSD: detail?.poolDisplayUSD(tokenPrice: tokenPrice),
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
        .sheet(isPresented: $showingTrackerNudge) {
            ActivitySourceNudgeSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingProgressMetrics) {
            if let detail {
                ProgressMetricsView(
                    detail: detail,
                    participantStatus: participantStatus,
                    healthService: healthService,
                    tokenPrice: tokenPrice
                )
                .presentationDragIndicator(.visible)
            }
        }
    }

    // MARK: - Detail Content

    @ViewBuilder
    private func detailContent(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space16) {
            // Hero card (ring + title + status + prize + insight + action)
            ChallengeProgressHero(
                detail: detail,
                participantStatus: participantStatus,
                participantLoaded: participantLoaded,
                healthService: healthService,
                progress: progress,
                tokenPrice: tokenPrice,
                onAction: { handleHeroAction($0, detail: detail) }
            )

            // Contextual secondary content
            secondaryContent(detail)

            // Milestone timeline
            milestoneTimeline(detail)
        }
        .frame(maxWidth: maxContentWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, LC.space16)
        .padding(.bottom, LC.space32)
    }

    // MARK: - Hero Action Handler

    private func handleHeroAction(_ action: HeroAction, detail: ChallengeDetail) {
        switch action {
        case .join:
            if !walletManager.isConnected {
                showingWalletSheet = true
            } else {
                Task { await joinChallenge(detail) }
            }
        case .submitProof:
            showingProofFlow = true
        case .claimReward:
            appState.selectedTab = .challenges
        case .viewResults:
            showingShareCard = true
        case .viewProgress:
            showingProgressMetrics = true
        case .share:
            showingShareCard = true
        }
    }

    // MARK: - Secondary Content (state-driven)

    @ViewBuilder
    private func secondaryContent(_ detail: ChallengeDetail) -> some View {
        let phase = ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
        let userState = UserChallengeState.from(detail: detail, participantStatus: participantStatus, phase: phase)

        switch userState {
        case .notJoined:
            if !appState.hasWallet {
                walletPrompt
            } else if let joinError {
                joinErrorCard(joinError)
            } else if isJoining {
                joiningCard
            } else if let stake = detail.stakeDisplayUSD(tokenPrice: tokenPrice) {
                stakeInfoCard(stake)
            }

        case .active:
            activeCard(detail)

        case .awaitingProof:
            proofCard(detail)

        case .awaitingVerdict:
            verdictCard

        case .completed:
            completedCard(detail)

        case .failed:
            failedCard

        case .ended:
            endedCard
        }
    }

    // MARK: - State Cards

    private var walletPrompt: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "wallet.bifold")
                .font(.system(size: 20))
                .foregroundStyle(LC.textTertiary(scheme))
                .frame(width: 36)
            VStack(alignment: .leading, spacing: LC.space2) {
                Text("Connect Your Wallet")
                    .font(.subheadline.weight(.semibold))
                Text("Required to join and participate")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
            }
            Spacer()
            Button {
                showingWalletSheet = true
            } label: {
                Text("Connect")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(LC.accent)
                    .clipShape(Capsule())
            }
        }
        .padding(LC.space16)
        .lcCard()
    }

    private func joinErrorCard(_ message: String) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(LC.danger)
                .frame(width: 24)
            Text(message)
                .font(.caption)
                .foregroundStyle(LC.danger)
        }
        .padding(LC.space16)
        .lcCard()
    }

    private var joiningCard: some View {
        HStack(spacing: LC.space12) {
            ProgressView()
                .tint(LC.accent)
            Text("Joining challenge...")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
        }
        .padding(LC.space16)
        .frame(maxWidth: .infinity)
        .lcCard()
    }

    private func stakeInfoCard(_ stake: String) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 14))
                .foregroundStyle(LC.accent)
                .frame(width: 24)
            Text("Stake \(stake) to join and compete")
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
            Spacer()
        }
        .padding(LC.space16)
        .lcCard()
    }

    /// Whether the join window is still open for this challenge.
    private var isJoinWindowOpen: Bool {
        guard let detail else { return false }
        // Join closes at joinClosesTs or startDate, whichever is set
        if let joinCloses = detail.joinClosesTs, let ts = Double(joinCloses), ts > 0 {
            return Date().timeIntervalSince1970 < ts
        }
        // Fallback: join open if challenge hasn't started yet or is active
        if let start = detail.startDate, start > Date() { return true }
        return detail.isActive
    }

    private func activeCard(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space12) {
            HStack(spacing: LC.space12) {
                Image(systemName: "figure.run")
                    .font(.system(size: 18))
                    .foregroundStyle(LC.accent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Challenge In Progress")
                        .font(.subheadline.weight(.semibold))
                    if let endDate = detail.endsDate {
                        Text("Complete your activity by \(endDate.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
                Spacer()
            }

            garminHealthKitTip

            // Auto-proof status
            if let proofStatus = autoProofService.status[challengeId] {
                autoProofStatusRow(proofStatus)
            }

            // Invite a friend — only when join window is still open
            if isJoinWindowOpen {
                ShareLink(
                    item: URL(string: "\(appState.serverURL)/challenge/\(challengeId)")!,
                    subject: Text("Join my challenge"),
                    message: Text("Think you can beat me? Join \"\(detail.displayTitle)\" on LightChallenge!")
                ) {
                    HStack(spacing: LC.space8) {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Invite a Friend")
                            .font(.subheadline.weight(.semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(
                        LinearGradient(
                            colors: [LC.accent, LC.accent.opacity(0.85)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous))
                }
            }
        }
        .padding(LC.space16)
        .lcCard()
    }

    private func proofCard(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space12) {
            HStack(spacing: LC.space12) {
                Image(systemName: "arrow.up.doc.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(LC.warning)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Proof Submission Open")
                        .font(.subheadline.weight(.semibold))
                    if let deadline = detail.proofDeadlineDate {
                        Text("Submit by \(deadline.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
                Spacer()
            }

            // Auto-proof status
            let proofStatus = autoProofService.status[challengeId]
            if let proofStatus {
                autoProofStatusRow(proofStatus)
            } else {
                // Trigger auto-proof
                HStack(spacing: LC.space8) {
                    ProgressView()
                        .tint(LC.accent)
                        .scaleEffect(0.8)
                    Text("Auto-submitting proof...")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                }
                .onAppear {
                    let meta = detail.toChallengeMeta()
                    autoProofService.triggerAutoProof(
                        challengeId: challengeId,
                        challenge: meta,
                        appState: appState,
                        healthService: healthService
                    )
                }
            }

            // Manual submit + file upload
            Button {
                showingProofFlow = true
            } label: {
                Label("Submit Manually", systemImage: "heart.fill")
            }
            .buttonStyle(LCSecondaryButton())

            manualUploadSection
        }
        .padding(LC.space16)
        .lcCard()
    }

    private var verdictCard: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "hourglass")
                .font(.system(size: 18))
                .foregroundStyle(LC.warning)
                .symbolEffect(.pulse)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: LC.space2) {
                Text("Proof Under Review")
                    .font(.subheadline.weight(.semibold))
                Text("Your evidence is being evaluated")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
            }
            Spacer()
        }
        .padding(LC.space16)
        .lcCard()
    }

    private func completedCard(_ detail: ChallengeDetail) -> some View {
        VStack(spacing: LC.space12) {
            HStack(spacing: LC.space12) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(LC.success)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Challenge Passed")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(LC.success)
                    Text("You completed this challenge successfully")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                }
                Spacer()
            }

            Button {
                showingShareCard = true
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(LCSecondaryButton())
        }
        .padding(LC.space16)
        .lcCard()
    }

    private var failedCard: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "xmark.seal.fill")
                .font(.system(size: 20))
                .foregroundStyle(LC.danger)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: LC.space2) {
                Text("Challenge Failed")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(LC.danger)
                Text("Your activity did not meet the requirements")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
            }
            Spacer()
        }
        .padding(LC.space16)
        .lcCard()
    }

    private var endedCard: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 18))
                .foregroundStyle(LC.textTertiary(scheme))
                .frame(width: 28)
            Text("This challenge has ended")
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
            Spacer()
        }
        .padding(LC.space16)
        .lcCard()
    }

    // MARK: - Auto-Proof Status Row

    private func autoProofStatusRow(_ status: AutoProofService.ProofStatus) -> some View {
        HStack(spacing: LC.space8) {
            Image(systemName: status.icon)
                .font(.system(size: 14))
                .foregroundStyle(status.color)
                .symbolEffect(.pulse, isActive: status == .pending || status == .collectingHealth || status == .submitting)
            Text(status.label)
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))
            Spacer()
            if status == .pending || status == .collectingHealth || status == .submitting {
                ProgressView()
                    .tint(LC.accent)
                    .scaleEffect(0.7)
            }
        }
        .padding(LC.space8)
        .background(status.color.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))
    }

    // MARK: - Milestone Timeline

    private func milestoneTimeline(_ detail: ChallengeDetail) -> some View {
        let milestones = buildMilestones(detail)
        guard !milestones.isEmpty else { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 0) {
                Text("Timeline")
                    .font(.subheadline.weight(.semibold))
                    .padding(.bottom, LC.space12)

                ForEach(Array(milestones.enumerated()), id: \.element.id) { index, milestone in
                    HStack(alignment: .top, spacing: LC.space12) {
                        // Stepper line + dot
                        VStack(spacing: 0) {
                            Circle()
                                .fill(milestone.isCompleted ? LC.accent : LC.textTertiary(scheme).opacity(0.3))
                                .frame(width: 8, height: 8)
                            if index < milestones.count - 1 {
                                Rectangle()
                                    .fill(milestone.isCompleted ? LC.accent.opacity(0.3) : LC.textTertiary(scheme).opacity(0.15))
                                    .frame(width: 1)
                                    .frame(maxHeight: .infinity)
                            }
                        }
                        .frame(width: 8)

                        VStack(alignment: .leading, spacing: LC.space2) {
                            Text(milestone.label)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(milestone.isCompleted ? LC.textPrimary(scheme) : LC.textTertiary(scheme))
                            if let date = milestone.date {
                                Text(date.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2)
                                    .foregroundStyle(LC.textTertiary(scheme))
                            }
                        }
                        .padding(.bottom, index < milestones.count - 1 ? LC.space16 : 0)

                        Spacer()
                    }
                }
            }
            .padding(LC.space16)
            .lcCard()
        )
    }

    private struct Milestone: Identifiable {
        let id: String
        let label: String
        let date: Date?
        let isCompleted: Bool
    }

    private func buildMilestones(_ detail: ChallengeDetail) -> [Milestone] {
        var milestones: [Milestone] = []
        let now = Date()

        // Created
        if let created = detail.createdAt.flatMap({ $0 > 0 ? Date(timeIntervalSince1970: $0) : nil }) {
            milestones.append(Milestone(id: "created", label: "Created", date: created, isCompleted: true))
        }

        // You Joined
        if detail.youJoined == true || participantStatus != nil {
            milestones.append(Milestone(id: "joined", label: "You Joined", date: nil, isCompleted: true))
        }

        // Start Date
        if let start = detail.startDate {
            milestones.append(Milestone(id: "start", label: "Challenge Start", date: start, isCompleted: start <= now))
        }

        // End Date
        if let end = detail.endsDate {
            milestones.append(Milestone(id: "end", label: "Challenge End", date: end, isCompleted: end <= now))
        }

        // Proof Deadline
        if let deadline = detail.proofDeadlineDate {
            milestones.append(Milestone(id: "proof", label: "Proof Deadline", date: deadline, isCompleted: deadline <= now))
        }

        // Finalized
        if detail.status == "Finalized" {
            let passed = participantStatus?.verdictPass
            let label = passed == true ? "Finalized — Passed" : passed == false ? "Finalized — Failed" : "Finalized"
            milestones.append(Milestone(id: "finalized", label: label, date: nil, isCompleted: true))
        }

        return milestones
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

            // Nudge user to connect an activity source if none are active
            if !appState.healthEnabled {
                showingTrackerNudge = true
            }
        } catch {
            joinError = error.localizedDescription
        }

        isJoining = false
    }

    // MARK: - Manual File Upload

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

    @ViewBuilder
    private var manualUploadSection: some View {
        if canShowManualUpload {
            VStack(spacing: LC.space8) {
                switch fileUploadStatus {
                case .idle:
                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Upload Evidence File", systemImage: "doc.badge.arrow.up")
                    }
                    .buttonStyle(LCSecondaryButton())

                    Text("TCX, GPX, JSON, or ZIP exports")
                        .font(.caption2)
                        .foregroundStyle(LC.textTertiary(scheme))

                case .uploading:
                    ProgressView("Uploading...")
                        .tint(LC.accent)

                case .success(let evidenceId):
                    HStack(spacing: LC.space8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(LC.success)
                        Text("Uploaded")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(LC.success)
                        if let eid = evidenceId {
                            Text("ID: \(eid)")
                                .font(.caption2)
                                .foregroundStyle(LC.textTertiary(scheme))
                        }
                    }

                case .error(let msg):
                    HStack(spacing: LC.space8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(LC.warning)
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(LC.danger)
                            .lineLimit(2)
                    }
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

            guard fileURL.startAccessingSecurityScopedResource() else {
                fileUploadStatus = .error("Unable to access the selected file.")
                return
            }
            defer { fileURL.stopAccessingSecurityScopedResource() }

            let fileName = fileURL.lastPathComponent
            let ext = fileURL.pathExtension.lowercased()

            let mimeType: String
            switch ext {
            case "json": mimeType = "application/json"
            case "xml", "tcx", "gpx": mimeType = "application/xml"
            case "zip": mimeType = "application/zip"
            default: mimeType = "application/octet-stream"
            }

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

            fileUploadStatus = .uploading
            let modelHash = detail?.proof?.modelHash ?? detail?.modelHash ?? ServerConfig.defaultFitnessModelHash

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
                    await loadParticipantStatus()
                } else {
                    fileUploadStatus = .error("Upload was not accepted by the server.")
                }
            } catch {
                fileUploadStatus = .error("Upload failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Loading / Error

    private var loadingView: some View {
        VStack(spacing: LC.space16) {
            ShimmerView().frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
            ShimmerView().frame(height: 80)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
            ShimmerView().frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
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

    private func loadTokenPrice() async {
        tokenPrice = await TokenPriceService.shared.getUSDPrice()
    }

    private func loadData() async {
        isLoading = true
        error = nil

        if detail == nil, let cached = await CacheService.shared.loadCachedDetail(id: challengeId) {
            detail = cached
        }

        let metaTask = Task { try? await APIClient.shared.fetchChallengeMeta(baseURL: appState.serverURL, id: challengeId) }

        do {
            let viewer = appState.hasWallet ? appState.walletAddress : nil
            var fresh = try await APIClient.shared.fetchChallengeDetail(
                baseURL: appState.serverURL,
                id: challengeId,
                viewer: viewer
            )

            if let meta = await metaTask.value {
                fresh.mergeFromMeta(meta)
            }

            detail = fresh
            await CacheService.shared.cacheDetail(fresh, id: challengeId)

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
            if detail == nil, let meta = await metaTask.value {
                detail = ChallengeDetail.fromMeta(meta)
            }
            if detail != nil {
                async let progressTask: () = loadProgress()
                async let participantTask: () = loadParticipantStatus()
                async let reputationTask: () = loadReputation()
                _ = await (progressTask, participantTask, reputationTask)
            } else {
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
        guard appState.hasWallet else {
            participantLoaded = true
            return
        }
        let prevPass = participantStatus?.verdictPass
        participantStatus = try? await APIClient.shared.fetchParticipantStatus(
            baseURL: appState.serverURL,
            challengeId: challengeId,
            subject: appState.walletAddress
        )
        participantLoaded = true
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

    // MARK: - Garmin HealthKit Tip

    @ViewBuilder
    private var garminHealthKitTip: some View {
        if healthService.isAuthorized {
            HStack(spacing: LC.space8) {
                Image(systemName: "applewatch.and.arrow.forward")
                    .font(.system(size: 12))
                    .foregroundStyle(LC.info)
                Text("Garmin, Fitbit, and other wearables sync via Apple Health automatically")
                    .font(.caption2)
                    .foregroundStyle(LC.textSecondary(scheme))
            }
            .padding(LC.space8)
            .background(LC.info.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM))
        }
    }
}
