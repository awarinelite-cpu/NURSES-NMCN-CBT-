# Free Trial Gate — Integration Guide

## What was built

| File | Action |
|------|--------|
| `ProtectedRoute.jsx` | Added `FreeTrialRoute` export (replaces `SubscribedRoute` on exam routes) |
| `useFreeTrialGate.js` | New hook — checks/marks per-mode trial in Firestore, enforces 10Q cap |

---

## Step 1 — App.jsx: swap SubscribedRoute → FreeTrialRoute on exam routes

In `App.jsx`, add `FreeTrialRoute` to the import:

```js
// BEFORE
import { ProtectedRoute, SubscribedRoute, AdminRoute, GuestRoute } from './components/shared/ProtectedRoute';

// AFTER
import { ProtectedRoute, SubscribedRoute, FreeTrialRoute, AdminRoute, GuestRoute } from './components/shared/ProtectedRoute';
```

Then change the six exam-mode entry-point routes from `SubscribedRoute` to `FreeTrialRoute`.
Keep `/exam/session` and `/exam/review` as `SubscribedRoute` (those are the actual session screens —
the gate fires BEFORE navigate, so a free user who still has a trial will have already called
markTrialUsed and their session starts normally; a used-up free user never reaches navigate).

```jsx
{/* CHANGE these six to FreeTrialRoute */}
<Route path="/daily-practice" element={<FreeTrialRoute><DailyPracticePage /></FreeTrialRoute>} />
<Route path="/daily-reviews"  element={<FreeTrialRoute><DailyPracticePage /></FreeTrialRoute>} />
<Route path="/course-drill"   element={<FreeTrialRoute><CourseDrillPage /></FreeTrialRoute>} />
<Route path="/topic-drill"    element={<FreeTrialRoute><TopicDrillPage /></FreeTrialRoute>} />
<Route path="/mock-exams"     element={<FreeTrialRoute><MockExamPage /></FreeTrialRoute>} />
<Route path="/past-questions" element={<FreeTrialRoute><PastQuestionsPage /></FreeTrialRoute>} />
<Route path="/quick-actions"  element={<FreeTrialRoute><QuickActionsPage /></FreeTrialRoute>} />
<Route path="/exams"          element={<FreeTrialRoute><ExamSetup /></FreeTrialRoute>} />
<Route path="/exam/list"      element={<FreeTrialRoute><ExamListPage /></FreeTrialRoute>} />
<Route path="/exam/setup"     element={<FreeTrialRoute><ExamSetupPage /></FreeTrialRoute>} />
<Route path="/exam/categories" element={<FreeTrialRoute><CategoryPickerPage /></FreeTrialRoute>} />
<Route path="/exam/config"    element={<FreeTrialRoute><ExamConfigPage /></FreeTrialRoute>} />

{/* KEEP these as SubscribedRoute — free trial users reach here only if trial is still valid */}
<Route path="/exam/session" element={<SubscribedRoute><ExamSession /></SubscribedRoute>} />
<Route path="/exam/review"  element={<SubscribedRoute><ExamReviewPage /></SubscribedRoute>} />
```

> **Note:** `/exam/session` stays `SubscribedRoute`. This means free trial users would be
> blocked at the session screen. To allow free trial users into the session, change
> `/exam/session` to `FreeTrialRoute` as well and rely entirely on the markTrialUsed
> gate inside each page's handleTakeNew. See Step 3 note.

---

## Step 2 — Add the hook to each exam page

The pattern is identical for every exam page. Shown here using CourseDrillPage as the example.

### 2a. Import the hook

```js
import { useFreeTrialGate, FREE_TRIAL_COUNT } from '../../hooks/useFreeTrialGate';
```

### 2b. Call the hook at the top of the component

```js
const {
  isSubscribed,
  trialUsed,
  trialAvailable,
  checkingTrial,
  markTrialUsed,
} = useFreeTrialGate('course_drill');   // ← use the correct key per page (see table below)
```

### 2c. Exam mode keys per page

| Page file            | examMode key      |
|----------------------|-------------------|
| CourseDrillPage.jsx  | `'course_drill'`  |
| TopicDrillPage.jsx   | `'topic_drill'`   |
| MockExamPage.jsx     | `'mock_exam'`     |
| DailyPracticePage.jsx| `'daily_practice'`|
| PastQuestionsPage.jsx| `'past_questions'`|
| QuickActionsPage.jsx | `'quick_actions'` |
| ExamSetupPage.jsx    | `'exam_setup'`    |

### 2d. Update handleTakeNew (cap questions + mark trial)

```js
// BEFORE (example from CourseDrillPage)
const handleTakeNew = () => {
  navigate('/exam/session', {
    state: {
      poolMode:  true,
      examType:  'course_drill',
      examName:  `${selCourse.label} — Course Drill`,
      category:  specialty.id,
      course:    selCourse.id,
      count:     finalCount,
      doShuffle: true,
      timeLimit: 0,
    },
  });
};

// AFTER
const handleTakeNew = async () => {
  if (!isSubscribed && trialUsed) return; // already locked — button should be hidden, but guard anyway

  const count = isSubscribed ? finalCount : FREE_TRIAL_COUNT; // cap at 10 for free trial

  if (!isSubscribed) {
    await markTrialUsed(); // persist to Firestore before leaving
  }

  navigate('/exam/session', {
    state: {
      poolMode:    true,
      examType:    'course_drill',
      examName:    `${selCourse.label} — Course Drill`,
      category:    specialty.id,
      course:      selCourse.id,
      courseLabel: selCourse.label,
      count,
      doShuffle:   true,
      timeLimit:   0,
    },
  });
};
```

