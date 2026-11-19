# Documentation index

| Document | Contents |
|----------|----------|
| [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md) | Components, functional/non-functional requirements, workflows, gaps/risks, decisions log |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Architecture diagrams, component responsibilities, frontend/backend structure, IoT flows, security, env vars, deployment |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | Firestore collections, ID strategy, fields/types, indexes, rules, multi-potter/device management |
| [API_DESIGN.md](API_DESIGN.md) | REST endpoints, device protocol, error contract, order state machine, rate limits |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | The 10 phases with deliverables, tests, risks and exit criteria |
| [FIREBASE_SETUP.md](FIREBASE_SETUP.md) | Step-by-step: create/connect your Firebase project, credentials, rules/indexes, emulators, troubleshooting |
| [DATABASE_IMPLEMENTATION.md](DATABASE_IMPLEMENTATION.md) | How the database layer is implemented (IDs, validation, consistency rules, indexes, tests, known limitations) |
| [ADMIN_AUTH.md](ADMIN_AUTH.md) | Admin sign-in and role enforcement, creating the first admin securely, hardening checklist, what is tested |
| [POTTER_DEVICE_MANAGEMENT.md](POTTER_DEVICE_MANAGEMENT.md) | Registering potters, registering/assigning devices, credential provisioning and revocation workflows, statuses, tests, limitations |
| [CUSTOMER_MARKETPLACE.md](CUSTOMER_MARKETPLACE.md) | The storefront: running it, features, design decisions (stock reservation, one order per product), tests, limitations |
| [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) | Pre-approval audit: PASS/WARNING/FAIL per check, defects fixed, residual risks |

Source requirements: `cloudcamp.pdf`. Status: **architecture approved; Phases 1–4 complete; Phase 5 (customer marketplace) implemented, awaiting review.**
