/**
 * EXAMINER — Firebase Cloud Functions
 * 
 * Functions:
 *  - assignQuiz       : Randomly pick questions, create a session for a student
 *  - gradeQuiz        : Grade a session and save results
 *  - autoGradeExpired : Scheduled — runs every minute to auto-grade timed-out sessions
 */

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// ─── Helper: Fisher-Yates shuffle ────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Helper: grade a session (shared logic) ──────────────────
async function gradeSession(session, sessionId) {
  const now       = admin.firestore.Timestamp.now();
  const startMs   = session.startTime.toMillis();
  const durationMs = session.durationMinutes * 60 * 1000;
  const elapsed   = now.toMillis() - startMs;
  const timeExpired = elapsed > (durationMs + 30000); // 30s grace

  // Fetch all question docs in parallel
  const qDocs = await Promise.all(
    session.questionIds.map(id => db.collection('questions').doc(id).get())
  );

  let totalPoints  = 0;
  let earnedPoints = 0;
  const breakdown  = [];

  for (const qDoc of qDocs) {
    if (!qDoc.exists) continue;
    const q      = qDoc.data();
    const points = q.points || 1;
    totalPoints += points;

    const studentAnswer = session.answers?.[qDoc.id];
    const correct       = studentAnswer !== undefined && studentAnswer === q.correctIndex;
    if (correct) earnedPoints += points;

    breakdown.push({
      questionId:    qDoc.id,
      questionText:  q.text,
      studentAnswer: studentAnswer ?? null,
      correctAnswer: q.correctIndex,
      correct,
      points,
    });
  }

  const score      = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const timeTaken  = Math.min(elapsed, durationMs);
  const correctCnt = breakdown.filter(b => b.correct).length;

  const result = {
    sessionId,
    studentEmail:      session.studentEmail,
    studentName:       session.studentName || session.studentEmail,
    studentUid:        session.studentUid,
    score,
    earnedPoints,
    totalPoints,
    timeTakenSeconds:  Math.round(timeTaken / 1000),
    submittedAt:       now,
    timeExpired,
    breakdown,
    totalQuestions:    session.questionIds.length,
    correctCount:      correctCnt,
  };

  // Write result + mark session submitted atomically
  const batch = db.batch();
  batch.set(db.collection('results').doc(sessionId), result);
  batch.update(db.collection('quizSessions').doc(sessionId), {
    submitted:   true,
    submittedAt: now,
    score,
  });
  await batch.commit();

  return result;
}

// ══════════════════════════════════════════════════════════════
//  1. assignQuiz — called when student opens quiz.html
// ══════════════════════════════════════════════════════════════
exports.assignQuiz = functions.https.onCall(async (data, context) => {
  // ── Auth check ────────────────────────────────────────────
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const uid   = context.auth.uid;
  const email = (context.auth.token.email || '').toLowerCase();

  // ── Allowlist check ───────────────────────────────────────
  const allowedDoc = await db.collection('allowedEmails').doc(email).get();
  if (!allowedDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Your email is not on the approved list. Contact your teacher.');
  }
  const studentName = allowedDoc.data().name || email;

  // ── Check for existing active session ────────────────────
  const existingSnap = await db.collection('quizSessions')
    .where('studentUid', '==', uid)
    .where('submitted', '==', false)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existingDoc  = existingSnap.docs[0];
    const existingData = existingDoc.data();

    // Check if it's expired but not yet graded
    const now      = Date.now();
    const startMs  = existingData.startTime.toMillis();
    const durMs    = existingData.durationMinutes * 60 * 1000;
    if (now > startMs + durMs + 30000) {
      // Auto-grade expired session
      const result = await gradeSession(existingData, existingDoc.id);
      return {
        sessionId:  existingDoc.id,
        submitted:  true,
        score:      result.score,
        breakdown:  result.breakdown,
        earnedPoints:   result.earnedPoints,
        totalPoints:    result.totalPoints,
        timeTakenSeconds: result.timeTakenSeconds,
        totalQuestions: result.totalQuestions,
        correctCount:   result.correctCount,
        timeExpired:    result.timeExpired,
      };
    }

    // Return existing live session (student refreshed the page)
    return {
      sessionId:        existingDoc.id,
      questions:        existingData.clientQuestions,
      startTime:        existingData.startTime.toMillis(),
      durationMinutes:  existingData.durationMinutes,
      answers:          existingData.answers || {},
      submitted:        false,
    };
  }

  // ── Check for already submitted session today ─────────────
  const submittedSnap = await db.collection('quizSessions')
    .where('studentUid', '==', uid)
    .where('submitted', '==', true)
    .orderBy('submittedAt', 'desc')
    .limit(1)
    .get();

  if (!submittedSnap.empty) {
    const sd = submittedSnap.docs[0];
    const resultDoc = await db.collection('results').doc(sd.id).get();
    if (resultDoc.exists) {
      const r = resultDoc.data();
      return {
        sessionId:        sd.id,
        submitted:        true,
        score:            r.score,
        breakdown:        r.breakdown,
        earnedPoints:     r.earnedPoints,
        totalPoints:      r.totalPoints,
        timeTakenSeconds: r.timeTakenSeconds,
        totalQuestions:   r.totalQuestions,
        correctCount:     r.correctCount,
        timeExpired:      r.timeExpired,
      };
    }
  }

  // ── Fetch quiz config ─────────────────────────────────────
  const configDoc = await db.collection('config').doc('quiz').get();
  const config    = configDoc.exists ? configDoc.data() : {};
  const numQ      = Math.max(1, config.numQuestions    || 15);
  const durationM = Math.max(1, config.durationMinutes || 10);

  // ── Fetch question bank ───────────────────────────────────
  const questionsSnap = await db.collection('questions').get();
  const allQuestions  = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (allQuestions.length === 0) {
    throw new functions.https.HttpsError('failed-precondition', 'The question bank is empty. Ask your teacher to add questions.');
  }
  if (allQuestions.length < numQ) {
    functions.logger.warn(`Only ${allQuestions.length} questions available, wanted ${numQ}. Using all.`);
  }

  // ── Randomize and select ──────────────────────────────────
  const selected = shuffle(allQuestions).slice(0, Math.min(numQ, allQuestions.length));

  // Shuffle options within each question (optional but recommended)
  const questionIds    = selected.map(q => q.id);
  // clientQuestions NEVER include correctIndex — that stays server-side
  const clientQuestions = selected.map(q => ({
    id:      q.id,
    text:    q.text,
    options: q.options,
    points:  q.points || 1,
  }));

  // ── Create session ────────────────────────────────────────
  const sessionRef  = db.collection('quizSessions').doc();
  const startTime   = admin.firestore.Timestamp.now();

  await sessionRef.set({
    studentEmail:     email,
    studentUid:       uid,
    studentName,
    questionIds,
    clientQuestions,
    answers:          {},
    startTime,
    durationMinutes:  durationM,
    submitted:        false,
    createdAt:        startTime,
  });

  functions.logger.info(`Quiz assigned to ${email}: session ${sessionRef.id}, ${selected.length} questions`);

  return {
    sessionId:       sessionRef.id,
    questions:       clientQuestions,
    startTime:       startTime.toMillis(),
    durationMinutes: durationM,
    answers:         {},
    submitted:       false,
  };
});

