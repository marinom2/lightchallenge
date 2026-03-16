// AvatarService.swift
// Avatar storage — persists locally AND syncs to server.
// Local cache for offline access; server is source of truth.

import SwiftUI

@MainActor
class AvatarService: ObservableObject {
    static let shared = AvatarService()

    @Published var avatarImage: UIImage?
    @Published var displayName: String?
    @Published var bio: String?

    private let fileManager = FileManager.default

    private var avatarURL: URL? {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("user_avatar.jpg")
    }

    init() {
        loadFromDisk()
    }

    // MARK: - Save (local + server)

    func save(_ image: UIImage, wallet: String, serverURL: String) {
        let cropped = cropToSquare(image)
        let resized = resize(cropped, to: CGSize(width: 512, height: 512))
        avatarImage = resized

        // Save locally
        if let url = avatarURL, let data = resized.jpegData(compressionQuality: 0.85) {
            try? data.write(to: url, options: .atomic)
        }

        // Upload to server
        Task {
            await uploadToServer(wallet: wallet, serverURL: serverURL)
        }
    }

    func clear(wallet: String, serverURL: String) {
        avatarImage = nil
        if let url = avatarURL { try? fileManager.removeItem(at: url) }

        Task {
            await deleteFromServer(wallet: wallet, serverURL: serverURL)
        }
    }

    var hasAvatar: Bool { avatarImage != nil }

    // MARK: - Sync from server

    func syncFromServer(wallet: String, serverURL: String) async {
        // Try to download avatar from server
        guard let url = URL(string: "\(serverURL)/api/me/avatar?address=\(wallet)") else { return }
        guard let (data, response) = try? await URLSession.shared.data(from: url) else { return }
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else { return }
        guard let image = UIImage(data: data) else { return }

        avatarImage = image
        // Cache locally
        if let fileURL = avatarURL {
            try? data.write(to: fileURL, options: .atomic)
        }

        // Also fetch profile metadata
        await fetchProfile(wallet: wallet, serverURL: serverURL)
    }

    func fetchProfile(wallet: String, serverURL: String) async {
        guard let url = URL(string: "\(serverURL)/api/me/profile?address=\(wallet)") else { return }
        guard let (data, response) = try? await URLSession.shared.data(from: url) else { return }
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        displayName = json["display_name"] as? String
        bio = json["bio"] as? String
    }

    func updateProfile(wallet: String, serverURL: String, displayName: String?, bio: String?) async {
        self.displayName = displayName
        self.bio = bio

        guard let url = URL(string: "\(serverURL)/api/me/profile") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any?] = [
            "wallet": wallet,
            "displayName": displayName,
            "bio": bio,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })
        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: - Server Upload

    private func uploadToServer(wallet: String, serverURL: String) async {
        guard let image = avatarImage,
              let jpegData = image.jpegData(compressionQuality: 0.85),
              let url = URL(string: "\(serverURL)/api/me/avatar")
        else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Wallet field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"wallet\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(wallet)\r\n".data(using: .utf8)!)

        // Avatar file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpegData)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        _ = try? await URLSession.shared.data(for: request)
    }

    private func deleteFromServer(wallet: String, serverURL: String) async {
        guard let url = URL(string: "\(serverURL)/api/me/avatar") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["wallet": wallet])
        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: - Local Cache

    private func loadFromDisk() {
        guard let url = avatarURL,
              fileManager.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url),
              let image = UIImage(data: data)
        else { return }
        avatarImage = image
    }

    // MARK: - Image Processing

    private func cropToSquare(_ image: UIImage) -> UIImage {
        let cgImage = image.cgImage!
        let side = min(cgImage.width, cgImage.height)
        let x = (cgImage.width - side) / 2
        let y = (cgImage.height - side) / 2
        let rect = CGRect(x: x, y: y, width: side, height: side)
        let cropped = cgImage.cropping(to: rect)!
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    private func resize(_ image: UIImage, to size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
