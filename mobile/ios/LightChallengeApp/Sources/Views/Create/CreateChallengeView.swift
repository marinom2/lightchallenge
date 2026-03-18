// CreateChallengeView.swift
// Native fitness challenge creation flow.
// 4 steps: Activity → Details → Rules → Review & Create

import SwiftUI
import CryptoKit

struct CreateChallengeView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var step = 1
    @State private var fitnessKind: String = "steps"
    @State private var selectedTemplate: ChallengeTemplate?
    @State private var title: String = ""
    @State private var description: String = ""
    @State private var tags: String = ""
    @State private var stakeAmount: String = "0.01"
    @State private var joinCloses = Date().addingTimeInterval(7200)  // +2h
    @State private var starts = Date().addingTimeInterval(10800)     // +3h
    @State private var ends = Date().addingTimeInterval(86400 * 7)   // +7d
    @State private var proofDeadline = Date().addingTimeInterval(86400 * 7 + 3600) // +7d1h
    @State private var templateFields: [String: Any] = [:]
    @State private var isCreating = false
    @State private var createError: String?
    @State private var createdResult: CreateChallengeResult?

    private let fitnessKinds: [(key: String, label: String, icon: String)] = [
        ("steps", "Steps", "figure.walk"),
        ("running", "Running", "figure.run"),
        ("walking", "Walking", "figure.walk.motion"),
        ("cycling", "Cycling", "bicycle"),
        ("hiking", "Hiking", "mountain.2.fill"),
        ("swimming", "Swimming", "figure.pool.swim"),
        ("strength", "Strength", "figure.strengthtraining.traditional"),
        ("yoga", "Yoga", "figure.yoga"),
        ("hiit", "HIIT", "figure.highintensity.intervaltraining"),
        ("rowing", "Rowing", "figure.rowing"),
        ("calories", "Calories", "flame.fill"),
        ("exercise", "Exercise", "heart.circle.fill"),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stepIndicator
                    .padding(.top, LC.space8)

                ScrollView {
                    VStack(spacing: LC.space24) {
                        switch step {
                        case 1: step1ActivityType
                        case 2: step2Details
                        case 3: step3Template
                        case 4: step4Review
                        default: EmptyView()
                        }
                    }
                    .padding(.horizontal, LC.space16)
                    .padding(.top, LC.space16)
                    .padding(.bottom, 100) // space for nav buttons
                }

                navigationButtons
            }
            .lcPageBackground()
            .navigationTitle("Create Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LC.textSecondary(scheme))
                }
            }
            .sheet(item: Binding(
                get: { createdResult.map { IdentifiableResult(result: $0) } },
                set: { if $0 == nil { createdResult = nil; dismiss() } }
            )) { item in
                successSheet(item.result)
            }
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: LC.space6) {
            ForEach(1...4, id: \.self) { i in
                VStack(spacing: LC.space4) {
                    Capsule()
                        .fill(i <= step ? LC.accent : LC.cardBorder(scheme))
                        .frame(height: 3)
                    Text(stepLabel(i))
                        .font(.system(size: 9, weight: i == step ? .semibold : .regular))
                        .foregroundStyle(i <= step ? LC.accent : LC.textTertiary(scheme))
                }
            }
        }
        .padding(.horizontal, LC.space16)
    }

    private func stepLabel(_ i: Int) -> String {
        switch i {
        case 1: "Activity"
        case 2: "Details"
        case 3: "Rules"
        case 4: "Review"
        default: ""
        }
    }

    // MARK: - Step 1: Activity Type

    private var step1ActivityType: some View {
        VStack(alignment: .leading, spacing: LC.space16) {
            sectionHeader(title: "Choose Activity", subtitle: "Select the fitness activity for your challenge")

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: LC.space12) {
                ForEach(fitnessKinds, id: \.key) { kind in
                    Button {
                        withAnimation(.spring(response: LC.springResponse, dampingFraction: LC.springDamping)) {
                            fitnessKind = kind.key
                            selectedTemplate = nil
                            templateFields = [:]
                        }
                    } label: {
                        VStack(spacing: LC.space8) {
                            ZStack {
                                Circle()
                                    .fill(fitnessKind == kind.key ? LC.accent.opacity(0.12) : LC.cardBgElevated(scheme))
                                    .frame(width: 48, height: 48)
                                Image(systemName: kind.icon)
                                    .font(.title3)
                                    .foregroundStyle(fitnessKind == kind.key ? LC.accent : LC.textSecondary(scheme))
                            }
                            Text(kind.label)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(fitnessKind == kind.key ? LC.textPrimary(scheme) : LC.textSecondary(scheme))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LC.space20)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                                .fill(fitnessKind == kind.key ? LC.accent.opacity(0.06) : LC.cardBg(scheme))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                                .stroke(fitnessKind == kind.key ? LC.accent : LC.cardBorder(scheme), lineWidth: fitnessKind == kind.key ? 2 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Step 2: Details

    private var step2Details: some View {
        VStack(alignment: .leading, spacing: LC.space20) {
            sectionHeader(title: "Challenge Details", subtitle: "Name your challenge, set the stake, and schedule dates")

            // Title & Description card
            VStack(spacing: 0) {
                inputRow(label: "Title", isLast: false) {
                    TextField("e.g. 10K Steps Daily", text: $title)
                        .font(.body)
                }
                inputRow(label: "Description", isLast: false) {
                    TextField("Optional — describe the challenge", text: $description, axis: .vertical)
                        .font(.body)
                        .lineLimit(2...4)
                }
                inputRow(label: "Tags", isLast: true) {
                    VStack(alignment: .leading, spacing: LC.space2) {
                        TextField("fitness, steps, beginner", text: $tags)
                            .font(.body)
                        Text("Comma-separated, max 8")
                            .font(.caption2)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
            }
            .lcCard()

            // Stake card
            VStack(spacing: 0) {
                inputRow(label: "Stake", isLast: true) {
                    HStack(spacing: LC.space8) {
                        TextField("0.01", text: Binding(
                            get: { stakeAmount },
                            set: { stakeAmount = $0.replacingOccurrences(of: ",", with: ".") }
                        ))
                            .font(.title3.monospaced().weight(.medium))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        Text("LCAI")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.accent)
                    }
                }
            }
            .lcCard()

            // Schedule card
            VStack(alignment: .leading, spacing: 0) {
                Text("Schedule")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LC.textTertiary(scheme))
                    .textCase(.uppercase)
                    .padding(.horizontal, LC.space16)
                    .padding(.top, LC.space16)
                    .padding(.bottom, LC.space4)

                scheduleRow(label: "Join by", date: $joinCloses, range: Date()...)
                Divider().padding(.leading, LC.space16)
                scheduleRow(label: "Start", date: $starts, range: Date()...)
                Divider().padding(.leading, LC.space16)
                scheduleRow(label: "End", date: $ends, range: starts...)
                Divider().padding(.leading, LC.space16)
                scheduleRow(label: "Proof deadline", date: $proofDeadline, range: ends...)

                Spacer().frame(height: LC.space8)
            }
            .lcCard()
        }
    }

    // MARK: - Step 3: Template & Rules

    private var step3Template: some View {
        VStack(alignment: .leading, spacing: LC.space20) {
            sectionHeader(title: "Challenge Rules", subtitle: "Select a template and configure the parameters")

            let templates = FitnessTemplates.templates(for: fitnessKind)

            VStack(spacing: LC.space12) {
                ForEach(templates) { template in
                    Button {
                        withAnimation(.spring(response: LC.springResponse, dampingFraction: LC.springDamping)) {
                            selectedTemplate = template
                            templateFields = [:]
                            for field in template.fields {
                                switch field.kind {
                                case .number(_, _, _, let def):
                                    if let def { templateFields[field.key] = def }
                                case .select(_, let def):
                                    if let def { templateFields[field.key] = def }
                                case .text(let def):
                                    if let def { templateFields[field.key] = def }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: LC.space12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                    .fill(selectedTemplate?.id == template.id ? LC.accent.opacity(0.12) : LC.cardBgElevated(scheme))
                                    .frame(width: 36, height: 36)
                                Image(systemName: selectedTemplate?.id == template.id ? "checkmark.circle.fill" : "circle")
                                    .font(.body)
                                    .foregroundStyle(selectedTemplate?.id == template.id ? LC.accent : LC.textTertiary(scheme))
                            }
                            VStack(alignment: .leading, spacing: LC.space2) {
                                Text(template.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(LC.textPrimary(scheme))
                                if let hint = template.hint {
                                    Text(hint)
                                        .font(.caption)
                                        .foregroundStyle(LC.textSecondary(scheme))
                                        .lineLimit(2)
                                }
                            }
                            Spacer()
                        }
                        .padding(LC.space12)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                                .fill(selectedTemplate?.id == template.id ? LC.accent.opacity(0.04) : LC.cardBg(scheme))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                                .stroke(selectedTemplate?.id == template.id ? LC.accent : LC.cardBorder(scheme), lineWidth: selectedTemplate?.id == template.id ? 1.5 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            // Template fields
            if let template = selectedTemplate, !template.fields.isEmpty {
                VStack(spacing: 0) {
                    Text("Parameters")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, LC.space16)
                        .padding(.top, LC.space16)
                        .padding(.bottom, LC.space8)

                    ForEach(Array(template.fields.enumerated()), id: \.element.id) { index, field in
                        if index > 0 {
                            Divider().padding(.leading, LC.space16)
                        }
                        templateFieldRow(field)
                    }

                    Spacer().frame(height: LC.space12)
                }
                .lcCard()
            }
        }
    }

    @ViewBuilder
    private func templateFieldRow(_ field: TemplateField) -> some View {
        HStack {
            Text(field.label)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .frame(minWidth: 80, alignment: .leading)

            Spacer()

            switch field.kind {
            case .number(let min, _, let step, _):
                HStack(spacing: LC.space8) {
                    TextField("", value: Binding(
                        get: { templateFields[field.key] as? Double ?? 0 },
                        set: { templateFields[field.key] = $0 }
                    ), format: .number)
                    .font(.body.monospaced().weight(.medium))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.decimalPad)
                    .frame(width: 80)

                    Stepper("", value: Binding(
                        get: { templateFields[field.key] as? Double ?? 0 },
                        set: { templateFields[field.key] = $0 }
                    ), in: (min ?? 0)...(Double.infinity), step: step ?? 1)
                    .labelsHidden()
                }

            case .select(let options, _):
                Picker("", selection: Binding(
                    get: { templateFields[field.key] as? String ?? "" },
                    set: { templateFields[field.key] = $0 }
                )) {
                    ForEach(options, id: \.value) { option in
                        Text(option.label).tag(option.value)
                    }
                }
                .pickerStyle(.menu)
                .tint(LC.accent)

            case .text(_):
                TextField("", text: Binding(
                    get: { templateFields[field.key] as? String ?? "" },
                    set: { templateFields[field.key] = $0 }
                ))
                .font(.body)
                .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    // MARK: - Step 4: Review

    private var step4Review: some View {
        VStack(alignment: .leading, spacing: LC.space20) {
            sectionHeader(title: "Review & Create", subtitle: "Confirm all details before submitting on-chain")

            // Summary card
            VStack(spacing: 0) {
                reviewRow("Title", value: title.isEmpty ? "—" : title, isFirst: true)
                reviewRow("Activity", value: fitnessKind.capitalized)
                reviewRow("Template", value: selectedTemplate?.name ?? "None")
                reviewRow("Stake", value: "\(stakeAmount) LCAI", accent: true)

                Divider().padding(.leading, LC.space16)

                reviewRow("Join by", value: joinCloses.formatted(date: .abbreviated, time: .shortened))
                reviewRow("Start", value: starts.formatted(date: .abbreviated, time: .shortened))
                reviewRow("End", value: ends.formatted(date: .abbreviated, time: .shortened))
                reviewRow("Proof deadline", value: proofDeadline.formatted(date: .abbreviated, time: .shortened), isLast: selectedTemplate == nil)

                if let template = selectedTemplate {
                    Divider().padding(.leading, LC.space16)

                    ForEach(Array(template.fields.enumerated()), id: \.element.id) { index, field in
                        reviewRow(field.label, value: formatFieldValue(templateFields[field.key]), isLast: index == template.fields.count - 1)
                    }
                }
            }
            .lcCard()

            // Wallet check
            if !walletManager.isConnected {
                HStack(spacing: LC.space12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.title3)
                    VStack(alignment: .leading, spacing: LC.space2) {
                        Text("Wallet Required")
                            .font(.subheadline.weight(.semibold))
                        Text("Connect your wallet to create the challenge on-chain.")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
                .padding(LC.space16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                        .fill(Color.orange.opacity(0.06))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                        .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                )
            }

            // Validation errors
            if let error = validationError {
                errorBanner(error)
            }

            if let error = createError {
                errorBanner(error)
            }
        }
    }

    // MARK: - Reusable Components

    private func sectionHeader(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: LC.space4) {
            Text(title)
                .font(.title3.weight(.bold))
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
        }
    }

    private func inputRow<Content: View>(label: String, isLast: Bool, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: LC.space6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(LC.textTertiary(scheme))
                .textCase(.uppercase)
            content()
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
        .overlay(alignment: .bottom) {
            if !isLast {
                Divider().padding(.leading, LC.space16)
            }
        }
    }

    private func scheduleRow(label: String, date: Binding<Date>, range: PartialRangeFrom<Date>) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .frame(minWidth: 100, alignment: .leading)

            Spacer()

            DatePicker("", selection: date, in: range, displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(LC.accent)
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    private func reviewRow(_ label: String, value: String, accent: Bool = false, isFirst: Bool = false, isLast: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(accent ? LC.accent : LC.textPrimary(scheme))
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space8)
    }

    private func formatFieldValue(_ value: Any?) -> String {
        guard let value else { return "—" }
        if let d = value as? Double {
            return d == d.rounded() ? String(format: "%.0f", d) : String(d)
        }
        return "\(value)"
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: LC.space12) {
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(LC.danger)
                .font(.body)
            Text(message)
                .font(.caption)
                .foregroundStyle(LC.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(LC.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.danger.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.danger.opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: LC.space12) {
            if step > 1 {
                Button {
                    withAnimation(.spring(response: LC.springResponse, dampingFraction: LC.springDamping)) { step -= 1 }
                } label: {
                    Text("Back")
                }
                .buttonStyle(LCSecondaryButton())
            }

            if step < 4 {
                Button {
                    withAnimation(.spring(response: LC.springResponse, dampingFraction: LC.springDamping)) { step += 1 }
                } label: {
                    Text("Continue")
                }
                .buttonStyle(LCGoldButton(isDisabled: !canAdvance))
                .disabled(!canAdvance)
            } else {
                Button {
                    Task { await createChallenge() }
                } label: {
                    if isCreating {
                        HStack(spacing: LC.space8) {
                            ProgressView()
                                .tint(.white)
                            Text("Creating...")
                                .foregroundStyle(.white)
                        }
                    } else {
                        Label("Create Challenge", systemImage: "bolt.circle.fill")
                    }
                }
                .buttonStyle(LCGoldButton(isDisabled: !canCreate || isCreating))
                .disabled(!canCreate || isCreating)
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
        .background(
            Rectangle()
                .fill(LC.pageBg(scheme))
                .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.06), radius: 8, y: -4)
                .ignoresSafeArea()
        )
    }

    // MARK: - Success Sheet

    private func successSheet(_ result: CreateChallengeResult) -> some View {
        VStack(spacing: 0) {
            Spacer()

            // Animated checkmark
            ZStack {
                Circle()
                    .fill(LC.success.opacity(0.1))
                    .frame(width: 120, height: 120)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(LC.success)
            }
            .padding(.bottom, LC.space24)

            Text("Challenge Created!")
                .font(.title.weight(.bold))
                .padding(.bottom, LC.space8)

            Text(title.isEmpty ? "Challenge #\(result.challengeId)" : title)
                .font(.headline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.bottom, LC.space24)

            // Info card
            VStack(spacing: 0) {
                HStack {
                    Text("Challenge ID")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("#\(result.challengeId)")
                        .font(.subheadline.monospaced().weight(.medium))
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)

                Divider().padding(.leading, LC.space16)

                HStack {
                    Text("Stake")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(stakeAmount) LCAI")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.accent)
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)

                Divider().padding(.leading, LC.space16)

                HStack {
                    Text("Transaction")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(result.txHash.prefix(10))...\(result.txHash.suffix(6))")
                        .font(.caption.monospaced())
                        .foregroundStyle(LC.textTertiary(scheme))
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)
            }
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(Color(.separator).opacity(0.3), lineWidth: 1)
            )
            .padding(.horizontal, LC.space24)

            Spacer()

            // Action buttons
            VStack(spacing: LC.space12) {
                Button {
                    let cid = result.challengeId
                    createdResult = nil
                    appState.deepLinkChallengeId = cid
                    appState.selectedTab = .explore
                    dismiss()
                } label: {
                    Text("View Challenge")
                }
                .buttonStyle(LCGoldButton())

                Button {
                    createdResult = nil
                    dismiss()
                } label: {
                    Text("Done")
                }
                .buttonStyle(LCSecondaryButton())
            }
            .padding(.horizontal, LC.space24)
            .padding(.bottom, LC.space40)
        }
        .padding()
    }

    // MARK: - Validation

    private var canAdvance: Bool {
        switch step {
        case 1: !fitnessKind.isEmpty
        case 2: !title.isEmpty && !stakeAmount.isEmpty
        case 3: selectedTemplate != nil
        default: true
        }
    }

    private var canCreate: Bool {
        validationError == nil && walletManager.isConnected
    }

    private var validationError: String? {
        if title.isEmpty { return "Title is required" }
        if stakeAmount.isEmpty || Double(stakeAmount) == nil || Double(stakeAmount)! <= 0 {
            return "Valid stake amount is required"
        }
        if selectedTemplate == nil { return "Select a challenge template" }
        if joinCloses >= starts { return "Registration must close before challenge starts" }
        if starts >= ends { return "Start must be before end" }
        if proofDeadline < ends { return "Proof deadline must be at or after end" }
        if starts.timeIntervalSinceNow < 3600 { return "Challenge must start at least 1 hour from now" }
        if !walletManager.isConnected { return "Wallet not connected" }
        return nil
    }

    // MARK: - Create

    private func createChallenge() async {
        guard let template = selectedTemplate else { return }

        isCreating = true
        createError = nil

        do {
            let weiAmount = ABIEncoder.ethToWei(stakeAmount)
            let kindId = template.kindId

            let aivmParams = template.paramsBuilder(templateFields)
            let rule = template.ruleBuilder(templateFields, starts, ends)

            // Build params hash (simplified: hash of JSON)
            let paramsJSON = try JSONSerialization.data(withJSONObject: aivmParams, options: [.sortedKeys])
            let paramsHashData = SHA256.hash(data: paramsJSON)
            let paramsHash = "0x" + paramsHashData.map { String(format: "%02x", $0) }.joined()

            let createParams = CreateChallengeParams(
                kind: kindId.rawValue,
                currency: CurrencyType.native.rawValue,
                token: CreateChallengeParams.zeroAddress,
                stakeAmount: weiAmount,
                joinClosesTs: UInt64(joinCloses.timeIntervalSince1970),
                startTs: UInt64(starts.timeIntervalSince1970),
                duration: UInt64(ends.timeIntervalSince(starts)),
                maxParticipants: 0,
                verifier: ContractAddresses.poiVerifier,
                proofDeadlineTs: UInt64(proofDeadline.timeIntervalSince1970),
                externalId: CreateChallengeParams.zeroBytes32
            )

            let parsedTags = Array(tags.split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
                .prefix(8))

            let meta = CreateChallengeMeta(
                title: title,
                description: description.isEmpty ? nil : description,
                tags: parsedTags + [fitnessKind],
                modelId: template.modelId,
                modelHash: template.modelHash,
                aivmParams: aivmParams,
                paramsHash: paramsHash,
                rule: rule,
                joinCloses: joinCloses,
                starts: starts,
                ends: ends,
                proofDeadline: proofDeadline
            )

            let result = try await ContractService.shared.createChallenge(
                params: createParams,
                meta: meta,
                baseURL: appState.serverURL
            )

            createdResult = result
        } catch {
            createError = error.localizedDescription
        }

        isCreating = false
    }
}

// MARK: - Identifiable Wrapper

private struct IdentifiableResult: Identifiable {
    let result: CreateChallengeResult
    var id: String { result.challengeId }
}
