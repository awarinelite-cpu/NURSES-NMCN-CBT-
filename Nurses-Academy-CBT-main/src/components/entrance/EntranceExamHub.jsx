// src/components/entrance/EntranceExamHub.jsx
// Route: /entrance-exam
//
// Fonts  : h1/h2 titles → Arial Black | all other text → Times New Roman Bold
// Colors : CSS variables throughout → works in light AND dark mode
// Routes : all feature cards verified against App.jsx routes

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  limit, deleteDoc, doc, getDoc, Timestamp,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { ensureEntranceDailyMockNotification, todayKey, maybePushEntranceDailyMockNotification } from '../../utils/dailyNotifications';
import StreakMilestoneModal, { MILESTONES } from '../shared/StreakMilestoneModal';
import { fetchBadges, evaluateBadges, syncBadges, BADGE_MAP } from '../../utils/badgeUtils';
import { fetchStreak } from '../../utils/streakUtils';
import EntranceDailyChallenge from './EntranceDailyChallenge';
import EntranceTipOfDay from './EntranceTipOfDay';
import StreakReminderBanner from '../shared/StreakReminderBanner';
const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── Animated wrapper ──────────────────────────────────────────────────────── */
function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity .5s ease, transform .5s ease', ...s,
    }}>
      {children}
    </div>
  );
}

/* ── Animated counter ──────────────────────────────────────────────────────── */
function useCounter(target, duration = 1400, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const to = setTimeout(() => {
      let n = 0; const step = target / (duration / 16);
      const t = setInterval(() => {
        n += step;
        if (n >= target) { setVal(target); clearInterval(t); } else setVal(Math.floor(n));
      }, 16);
      return () => clearInterval(t);
    }, delay);
    return () => clearTimeout(to);
  }, [target, duration, delay]);
  return val;
}

/* ── Feature Card ──────────────────────────────────────────────────────────── */
function FeatureCard({ icon, label, sub, color, to, delay }) {
  const [hov, setHov] = useState(false);
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '20px 16px',
        background: hov ? `${color}12` : 'var(--bg-card)',
        border: `2px solid ${hov ? color + '66' : 'var(--border)'}`,
        borderRadius: 16, textDecoration: 'none', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        opacity: vis ? 1 : 0,
        transform: vis ? (hov ? 'translateY(-3px)' : 'translateY(0)') : 'translateY(14px)',
        boxShadow: hov ? `0 6px 24px ${color}22` : 'var(--shadow-sm)',
        transition: 'opacity .45s ease, transform .3s ease, background .2s, border-color .2s, box-shadow .2s',
        fontFamily: F,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: '4px 0 0 4px' }} />
      <div style={{ paddingLeft: 10 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', fontFamily: F, marginBottom: 4, lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
          {sub}
        </div>
      </div>
      <div style={{
        position: 'absolute', right: 14, bottom: 14,
        color, fontWeight: 900, fontSize: 20,
        opacity: hov ? 1 : 0.3, transition: 'opacity .2s',
      }}>→</div>
    </Link>
  );
}