// ══════════════════════════════════════════════════════════════
//  2. gradeQuiz — called on submit (or auto-called on expiry)
// ══════════════════════════════════════════════════════════════
exports.gradeQuiz = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { sessionId } = data;
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const email      = (context.auth.token.email || '').toLowerCase();
  const sessionRef = db.collection('quizSessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found.');
  }

  const session = sessionDoc.data();

  // Verify ownership
  if (session.studentEmail !== email) {
    throw new functions.https.HttpsError('permission-denied', 'This is not your session.');
  }

  // Already graded — return existing result
  if (session.submitted) {
    const resultDoc = await db.collection('results').doc(sessionId).get();
    if (resultDoc.exists) {
      const r = resultDoc.data();
      return {
        score:            r.score,
        earnedPoints:     r.earnedPoints,
        totalPoints:      r.totalPoints,
        timeTakenSeconds: r.timeTakenSeconds,
        correctCount:     r.correctCount,
        totalQuestions:   r.totalQuestions,
        timeExpired:      r.timeExpired,
        breakdown:        r.breakdown,
      };
    }
  }

  // Grade it now
  const result = await gradeSession(session, sessionId);
  functions.logger.info(`Quiz graded: ${email} scored ${result.score}% (session ${sessionId})`);

  return {
    score:            result.score,
    earnedPoints:     result.earnedPoints,
    totalPoints:      result.totalPoints,
    timeTakenSeconds: result.timeTakenSeconds,
    correctCount:     result.correctCount,
    totalQuestions:   result.totalQuestions,
    timeExpired:      result.timeExpired,
    breakdown:        result.breakdown,
  };
});

// ══════════════════════════════════════════════════════════════
//  3. autoGradeExpired — scheduled every minute
//     Auto-grades sessions where the timer has expired
// ══════════════════════════════════════════════════════════════
exports.autoGradeExpired = functions
  .runWith({ timeoutSeconds: 300, memory: '256MB' })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const now  = admin.firestore.Timestamp.now();
    const snap = await db.collection('quizSessions')
      .where('submitted', '==', false)
      .get();

    let graded = 0;
    for (const doc of snap.docs) {
      const session  = doc.data();
      const startMs  = session.startTime.toMillis();
      const durMs    = session.durationMinutes * 60 * 1000;
      const elapsed  = now.toMillis() - startMs;

      // Grace period: 60 seconds after timer ends
      if (elapsed > durMs + 60000) {
        try {
          await gradeSession(session, doc.id);
          graded++;
          functions.logger.info(`Auto-graded expired session ${doc.id} for ${session.studentEmail}`);
        } catch (e) {
          functions.logger.error(`Failed to auto-grade ${doc.id}:`, e.message);
        }
      }
    }

    if (graded > 0) {
      functions.logger.info(`Auto-graded ${graded} expired sessions.`);
    }
    return null;
  });
