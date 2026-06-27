// src/components/entrance/EntranceStudyBuddyPage.jsx
// Route: /entrance-exam/study-buddy
//
// Fully automatic — no subject picking, no specialty selection.
// Algorithm:
//   1. Compute current user's subject averages from entranceExamSessions
//   2. Derive weak subjects (avg < 60%) and strong subjects (avg >= 65%)
//   3. Query other buddySearchable users
//   4. For each candidate compute their weak/strong from their sessions
//   5. Score: +2 if they're strong where I'm weak, +1 if I'm strong where they're weak
//   6. Show top 3 matches with subject tags and one-tap DM

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs,
  doc, updateDoc, limit,
} from 'firebase/firestore';
import { db }       from '../../firebase/config';
import { useAuth }  from '../../context/AuthContext';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const SUBJECT_COLORS = {
  'Biology':           '#16A34A',
  'Chemistry':         '#7C3AED',
  'Physics':           '#0891B2',
  'Mathematics':       '#F59E0B',
  'English Language':  '#2563EB',
  'General Studies':   '#0D9488',
  'General Knowledge': '#0D9488',
  'Nursing Aptitude':  '#EF4444',
  'Current Affairs':   '#64748B',
};
const subjectColor = s => SUBJECT_COLORS[s] || '#0D9488';

// Compute weak/strong subjects from entranceExamSessions for a given uid
async function computeSubjectMap(uid) {
  try {
    const snap = await getDocs(query(
      collection(db, 'entranceExamSessions'),
      where('userId', '==', uid),
    ));
    const map = {};
    snap.docs.forEach(d => {
      const s = d.data();
      const subj = s.subject || s.examName || null;
      if (!subj || s.scorePercent === undefined) return;
      if (!map[subj]) map[subj] = { total: 0, sum: 0 };
      map[subj].total++;
      map[subj].sum += s.scorePercent;
    });
    const result = {};
    Object.entries(map).forEach(([subj, v]) => {
      result[subj] = Math.round(v.sum / v.total);
    });
    return result; // { subject: avgScore }
  } catch { return {}; }
}

