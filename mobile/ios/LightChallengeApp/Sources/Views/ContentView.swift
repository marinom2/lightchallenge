// ContentView.swift
// Main view for LightChallenge iOS evidence collector.
//
// Flow:
//   1. User arrives via deep link or scans QR from webapp
//   2. App requests HealthKit authorization
//   3. Collects step count + distance data
//   4. Previews data and submits to LightChallenge API

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var health: HealthKitService
    @State private var serverURL: String = ServerConfig.defaultBaseURL
    @State private var challengeId: String = ""
    @State private var subject: String = ""
    @State private var lookbackDays: Int = 90

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    headerSection
                    if !health.isAuthorized {
                        authorizationSection
                    } else {
                        challengeInputSection
                        if !health.stepDays.isEmpty {
                            dataPreviewSection
                        }
                        actionSection
                        if let result = health.lastSubmission {
                            resultSection(result)
                        }
                    }
                    if let error = health.error {
                        errorSection(error)
                    }
                }
                .padding()
            }
            .navigationTitle("LightChallenge")
            .onAppear {
                // Pre-fill from deep link
                if !health.pendingChallengeId.isEmpty {
                    challengeId = health.pendingChallengeId
                }
                if !health.pendingSubject.isEmpty {
                    subject = health.pendingSubject
                }
            }
            .onChange(of: health.pendingChallengeId) { _, newVal in
                if !newVal.isEmpty { challengeId = newVal }
            }
            .onChange(of: health.pendingSubject) { _, newVal in
                if !newVal.isEmpty { subject = newVal }
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 48))
                .foregroundStyle(.pink)
            Text("Apple Health Evidence")
                .font(.title2.bold())
            Text("Collect your step count and distance data from Apple Health to verify your challenge.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical)
    }

    // MARK: - Authorization

    private var authorizationSection: some View {
        VStack(spacing: 12) {
            Label("HealthKit Access Required", systemImage: "lock.shield")
                .font(.headline)
            Text("LightChallenge needs read-only access to your step count and walking/running distance to verify your challenge participation.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await health.requestAuthorization() }
            } label: {
                Label("Grant HealthKit Access", systemImage: "heart.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.pink)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(.ultraThinMaterial))
    }

    // MARK: - Challenge Input

    private var challengeInputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Challenge Details")
                .font(.headline)

            VStack(alignment: .leading, spacing: 4) {
                Text("Challenge ID").font(.caption).foregroundStyle(.secondary)
                TextField("e.g. 42", text: $challengeId)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Your Wallet Address").font(.caption).foregroundStyle(.secondary)
                TextField("0x...", text: $subject)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .font(.system(.body, design: .monospaced))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Lookback Period").font(.caption).foregroundStyle(.secondary)
                Picker("Days", selection: $lookbackDays) {
                    Text("30 days").tag(30)
                    Text("60 days").tag(60)
                    Text("90 days").tag(90)
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Server").font(.caption).foregroundStyle(.secondary)
                TextField("https://app.lightchallenge.io", text: $serverURL)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .font(.system(.caption, design: .monospaced))
                HStack(spacing: 8) {
                    Button("Production") { serverURL = ServerConfig.defaultBaseURL }
                        .font(.caption2)
                    Button("Local Dev") { serverURL = ServerConfig.devBaseURL }
                        .font(.caption2)
                }
                if serverURL.contains("YOUR_MAC_IP") {
                    Text("Replace YOUR_MAC_IP with your Mac's LAN IP (Wi-Fi settings).")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            // Token status
            if !health.pendingToken.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                        .font(.caption)
                    Text("Authenticated via wallet signature")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("No auth token — open via QR code from the webapp to authenticate")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(.ultraThinMaterial))
    }

    // MARK: - Data Preview

    private var dataPreviewSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Collected Data")
                .font(.headline)

            let totalSteps = health.stepDays.reduce(0) { $0 + $1.steps }
            let totalDistanceKm = health.distanceDays.reduce(0.0) { $0 + $1.distanceMeters } / 1000.0
            let activeDays = health.stepDays.filter { $0.steps > 0 }.count

            HStack(spacing: 16) {
                StatCard(title: "Total Steps", value: formatNumber(totalSteps))
                StatCard(title: "Distance", value: String(format: "%.1f km", totalDistanceKm))
                StatCard(title: "Active Days", value: "\(activeDays)")
            }

            if health.stepDays.count > 0 {
                Text("Recent days:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(health.stepDays.suffix(7)) { day in
                    HStack {
                        Text(day.date)
                            .font(.system(.caption, design: .monospaced))
                        Spacer()
                        Text("\(formatNumber(day.steps)) steps")
                            .font(.caption.bold())
                    }
                }
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(.ultraThinMaterial))
    }

    // MARK: - Actions

    private var actionSection: some View {
        VStack(spacing: 12) {
            Button {
                Task { await health.collectEvidence(days: lookbackDays) }
            } label: {
                Label(
                    health.stepDays.isEmpty ? "Collect Health Data" : "Refresh Data",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(health.isLoading)

            if !health.stepDays.isEmpty {
                Button {
                    Task {
                        await health.submitEvidence(
                            baseURL: serverURL,
                            challengeId: challengeId,
                            subject: subject,
                            modelHash: ServerConfig.appleStepsModelHash
                        )
                    }
                } label: {
                    Label("Submit Evidence", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(
                    health.isLoading ||
                    challengeId.isEmpty ||
                    subject.isEmpty ||
                    !subject.hasPrefix("0x")
                )
            }

            if health.isLoading {
                ProgressView()
                    .padding(.top, 4)
            }
        }
    }

    // MARK: - Result

    private func resultSection(_ result: SubmissionResult) -> some View {
        VStack(spacing: 8) {
            Image(systemName: result.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(result.ok ? .green : .red)
            Text(result.ok ? "Evidence Submitted" : "Submission Failed")
                .font(.headline)
            if let eid = result.evidenceId {
                Text("Evidence ID: \(eid)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("\(result.recordCount) records · hash: \(result.dataHash.prefix(18))...")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(.ultraThinMaterial))
    }

    // MARK: - Error

    private func errorSection(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(.red.opacity(0.1)))
    }

    // MARK: - Helpers

    private func formatNumber(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.bold())
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(.ultraThinMaterial))
    }
}

#Preview {
    ContentView()
        .environmentObject(HealthKitService())
}
