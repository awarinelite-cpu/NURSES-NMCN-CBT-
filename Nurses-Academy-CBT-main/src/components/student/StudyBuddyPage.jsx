// src/components/student/StudyBuddyPage.jsx
// Route: /study-buddy
//
// Study Buddy Matching — students declare their weak subjects, platform
// suggests 3 compatible partners with complementary strengths, and a
// one-tap button opens a DM.
//
// Firestore reads:
//   users/{uid}                  — own profile
//   users (query)                — all subscribed students for matching
//   examSessions (query by uid)  — compute category averages for each user
//
// Firestore writes:
//   users/{uid}.weakSubjects     — array of category ids the student flagged
//   users/{uid}.buddySearchable  — bool: opt in to being findable
//
// Matching algorithm:
//   1. Load current user's weak subjects (from profile or computed from sessions)
//   2. Query other users who have buddySearchable=true
//   3. For each candidate, score compatibility:
//        +2 for each weak subject of mine that is a strong subject of theirs
//        +1 for each strong subject of mine that is weak for them (I can help)
//   4. Sort by score desc, surface top 3

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc,
  updateDoc, getDoc, limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

// ── Subject pill selector ─────────────────────────────────────────────────────
function SubjectPill({ cat, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(cat.id)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
        fontFamily: F, fontWeight: 700, fontSize: 13,
        border: selected ? `1.5px solid ${cat.color}` : '1.5px solid var(--border)',
        background: selected ? `${cat.color}22` : 'var(--bg-card)',
        color: selected ? cat.color : 'var(--text-muted)',
        transition: 'all 0.18s ease',
      }}
    >
      <span>{cat.icon}</span>
      <span>{cat.shortLabel}</span>
      {selected && <span style={{ fontSize: 10, fontWeight: 900 }}>✓</span>}
    </button>
  );
}

// ── Compute category averages from examSessions ────────────────────────────────
async function computeCategoryAverages(uid) {
  try {
    const snap = await getDocs(query(
      collection(db, 'examSessions'),
      where('userId', '==', uid),
    ));
    const catMap = {};
    snap.docs.forEach(d => {
      const s = d.data();
      if (!s.category || s.scorePercent === undefined) return;
      if (!catMap[s.category]) catMap[s.category] = { total: 0, sum: 0 };
      catMap[s.category].total++;
      catMap[s.category].sum += s.scorePercent;
    });
    const result = {};
    Object.entries(catMap).forEach(([id, v]) => {
      result[id] = Math.round(v.sum / v.total);
    });
    return result; // { category_id: avgScore }
  } catch {
    return {};
  }
}