// ── Buddy Card ────────────────────────────────────────────────────────────────
function BuddyCard({ buddy, idx }) {
  const navigate  = useNavigate();
  const [hov, setHov] = useState(false);
  const name     = buddy.profile?.name || 'Student';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const score    = buddy.matchScore;
  const scoreColor = score >= 6 ? '#22C55E' : score >= 3 ? '#F59E0B' : '#0D9488';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1.5px solid ${hov ? 'var(--teal)' : 'var(--border)'}`,
        borderRadius: 16, padding: '18px 18px 14px',
        opacity: 0, animation: `buddyFadeUp 0.45s ease ${idx * 120}ms forwards`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hov ? '0 6px 24px rgba(13,148,136,0.12)' : 'none',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, var(--teal), ${scoreColor})`, borderRadius: '16px 16px 0 0' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: 'linear-gradient(135deg, var(--teal), #1E3A8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: H, fontWeight: 900, fontSize: 18, color: '#fff' }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F }}>
            {buddy.profile?.entranceExamPaid ? '⭐ Full Access' : '🆓 Free'} · {buddy.sessionCount || 0} exam{buddy.sessionCount !== 1 ? 's' : ''} taken
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 20, background: `${scoreColor}22`, border: `1px solid ${scoreColor}55`, fontFamily: H, fontWeight: 900, fontSize: 12, color: scoreColor }}>
          {score} pts
        </div>
      </div>

      {/* They can help me */}
      {buddy.theyHelpMe.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📚 They can help you with
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {buddy.theyHelpMe.map(s => (
              <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: `${subjectColor(s)}18`, color: subjectColor(s), border: `1px solid ${subjectColor(s)}33`, fontWeight: 700, fontFamily: F }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* I can help them */}
      {buddy.iHelpThem.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🤝 You can help them with
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {buddy.iHelpThem.map(s => (
              <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(13,148,136,0.12)', color: 'var(--teal)', border: '1px solid rgba(13,148,136,0.25)', fontWeight: 700, fontFamily: F }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate(`/entrance-exam/chat/${buddy.uid}`)}
        style={{ width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14, background: 'var(--teal)', color: '#fff', border: 'none', transition: 'opacity 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        💬 Send a Message
      </button>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ height: 160, borderRadius: 16, background: 'var(--bg-card)', border: '1.5px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--bg-card) 25%,var(--bg-tertiary) 50%,var(--bg-card) 75%)', backgroundSize: '200% 100%', animation: 'esbShimmer 1.4s infinite' }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EntranceStudyBuddyPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [searchable,   setSearchable]   = useState(false);
  const [savingVis,    setSavingVis]    = useState(false);
  const [buddies,      setBuddies]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [searched,     setSearched]     = useState(false);
  const [mySubjectMap, setMySubjectMap] = useState({});
  const [mapReady,     setMapReady]     = useState(false);
  const [noData,       setNoData]       = useState(false); // true if user has < 3 sessions

  // Load visibility preference
  useEffect(() => {
    if (profile) setSearchable(profile.entranceBuddySearchable || false);
  }, [profile]);

  // Compute my subject averages
  useEffect(() => {
    if (!user?.uid) return;
    computeSubjectMap(user.uid).then(map => {
      setMySubjectMap(map);
      setMapReady(true);
      setNoData(Object.keys(map).length === 0);
    });
  }, [user?.uid]);

  const saveVisibility = async (val) => {
    if (!user?.uid) return;
    setSavingVis(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { entranceBuddySearchable: val });
    } catch (e) { console.error('Save visibility error:', e); }
    finally { setSavingVis(false); }
  };

  const handleToggle = (val) => {
    setSearchable(val);
    saveVisibility(val);
  };

  const findBuddies = useCallback(async () => {
    if (!user?.uid) return;
    setSearching(true);
    setBuddies([]);
    setSearched(false);

    try {
      // My weak = avg < 60, my strong = avg >= 65
      const myWeak   = new Set(Object.entries(mySubjectMap).filter(([, v]) => v < 60).map(([k]) => k));
      const myStrong = new Set(Object.entries(mySubjectMap).filter(([, v]) => v >= 65).map(([k]) => k));

      // Fetch searchable users (cap 80)
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('entranceBuddySearchable', '==', true),
        limit(80),
      ));

      const candidates = snap.docs
        .map(d => ({ uid: d.id, profile: d.data() }))
        .filter(c => c.uid !== user.uid);

      if (candidates.length === 0) { setSearched(true); setSearching(false); return; }

      // Compute subject maps for all candidates in parallel
      const candidateMaps = await Promise.all(
        candidates.map(c => computeSubjectMap(c.uid))
      );

      const scored = candidates.map((c, i) => {
        const theirMap    = candidateMaps[i];
        const theirWeak   = new Set(Object.entries(theirMap).filter(([, v]) => v < 60).map(([k]) => k));
        const theirStrong = new Set(Object.entries(theirMap).filter(([, v]) => v >= 65).map(([k]) => k));

        let score = 0;
        const theyHelpMe = [];
        const iHelpThem  = [];

        // +2 each subject they're strong in that I'm weak
        myWeak.forEach(subj => {
          if (theirStrong.has(subj)) { score += 2; theyHelpMe.push(subj); }
        });
        // +1 each subject I'm strong in that they're weak
        myStrong.forEach(subj => {
          if (theirWeak.has(subj)) { score += 1; iHelpThem.push(subj); }
        });

        // Fallback: if no data yet on either side, give 1pt for being searchable
        if (score === 0 && myWeak.size === 0 && myStrong.size === 0) score = 1;

        const sessionCount = Object.values(theirMap).length;
        return { ...c, matchScore: score, theyHelpMe, iHelpThem, sessionCount };
      });

      const top3 = scored
        .filter(c => c.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3);

      setBuddies(top3);
    } catch (e) {
      console.error('Find buddies error:', e);
    } finally {
      setSearched(true);
      setSearching(false);
    }
  }, [user?.uid, mySubjectMap]);

  // Auto-search once subject map is ready
  useEffect(() => {
    if (mapReady && !searched) findBuddies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, fontFamily: F }}>
      <style>{`
        @keyframes buddyFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes esbShimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      `}</style>

      {/* Back */}
      <button
        onClick={() => navigate('/entrance-exam')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: '0 0 18px', display: 'flex', alignItems: 'center', gap: 6, fontFamily: F }}
      >
        ← Entrance Exam
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: H, fontSize: 'clamp(1.3rem,3vw,1.8rem)', color: 'var(--text-primary)', margin: '0 0 6px' }}>
          🤝 Study Buddy Finder
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, fontFamily: F, fontWeight: 700, lineHeight: 1.6 }}>
          We automatically match you with students who are strong where you are weak — and weak where you are strong. No setup needed.
        </p>
      </div>

      {/* Visibility toggle */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👁️</div>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>Make Me Findable</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: F }}>
              {savingVis ? 'Saving…' : searchable ? 'Other students can find you as a buddy' : 'Turn on so others can match with you'}
            </div>
          </div>
        </div>
        <div
          onClick={() => handleToggle(!searchable)}
          style={{ width: 48, height: 26, borderRadius: 13, cursor: 'pointer', background: searchable ? 'var(--teal)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.25s ease' }}
        >
          <div style={{ position: 'absolute', top: 3, borderRadius: '50%', width: 20, height: 20, background: '#fff', left: searchable ? 25 : 3, transition: 'left 0.25s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
        </div>
      </div>

      {/* No exam data notice */}
      {mapReady && noData && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, lineHeight: 1.6 }}>
            Complete a few entrance exams first. We use your scores to automatically find the best matches — no manual setup needed.
          </div>
        </div>
      )}

      {/* My subject averages */}
      {mapReady && !noData && (
        <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>📊 Your Subject Profile (auto-detected)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(mySubjectMap).sort(([,a],[,b]) => a - b).map(([subj, avg]) => {
              const isWeak   = avg < 60;
              const isStrong = avg >= 65;
              const color    = isWeak ? '#EF4444' : isStrong ? '#22C55E' : '#F59E0B';
              return (
                <div key={subj} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: `${color}14`, border: `1px solid ${color}33` }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: H }}>{avg}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>{subj}</span>
                  <span style={{ fontSize: 10 }}>{isWeak ? '⚠️' : isStrong ? '💪' : '📈'}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
            ⚠️ = weak (below 60%) · 💪 = strong (65%+) · 📈 = improving
          </div>
        </div>
      )}

      {/* Refresh button */}
      {mapReady && (
        <button
          onClick={findBuddies}
          disabled={searching}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', marginBottom: 28, cursor: searching ? 'not-allowed' : 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14, background: searching ? 'var(--bg-tertiary)' : 'var(--teal)', color: searching ? 'var(--text-muted)' : '#fff', transition: 'background 0.2s', opacity: searching ? 0.7 : 1 }}
        >
          {searching ? '🔍 Searching…' : '🔍 Refresh Matches'}
        </button>
      )}

      {/* Results */}
      {searching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          {[1,2,3].map(k => <SkeletonCard key={k} />)}
        </div>
      )}

      {searched && !searching && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>
              🎯 Your Best Matches
            </h3>
            {buddies.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F }}>{buddies.length} found</span>
            )}
          </div>

          {buddies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>No matches yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 320, margin: '0 auto', fontFamily: F }}>
                Not enough students have turned on "Make Me Findable" yet. Share the platform with your classmates — the more students join, the better your matches.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {buddies.map((buddy, idx) => (
                <BuddyCard key={buddy.uid} buddy={buddy} idx={idx} />
              ))}
            </div>
          )}
        </>
      )}

      {/* How it works */}
      <div style={{ marginTop: 32, padding: '18px 20px', background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 14 }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--teal)', marginBottom: 10 }}>
          💡 How Matching Works
        </div>
        {[
          'We analyse your exam scores across all entrance subjects automatically.',
          'We find students who score high in your weak subjects (+2 pts each).',
          'We also consider subjects where you can help them (+1 pt each).',
          'Top 3 most compatible matches are shown — tap to DM instantly.',
        ].map((tip, i) => (
          <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, lineHeight: 1.7 }}>{i + 1}. {tip}</div>
        ))}
      </div>
    </div>
  );
}
