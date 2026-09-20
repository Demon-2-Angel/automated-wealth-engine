# 🚀 Automated Wealth Engine: Serverless Mutual Fund SIP Ingestion Pipeline

[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=flat&logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![Telegram Bot API](https://img.shields.io/badge/Telegram%20Bot-2CA5E0?style=flat&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An event-driven, zero-maintenance financial data pipeline running serverless on Google Apps Script. It ingests Mutual Fund unit allotment confirmations from fintech platforms (Groww / BSE StAR MF), parses transaction parameters using deterministic regular expressions, dynamically binds live mathematical formulas into an auditable Google Sheets ledger, and pushes real-time milestone telemetry to Telegram and email.

---

## 🏗 System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        INGESTION & EVENT TRIGGER                       │
│                                                                        │
│   Groww / AMC Allotment Notice (T+2 / T+3 settlement)                  │
│             │                                                          │
│             ▼                                                          │
│   [ Transactional Gmail Inbox ]                                        │
│             │                                                          │
│             ▼ Rule Filter: "Mutual Funds/Groww SIPs" (is:unread)       │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                │ Daily Cron Trigger (18:00 - 19:00 IST)
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       COMPUTE ENGINE (APPS SCRIPT)                     │
│                                                                        │
│   1. GmailApp.search() -> Batch retrieve unread threads                │
│   2. In-Memory Hash Cache -> Read Col A & I into composite Set:        │
│          Key: `${Date}|${FundName}|${RoundedAmount}`                   │
│   3. Deterministic Regex Extraction:                                   │
│          ├── Scheme Name                                               │
│          ├── SIP Amount                                                │
│          ├── Units Allotted                                            │
│          └── NAV (Buy Price)                                           │
│   4. Idempotency Gatekeeper:                                           │
│          IF key in Set -> Mark read & skip insertion                   │
│          ELSE -> Process & write to ledger                             │
│   5. Variance Classifier:                                              │
│          |Amount - Target_SIP| < ₹100 ? "SIP" : "Lumpsum"              │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                │ SpreadsheetApp.openById(TARGET_SHEET_ID)
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA WAREHOUSE (GOOGLE SHEETS)                  │
│                                                                        │
│   Tab: "Transactions"                                                  │
│   ├── Col A–I: Date, Type, Scheme, Category, Platform, AMFI, NAV,      │
│   │            Units, Amount                                           │
│   ├── Col J: =SUMIFS($H$2:H{n}, $C$2:C{n}, C{n})   [Cumulative Units]  │
│   ├── Col K: =VLOOKUP(F{n}, NAVTable!$A:$E, 5, 0)  [Live AMFI NAV]     │
│   ├── Col L: =H{n} * K{n}                          [Current Value]     │
│   ├── Col M: =TODAY() - A{n}                       [Holding Days]      │
│   └── Col N: =L{n} - I{n}                          [Unrealized Gain]   │
│                                                                        │
│   Tab: "Investment_Summary"                                            │
│   └── Category allocations, total capital deployed, portfolio XIRR     │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                │ Telemetry Payloads
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     TELEMETRY & ALERT DISTRIBUTION                     │
│                                                                        │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐   │
│   │ Telegram Bot API            │    │ Gmail SMTP Dispatch         │   │
│   │ • Real-time allotment push  │    │ • High-fidelity HTML digest │   │
│   │ • Fund breakdown summary    │    │ • Streak & milestone stats  │   │
│   │ • Total deployed milestone  │    │ • Compounding mindset card  │   │
│   └─────────────────────────────┘    └─────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