### 2e. Show a locked banner when trial is used up

Add this JSX block just above the "Take New Exam" card (or wherever the start button lives).
It renders only for unsubscribed users whose trial is already consumed.

```jsx
{/* Free trial used-up banner */}
{!isSubscribed && trialUsed && (
  <div style={{
    background: 'rgba(239,68,68,0.08)',
    border: '1.5px solid rgba(239,68,68,0.35)',
    borderRadius: 14,
    padding: '18px 20px',
    marginBottom: 24,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
  }}>
    <span style={{ fontSize: 28, flexShrink: 0 }}>🔒</span>
    <div>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#EF4444', marginBottom: 4 }}>
        Free Trial Used
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        You've already used your free 10-question trial for this mode.
        Subscribe to unlock unlimited access to all exam modes.
      </div>
      <button
        className="btn btn-primary"
        onClick={() => navigate('/subscription')}
        style={{ marginTop: 14, padding: '10px 24px', fontWeight: 800, borderRadius: 10 }}
      >
        ⭐ Subscribe to Unlock
      </button>
    </div>
  </div>
)}

{/* Free trial available banner — shown once before they start */}
{!isSubscribed && !trialUsed && (
  <div style={{
    background: 'rgba(13,148,136,0.07)',
    border: '1.5px solid rgba(13,148,136,0.3)',
    borderRadius: 14,
    padding: '14px 18px',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  }}>
    <span style={{ fontSize: 22, flexShrink: 0 }}>🎁</span>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
      <span style={{ fontWeight: 700, color: 'var(--teal)' }}>Free Trial — </span>
      You get <strong>10 free questions</strong> in this mode. This is a one-time trial.{' '}
      <span
        style={{ color: 'var(--teal)', fontWeight: 700, cursor: 'pointer' }}
        onClick={() => navigate('/subscription')}
      >
        Subscribe
      </span>{' '}
      for unlimited access.
    </div>
  </div>
)}
```

### 2f. Disable / hide the Start Exam button for locked users

```jsx
<button
  className="btn btn-primary"
  onClick={handleTakeNew}
  disabled={(!isSubscribed && trialUsed) || (useCustom && !customCount)}
  style={{
    width: '100%', padding: '14px', fontSize: 15, fontWeight: 800, borderRadius: 12,
    opacity: (!isSubscribed && trialUsed) ? 0.4 : 1,
    cursor: (!isSubscribed && trialUsed) ? 'not-allowed' : 'pointer',
  }}
>
  {isSubscribed
    ? `🚀 Start Exam — ${finalCount} Questions`
    : trialUsed
      ? '🔒 Trial Used — Subscribe to Continue'
      : `🎁 Start Free Trial — ${FREE_TRIAL_COUNT} Questions`}
</button>
```

---

## Step 3 — Allow /exam/session for free trial users

Since free trial users now navigate to `/exam/session`, change that route in App.jsx:

```jsx
{/* Allow logged-in users (subscribed OR free-trial) into the session */}
<Route path="/exam/session" element={<FreeTrialRoute><ExamSession /></FreeTrialRoute>} />
<Route path="/exam/review"  element={<FreeTrialRoute><ExamReviewPage /></FreeTrialRoute>} />
```

The 10-question cap is already encoded in the `count` passed via navigate state,
so ExamSession itself needs no changes.

---

## Step 4 — Firestore: no schema migration needed

The hook writes to `users/{uid}.freeTrialUsed` using dot-notation `updateDoc` with merge,
so it only adds the new field and never touches existing user data.

No Firestore rules change is needed if your rules already allow authenticated users to
write their own user document:
```
match /users/{userId} {
  allow write: if request.auth.uid == userId;
}
```

---

## Summary of changes per file

| File | Changes |
|------|---------|
| `ProtectedRoute.jsx` | + `FreeTrialRoute` export |
| `useFreeTrialGate.js` | New hook (place in `src/hooks/`) |
| `App.jsx` | Import `FreeTrialRoute`; swap 10 exam routes; keep `/exam/session` + `/exam/review` as `FreeTrialRoute` |
| `CourseDrillPage.jsx` | Import hook; update `handleTakeNew`; add banners; update button |
| `TopicDrillPage.jsx` | Same pattern, key `'topic_drill'` |
| `MockExamPage.jsx` | Same pattern, key `'mock_exam'` |
| `DailyPracticePage.jsx` | Same pattern, key `'daily_practice'` |
| `PastQuestionsPage.jsx` | Same pattern, key `'past_questions'` |
| `QuickActionsPage.jsx` | Same pattern, key `'quick_actions'` |
| `ExamSetupPage.jsx` | Same pattern, key `'exam_setup'` |
