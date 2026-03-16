// CreateChallengeView.swift
// Native fitness challenge creation flow.
// 4 steps: Activity → Details → Rules → Review & Create

import SwiftUI

struct CreateChallengeView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @Environment(\.dismiss) private var dismiss

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

    private let fitnessKinds = [
        ("steps", "Steps", "figure.walk"),
        ("running", "Running", "figure.run"),
        ("cycling", "Cycling", "bicycle"),
        ("hiking", "Hiking", "mountain.2.fill"),
        ("swimming", "Swimming", "figure.pool.swim"),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Progress indicator
                stepIndicator

                ScrollView {
                    VStack(spacing: 20) {
                        switch step {
                        case 1: step1ActivityType
                        case 2: step2Details
                        case 3: step3Template
                        case 4: step4Review
                        default: EmptyView()
                        }
                    }
                    .padding()
                }

                // Navigation buttons
                navigationButtons
            }
            .navigationTitle("Create Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
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
        HStack(spacing: 4) {
            ForEach(1...4, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? LC.accent : Color.secondary.opacity(0.2))
                    .frame(height: 3)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Step 1: Activity Type

    private var step1ActivityType: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Choose Activity")
                .font(.title3.weight(.bold))
            Text("Select the type of fitness activity for your challenge.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(fitnessKinds, id: \.0) { kind, label, icon in
                    Button {
                        fitnessKind = kind
                        selectedTemplate = nil
                        templateFields = [:]
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: icon)
                                .font(.title2)
                            Text(label)
                                .font(.subheadline.weight(.medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(fitnessKind == kind ? LC.accent.opacity(0.12) : .secondary.opacity(0.06))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(fitnessKind == kind ? LC.accent : .clear, lineWidth: 2)
                        )
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(fitnessKind == kind ? LC.accent : .primary)
                }
            }
        }
    }

    // MARK: - Step 2: Details

    private var step2Details: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Challenge Details")
                .font(.title3.weight(.bold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Title").font(.subheadline.weight(.medium))
                TextField("e.g. 10K Steps Daily Challenge", text: $title)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Description").font(.subheadline.weight(.medium))
                TextField("Optional description...", text: $description, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3...6)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Tags").font(.subheadline.weight(.medium))
                TextField("fitness, steps, beginner", text: $tags)
                    .textFieldStyle(.roundedBorder)
                Text("Comma-separated, max 8")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Stake Amount (LCAI)").font(.subheadline.weight(.medium))
                TextField("0.01", text: $stakeAmount)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.decimalPad)
            }

            // Schedule
            VStack(alignment: .leading, spacing: 12) {
                Text("Schedule").font(.subheadline.weight(.semibold))

                DatePicker("Registration Closes", selection: $joinCloses, in: Date()...)
                    .font(.subheadline)
                DatePicker("Challenge Starts", selection: $starts, in: Date()...)
                    .font(.subheadline)
                DatePicker("Challenge Ends", selection: $ends, in: starts...)
                    .font(.subheadline)
                DatePicker("Proof Deadline", selection: $proofDeadline, in: ends...)
                    .font(.subheadline)
            }
        }
    }

    // MARK: - Step 3: Template & Rules

    private var step3Template: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Challenge Rules")
                .font(.title3.weight(.bold))
            Text("Select a template and configure the rules.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            let templates = FitnessTemplates.templates(for: fitnessKind)

            ForEach(templates) { template in
                Button {
                    selectedTemplate = template
                    // Reset fields to defaults
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
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(template.name)
                                .font(.subheadline.weight(.medium))
                            if let hint = template.hint {
                                Text(hint)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if selectedTemplate?.id == template.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(LC.accent)
                        }
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(selectedTemplate?.id == template.id ? LC.accent.opacity(0.08) : .secondary.opacity(0.06))
                    )
                }
                .buttonStyle(.plain)
            }

            // Template fields
            if let template = selectedTemplate {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Parameters")
                        .font(.subheadline.weight(.semibold))
                        .padding(.top, 8)

                    ForEach(template.fields) { field in
                        templateFieldView(field)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func templateFieldView(_ field: TemplateField) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label).font(.caption.weight(.medium))

            switch field.kind {
            case .number(let min, _, let step, _):
                HStack {
                    TextField("", value: Binding(
                        get: { templateFields[field.key] as? Double ?? 0 },
                        set: { templateFields[field.key] = $0 }
                    ), format: .number)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.decimalPad)

                    Stepper("", value: Binding(
                        get: { templateFields[field.key] as? Double ?? 0 },
                        set: { templateFields[field.key] = $0 }
                    ), in: (min ?? 0)...(Double.infinity), step: step ?? 1)
                    .labelsHidden()
                }

            case .select(let options, _):
                Picker(field.label, selection: Binding(
                    get: { templateFields[field.key] as? String ?? "" },
                    set: { templateFields[field.key] = $0 }
                )) {
                    ForEach(options, id: \.value) { option in
                        Text(option.label).tag(option.value)
                    }
                }
                .pickerStyle(.menu)

            case .text(_):
                TextField("", text: Binding(
                    get: { templateFields[field.key] as? String ?? "" },
                    set: { templateFields[field.key] = $0 }
                ))
                .textFieldStyle(.roundedBorder)
            }
        }
    }

    // MARK: - Step 4: Review

    private var step4Review: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Review & Create")
                .font(.title3.weight(.bold))

            // Summary card
            VStack(alignment: .leading, spacing: 12) {
                reviewRow("Title", value: title)
                reviewRow("Activity", value: fitnessKind.capitalized)
                reviewRow("Template", value: selectedTemplate?.name ?? "None")
                reviewRow("Stake", value: "\(stakeAmount) LCAI")
                reviewRow("Starts", value: starts.formatted(date: .abbreviated, time: .shortened))
                reviewRow("Ends", value: ends.formatted(date: .abbreviated, time: .shortened))
                reviewRow("Proof Deadline", value: proofDeadline.formatted(date: .abbreviated, time: .shortened))

                if let template = selectedTemplate {
                    Divider()
                    Text("Rules").font(.caption.weight(.semibold))
                    ForEach(template.fields) { field in
                        reviewRow(field.label, value: "\(templateFields[field.key] ?? "—")")
                    }
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 12).fill(.secondary.opacity(0.06)))

            // Wallet check
            if !walletManager.isConnected {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(LC.accent)
                    Text("Connect your wallet to create the challenge on-chain.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(RoundedRectangle(cornerRadius: 10).fill(LC.accent.opacity(0.08)))
            }

            // Validation errors
            if let error = validationError {
                HStack(spacing: 8) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(LC.danger)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(LC.danger)
                }
            }

            if let error = createError {
                HStack(spacing: 8) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(LC.danger)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(LC.danger)
                }
                .padding()
                .background(RoundedRectangle(cornerRadius: 10).fill(LC.danger.opacity(0.08)))
            }
        }
    }

    private func reviewRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption.weight(.medium))
        }
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: 12) {
            if step > 1 {
                Button {
                    withAnimation { step -= 1 }
                } label: {
                    Text("Back")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }

            if step < 4 {
                Button {
                    withAnimation { step += 1 }
                } label: {
                    Text("Next")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(LC.accent)
                .disabled(!canAdvance)
            } else {
                Button {
                    Task { await createChallenge() }
                } label: {
                    if isCreating {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Label("Create Challenge", systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(LC.accent)
                .disabled(!canCreate || isCreating)
            }
        }
        .padding()
    }

    // MARK: - Success Sheet

    private func successSheet(_ result: CreateChallengeResult) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(LC.success)

            Text("Challenge Created!")
                .font(.title2.weight(.bold))

            Text("Challenge #\(result.challengeId) has been created on-chain.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text("TX: \(result.txHash.prefix(18))...")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)

            Spacer()

            Button("Done") {
                createdResult = nil
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .tint(LC.accent)
            .padding(.horizontal, 40)
            .padding(.bottom, 40)
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
            let paramsHashData = CryptoKit.SHA256.hash(data: paramsJSON)
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

import CryptoKit