/* ── Paused Exams Modal ─────────────────────────────────────────────────────── */
function PausedModal({ exams, onContinue, onDiscard, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: 24, maxWidth: 480, width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>▶</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', fontFamily: H }}>Continue an Exam</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>
                {exams.length} paused exam{exams.length !== 1 ? 's' : ''} waiting
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 10, width: 34, height: 34, cursor: 'pointer',
            color: 'var(--text-primary)', fontSize: 20, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {exams.map(exam => {
            const pct  = exam.answeredCount && exam.totalQuestions
              ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
            const date = exam.savedAt?.toDate
              ? exam.savedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
              : 'Recently';
            const time = exam.savedAt?.toDate
              ? exam.savedAt.toDate().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <div key={exam.id} style={{ background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📋</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F, marginBottom: 2 }}>{exam.examName || 'Entrance Exam'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>Q{(exam.currentIndex || 0) + 1} of {exam.totalQuestions || '?'} · {exam.answeredCount || 0} answered</div>
                  </div>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>🕐 Saved {date}{time ? ` · ${time}` : ''}</span>
                  <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, fontFamily: F }}>{pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onContinue(exam)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--teal)', color: '#fff', fontFamily: F, fontWeight: 800, fontSize: 14 }}>▶ Resume</button>
                  <button onClick={() => onDiscard(exam)} style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', fontFamily: F, fontWeight: 700, fontSize: 13 }}>🗑 Discard</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Weak Subjects Detector (entrance-specific) ─────────────────────────────── */
function useWeakSubjects(user) {
  const [weakSubjects, setWeakSubjects] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid)));
        if (cancelled) return;
        const sessions = snap.docs.map(d => d.data());
        setSessionCount(sessions.length);
        if (sessions.length < 5) { setLoading(false); return; }
        const subjectMap = {};
        sessions.forEach(s => {
          const key = s.subject || s.examType || '';
          if (!key) return;
          if (!subjectMap[key]) subjectMap[key] = { subject: key, total: 0, sumScore: 0 };
          subjectMap[key].total += 1;
          subjectMap[key].sumScore += (s.scorePercent || 0);
        });
        const results = Object.values(subjectMap)
          .filter(s => s.total >= 2)
          .map(s => ({ ...s, avg: Math.round(s.sumScore / s.total) }))
          .filter(s => s.avg < 60).sort((a, b) => a.avg - b.avg).slice(0, 3);
        setWeakSubjects(results);
      } catch (e) { console.warn('EntranceWeakSubjects (non-fatal):', e.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);
  return { weakSubjects, sessionCount, loading };
}

function WeakSubjectsPanel({ user }) {
  const { weakSubjects, sessionCount, loading } = useWeakSubjects(user);
  const [dismissed,  setDismissed]  = useState(false);
  const [drilling,   setDrilling]   = useState(false);
  const [drillError, setDrillError] = useState('');
  const navigate = useNavigate();

  if (loading || dismissed || sessionCount < 5 || weakSubjects.length === 0) return null;

  const scoreColor = avg => avg >= 50
    ? { text: '#F59E0B', bg: 'rgba(245,158,11,0.12)', bar: '#F59E0B' }
    : { text: '#EF4444', bg: 'rgba(239,68,68,0.12)', bar: '#EF4444' };

  // Fetch questions from ALL weak subjects, spread evenly, shuffle, take 10.
  // Passes pre-loaded questionIds via resumeData so EntranceSubjectSession
  // skips its own single-subject fetch.
  const handleMixedDrill = async () => {
    setDrilling(true);
    setDrillError('');
    try {
      const perSubject = Math.ceil(10 / weakSubjects.length);
      // Fetch questions and mastery data in parallel
      const fetches = weakSubjects.map(s =>
        getDocs(query(collection(db, 'entranceExamQuestions'), where('subject', '==', s.subject)))
      );
      const snaps = await Promise.all(fetches);

      // Read mastered IDs per subject from profile (already in context)
      const masteredMap = profile?.entranceSubjectMastered || {};

      let pool = [];
      snaps.forEach((snap, idx) => {
        const subjectKey = (weakSubjects[idx].subject || '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        const masteredIds = masteredMap[subjectKey] || [];
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Exclude correctly-answered questions; if all mastered reset that subject
        const unmastered = docs.filter(d => !masteredIds.includes(d.id));
        const eligible   = unmastered.length > 0 ? unmastered : docs; // reset if bank exhausted
        const shuffled   = eligible.sort(() => Math.random() - 0.5);
        pool.push(...shuffled.slice(0, perSubject));
      });
      pool = pool.sort(() => Math.random() - 0.5).slice(0, 10);

      if (pool.length === 0) {
        setDrillError('No questions found for your weak subjects yet.');
        setDrilling(false);
        return;
      }

      const subjectNames = weakSubjects.map(s => s.subject).join(', ');
      navigate('/entrance-exam/subject-session', {
        state: {
          subject: { id: 'mixed_weak', name: 'Mixed Weak Subjects', icon: '🎯', color: '#EF4444', questionCount: pool.length },
          year:         'All Years',
          count:        pool.length,
          timeLimitMin: 15,
          doShuffle:    false,
          resumeMode:   true,
          pausedExamId: null,
          resumeData: {
            questionIds:  pool.map(q => q.id),
            answers:      {},
            flagged:      {},
            currentIndex: 0,
            timeLeft:     15 * 60,
            _preloaded:   pool,
          },
          _mixedLabel: 'Weak drill: ' + subjectNames,
        },
      });
    } catch (e) {
      setDrillError('Failed to load questions. Please try again.');
      console.error('Mixed drill error:', e);
      setDrilling(false);
    }
  };

  return (
    <ACard delay={780} style={{ marginBottom: 28 }}>
      <div style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: '18px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>Weak Subjects Detected</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Based on your last {sessionCount} sessions — drill these to improve fast</div>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {weakSubjects.map((s, idx) => {
            const { text, bg, bar } = scoreColor(s.avg);
            return (
              <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: text, fontFamily: H }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.subject.replace(/_/g, ' ')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: bar, width: Math.max(s.avg, 4) + '%', transition: 'width 1s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: text, minWidth: 32 }}>{s.avg}%</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({s.total} attempt{s.total !== 1 ? 's' : ''})</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {drillError && (
          <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, fontFamily: F, marginBottom: 10 }}>
            Warning: {drillError}
          </div>
        )}

        <button
          onClick={handleMixedDrill}
          disabled={drilling}
          style={{
            width: '100%', padding: '13px 18px', borderRadius: 12, border: 'none',
            background: drilling ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.85)',
            color: '#fff', cursor: drilling ? 'not-allowed' : 'pointer',
            fontFamily: H, fontWeight: 900, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'background .2s',
          }}
          onMouseEnter={e => { if (!drilling) e.currentTarget.style.background = '#EF4444'; }}
          onMouseLeave={e => { if (!drilling) e.currentTarget.style.background = 'rgba(239,68,68,0.85)'; }}
        >
          {drilling
            ? 'Loading questions...'
            : 'Drill 10 Mixed Questions — ' + weakSubjects.map(s => s.subject.split(' ')[0]).join(' + ')}
        </button>

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: F }}>
          Questions are drawn from all {weakSubjects.length} weak subjects and shuffled together.
        </div>
      </div>
    </ACard>
  );
}

