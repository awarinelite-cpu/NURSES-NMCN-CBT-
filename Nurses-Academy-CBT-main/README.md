# 📚 NMCN CBT Platform

> Nigeria's smartest nursing exam preparation platform — built with React + Firebase + Render.

---

## 🗂️ Project Structure

```
nmcn-cbt/
├── public/
│   ├── index.html              # HTML shell + PWA meta tags
│   ├── manifest.json           # PWA manifest (icons, theme, shortcuts)
│   └── service-worker.js       # Offline caching + push notifications
│
├── src/
│   ├── App.jsx                 # Root router — all routes defined here
│   ├── index.jsx               # React entry point
│   │
│   ├── firebase/
│   │   └── config.js           # ⚠️ PUT YOUR FIREBASE CREDENTIALS HERE
│   │
│   ├── context/
│   │   ├── AuthContext.jsx     # Login, register, logout, profile state
│   │   └── ThemeContext.jsx    # Dark/light mode toggle
│   │
│   ├── data/
│   │   ├── categories.js       # All 17 nursing categories, plans, bank details
│   │   └── sampleQuestions.js  # Demo questions for testing
│   │
│   ├── utils/
│   │   └── questionParser.js   # Auto-parser for bulk-pasted questions
│   │
│   ├── styles/
│   │   └── global.css          # Full design system (dark mode, animations)
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthPage.jsx            # Login / Register / Forgot Password
│   │   │
│   │   ├── shared/
│   │   │   ├── AppLayout.jsx           # Navbar + Sidebar wrapper
│   │   │   ├── Navbar.jsx              # Top bar with user menu + theme toggle
│   │   │   ├── Sidebar.jsx             # Navigation sidebar (student & admin)
│   │   │   ├── Toast.jsx               # Global toast notification system
│   │   │   ├── ProtectedRoute.jsx      # Route guards (auth, admin)
│   │   │   └── LandingPage.jsx         # Public marketing landing page
│   │   │
│   │   ├── exam/
│   │   │   ├── ExamSetup.jsx           # Category + type + year + settings picker
│   │   │   └── ExamSession.jsx         # Live exam with timer, AI explain, review
│   │   │
│   │   ├── student/
│   │   │   ├── StudentDashboard.jsx    # Home: stats, quick actions, categories
│   │   │   ├── AnalyticsPage.jsx       # Performance charts, weak areas, history
│   │   │   ├── BookmarksPage.jsx       # Saved questions with answers
│   │   │   └── SubscriptionPage.jsx    # Plan picker + bank transfer + access code
│   │   │
│   │   └── admin/
│   │       ├── AdminDashboard.jsx      # Overview: stats, quick actions, recent
│   │       ├── QuestionsManager.jsx    # Add single / bulk paste / list / delete
│   │       ├── UsersManager.jsx        # View users, grant plans, make admin
│   │       ├── PaymentsManager.jsx     # Confirm/reject receipt uploads
│   │       ├── AccessCodesManager.jsx  # Generate & manage access codes
│   │       └── AnnouncementsManager.jsx # Publish & pin announcements
│
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Composite index definitions
├── firebase.json               # Firebase hosting + rules config
├── render.yaml                 # Render.com deployment config
└── package.json
```

---

## ⚡ Quick Start

### 1. Install dependencies
```bash
cd nmcn-cbt
npm install
```

### 2. Set up Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Email/Password
4. Enable **Firestore Database** (start in test mode, then deploy rules)
5. Copy your config from Project Settings → General → Your Apps
6. Paste into `src/firebase/config.js`:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

### 3. Deploy Firestore rules & indexes
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore
```

### 4. Create your admin account
1. Run the app: `npm start`
2. Register with your email at `/auth`
3. In Firestore Console → users → find your document → set `role: "admin"`

### 5. Seed sample questions (optional)
In Firebase Console → Firestore → questions collection, use the structure from `src/data/sampleQuestions.js`.
Or use the Admin Panel → Questions Manager → Add Single / Bulk Upload.

---

## 🚀 Deployment

### Option A: Render.com (recommended)
1. Push project to GitHub
2. Go to [render.com](https://render.com) → New → Static Site
3. Connect your repo
4. Build command: `npm install && npm run build`
5. Publish directory: `build`
6. Add environment variables (optional — currently using hardcoded config)
7. Done — Render handles HTTPS and CDN automatically

### Option B: Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

---

## 🏥 Features

| Feature | Description |
|---------|-------------|
| **17 Nursing Categories** | General + all Post-Basic specialties |
| **Past Questions 2020–2025** | Filterable by year, category, type |
| **Exam Types** | NMCN Past, Hospital Finals, Mock, Daily Practice, Topic Drill |
| **Timed Simulation** | Configurable timer with auto-submit |
| **AI Explanations** | Claude AI explains every answer on demand |
| **Smart Question Parser** | Auto-parses bulk-pasted questions (A/B/C/D format) |
| **Performance Analytics** | Score trends, weak areas, pass rates |
| **Bookmarks** | Save questions for later review |
| **Admin Panel** | Full CRUD on questions, users, payments, codes |
| **Manual Payments** | Bank transfer receipt upload → admin confirm |
| **Access Codes** | Generate one-time codes for manual access |
| **Dark Mode** | Full dark/light theme toggle |
| **PWA** | Offline-capable, installable on mobile |
| **Push Notifications** | FCM-based real-time alerts |

---

## 💳 Subscription Plans

| Plan | Price | Duration | Features |
|------|-------|----------|----------|
| Free | ₦0 | Forever | 10 questions/day, 1 category |
| Basic | ₦2,500 | 30 days | Unlimited, 3 categories |
| Standard ⭐ | ₦5,000 | 90 days | All categories + AI + analytics |
| Premium | ₦8,000 | 6 months | Everything + hospital finals |

**Update bank details** in `src/data/categories.js` → `BANK_DETAILS` object.

---

## 🔐 Security Rules

Firestore rules enforce:
- Students can only read/write their own data
- Only admins can write questions, access all users/payments
- Access codes can only be read by the assigned user or admin

Deploy rules: `firebase deploy --only firestore:rules`

---

## 🎨 Customisation

### Brand colors (in `src/styles/global.css`):
```css
--teal:      #0D9488;  /* Primary */
--blue-deep: #1E3A8A;  /* Secondary */
--gold:      #F59E0B;  /* Accent */
```

### Add new categories:
Edit `src/data/categories.js` → `NURSING_CATEGORIES` array.

### Update bank details:
Edit `src/data/categories.js` → `BANK_DETAILS` object.

---

## 📱 PWA Icons
Add icons to `public/icons/` folder:
- icon-72.png, icon-96.png, icon-128.png, icon-144.png
- icon-152.png, icon-192.png, icon-384.png, icon-512.png

Use any online PWA icon generator — start with a 512×512 PNG of your logo.

---

## 🤖 AI Explanations
The exam session calls the Anthropic Claude API directly from the browser.
The API key is injected automatically by the Claude.ai environment when running inside artifacts.

For production deployment, set up a backend proxy to protect your API key:
```
POST /api/explain
Body: { question, options, correctIndex, explanation }
Response: { text: "AI explanation..." }
```

---

## 📞 Support
Built for NMCN nursing students in Nigeria.
Admin: set `role: "admin"` in Firestore to access the admin panel.
