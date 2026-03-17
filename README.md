# 📋 Examiner — Online Quiz System

A secure, real-time quiz system for classrooms. Students get randomized questions, a server-enforced timer, and instant auto-graded results. Teachers get a live dashboard with analytics.

**Live site:** https://cassaiub.github.io/examiner/

---

## ✅ Features

| Feature | How it works |
|---|---|
| Email allowlist | Only pre-approved emails can sign in |
| Randomized questions | Each student gets a different random subset |
| Server-enforced timer | Timer is anchored to server timestamp — can't be paused or cheated |
| No going back | Each answer is locked on move to next question |
| Auto-grading | Score calculated server-side; answer keys never reach the browser |
| Teacher dashboard | Live stats, score charts, CSV export, per-student breakdown |
| Admin panel | Add/edit questions, manage student emails, import CSV |
| Mobile-friendly | Fully responsive design |

---

## 🚀 Deployment Guide

### STEP 1 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it (e.g. "examiner")
3. Disable Google Analytics (optional) → **Create project**

### STEP 2 — Enable Firebase Services

In your Firebase project console:

**Authentication:**
1. Build → Authentication → **Get Started**
2. Enable **Email/Password**
3. Enable **Google** (for Google sign-in)
4. Under **Settings → Authorized domains**, add `cassaiub.github.io`

**Firestore Database:**
1. Build → Firestore Database → **Create database**
2. Choose **Production mode** → Select a region (e.g. `us-central1`) → **Enable**

**Cloud Functions:**
1. Build → Functions → **Get started**
2. This requires a **Blaze (pay-as-you-go)** plan — upgrade if needed
3. The free tier includes 2M function calls/month (more than enough for a class)

### STEP 3 — Get Your Firebase Config

1. Firebase Console → ⚙️ Project Settings → **Your apps**
2. Click **</>** (Web app) → Register app
3. Copy the config object (the part with apiKey, authDomain, etc.)

### STEP 4 — Update js/config.js

Open `js/config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← Your values here
  authDomain:        "myproject.firebaseapp.com",
  projectId:         "myproject",
  storageBucket:     "myproject.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};

const TEACHER_EMAILS = [
  "yourname@gmail.com"    // ← Your teacher email
];
```

### STEP 5 — Update firestore.rules

Open `firestore.rules` and replace `teacher@example.com` with your actual teacher email:

```
function isTeacher() {
  return isAuthed() && (
    email() == "yourname@gmail.com"   // ← Your email
  );
}
```

### STEP 6 — Update .firebaserc

Open `.firebaserc` and replace `YOUR_PROJECT_ID`:

```json
{
  "projects": {
    "default": "myproject"   ← Your Firebase project ID
  }
}
```

### STEP 7 — Deploy Firebase Functions & Rules

Install Firebase CLI and deploy:

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Go to your project folder
cd examiner

# Install function dependencies
cd functions && npm install && cd ..

# Deploy Firestore rules + indexes + Cloud Functions
firebase deploy --only firestore,functions
```

You should see:
```
✔  functions[assignQuiz]: Successful deploy
✔  functions[gradeQuiz]:  Successful deploy
✔  functions[autoGradeExpired]: Successful deploy
✔  firestore: Released rules
```

### STEP 8 — Push frontend to GitHub Pages

```bash
# In your examiner repo
git add .
git commit -m "Initial Examiner deployment"
git push origin main
```

GitHub Pages will serve `index.html` automatically at https://cassaiub.github.io/examiner/

### STEP 9 — Add Your Teacher Account

1. Go to https://cassaiub.github.io/examiner/
2. Click **Create Account**
3. Sign up with your teacher email (the one in `TEACHER_EMAILS`)
4. You'll be redirected to the **Dashboard**

### STEP 10 — Add Questions & Students

1. From the Dashboard, click **⚙ Admin**
2. **Quiz Settings** → Set duration and number of questions
3. **Question Bank** → Add questions manually or import via CSV
4. **Allowed Students** → Add student emails or import CSV

---

## 📁 Project Structure

```
examiner/
├── index.html          ← Login / signup page
├── quiz.html           ← Student quiz interface
├── dashboard.html      ← Teacher analytics dashboard
├── admin.html          ← Admin panel (questions, emails, settings)
├── css/
│   └── style.css       ← Shared design system
├── js/
│   └── config.js       ← Firebase config (YOU FILL THIS IN)
├── functions/
│   ├── index.js        ← Cloud Functions (assignQuiz, gradeQuiz)
│   └── package.json
├── firestore.rules     ← Database security rules
├── firestore.indexes.json
├── firebase.json       ← Firebase project config
└── .firebaserc         ← Project ID (YOU FILL THIS IN)
```

---

## 📊 CSV Import Formats

### Questions CSV
```csv
question,option_a,option_b,option_c,option_d,correct_index,points
"What is 2+2?","1","2","4","8",2,1
"Capital of France?","London","Paris","Berlin","Rome",1,1
```
`correct_index`: 0=A, 1=B, 2=C, 3=D

### Students CSV
```csv
name,email
"Alice Ahmed","alice@example.com"
"Bob Rahman","bob@example.com"
```

---

## 🔒 Security Model

| Action | Who can do it |
|---|---|
| Read questions | Cloud Functions only (Admin SDK) |
| Create quiz sessions | Cloud Functions only |
| Update answer in session | The session owner only |
| Submit/grade quiz | Cloud Functions only |
| Read results | Teacher or the student who took it |
| Write results | Cloud Functions only |
| Manage questions & emails | Teacher only |

---

## 🛠 Common Issues

**"Permission denied" error on login**
→ Make sure the student's email is in the Allowed Students list in the Admin panel.

**"Question bank is empty" error**
→ Add questions in the Admin panel first.

**Functions not deploying**
→ Ensure you're on the Blaze plan in Firebase Console.

**Google sign-in not working**
→ Add `cassaiub.github.io` to Firebase Console → Authentication → Settings → Authorized domains.

**Timer is out of sync**
→ The timer is server-anchored. A page refresh will show the correct remaining time.

---

## 💰 Cost Estimate (Firebase)

For a class of 100 students taking one quiz:

| Service | Usage | Cost |
|---|---|---|
| Auth | 100 sign-ins | Free (always) |
| Firestore reads | ~2,000 | Free (50K/day free tier) |
| Firestore writes | ~600 | Free (20K/day free tier) |
| Cloud Functions | ~200 invocations | Free (2M/month free tier) |
| **Total** | | **$0** |

---

## 📄 License

MIT — Free to use and modify for educational purposes.