/* ── Surprise Me Button (entrance version) ──────────────────────────────────── */
function SurpriseMeButton({ user }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600); }, 4000);
    return () => clearInterval(t);
  }, []);
  const handleSurprise = async () => {
    setIsLoading(true);
    try {
      let pickedSubject = null;
      if (user?.uid) {
        try {
          const snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid)));
          const sessions = snap.docs.map(d => d.data()).filter(s => s.scorePercent !== undefined);
          if (sessions.length >= 3) {
            const subjectMap = {};
            sessions.forEach(s => {
              const key = s.subject || s.examType || '';
              if (!key) return;
              if (!subjectMap[key]) subjectMap[key] = { total: 0, sum: 0 };
              subjectMap[key].total++; subjectMap[key].sum += s.scorePercent;
            });
            const weakOnes = Object.entries(subjectMap)
              .map(([id, v]) => ({ id, avg: Math.round(v.sum / v.total) }))
              .filter(c => c.avg < 65).sort((a, b) => a.avg - b.avg);
            if (weakOnes.length > 0) pickedSubject = weakOnes[0].id;
          }
        } catch { /* fall through */ }
      }
      navigate('/entrance-exam/subject-session', {
        state: {
          subject:      { id: pickedSubject, name: pickedSubject, icon: '🎲', color: '#7C3AED', questionCount: 999 },
          year:         'All Years',
          count:        10,
          timeLimitMin: 15,
          doShuffle:    true,
        },
      });
    } catch (e) { console.error('Surprise Me error:', e); }
    finally { setIsLoading(false); }
  };
  return (
    <button onClick={handleSurprise} disabled={isLoading} style={{
      width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
      background: 'linear-gradient(135deg, #7C3AED 0%, #0D9488 100%)',
      color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
      boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
      transform: pulse ? 'scale(1.02)' : 'scale(1)',
      transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
      opacity: isLoading ? 0.7 : 1,
    }}>
      <span style={{ fontSize: 28 }}>{isLoading ? '⏳' : '🎲'}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: H }}>{isLoading ? 'Finding questions…' : 'Surprise Me!'}</div>
        <div style={{ fontSize: 12, opacity: 0.85, fontFamily: F, fontWeight: 700 }}>Jumps to your weakest subject drill • No setup needed</div>
      </div>
      {!isLoading && <span style={{ marginLeft: 'auto', fontSize: 20, opacity: 0.7 }}>→</span>}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
