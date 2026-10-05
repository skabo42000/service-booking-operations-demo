# Security and data handling

## Scope

This repository is a portfolio / demonstration project. Public files and Git history were scanned with Gitleaks 8.30.1, and runtime dependency versions were checked against npm / PyPI vulnerability databases during the October 4, 2026 release. These checks find known patterns and advisories; they are not a penetration test or a guarantee that the application is secure.

Keep secrets in private environment variables or a secret manager. `.env.example` is a blank template. Do not commit populated workflow exports, databases, uploads, customer records, transcripts, recordings or provider keys. A public frontend variable is visible to every visitor.

## Reporting

Report a suspected issue privately through the contact channel at [synqlogic.com](https://synqlogic.com). Include the repository, affected component and a minimal synthetic reproduction. Do not put credentials or personal data in a public GitHub issue. Rotate any exposed live secret immediately; removing it from a file does not invalidate it or erase history.

## Automated controls

The security workflow scans Git history on pushes / pull requests with fully redacted output. Workflow permissions are read-only, official checkout is pinned to a commit, and the scanner archive is verified by SHA-256 before execution. Dependency update checks are configured weekly. Review and test updates before merging them.

## Project-specific boundaries

- Full npm audit reports the high-severity [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through the **development-only** ESLint / fast-glob chain (five affected package entries, one advisory). As of this release, braces 3.0.3 is the latest published version and has no patch for this issue. Production-only npm audit is clean. Keep lint glob patterns under developer control, avoid untrusted nested patterns, and update when upstream publishes a fix. The production audit is narrower than a full dependency audit.

- Use synthetic records only. The shared staff key and selectable demo identities are not individual staff authentication. Roles demonstrate authorization logic after demo sign-in; they must not protect real business data without verified identities.
- Displayed email codes are disabled by default. `DEMO_SHOW_LOGIN_CODE=on` is an explicit synthetic-demo mode that provides no email ownership verification. Email delivery is not implemented.
- Sessions and challenges use hashed storage, expiration / attempt limits and HttpOnly / SameSite cookies. State / PKCE and claim checks protect the optional Google flow. Production identity integration still needs end-to-end review.
- Mutating routes enforce Origin checks, and production human checks fail closed when configuration is missing. `BOT_CHECK=off` is an explicit demo bypass; never use it for real bookings. IP limits need a trusted proxy.
- Local SQLite and daily-reset options are demo infrastructure. Configure backups, access boundaries, audit / retention policy and durable storage before production.
- Payment records do not charge cards or capture deposits. Do not collect payment credentials in this app.
- AI questions and confirmed facts can reach your configured model provider. The AI guide cannot independently create bookings; do not treat its text as a tool result. Python API keys stay internal.
- The public copy upgrades Next.js to 16.3.8. The original private source / deployed demonstration is separate and must be upgraded independently.
