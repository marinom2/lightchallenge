# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main (testnet) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in LightChallenge, please report it responsibly.

### Process

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email security concerns to the maintainers (see CODEOWNERS or repository contacts).
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### Scope

The following components are in scope:
- Smart contracts (`contracts/`)
- API routes (`webapp/app/api/`)
- Off-chain workers and indexers (`offchain/`)
- Authentication and authorization logic (`webapp/lib/auth.ts`)
- Treasury and fund management logic

### Out of Scope

- Third-party dependencies (report upstream)
- Lightchain AIVM contracts (report to Lightchain)
- Frontend-only cosmetic issues

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity

## Security Architecture

### Smart Contracts
- All user funds held in Treasury (ChallengePay holds zero balance)
- Pull-based claims via Treasury allowances (unstoppable by design)
- Fee configuration validated to prevent arithmetic underflow
- 2-step admin transfer on ChallengePay and EventChallengeRouter
- Dispatcher access control on `submitProofFor` / `submitProofForBatch`
- Verifier immutability after participants join a challenge
- Cancel blocked after winners are recorded
- Minimum stake enforcement

### API Security
- Wallet-signature authentication on state-mutating endpoints
- Admin endpoints fail-closed (no dev-mode bypass)
- Relay rate limiting (20 req/min per IP)
- RPC proxy restricted to read-only methods
- Error responses sanitized (no internal details leaked)
- Request parameter caps to prevent resource exhaustion

### Data Security
- OAuth tokens encrypted at rest (AES-256-GCM)
- SSL/TLS enforced on all database connections in production
- Evidence size limits enforced
- PII redacted in API responses

### Off-chain Pipeline
- Reorg-safe block processing with configurable confirmation depth
- Idempotent event processing
- Verdict-gated AIVM dispatch (only passing verdicts trigger jobs)

## Audit Status

A comprehensive internal security audit was performed covering:
- Smart contract security (fee math, access control, reentrancy, treasury safety)
- API authentication and authorization
- Database consistency and injection prevention
- Off-chain pipeline safety

The protocol has not yet undergone a formal third-party audit. This is planned before mainnet deployment.

## Known Limitations

1. **Auth model**: Lightweight wallet-signature verification (not full SIWE sessions). Adequate for current stage; SIWE planned for production.
2. **Reorg recovery**: 12-block confirmation buffer protects against standard reorgs. Deep reorgs (>12 blocks) require manual reconciliation.
3. **Rounding dust**: Integer division in fee splits and per-winner bonus may leave small amounts (< participantsCount wei) in Treasury buckets. Recoverable via sweep.
4. **TrustedForwarder**: Deployed but dormant (no targets allowed). Retained for future gasless transaction support.