export default function EntranceExamHub() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stats,           setStats]           = useState({ schools: 0, questions: 0 });
  const [completedExams,  setCompletedExams]  = useState([]);
  const [pausedExams,     setPausedExams]     = useState([]);
  const [avgScore,        setAvgScore]        = useState(0);
  const [bannerVis,       setBannerVis]       = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [loadError,       setLoadError]       = useState('');
  const [showPausedModal, setShowPausedModal] = useState(false);
  const [mockReady,       setMockReady]       = useState(false);  // today's daily mock published?
  const [todayMockDone,   setTodayMockDone]   = useState(false);  // user already did today's mock?
  const [earnedBadges,    setEarnedBadges]    = useState([]);
  const [streakReminderData, setStreakReminderData] = useState(null);
  const [streakMilestone, setStreakMilestone] = useState(0);
  const streakCheckedRef = useRef(false);

  const animSchools   = useCounter(stats.schools,   1200, 300);
  const animQuestions = useCounter(stats.questions, 1400, 400);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // Read school docs (already needed for count) — each doc has a cached
      // `questionCount` field updated whenever questions are added/deleted.
      // This avoids getCountFromServer which exhausts Firebase quota fast.
      const schoolSnap = await getDocs(collection(db, 'entranceExamSchools'));
      const schoolCount = schoolSnap.size;
      const questionCount = schoolSnap.docs.reduce((sum, d) => sum + (d.data().questionCount || 0), 0);
      setStats({ schools: schoolCount, questions: questionCount });
    } catch (e) {
      console.error('Stats load error:', e.code, e.message);
      setLoadError(`Stats failed (${e.code || e.message})`);
    }

    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid), orderBy('completedAt', 'desc'), limit(20)));
      } catch {
        snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid), limit(20)));
      }
      let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sessions.sort((a, b) => {
        const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      const avg = sessions.length ? Math.round(sessions.reduce((s, a) => s + (a.scorePercent || 0), 0) / sessions.length) : 0;
      setCompletedExams(sessions.slice(0, 5));
      setAvgScore(avg);
    } catch (e) {
      console.error('Sessions load error:', e.code, e.message);
      setLoadError(`Could not load your exams (${e.code || e.message})`);
    }

    try {
      const pausedSnap = await getDocs(query(collection(db, 'entrancePausedExams'), where('userId', '==', user.uid)));
      const paused = pausedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      paused.sort((a, b) => {
        const ta = a.savedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.savedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      setPausedExams(paused);
    } catch (e) { console.error('Paused exams load error:', e.code, e.message); }

    // If today's Daily Mock has been published, make sure the
    // "new mock available" notification exists (idempotent)
    // Also detect if the user already completed today's mock.
    try {
      const key = todayKey();
      const todaySnap = await getDoc(doc(db, 'dailyMockSchedule', key));
      const ready = todaySnap.exists();
      setMockReady(ready);
      if (ready) { ensureEntranceDailyMockNotification(key); maybePushEntranceDailyMockNotification(); }

      // Check if the user already did today's mock (completedAt >= today midnight)
      if (user && ready) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        try {
          const doneSnap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('userId',   '==', user.uid),
            where('examType', '==', 'entrance_daily_mock'),
            where('completedAt', '>=', Timestamp.fromDate(todayStart)),
            limit(1),
          ));
          setTodayMockDone(!doneSnap.empty);
        } catch {
          // Composite index may not exist — fall back to checking loaded sessions
          const todayStr = key;
          const done = completedExams.some(s =>
            s.examType === 'entrance_daily_mock' &&
            s.completedAt?.toDate?.()?.toISOString?.()?.slice(0, 10) === todayStr
          );
          setTodayMockDone(done);
        }
      }
    } catch (e) { console.error('Daily mock check error:', e.code, e.message); }

    // ── Load badges & streak data (non-blocking) ──────────────────────────
    try {
      const allSessSnap = await getDocs(query(
        collection(db, 'entranceExamSessions'),
        where('userId', '==', user.uid),
      ));
      const allSessions = allSessSnap.docs.map(d => d.data());
      const streakData  = await fetchStreak(user.uid);
      setStreakReminderData(streakData);
      const earned = evaluateBadges({ sessions: allSessions, streakData, bookmarkCount: profile?.bookmarkCount || 0 });
      await syncBadges(user.uid, earned);
      setEarnedBadges(earned);
    } catch (e) { console.warn('Badge/streak load failed (non-fatal):', e.message); }

    setLoading(false);
  }, [user]); // useCallback dep — re-creates only when user changes


  useEffect(() => {
    setTimeout(() => setBannerVis(true), 60);
    if (!user) { setLoading(false); return; }
    load();
  }, [user, authLoading, load]);

  // ── Streak milestone detection (uses separate localStorage key to avoid
  //    collision with NMCN CBT milestone tracking) ───────────────────────────
  const streak = profile?.streak || 0;
  useEffect(() => {
    if (streakCheckedRef.current || !streak) return;
    streakCheckedRef.current = true;
    if (!MILESTONES[streak]) return;
    const key = `entrance_streak_milestone_${streak}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const t = setTimeout(() => setStreakMilestone(streak), 800);
    return () => clearTimeout(t);
  }, [streak]);

  const handleContinue = (exam) => {
    setShowPausedModal(false);
    navigate('/entrance-exam/session', {
      state: {
        resumeMode: true, pausedExamId: exam.id,
        examType: exam.examType || 'entrance_daily_mock',
        examName: exam.examName || 'Entrance Exam — Daily Mock',
        resumeData: { questionIds: exam.questionIds, answers: exam.answers, flagged: exam.flagged, currentIndex: exam.currentIndex || 0 },
      },
    });
  };

  const handleDiscard = async (exam) => {
    if (!window.confirm('Discard this paused exam?')) return;
    try {
      await deleteDoc(doc(db, 'entrancePausedExams', exam.id));
      setPausedExams(prev => {
        const updated = prev.filter(e => e.id !== exam.id);
        if (updated.length === 0) setShowPausedModal(false);
        return updated;
      });
    } catch (e) { console.error('Discard error:', e); }
  };

  // ── Feature cards ─────────────────────────────────────────────────────────
  const FEATURE_CARDS = [
    {
      icon:  todayMockDone ? '✅' : mockReady ? '🗓️' : '🗓️',
      label: 'Daily Mock Exam',
      sub:   todayMockDone
               ? "Done today! Tap to review or retry"
               : mockReady
                 ? "Today's mock is ready!"
                 : "Check back — mock coming soon",
      color: todayMockDone ? '#16A34A' : mockReady ? '#F59E0B' : '#64748B',
      to: '/entrance-exam/daily-mock',
      delay: 350,
    },
    { icon: '🏫', label: 'School Past Questions', sub: `${animSchools || '…'} schools available`,             color: '#0D9488', to: '/entrance-exam/schools',       delay: 420 },
    { icon: '📚', label: 'Subject Drill',          sub: 'Topic-by-topic practice',                             color: '#2563EB', to: '/entrance-exam/subject-drill', delay: 490 },
    { icon: '📋', label: 'Exams Taken',            sub: `${completedExams.length} recent session${completedExams.length !== 1 ? 's' : ''}`, color: '#7C3AED', to: '/entrance-exam/exams-taken', delay: 560 },
    { icon: '🔖', label: 'Bookmarks',              sub: 'Your saved questions',                                color: '#A855F7', to: '/entrance-exam/bookmarks',     delay: 630 },
    { icon: '📊', label: 'My Results',             sub: avgScore > 0 ? `Avg score: ${avgScore}%` : 'No exams yet', color: '#16A34A', to: '/entrance-exam/my-results', delay: 700 },
    { icon: '📈', label: 'Analysis',               sub: 'See your weak areas',                                color: '#0891B2', to: '/entrance-exam/analysis',      delay: 770 },
    { icon: '🏆', label: 'Leaderboard',            sub: 'See top students',                                    color: '#EF4444', to: '/entrance-exam/leaderboard',   delay: 840 },
    { icon: '🤝', label: 'Study Buddy',            sub: 'Find aspirants to prep with',                         color: '#F59E0B', to: '/entrance-exam/study-buddy',   delay: 910 },
  ];

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: F, color: 'var(--text-primary)' }}>

      {showPausedModal && (
        <PausedModal exams={pausedExams} onContinue={handleContinue} onDiscard={handleDiscard} onClose={() => setShowPausedModal(false)} />
      )}

      {/* ── Streak Milestone Modal ── */}
      {streakMilestone > 0 && (
        <StreakMilestoneModal
          streak={streakMilestone}
          onClose={() => setStreakMilestone(0)}
        />
      )}

      {/* ── Streak Reminder Banner ── */}
      {streakReminderData && <StreakReminderBanner streakData={streakReminderData} />}

      {/* ── Badge Preview Strip ── */}
      {earnedBadges.length > 0 && (
        <div
          onClick={() => navigate('/badges')}
          style={{
            background: 'linear-gradient(135deg, #0D948818 0%, #1E3A8A18 100%)',
            border: '1.5px solid rgba(13,148,136,0.25)',
            borderRadius: 14, padding: '12px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏅</span>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: '#0D9488' }}>
                {earnedBadges.length} Badge{earnedBadges.length !== 1 ? 's' : ''} Earned
              </div>
              <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                Tap to view your collection
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {earnedBadges.slice(0, 5).map(id => {
              const b = BADGE_MAP[id];
              return b ? <span key={id} style={{ fontSize: 22 }} title={b.label}>{b.icon}</span> : null;
            })}
            <span style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>›</span>
          </div>
        </div>
      )}

      {/* ── Tip of the Day (Entrance Exam — O-level subjects) ── */}
      <EntranceTipOfDay />

      {/* ── Daily Challenge (Entrance Exam — reads entranceDailyChallenge) ── */}
      <EntranceDailyChallenge />

      {loadError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ⚠️ {loadError}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F }}>Retry</button>
        </div>
      )}

      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A5E 0%, #065F46 100%)',
        borderRadius: 20, marginBottom: 32, overflow: 'hidden', position: 'relative',
        opacity: bannerVis ? 1 : 0, transform: bannerVis ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'opacity .6s ease, transform .6s ease',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 75% 50%, rgba(13,148,136,0.35) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px,4vw,36px)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, fontFamily: F }}>🏥 NMCN CBT Platform</div>
          <h2 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', color: '#FFFFFF', margin: '0 0 10px', lineHeight: 1.2 }}>
            🏫 Nursing Schools Entrance Exam
          </h2>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.82)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Past Questions &amp; Daily Mock — Practice Smart. Pass First. Enter Your Dream School.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Schools',    value: loading ? '…' : animSchools,           icon: '🏫' },
              { label: 'Questions',  value: loading ? '…' : animQuestions,         icon: '❓' },
              { label: 'Your Exams', value: loading ? '…' : completedExams.length, icon: '📝' },
              ...(avgScore > 0 ? [{ label: 'Avg Score', value: `${avgScore}%`, icon: '📊' }] : []),
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 12, padding: '10px 16px' }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: '#fff', lineHeight: 1, fontFamily: H }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, marginTop: 2, fontFamily: F }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Free preview banner — only for unpaid non-admin users ── */}
          {!authLoading && !profile?.entranceExamPaid && profile?.role !== 'admin' && (
            <div style={{
              marginBottom: pausedExams.length > 0 ? 16 : 0,
              borderRadius: 12, overflow: 'hidden',
              border: '1.5px solid rgba(245,158,11,0.45)',
            }}>
              {/* Top row: free preview info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(245,158,11,0.1)',
                padding: '10px 14px',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#F59E0B', fontFamily: F }}>
                    Free Preview — 10 questions per exam
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 2 }}>
                    All features unlocked · Questions capped at 10 until you register
                  </div>
                </div>
              </div>
              {/* Bottom row: upgrade CTA */}
              <div
                onClick={() => navigate('/entrance-exam/payment')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'rgba(245,158,11,0.18)',
                  padding: '8px 14px', cursor: 'pointer',
                  borderTop: '1px solid rgba(245,158,11,0.25)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
              >
                <span style={{ fontWeight: 900, fontSize: 12, color: '#F59E0B', fontFamily: F }}>
                  🔓 Unlock Full Access for ₦3,000 →
                </span>
              </div>
            </div>
          )}

          {pausedExams.length > 0 && (
            <div
              onClick={() => setShowPausedModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.45)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer', marginTop: 16, transition: 'background 0.2s, border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.15)'}
            >
              <span style={{ fontSize: 22 }}>▶</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', fontFamily: F }}>Continue an Exam</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 700, fontFamily: F, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pausedExams[0].examName || 'Entrance Exam'} · click to resume
                </div>
              </div>
              <div style={{ background: '#F59E0B', color: '#000', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, fontFamily: H, flexShrink: 0 }}>
                {pausedExams.length}
              </div>
              <span style={{ color: '#F59E0B', fontSize: 20, fontWeight: 900, flexShrink: 0 }}>→</span>
            </div>
          )}
        </div>
      </div>

      {/* Feature Cards */}
      <ACard delay={280} style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'var(--text-primary)', margin: '0 0 16px' }}>
          ⚡ What do you want to do?
        </h2>
        <SurpriseMeButton user={user} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {FEATURE_CARDS.map(card => <FeatureCard key={card.label} {...card} />)}
        </div>
      </ACard>

      {/* ── Weak Subjects Detector ── */}
      <WeakSubjectsPanel user={user} />

      {/* ── Progress Wall shortcut ── */}
      <ACard delay={900} style={{ marginBottom: 20 }}>
        <div onClick={() => navigate('/progress-wall')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg,rgba(13,148,136,0.12),rgba(30,58,138,0.12))', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 14, padding: '16px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>🗺️</span>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)' }}>Progress Wall</div>
              <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Heatmap · Subject mastery · Weak spots</div>
            </div>
          </div>
          <span style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color: 'var(--text-muted)' }}>›</span>
        </div>
      </ACard>

      {/* Recommendation */}
      <ACard delay={900} style={{ marginBottom: 24 }}>
        <div style={{ background: 'var(--teal-glow)', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 14, padding: '18px 22px' }}>
          <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem, 2vw, 1.5rem)', color: 'var(--text-primary)', margin: '0 0 12px' }}>
            💡 Recommended For You
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              avgScore < 70 && avgScore > 0
                ? `Your average is ${avgScore}% — try Subject Drill to boost weak areas`
                : avgScore >= 70
                  ? `You're averaging ${avgScore}% — great! Try a harder school's questions`
                  : "Start with any school's past questions to get your first score",
              todayMockDone
                ? "Great job completing today's Daily Mock! Try a School Past Questions next"
                : mockReady
                  ? "Don't forget today's Daily Mock Exam — it resets at midnight"
                  : "Try Subject Drill to sharpen your weak areas",
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: F, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--teal)', fontWeight: 900, flexShrink: 0 }}>→</span>
                {tip}
              </div>
            ))}
          </div>
        </div>
      </ACard>

      {/* Recent Exams */}
      {completedExams.length > 0 && (
        <ACard delay={1000} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem, 2vw, 1.5rem)', color: 'var(--text-primary)', margin: 0 }}>🕓 Recent Exams</h3>
            <Link to="/entrance-exam/my-results" style={{ color: 'var(--teal)', fontSize: 14, fontWeight: 700, fontFamily: F }}>All results →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completedExams.map(s => {
              const pct    = s.scorePercent ?? Math.round(((s.correct || 0) / (s.totalQuestions || 1)) * 100);
              const passed = pct >= 50;
              const date   = s.completedAt?.toDate ? s.completedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently';
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `5px solid ${passed ? '#16A34A' : '#EF4444'}`, borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', fontFamily: F }}>{s.examName || 'Entrance Exam'}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 2 }}>{date} · {s.correct ?? '?'}/{s.totalQuestions ?? '?'} correct</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: passed ? '#16A34A' : '#EF4444', fontFamily: H }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </ACard>
      )}

      {/* Empty state */}
      {!loading && completedExams.length === 0 && pausedExams.length === 0 && (
        <ACard delay={900}>
          <div style={{ textAlign: 'center', padding: '40px 28px', background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 18 }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🏫</div>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.3rem, 3vw, 2rem)', color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Start Your Entrance Exam Prep
            </h3>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.7 }}>
              Browse nursing schools and start practising with real past questions.
            </p>
            <Link to="/entrance-exam/schools" className="btn btn-primary" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 15, fontFamily: F, fontWeight: 700 }}>
              🏫 Browse Schools
            </Link>
          </div>
        </ACard>
      )}

    </div>
  );
}
