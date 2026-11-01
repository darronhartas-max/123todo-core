# 123 To Do (Community Core Edition)

> **A fast, privacy-first, open-source Progressive Web App (PWA) for tasks, projects, and voice notes.**  
> Built with React, client-side AES-256-GCM zero-knowledge encryption, and local-first architecture.  
> Official hosted version: [app.123todo.com](https://app.123todo.com) | [123todo.com](https://www.123todo.com)

---

## 🌟 Philosophy: Open-Core & Verifiable Privacy

123 To Do is built on an **Open-Core** model. We believe users, developers, and security auditors should never have to take a company's privacy claims on blind faith.

Every line of our **core security architecture, client-side cryptographic engine, and local-first storage algorithms** is fully open-source and auditable in this repository.

### What is the Community Core?
This repository is the full, standalone, open-source foundation of 123 To Do. It contains:
- The entire React PWA interface (Task Manager Mode + Simple Voice Notes Mode).
- Complete client-side **AES-256-GCM encryption & decryption** (`src/utils/crypto.js`).
- Complete **24-hour automated shadow backup system** and local restore workflows.
- Full offline-first support with background service workers.
- The **1-2-3 Priority Method** (Must Do, Should Do, Could Do, On Hold).
- Drag-and-drop auto-wrapping checklist subtasks.
- Voice dictation via Web Speech API with spoken punctuation recognition.
- 1-click competitor migration tools for Todoist, TickTick, Google Keep, Google Tasks, and Microsoft To Do.
- Standard quotas: 2 photos per note, 7 custom projects, 7 subtasks per task, 90-day archive search indexing, and polite cloud sync.

---

## 🔍 Security & Privacy Audit Guide (For Critics & Researchers)

We invite privacy advocates, researchers, and critics to inspect and verify our core privacy commitments:

### 1. Client-Side AES-256-GCM Encryption
- **File to inspect**: [`src/utils/crypto.js`](src/utils/crypto.js)
- **Test suite**: [`src/utils/crypto.test.js`](src/utils/crypto.test.js)
- **Verification**: Encryption keys are derived client-side via PBKDF2 (100,000 iterations of SHA-256 with a unique salt) using the user's secret passphrase. All payloads are encrypted into AES-GCM ciphertexts with dynamic IVs **before** touching any network socket or cloud storage. Neither Cloudflare nor Google Drive ever receives plain text.

### 2. Zero Cookies & Zero Third-Party Trackers
- **Verification**: Search the entire codebase for `document.cookie`, `gtag`, `facebook`, `segment`, or third-party tracking scripts.
- **Result**: Exactly zero. 123 To Do uses zero tracking cookies, zero cross-site trackers, and zero external analytics SDKs.

### 3. Local-First & Anonymous Telemetry
- **File to inspect**: [`src/utils/telemetry.js`](src/utils/telemetry.js)
- **Verification**: Telemetry records only coarse local counters (e.g. daily tasks completed, PWA install count) stored client-side in `localStorage`. No IP addresses, user identifiers, or location data are ever transmitted.

---

## 🚀 Getting Started (Run Locally)

### Prerequisites
- Node.js (v18, v20, or v22 recommended)
- npm (v9+)

### Installation
```bash
# Clone the repository
git clone https://github.com/darronhartas-max/123todo-core.git
cd 123todo-core

# Install dependencies
npm install

# Start local development server
npm start
```
The app will open automatically at [http://localhost:3000](http://localhost:3000).

### Running Tests
We maintain 100% pass rates across our full unit and integration test suites:
```bash
npm test -- --watchAll=false
```

### Building for Production
```bash
npm run build
```
Creates an optimized production bundle in the `build/` directory ready for any static web host or Docker container.

---

## 🏗️ Architecture & Tech Stack

- **Framework**: React 19 / Create React App
- **Styling**: Pure CSS Variables & Responsive Flexbox/Grid (zero heavyweight CSS frameworks)
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Cryptography**: W3C Web Cryptography API (`crypto.subtle`)
- **PWA & Offline**: Workbox Service Worker, LocalStorage, IndexedDB for photo attachments
- **Testing**: Jest & React Testing Library (55+ test suites, 460+ tests)

---

## 📄 License

This Community Core edition is licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 Unforgettable Management Ltd / Darron Hartas.
