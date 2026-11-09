# MONTRA STRATEGY — Phase 1

Minimal local frontend for an independent Montra ecosystem launchpad.

## Included
- Responsive homepage and minimal visual system
- Token Studio form (name, symbol, description, website, X/Twitter)
- Local-only project preview
- Elysium network information
- Explicitly disabled wallet connection and token deployment

## Not included yet
- Wallet connection
- Montra Registry reads
- LaunchFactory calls
- Metadata upload to Montra
- Builder attribution / ERC-8021
- Any transaction signing or sending

These are intentionally deferred to later phases. No launch transaction can be submitted from this Phase 1 project.

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Run locally (Windows PowerShell or Git Bash)

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually http://localhost:5173.

## Build check

```bash
npm run build
```

## Verified Montra network facts
- Network: Elysium
- Chain ID: 99901
- Gas token: HYPE
- Registry: `0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7`

The factory address and ABI must be read from the official registry / current Montra documentation in Phase 2. Do not guess or hard-code them.

## Safety boundary
The Deploy button is disabled in the UI. Do not enable transaction submission until the official ABI, registry reads, active launch configuration, metadata flow, builder attribution requirements, simulation and user approval have all been verified.

## Official documentation
- https://montramarkets.xyz/docs
- https://montramarkets.xyz/docs/launching
- https://montramarkets.xyz/docs/build
- https://montramarkets.xyz/docs/contracts
- https://montramarkets.xyz/docs/builders
