// src/components/student/LeaderboardPage.jsx
// Route: /leaderboard
// Reads examSessions (NMCN CBT) and builds a ranked table.
// Every student row is clickable → /student/:uid (public profile + chat)

import { useState, useEffect, useCallback } from 'react';
import { useNavigate }          from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db }                  from '../../firebase/config';
import { useAuth }             from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

const gradeColor = (p) =>
  p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

const MEDALS = ['🥇', '🥈', '🥉'];

/* ── tiny helpers ── */
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
      <div style={{
        width: 44, height: 44,
        border: '3px solid rgba(13,148,136,0.12)',
        borderTopColor: '#0D9488',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function Avatar({ name = '', size = 36 }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: H, fontWeight: 900, color: 'var(--text-primary)',
      fontSize: size * 0.38,
    }}>
      {initials}
    </div>
  );
}

function FilterBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px', borderRadius: 20, border: 'none',
        cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: F,
        background: active ? '#0D9488' : 'var(--bg-tertiary, rgba(255,255,255,0.05))',
        color:      active ? '#fff'    : 'var(--text-muted, #64748B)',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >{label}</button>
  );
}

/* ── Main component ── */
export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [board,   setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('all');   // 'all' | 'week' | 'month'

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(collection(db, 'examSessions'));

      const cutoff = new Date();
      if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
      else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
      else                         cutoff.setFullYear(2000);

      const userMap = {};

      snap.forEach(d => {
        const s = d.data();
        if (!s.userId) return;

        const completedMs =
          s.completedAt?.toDate?.()?.getTime?.() ??
          (s.completedAt?.seconds ? s.completedAt.seconds * 1000 : 0);

        if (completedMs < cutoff.getTime()) return;

        const pct =
          typeof s.scorePercent === 'number'
            ? s.scorePercent
            : s.totalQuestions > 0
              ? Math.round(((s.correct || 0) / s.totalQuestions) * 100)
              : 0;

        if (!userMap[s.userId]) {
          userMap[s.userId] = {
            uid:    s.userId,
            name:   s.userName || s.displayName || 'Student',
            school: s.userSchool || '',
            scores: [],
          };
        }
        userMap[s.userId].scores.push(pct);
      });

      const rows = Object.values(userMap)
        .filter(u => u.scores.length > 0)
        .map(u => ({
          uid:   u.uid,
          name:  u.name,
          school: u.school,
          best:  Math.max(...u.scores),
          avg:   Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length),
          count: u.scores.length,
        }));

      rows.sort((a, b) =>
        b.best  - a.best  ||
        b.avg   - a.avg   ||
        b.count - a.count
      );

      setBoard(rows.slice(0, 100));
    } catch (e) {
      console.error('Leaderboard load error:', e);
      setError('Could not load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const myRank = board.findIndex(r => r.uid === user?.uid) + 1;

  /* ── Top-3 podium cards ── */
  function PodiumCard({ entry, rank }) {
    const isMe = entry.uid === user?.uid;
    const heights = ['80px', '60px', '70px']; // gold, silver, bronze
    const podiumOrder = [1, 0, 2]; // silver, gold, bronze visual order
    return (
      <div
        onClick={() => navigate(`/student/${entry.uid}`, { state: { name: entry.name, school: entry.school } })}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', gap: 8, flex: 1, minWidth: 0,
          animation: 'fadeUp 0.4s ease both',
          animationDelay: `${rank * 80}ms`,
        }}
      >
        <div style={{ fontSize: 28 }}>{MEDALS[rank]}</div>
        <Avatar name={entry.name} size={48} />
        <div style={{
          fontFamily: H, fontWeight: 900, fontSize: 13,
          color: isMe ? '#0D9488' : 'var(--text-primary, #F1F5F9)',
          textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.3,
          maxWidth: 90,
        }}>
          {entry.name}{isMe ? ' (You)' : ''}
        </div>
        <div style={{
          fontSize: 18, fontFamily: H, fontWeight: 900,
          color: gradeColor(entry.best),
        }}>
          {entry.best}%
        </div>
        {/* Podium base */}
        <div style={{
          width: '100%',
          height: heights[rank],
          background: rank === 0
            ? 'linear-gradient(180deg, rgba(251,191,36,0.25), rgba(251,191,36,0.08))'
            : rank === 1
              ? 'linear-gradient(180deg, rgba(148,163,184,0.2), rgba(148,163,184,0.06))'
              : 'linear-gradient(180deg, rgba(205,127,50,0.2), rgba(205,127,50,0.06))',
          border: `1px solid ${rank === 0 ? 'rgba(251,191,36,0.3)' : rank === 1 ? 'rgba(148,163,184,0.2)' : 'rgba(205,127,50,0.25)'}`,
          borderRadius: '8px 8px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: H, fontWeight: 900, fontSize: 22, opacity: 0.5 }}>
            #{rank + 1}
          </span>
        </div>
      </div>
    );
  }

  /* ── Render ── */
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
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lb-row {
          transition: background 0.15s, transform 0.1s;
          cursor: pointer;
          border-radius: 12px;
        }
        .lb-row:hover { background: rgba(13,148,136,0.08) !important; transform: translateX(3px); }
        .lb-row:active { transform: scale(0.99); }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--bg-card, #0B1826)',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
        padding: '16px 18px 14px',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <h1 style={{
          margin: 0, fontFamily: H, fontWeight: 900,
          fontSize: 'clamp(1.3rem,4vw,1.9rem)',
          color: 'var(--text-primary)',
        }}>
          🏆 Leaderboard
        </h1>
        <p style={{
          margin: '4px 0 0', fontSize: 13, fontWeight: 700,
          color: 'var(--text-muted)', fontFamily: F,
        }}>
          NMCN CBT top performers · tap any student to view their profile
        </p>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 14px' }}>

        {/* ── Your rank banner (if ranked) ── */}
        {myRank > 0 && !loading && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(30,58,138,0.15))',
            border: '1.5px solid rgba(13,148,136,0.3)',
            borderRadius: 14, padding: '12px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 20,
            animation: 'fadeUp 0.3s ease',
          }}>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)' }}>
                Your current rank
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
                {filter === 'all' ? 'All time' : filter === 'week' ? 'This week' : 'This month'}
              </div>
            </div>
            <div style={{
              fontFamily: H, fontWeight: 900,
              fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
              color: myRank <= 3 ? '#0D9488' : '#F1F5F9',
            }}>
              {myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`}
            </div>
          </div>
        )}

        {/* ── Filter pills ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          <FilterBtn label="All Time"   active={filter === 'all'}   onClick={() => setFilter('all')} />
          <FilterBtn label="This Month" active={filter === 'month'} onClick={() => setFilter('month')} />
          <FilterBtn label="This Week"  active={filter === 'week'}  onClick={() => setFilter('week')} />
        </div>

        {/* Cycle reset countdown */}
        {filter !== 'all' && (() => {
          const now   = new Date();
          let resets;
          if (filter === 'week') {
            // resets next Monday
            const d = new Date(now);
            d.setDate(d.getDate() + (7 - d.getDay() + 1) % 7 || 7);
            d.setHours(0, 0, 0, 0);
            resets = d;
          } else {
            // resets 1st of next month
            resets = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          }
          const days  = Math.ceil((resets - now) / 86400000);
          const label = days === 1 ? 'tomorrow' : `in ${days} days`;
          return (
            <div style={{
              marginBottom: 20, padding: '8px 14px', borderRadius: 10,
              background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.2)',
              fontSize: 12, color: 'var(--text-muted)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>🔄</span>
              <span>
                Leaderboard resets <strong style={{ color: 'var(--teal)' }}>{label}</strong>
                {filter === 'week' ? ' — only this week\'s exams count' : ' — only this month\'s exams count'}.
                New students compete on equal footing each cycle.
              </span>
            </div>
          );
        })()}

        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            fontFamily: F, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
            <p style={{ fontWeight: 700, margin: 0 }}>{error}</p>
            <button
              onClick={load}
              style={{
                marginTop: 16, padding: '10px 24px',
                background: '#0D9488', color: 'var(--text-primary)',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontWeight: 700, fontFamily: F,
              }}
            >Try Again</button>
          </div>
        ) : board.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            fontFamily: F, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>📭</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
              No scores yet
            </div>
            <p style={{ fontWeight: 700, margin: 0, lineHeight: 1.6 }}>
              No exams completed {filter !== 'all' ? 'in this period' : ''}. <br />
              Be the first on the board!
            </p>
          </div>
        ) : (
          <>
            {/* ── Podium (top 3) ── */}
            {board.length >= 3 && (
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                marginBottom: 28, padding: '0 4px',
              }}>
                {/* visual order: 2nd | 1st | 3rd */}
                {[board[1], board[0], board[2]].map((entry, vi) => {
                  const realRank = vi === 0 ? 1 : vi === 1 ? 0 : 2;
                  return entry ? <PodiumCard key={entry.uid} entry={entry} rank={realRank} /> : <div key={vi} style={{ flex: 1 }} />;
                })}
              </div>
            )}

            {/* ── Full ranked list ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '36px 36px 1fr 56px 56px 44px',
                gap: 6, padding: '0 10px 6px',
                fontSize: 10, fontWeight: 700, fontFamily: F,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.6,
              }}>
                <div></div>
                <div></div>
                <div>Student</div>
                <div style={{ textAlign: 'center' }}>Best</div>
                <div style={{ textAlign: 'center' }}>Avg</div>
                <div style={{ textAlign: 'center' }}>Exams</div>
              </div>

              {board.map((row, i) => {
                const isMe = row.uid === user?.uid;
                return (
                  <div
                    key={row.uid}
                    className="lb-row"
                    onClick={() => navigate(`/student/${row.uid}`, { state: { name: row.name, school: row.school } })}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 36px 1fr 56px 56px 44px',
                      gap: 6,
                      alignItems: 'center',
                      padding: '10px 10px',
                      background: isMe
                        ? 'rgba(13,148,136,0.1)'
                        : i % 2 === 0
                          ? 'rgba(255,255,255,0.02)'
                          : 'transparent',
                      border: isMe ? '1px solid rgba(13,148,136,0.25)' : '1px solid transparent',
                      animation: 'fadeUp 0.35s ease both',
                      animationDelay: `${Math.min(i * 30, 300)}ms`,
                    }}
                  >
                    {/* Rank */}
                    <div style={{
                      fontFamily: H, fontWeight: 900, fontSize: 15,
                      color: i < 3 ? ['#FBBF24','#94A3B8','#CD7F32'][i] : 'var(--text-muted, #64748B)',
                      textAlign: 'center',
                    }}>
                      {i < 3 ? MEDALS[i] : `${i + 1}`}
                    </div>

                    {/* Avatar */}
                    <Avatar name={row.name} size={32} />

                    {/* Name + school */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: H, fontWeight: 900, fontSize: 13,
                        color: isMe ? '#0D9488' : 'var(--text-primary, #F1F5F9)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {row.name}{isMe ? ' 👈' : ''}
                      </div>
                      {row.school && (
                        <div style={{
                          fontSize: 10, fontWeight: 700, fontFamily: F,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {row.school}
                        </div>
                      )}
                    </div>

                    {/* Best score */}
                    <div style={{
                      textAlign: 'center', fontFamily: H, fontWeight: 900,
                      fontSize: 13, color: gradeColor(row.best),
                    }}>
                      {row.best}%
                    </div>

                    {/* Avg score */}
                    <div style={{
                      textAlign: 'center', fontFamily: F, fontWeight: 700,
                      fontSize: 12, color: gradeColor(row.avg),
                    }}>
                      {row.avg}%
                    </div>

                    {/* Exam count */}
                    <div style={{
                      textAlign: 'center', fontFamily: F, fontWeight: 700,
                      fontSize: 12, color: 'var(--text-muted)',
                    }}>
                      {row.count}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              textAlign: 'center', marginTop: 24,
              fontSize: 12, fontFamily: F, fontWeight: 700,
              color: 'var(--text-muted)',
            }}>
              Showing top {board.length} students · Tap any name to view their profile
            </div>
          </>
        )}
      </div>
    </div>
  );
}
