# Al3nany ERP - Project Specification & Architectural Guidelines

## 1. System Overview
Al3nany ERP is a high-integrity, transactional ERP system built using Firebase/Firestore, emphasizing double-entry bookkeeping, strict auditability, atomicity, and professional accounting standards.

## 2. Core Architectural Standards
- **Transaction Injection (Orchestrator Pattern):** Used for atomic operations across modules (Inventory, Cashbox, Suppliers).
- **Consistency Rules:** 
  - Strict Idempotency using `referenceId`/`sourceLineId`/`transferId`.
  - 4-decimal precision for Weighted Average Cost (WAC).
  - "Read-Before-Write" logic within Firestore transactions to prevent race conditions.
- **Financial Logic:** 
  - Cashbox balances are fast-access caches; `cashbox_transactions` (Ledger) is the absolute Source of Truth.
  - Debits and Credits are treated as positive values in the ledger, distinguished by `type: 'in'` or `type: 'out'`.
- **Performance:** UI uses local-first state (Zustand stores) with in-memory filtering/caching for search functionality to ensure sub-millisecond latency.

## 3. UI / UX Standards & Rules

### Chronological Records Display Rule
- **Display Order:** All chronological transaction/activity records in Al3nany ERP must display records from **oldest at the top to newest at the bottom** (Chronological Order). Reverse chronological ordering (newest at the top) is strictly prohibited for time-accumulated ledgers.
- **Auto-Scroll Behavior:** When opening a page with a long transaction ledger, the view should automatically scroll to the newest record located at the bottom, allowing users to scroll upwards to review older history.
- **Scope:** This rule applies consistently to current modules (e.g., Cashbox Ledger) and all future chronological activity modules. It does *not* apply to alphabetical lists, product search results, dropdowns, or non-time-series lists.
