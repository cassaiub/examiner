// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 1 — Replace with YOUR Firebase project config      ║
// ║  Firebase Console → Project Settings → Your apps         ║
// ╚══════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "AIzaSyA0CgD5YX4yQLvD06cNTLxQz6c713CoZOE",
  authDomain: "cassaquiz.firebaseapp.com",
  projectId: "cassaquiz",
  storageBucket: "cassaquiz.firebasestorage.app",
  messagingSenderId: "618377087169",
  appId: "1:618377087169:web:ec2d67506b76a41a2aac40"
};

// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 2 — Set your teacher / admin email(s)              ║
// ╚══════════════════════════════════════════════════════════╝
const TEACHER_EMAILS = [
  "kasad@iub.edu.bd",
  "uddinsa@iub.edu.bd"
  // Add more teacher emails here 
];

// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 3 — Default quiz settings (editable in Admin)      ║
// ╚══════════════════════════════════════════════════════════╝
const APP_CONFIG = {
  quizDurationMinutes: 10,
  questionsPerQuiz: 15,
  appName: "Examiner",
  institutionName: "Your Institution"
};

// ─── Initialize Firebase ────────────────────────────────────
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// Enable offline persistence (helps on mobile)
db.enablePersistence({ synchronizeTabs: true }).catch(() => { });

// ─── Utility: check if current user is teacher ─────────────
function isTeacher(email) {
  return TEACHER_EMAILS.map(e => e.toLowerCase()).includes((email || '').toLowerCase());
}

// ─── Utility: auth state guard ──────────────────────────────
function requireAuth(redirectTo = 'index.html') {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = redirectTo;
      } else {
        resolve(user);
      }
    });
  });
}

// ─── Toast notification helper ──────────────────────────────
function showToast(message, type = 'default', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', default: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Confirm dialog helper ───────────────────────────────────
function confirmDialog(message) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-box" style="max-width:380px">
        <div class="modal-body" style="text-align:center;padding:2rem">
          <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
          <p style="color:var(--text);font-weight:600;margin-bottom:2rem">${message}</p>
          <div style="display:flex;gap:0.75rem;justify-content:center">
            <button class="btn btn-outline" id="confirm-no">Cancel</button>
            <button class="btn btn-danger" id="confirm-yes">Confirm</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#confirm-yes').onclick = () => { backdrop.remove(); resolve(true); };
    backdrop.querySelector('#confirm-no').onclick = () => { backdrop.remove(); resolve(false); };
  });
}

// ─── Format seconds → mm:ss ─────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Format date ─────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
