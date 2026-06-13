// src/components/student/StudentPublicProfile.jsx
// Route: /student/:uid
// Opens when a student clicks a name on the leaderboard.
// Shows public profile info + exam stats + a floating chat button.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate }      from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db }                          from '../../firebase/config';
import { useAuth }                     from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

const gradeColor = (p) =>
  p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{
        width: 44, height: 44,
        border: '3px solid rgba(255,255,255,0.08)',
        borderTopColor: '#0D9488',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '16px 12px',
      textAlign: 'center',
      flex: 1,
      minWidth: 70,
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{
        fontFamily: H, fontWeight: 900, fontSize: 22,
        color: color || 'var(--text-primary, #F1F5F9)',
        lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: 10, color: 'var(--text-muted)',
        fontFamily: F, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginTop: 5,
      }}>{label}</div>
    </div>
  );
}

export default function StudentPublicProfile() {
  const { uid }     = useParams();
  const { user }    = useAuth();
  const navigate    = useNavigate();

  const [profileData, setProfileData]  = useState(null);
  const [examStats,   setExamStats]    = useState(null);
  const [loading,     setLoading]      = useState(true);
  const [error,       setError]        = useState('');

  const isOwnProfile = user?.uid === uid;

  useEffect(() => {
    if (!uid) { setError('No student ID provided.'); setLoading(false); return; }
    load();
  }, [uid]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // 1. Load user profile document
      const userSnap = await getDoc(doc(db, 'users', uid));
      const data = userSnap.exists() ? userSnap.data() : null;

      // 2. Load entrance exam sessions for stats
      const sessionsSnap = await getDocs(collection(db, 'entranceExamSessions'));
      const scores = [];
      sessionsSnap.forEach(d => {
        const s = d.data();
        if (s.userId !== uid) return;
        const pct =
          typeof s.scorePercent === 'number'
            ? s.scorePercent
            : s.totalQuestions > 0
              ? Math.round(((s.correct || 0) / s.totalQuestions) * 100)
              : 0;
        scores.push(pct);
      });

      const best  = scores.length ? Math.max(...scores) : null;
      const avg   = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
      const count = scores.length;

      setProfileData(data);
      setExamStats({ best, avg, count });
    } catch (e) {
      console.error('StudentPublicProfile load error:', e);
      setError('Could not load this student\'s profile.');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived display values ──
  const displayName   = profileData?.name || profileData?.displayName || 'Student';
  const school        = profileData?.school || profileData?.institution || '';
  const specialization = profileData?.specialization || '';
  const bio           = profileData?.bio || '';
  const totalExams    = profileData?.totalExams   ?? examStats?.count ?? 0;
  const avgScore      = profileData?.totalExams
    ? Math.round((profileData?.totalScore || 0) / profileData.totalExams)
    : examStats?.avg ?? null;
  const streak        = profileData?.streak        ?? 0;
  const bookmarks     = profileData?.bookmarkCount ?? 0;
  const isPremium     = profileData?.subscribed    ?? false;

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #020B18)' }}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-primary, #020B18)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 52 }}>😕</div>
        <h3 style={{ fontFamily: H, color: 'var(--text-primary)', margin: 0 }}>Profile Not Found</h3>
        <p style={{ fontFamily: F, color: 'var(--text-muted)', margin: 0 }}>{error}</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '11px 28px', background: '#0D9488', color: 'var(--text-primary)',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontWeight: 700, fontSize: 14, fontFamily: F,
          }}
        >← Go Back</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #020B18)',
      color: 'var(--text-primary)',
      fontFamily: F,
      paddingBottom: 100,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pub-card { animation: fadeUp 0.35s ease both; }
        .chat-fab:hover { transform: scale(1.08) !important; box-shadow: 0 8px 28px rgba(13,148,136,0.55) !important; }
        .chat-fab:active { transform: scale(0.96) !important; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        background: 'var(--bg-card, #0B1826)',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: '#0D9488', padding: 4,
            fontWeight: 700, lineHeight: 1, flexShrink: 0,
          }}
        >←</button>
        <div>
          <h1 style={{
            margin: 0, fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
            color: 'var(--text-primary)',
          }}>
            {isOwnProfile ? '👤 My Profile' : `👤 ${displayName}`}
          </h1>
          <p style={{
            margin: 0, fontSize: 12, fontFamily: F,
            fontWeight: 700, color: 'var(--text-muted)',
          }}>
            Student Profile
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px' }}>

        {/* Avatar + name card */}
        <div className="pub-card" style={{
          background: 'linear-gradient(135deg, rgba(13,148,136,0.13) 0%, rgba(30,58,138,0.18) 100%)',
          border: '1.5px solid rgba(13,148,136,0.22)',
          borderRadius: 18,
          padding: '28px 24px',
          display: 'flex', alignItems: 'center', gap: 20,
          marginBottom: 16,
          animationDelay: '0ms',
        }}>
          {/* Avatar */}
          <div style={{
            width: 76, height: 76, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: H, fontWeight: 900, fontSize: 28,
            color: 'var(--text-primary)', flexShrink: 0,
            boxShadow: '0 0 0 3px rgba(13,148,136,0.3)',
          }}>
            {initials || '?'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,3vw,1.45rem)', color: 'var(--text-primary)', marginBottom: 4 }}>
              {displayName}
              {isOwnProfile && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  color: '#0D9488', background: 'rgba(13,148,136,0.15)',
                  border: '1px solid #0D9488', borderRadius: 20,
                  padding: '2px 8px', verticalAlign: 'middle',
                }}>You</span>
              )}
            </div>
            {school && (
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: '#0D9488', marginBottom: 4 }}>
                🏫 {school}
              </div>
            )}
            {specialization && (
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: 'var(--text-muted)' }}>
                🩺 {specialization}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
                background: isPremium ? 'rgba(13,148,136,0.18)' : 'rgba(100,116,139,0.18)',
                color: isPremium ? '#0D9488' : '#94A3B8',
                border: `1px solid ${isPremium ? 'rgba(13,148,136,0.35)' : 'rgba(100,116,139,0.3)'}`,
              }}>
                {isPremium ? '⭐ Premium' : '🆓 Free Plan'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="pub-card" style={{
          display: 'flex', gap: 10, marginBottom: 16,
          flexWrap: 'wrap',
          animationDelay: '60ms',
        }}>
          <StatBox icon="📝" label="Exams Taken" value={totalExams} />
          <StatBox
            icon="🎯" label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore !== null ? gradeColor(avgScore) : undefined}
          />
          <StatBox
            icon="🏆" label="Best Score"
            value={examStats?.best !== null && examStats?.best !== undefined ? `${examStats.best}%` : '—'}
            color={examStats?.best !== null && examStats?.best !== undefined ? gradeColor(examStats.best) : undefined}
          />
          <StatBox icon="🔥" label="Day Streak" value={streak} />
        </div>

        {/* Bio */}
        {bio && (
          <div className="pub-card" style={{
            background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '18px 20px',
            marginBottom: 16,
            animationDelay: '120ms',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, fontFamily: F,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 10,
            }}>About</div>
            <p style={{
              fontFamily: F, fontWeight: 700, fontSize: 14,
              color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7,
            }}>{bio}</p>
          </div>
        )}

        {/* Performance summary */}
        {examStats && examStats.count > 0 && (
          <div className="pub-card" style={{
            background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '18px 20px',
            marginBottom: 16,
            animationDelay: '180ms',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, fontFamily: F,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 14,
            }}>Entrance Exam Performance</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Best score bar */}
              {examStats.best !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: 'var(--text-secondary)' }}>Best Score</span>
                    <span style={{ fontSize: 13, fontWeight: 900, fontFamily: H, color: gradeColor(examStats.best) }}>
                      {examStats.best}%
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: gradeColor(examStats.best),
                      width: `${examStats.best}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Avg score bar */}
              {examStats.avg !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: 'var(--text-secondary)' }}>Average Score</span>
                    <span style={{ fontSize: 13, fontWeight: 900, fontFamily: H, color: gradeColor(examStats.avg) }}>
                      {examStats.avg}%
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: gradeColor(examStats.avg),
                      width: `${examStats.avg}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{
              marginTop: 14, fontSize: 12, fontWeight: 700,
              fontFamily: F, color: 'var(--text-muted)',
            }}>
              {examStats.count} entrance exam{examStats.count !== 1 ? 's' : ''} completed
            </div>
          </div>
        )}

        {/* Edit profile shortcut — only for own profile */}
        {isOwnProfile && (
          <button
            onClick={() => navigate('/profile')}
            className="pub-card"
            style={{
              display: 'block', width: '100%',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #0D9488, #0F766E)',
              border: 'none', borderRadius: 12,
              color: 'var(--text-primary)', fontWeight: 700, fontSize: 14,
              fontFamily: F, cursor: 'pointer',
              textAlign: 'center',
              boxShadow: '0 4px 18px rgba(13,148,136,0.3)',
              animationDelay: '240ms',
            }}
          >
            ✏️ Edit My Profile
          </button>
        )}

      </div>

      {/* ── Floating Chat Button (only shown for OTHER students) ── */}
      {!isOwnProfile && (
        <button
          className="chat-fab"
          onClick={() => navigate(`/chat/${uid}`, { state: { name: displayName, school } })}
          style={{
            position: 'fixed',
            bottom: 28,
            right: 22,
            width: 62,
            height: 62,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0D9488, #0891B2)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 24px rgba(13,148,136,0.45)',
            transition: 'transform 0.18s, box-shadow 0.18s',
            zIndex: 50,
          }}
          title={`Chat with ${displayName}`}
        >
          {/* Chat bubble SVG icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* Pulse ring */}
          <span style={{
            position: 'absolute', inset: -4,
            borderRadius: '50%',
            border: '2px solid rgba(13,148,136,0.5)',
            animation: 'pulse-ring 1.8s ease-out infinite',
          }} />
        </button>
      )}

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.7; }
          80%  { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
