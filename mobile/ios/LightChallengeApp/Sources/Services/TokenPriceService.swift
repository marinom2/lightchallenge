// TokenPriceService.swift
// Fetches live LCAI/USD price from CoinGecko → GeckoTerminal → Uniswap.
// Token: 0x9ca8530ca349c966fe9ef903df17a75b8a778927 (Ethereum)

import Foundation

actor TokenPriceService {
    static let shared = TokenPriceService()

    private let tokenAddress = "0x9ca8530ca349c966fe9ef903df17a75b8a778927"
    private let cacheDuration: TimeInterval = 60 // 1 minute

    private var cachedPrice: Double?
    private var cacheTimestamp: Date?

    /// Current USD price per token. Returns cached value if fresh enough.
    func getUSDPrice() async -> Double? {
        if let cached = cachedPrice, let ts = cacheTimestamp, Date().timeIntervalSince(ts) < cacheDuration {
            return cached
        }

        // Try sources in priority order
        if let price = await fetchFromCoinGecko() {
            cachedPrice = price
            cacheTimestamp = Date()
            return price
        }

        if let price = await fetchFromGeckoTerminal() {
            cachedPrice = price
            cacheTimestamp = Date()
            return price
        }

        if let price = await fetchFromUniswap() {
            cachedPrice = price
            cacheTimestamp = Date()
            return price
        }

        return cachedPrice // Return stale cache if all sources fail
    }

    // MARK: - CoinGecko (primary)

    private func fetchFromCoinGecko() async -> Double? {
        let urlString = "https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=\(tokenAddress)&vs_currencies=usd"
        guard let url = URL(string: urlString) else { return nil }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }

            // Response: { "0x...": { "usd": 0.123 } }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let tokenData = json[tokenAddress] as? [String: Any],
               let price = tokenData["usd"] as? Double {
                return price
            }
        } catch {
            // Fall through to next source
        }

        return nil
    }

    // MARK: - GeckoTerminal (fallback 1)

    private func fetchFromGeckoTerminal() async -> Double? {
        let urlString = "https://api.geckoterminal.com/api/v2/simple/networks/eth/token_price/\(tokenAddress)"
        guard let url = URL(string: urlString) else { return nil }

        do {
            var request = URLRequest(url: url)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.timeoutInterval = 10

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }

            // Response: { "data": { "attributes": { "token_prices": { "0x...": "0.123" } } } }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let dataObj = json["data"] as? [String: Any],
               let attrs = dataObj["attributes"] as? [String: Any],
               let prices = attrs["token_prices"] as? [String: String],
               let priceStr = prices[tokenAddress],
               let price = Double(priceStr) {
                return price
            }
        } catch {
            // Fall through
        }

        return nil
    }

    // MARK: - Uniswap (fallback 2)

    private func fetchFromUniswap() async -> Double? {
        // Use Uniswap V3 subgraph to get token price in ETH, then convert
        let subgraphURL = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3"
        guard let url = URL(string: subgraphURL) else { return nil }

        let query = """
        {
          token(id: "\(tokenAddress)") {
            derivedETH
          }
          bundle(id: "1") {
            ethPriceUSD
          }
        }
        """

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 10

            let body: [String: Any] = ["query": query]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }

            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let dataObj = json["data"] as? [String: Any],
               let token = dataObj["token"] as? [String: Any],
               let bundle = dataObj["bundle"] as? [String: Any],
               let derivedETH = Double(token["derivedETH"] as? String ?? ""),
               let ethPriceUSD = Double(bundle["ethPriceUSD"] as? String ?? "") {
                return derivedETH * ethPriceUSD
            }
        } catch {
            // Fall through
        }

        return nil
    }
}

// MARK: - LCFormatter USD Extension

extension LCFormatter {
    /// Format a USDC value with appropriate precision.
    private static func fmtUSDC(_ usd: Double) -> String {
        if usd >= 1000 {
            return String(format: "%.0f USDC", usd)
        } else if usd >= 1 {
            return String(format: "%.2f USDC", usd)
        } else if usd >= 0.01 {
            return String(format: "%.3f USDC", usd)
        } else {
            return String(format: "%.4f USDC", usd)
        }
    }

    /// Format a wei amount as USDC using the live token price.
    /// Falls back to LCAI display if price is unavailable.
    static func formatUSD(wei: Double, tokenPrice: Double?) -> String {
        let lcai = wei / 1e18
        guard let price = tokenPrice, price > 0 else {
            return format(wei: wei)
        }
        return fmtUSDC(lcai * price)
    }

    /// Format a wei string as USDC.
    static func formatUSD(weiString: String, tokenPrice: Double?) -> String {
        guard let amount = Double(weiString), amount > 0 else { return "0 USDC" }
        return formatUSD(wei: amount, tokenPrice: tokenPrice)
    }

    /// Format LCAI amount (not wei) as USDC.
    static func formatLCAIasUSD(lcai: Double, tokenPrice: Double?) -> String {
        guard let price = tokenPrice, price > 0 else {
            if lcai >= 1000 {
                return String(format: "%.0f LCAI", lcai)
            }
            return String(format: "%.2f LCAI", lcai)
        }
        return fmtUSDC(lcai * price)
    }
}
