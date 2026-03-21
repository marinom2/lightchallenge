// FitnessProofView.swift
// Apple Health evidence collection and submission flow.
// Evolved from the original ContentView single-screen collector.

import SwiftUI

struct FitnessProofView: View {
    let challengeId: String
    let modelHash: String
    let deepLinkToken: String?
    let deepLinkExpires: String?

    @EnvironmentObject private var healthService: HealthKitService
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var lookbackDays: Int = 90

    private var subject: String { appState.walletAddress }

    private var canSubmit: Bool {
        !healthService.isLoading &&
        !healthService.stepDays.isEmpty &&
        !challengeId.isEmpty &&
        appState.hasWallet
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                headerSection

                if !healthService.isAuthorized {
                    authorizationSection
                } else {
                    lookbackPicker
                    collectButton

                    if !healthService.stepDays.isEmpty {
                        dataPreviewSection
                        submitButton
                    }

                    if let result = healthService.lastSubmission {
                        resultSection(result)
                    }
                }

                if let error = healthService.error {
                    errorBanner(error)
                }
            }
            .padding()
        }
        .navigationTitle("Submit Proof")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
        }
        .task {
            // Apply deep link token to health service
            if let token = deepLinkToken {
                healthService.pendingToken = token
                healthService.pendingExpires = deepLinkExpires ?? ""
            }

            // Auto-prompt HealthKit if not yet authorized
            if !healthService.isAuthorized {
                await healthService.requestAuthorization()
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 40))
                .foregroundStyle(LC.danger)
            Text("Apple Health Proof")
                .font(.title3.weight(.bold))
            Text("Challenge #\(challengeId)")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Auth status
            if !healthService.pendingToken.isEmpty || deepLinkToken != nil {
                Label("Authenticated", systemImage: "checkmark.seal.fill")
                    .font(.caption)
                    .foregroundStyle(LC.success)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Authorization

    private var authorizationSection: some View {
        VStack(spacing: 12) {
            Label("HealthKit Access Required", systemImage: "lock.shield")
                .font(.headline)
            Text("Read-only access to steps, distance, cycling, swimming, heart rate, energy, and flights is needed to verify your challenge.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await healthService.requestAuthorization() }
            } label: {
                Label("Grant HealthKit Access", systemImage: "heart.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(LC.danger)
        }
        .padding()
        .lcGlass()
    }

    // MARK: - Lookback Picker

    private var lookbackPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Data Period")
                .font(.subheadline.weight(.medium))
            Picker("Lookback", selection: $lookbackDays) {
                Text("30 days").tag(30)
                Text("60 days").tag(60)
                Text("90 days").tag(90)
            }
            .pickerStyle(.segmented)
        }
    }

    // MARK: - Collect

    private var collectButton: some View {
        Button {
            Task { await healthService.collectEvidence(days: lookbackDays) }
        } label: {
            Label(
                healthService.stepDays.isEmpty ? "Collect Health Data" : "Refresh Data",
                systemImage: healthService.stepDays.isEmpty ? "heart.fill" : "arrow.clockwise"
            )
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(healthService.isLoading)
    }

    // MARK: - Data Preview

    private var dataPreviewSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your Data")
                .font(.subheadline.weight(.semibold))

            let totalSteps = healthService.stepDays.reduce(0) { $0 + $1.steps }
            let totalDistanceKm = healthService.distanceDays.reduce(0.0) { $0 + $1.distanceMeters } / 1000.0
            let totalCyclingKm = healthService.cyclingDays.reduce(0.0) { $0 + $1.totalDistanceMeters } / 1000.0
            let totalSwimmingM = healthService.swimmingDays.reduce(0.0) { $0 + $1.totalDistanceMeters }
            let totalEnergy = healthService.activeEnergyDays.reduce(0.0) { $0 + $1.kilocalories }
            let activeDays = healthService.stepDays.filter { $0.steps > 0 }.count

            // Primary metrics
            HStack(spacing: 12) {
                miniStat("Steps", value: formatNumber(totalSteps), icon: "figure.walk")
                miniStat("Walk/Run", value: String(format: "%.1f km", totalDistanceKm), icon: "figure.run")
                miniStat("Active", value: "\(activeDays) days", icon: "calendar")
            }

            // Secondary metrics (only show if data exists)
            let hasSecondary = totalCyclingKm > 0 || totalSwimmingM > 0 || totalEnergy > 0
            if hasSecondary {
                HStack(spacing: 12) {
                    if totalCyclingKm > 0 {
                        miniStat("Cycling", value: String(format: "%.1f km", totalCyclingKm), icon: "bicycle")
                    }
                    if totalSwimmingM > 0 {
                        miniStat("Swim", value: String(format: "%.0f m", totalSwimmingM), icon: "figure.pool.swim")
                    }
                    if totalEnergy > 0 {
                        miniStat("Energy", value: String(format: "%.0f kcal", totalEnergy), icon: "flame")
                    }
                }
            }

            // Heart rate summary
            if !healthService.heartRateDays.isEmpty {
                let avgHR = healthService.heartRateDays.reduce(0.0) { $0 + $1.avgBpm } / Double(healthService.heartRateDays.count)
                HStack(spacing: 12) {
                    miniStat("Avg HR", value: String(format: "%.0f bpm", avgHR), icon: "heart.fill")
                    miniStat("HR Days", value: "\(healthService.heartRateDays.count)", icon: "waveform.path.ecg")
                }
            }

            // Recent days
            if !healthService.stepDays.isEmpty {
                VStack(spacing: 4) {
                    ForEach(healthService.stepDays.suffix(5)) { day in
                        HStack {
                            Text(day.date)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(formatNumber(day.steps)) steps")
                                .font(.caption.weight(.medium))
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .lcGlass()
    }

    private func miniStat(_ label: String, value: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.bold))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(.quaternary.opacity(0.5)))
    }

    // MARK: - Submit

    private var submitButton: some View {
        Button {
            Task {
                await healthService.submitEvidence(
                    baseURL: appState.serverURL,
                    challengeId: challengeId,
                    subject: subject,
                    modelHash: modelHash
                )
            }
        } label: {
            if healthService.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else {
                Label("Submit Evidence", systemImage: "paperplane.fill")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(LC.success)
        .disabled(!canSubmit)
    }

    // MARK: - Result

    private func resultSection(_ result: SubmissionResult) -> some View {
        VStack(spacing: 10) {
            Image(systemName: result.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(result.ok ? LC.success : LC.danger)
            Text(result.ok ? "Evidence Submitted" : "Submission Failed")
                .font(.subheadline.weight(.semibold))
            if let eid = result.evidenceId {
                Text("Evidence ID: \(eid)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("\(result.recordCount) records")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if result.ok {
                Button("Done") { dismiss() }
                    .buttonStyle(.bordered)
                    .padding(.top, 4)
            }
        }
        .padding()
        .lcGlass()
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(LC.danger.opacity(0.08)))
    }

    // MARK: - Helpers

    private func formatNumber(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}