// ── Buddy score card ──────────────────────────────────────────────────────────
function BuddyCard({ buddy, myWeakIds, idx }) {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);

  const name    = buddy.profile?.name || 'Student';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const score   = buddy.matchScore;
  const theyHelp  = buddy.theyHelpMe;   // subjects where they're strong, I'm weak
  const iHelp     = buddy.iHelpThem;    // subjects where I'm strong, they're weak

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
      {/* Accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, var(--teal), ${scoreColor})`,
        borderRadius: '16px 16px 0 0',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {/* Avatar */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `linear-gradient(135deg, var(--teal), #1E3A8A)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: H, fontWeight: 900, fontSize: 18, color: '#fff',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>
            {name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {buddy.profile?.subscribed ? '⭐ Premium' : '🆓 Free'} ·
            {' '}{buddy.profile?.totalExams || 0} exams taken
          </div>
        </div>
        {/* Match score badge */}
        <div style={{
          flexShrink: 0, padding: '4px 10px', borderRadius: 20,
          background: `${scoreColor}22`, border: `1px solid ${scoreColor}55`,
          fontFamily: H, fontWeight: 900, fontSize: 12, color: scoreColor,
        }}>
          {score} pts match
        </div>
      </div>

      {/* They can help me */}
      {theyHelp.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📚 They can help you with
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {theyHelp.map(cat => (
              <span key={cat.id} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: `${cat.color}18`, color: cat.color,
                border: `1px solid ${cat.color}33`, fontWeight: 700,
              }}>
                {cat.icon} {cat.shortLabel}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* I can help them */}
      {iHelp.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🤝 You can help them with
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {iHelp.map(cat => (
              <span key={cat.id} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
                border: '1px solid rgba(13,148,136,0.25)', fontWeight: 700,
              }}>
                {cat.icon} {cat.shortLabel}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* DM button */}
      <button
        onClick={() => navigate(`/chat/${buddy.uid}`)}
        style={{
          width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
          fontFamily: F, fontWeight: 700, fontSize: 14,
          background: 'var(--teal)', color: '#fff', border: 'none',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        💬 Send a Message
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ reason }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 24px',
      background: 'var(--bg-card)', border: '1.5px solid var(--border)',
      borderRadius: 16,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>
        No matches found yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 320, margin: '0 auto' }}>
        {reason}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudyBuddyPage() {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [weakSubjects,   setWeakSubjects]   = useState([]);   // category ids user flagged
  const [searchable,     setSearchable]     = useState(false);
  const [buddies,        setBuddies]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [searched,       setSearched]       = useState(false);
  const [myAvgMap,       setMyAvgMap]       = useState({});   // my category averages
  const [avgMapReady,    setAvgMapReady]    = useState(false); // true once avgMap fetch completes
  const [setupComplete,  setSetupComplete]  = useState(false);

  // Load current settings on mount
  useEffect(() => {
    if (!profile) return;
    if (profile.weakSubjects?.length) {
      setWeakSubjects(profile.weakSubjects);
      setSetupComplete(true);
    }
    setSearchable(profile.buddySearchable || false);
  }, [profile]);

  // Load my category averages
  useEffect(() => {
    if (!user?.uid) return;
    computeCategoryAverages(user.uid).then(map => {
      setMyAvgMap(map);
      setAvgMapReady(true); // always mark ready, even if map is empty (new user)
    });
  }, [user?.uid]);

  const toggleSubject = (id) => {
    setWeakSubjects(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const saveSettings = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        weakSubjects: weakSubjects,
        buddySearchable: searchable,
      });
      setSetupComplete(true);
    } catch (e) {
      console.error('Save buddy settings error:', e);
    } finally {
      setSaving(false);
    }
  };

  const findBuddies = useCallback(async () => {
    if (!user?.uid) return;
    setSearching(true);
    setBuddies([]);
    setSearched(false);
    try {
      // Fetch other searchable users (cap at 80 to limit reads)
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('buddySearchable', '==', true),
        limit(80),
      ));

      const candidates = snap.docs
        .map(d => ({ uid: d.id, profile: d.data() }))
        .filter(c => c.uid !== user.uid);

      if (candidates.length === 0) {
        setSearched(true);
        setSearching(false);
        return;
      }

      // Compute category averages for each candidate (batch — up to 80 users)
      // We only compute for candidates; use their weakSubjects if set, otherwise
      // derive from their profile.totalScore / totalExams as a rough signal.
      const myWeak    = new Set(weakSubjects);   // IDs I'm weak in
      // Only treat a subject as "strong" if user has actual session data showing >= 65%
      // (don't assume strength from absence of data — that caused zero matches for new users)
      const myStrong  = new Set(
        NURSING_CATEGORIES
          .map(c => c.id)
          .filter(id => myAvgMap[id] !== undefined && myAvgMap[id] >= 65 && !myWeak.has(id))
      );

      const scored = candidates.map(c => {
        const theirWeak   = new Set(c.profile.weakSubjects || []);
        const theirStrong = new Set(
          NURSING_CATEGORIES
            .map(cat => cat.id)
            .filter(id => !theirWeak.has(id))
        );

        // +2 if they're strong in my weak areas (they can help ME)
        let score = 0;
        const theyHelpMeIds = [];
        myWeak.forEach(id => {
          if (theirStrong.has(id)) { score += 2; theyHelpMeIds.push(id); }
        });

        // +1 if I'm strong in their weak areas (I can help THEM)
        const iHelpThemIds = [];
        theirWeak.forEach(id => {
          if (myStrong.has(id)) { score += 1; iHelpThemIds.push(id); }
        });

        // Bonus +1 if they are searchable and have matching weak subjects
        // so that even users without session data see some results
        if (score === 0 && myWeak.size > 0) {
          // Fallback: show any searchable user who shares at least one weak subject
          let commonWeak = 0;
          myWeak.forEach(id => { if (theirWeak.has(id)) commonWeak++; });
          if (commonWeak > 0) score = commonWeak; // mild match — same struggles
        }

        return {
          ...c,
          matchScore: score,
          theyHelpMe: theyHelpMeIds.map(id => NURSING_CATEGORIES.find(cat => cat.id === id)).filter(Boolean),
          iHelpThem:  iHelpThemIds.map(id => NURSING_CATEGORIES.find(cat => cat.id === id)).filter(Boolean),
        };
      });

      const top3 = scored
        .filter(c => c.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3);

      setBuddies(top3);
      setSearched(true);
    } catch (e) {
      console.error('Find buddies error:', e);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [user?.uid, weakSubjects, myAvgMap]);

  // Auto-search once setup is loaded and avgMap fetch has completed (even if empty)
  useEffect(() => {
    if (setupComplete && avgMapReady && !searched) {
      findBuddies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupComplete, avgMapReady]);

  const catGroups = [
    { label: 'Basic RN',   cats: NURSING_CATEGORIES.filter(c => c.examType === 'basic')     },
    { label: 'Post Basic', cats: NURSING_CATEGORIES.filter(c => c.examType === 'post_basic') },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      <style>{`
        @keyframes buddyFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13, fontFamily: F,
            fontWeight: 700, padding: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Dashboard
        </button>
        <h2 style={{ fontFamily: H, fontSize: 'clamp(1.3rem,3vw,1.8rem)', color: 'var(--text-primary)', margin: '0 0 6px' }}>
          🤝 Study Buddy Finder
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, fontFamily: F }}>
          Find students who complement your strengths — learn together, improve faster.
        </p>
      </div>

      {/* ── Step 1: Set your weak subjects ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 16, padding: '20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'rgba(13,148,136,0.15)',
            border: '1.5px solid rgba(13,148,136,0.3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>1️⃣</div>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>
              Mark Your Weak Subjects
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              Select subjects you need help with — we'll find students who excel there
            </div>
          </div>
        </div>

        {catGroups.map(group => (
          <div key={group.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {group.cats.map(cat => (
                <SubjectPill
                  key={cat.id}
                  cat={cat}
                  selected={weakSubjects.includes(cat.id)}
                  onClick={toggleSubject}
                />
              ))}
            </div>
          </div>
        ))}

        {weakSubjects.length > 0 && (
          <div style={{
            marginTop: 6, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)',
            fontSize: 12, color: 'var(--text-muted)', fontFamily: F,
          }}>
            ✅ <strong style={{ color: 'var(--teal)' }}>{weakSubjects.length}</strong> weak subject{weakSubjects.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      {/* ── Step 2: Visibility toggle ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 16, padding: '18px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'rgba(245,158,11,0.12)',
            border: '1.5px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>2️⃣</div>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>
              Make Me Findable
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              Allow other students to find you as a study buddy
            </div>
          </div>
        </div>
        {/* Toggle switch */}
        <div
          onClick={() => setSearchable(v => !v)}
          style={{
            width: 48, height: 26, borderRadius: 13, cursor: 'pointer',
            background: searchable ? 'var(--teal)' : 'var(--border)',
            position: 'relative', flexShrink: 0,
            transition: 'background 0.25s ease',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, borderRadius: '50%',
            width: 20, height: 20, background: '#fff',
            left: searchable ? 25 : 3,
            transition: 'left 0.25s ease',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }} />
        </div>
      </div>

      {/* Save + Search buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button
          onClick={saveSettings}
          disabled={saving}
          style={{
            flex: 1, padding: '13px', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: F, fontWeight: 700, fontSize: 14,
            background: 'rgba(13,148,136,0.15)', border: '1.5px solid rgba(13,148,136,0.4)',
            color: 'var(--teal)', opacity: saving ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {saving ? '💾 Saving…' : '💾 Save Preferences'}
        </button>
        <button
          onClick={() => { saveSettings(); findBuddies(); }}
          disabled={searching || weakSubjects.length === 0}
          style={{
            flex: 2, padding: '13px', borderRadius: 12,
            cursor: (searching || weakSubjects.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: F, fontWeight: 700, fontSize: 14,
            background: weakSubjects.length === 0 ? 'var(--bg-tertiary)' : 'var(--teal)',
            border: 'none', color: weakSubjects.length === 0 ? 'var(--text-muted)' : '#fff',
            opacity: searching ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          {searching ? '🔍 Searching…' : '🔍 Find Study Buddies'}
        </button>
      </div>

      {/* ── Results ── */}
      {(searched || searching) && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>
              🎯 Your Best Matches
            </h3>
            {buddies.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F }}>
                {buddies.length} found
              </span>
            )}
          </div>

          {searching ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3].map(k => (
                <div key={k} style={{
                  height: 140, borderRadius: 16, background: 'var(--bg-card)',
                  border: '1.5px solid var(--border)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg,var(--bg-card) 25%,var(--bg-tertiary) 50%,var(--bg-card) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'sdShimmer 1.4s infinite',
                  }} />
                </div>
              ))}
              <style>{`@keyframes sdShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
            </div>
          ) : buddies.length === 0 ? (
            <EmptyState reason={
              weakSubjects.length === 0
                ? "Select your weak subjects above, then search again."
                : "No students with matching weak subjects have turned on 'Make Me Findable' yet. Try selecting more subjects, or share the platform with your classmates so more people join!"
            } />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {buddies.map((buddy, idx) => (
                <BuddyCard
                  key={buddy.uid}
                  buddy={buddy}
                  myWeakIds={weakSubjects}
                  idx={idx}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No weak subjects selected yet */}
      {!searched && !searching && weakSubjects.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 24px',
          background: 'var(--bg-card)', border: '1.5px solid var(--border)',
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👆</div>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 8 }}>
            Select your weak subjects first
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F, lineHeight: 1.7 }}>
            Pick the subjects you struggle with above, then tap "Find Study Buddies" to
            discover students who can help you.
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={{
        marginTop: 32, padding: '18px 20px',
        background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)',
        borderRadius: 14,
      }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--teal)', marginBottom: 10 }}>
          💡 How Study Buddy Matching Works
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            '1. Mark subjects you find difficult.',
            '2. Turn on "Make Me Findable" so others can find you too.',
            '3. We score matches: +2 pts if they\'re strong where you\'re weak, +1 pt if you can help them.',
            '4. Top 3 most compatible students are shown — tap to DM instantly.',
          ].map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, lineHeight: 1.6 }}>
              {tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
