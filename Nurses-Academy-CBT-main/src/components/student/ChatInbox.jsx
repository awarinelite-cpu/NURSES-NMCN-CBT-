// src/components/student/ChatInbox.jsx
// All direct-message conversations for the current user, with unread badges

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
  doc, getDoc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

function timeAgo(ts) {
  if (!ts) return '';
  const d   = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  const days = Math.floor(diff/86400);
  if (days === 1)  return 'Yesterday';
  if (days < 7)    return `${days}d ago`;
  return d.toLocaleDateString([], { day:'numeric', month:'short' });
}

function Avatar({ name='', size=46 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:'linear-gradient(135deg,#0D9488,#1E3A8A)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:H, fontWeight:900, color:'#fff', fontSize:size*0.38,
    }}>{initials}</div>
  );
}

function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div style={{
        width:36, height:36, borderRadius:'50%',
        border:'3px solid rgba(13,148,136,0.15)',
        borderTopColor:'#0D9488',
        animation:'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

export default function ChatInbox() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();

  // Derive context from URL so inbox works for both CBT and Entrance sections
  const isEntrance        = location.pathname.startsWith('/entrance-exam');
  const chatBasePath      = isEntrance ? '/entrance-exam/chat' : '/chat';
  const leaderboardRoute  = isEntrance ? '/entrance-exam/leaderboard' : '/leaderboard';
  const backRoute         = isEntrance ? '/entrance-exam' : '/dashboard';
  const myUid             = user?.uid;

  const [threads,  setThreads]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  // Profile cache lives in a ref, not state: the onSnapshot callback below
  // only depends on [myUid], so a state-based cache would always read the
  // value from mount time (stale closure) and re-fetch every profile on
  // every snapshot. A ref is always current and doesn't trigger re-renders.
  const profilesRef = useRef({}); // uid → profile

  /* Listen to all directChats where I'm a participant */
  useEffect(() => {
    if (!myUid) return;
    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
      // NOTE: No orderBy here — array-contains + orderBy on different field
      // requires a Firestore composite index. Sort client-side instead.
    );
    const unsub = onSnapshot(q, async (snap) => {
      const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Load unread count per chat and other participant profile
      const enriched = await Promise.all(chats.map(async (chat) => {
        const otherUid = chat.participants?.find(p => p !== myUid);
        if (!otherUid) return null;

        // Load their profile (cache it)
        let theirProfile = profilesRef.current[otherUid];
        if (!theirProfile) {
          try {
            const snap = await getDoc(doc(db, 'users', otherUid));
            theirProfile = snap.exists() ? snap.data() : { name: 'Student' };
          } catch { theirProfile = { name: 'Student' }; }
        }

        // Count unread messages in this chat
        // We use the messages subcollection — but to avoid per-chat reads on every update,
        // we store unreadCount on the chat doc itself when messages are sent (ChatPage does this via read flag)
        // Fall back: count from lastMessage timestamp vs our lastRead
        const unread = chat.unreadCounts?.[myUid] || 0;

        return {
          ...chat,
          otherUid,
          theirName: theirProfile.name || theirProfile.displayName || 'Student',
          theirSchool: theirProfile.school || '',
          theirProfile,
          unread,
        };
      }));

      // Sort client-side by updatedAt descending (avoids composite index requirement)
      const valid = enriched
        .filter(Boolean)
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
          const tb = b.updatedAt?.toMillis?.() || (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
          return tb - ta;
        });

      // Cache profiles
      valid.forEach(c => { if (c.otherUid) profilesRef.current[c.otherUid] = c.theirProfile; });
      setThreads(valid);
      setLoading(false);
    }, (err) => {
      console.error('ChatInbox error:', err);
      setLoading(false);
    });
    return unsub;
  }, [myUid]);

  const totalUnread = threads.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <div style={{
      minHeight:'100vh',
      background:'var(--bg-primary,#060E1A)',
      color:'var(--text-primary,#F1F5F9)',
      fontFamily:F,
    }}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes unreadGlow {
          0%,100% { box-shadow: inset 3px 0 0 #0D9488; }
          50%     { box-shadow: inset 3px 0 0 #2dd4bf, 0 0 12px rgba(13,148,136,0.15); }
        }
        .thread-row:hover  { background:rgba(13,148,136,0.07) !important; }
        .thread-row:active { background:rgba(13,148,136,0.14) !important; }
        .thread-row.has-unread {
          background: rgba(13,148,136,0.055) !important;
          animation: unreadGlow 2.4s ease-in-out infinite;
        }
        .thread-row.has-unread:hover {
          background: rgba(13,148,136,0.11) !important;
        }
        .new-pill {
          display: inline-flex;
          align-items: center;
          padding: 1px 6px;
          border-radius: 8px;
          background: linear-gradient(90deg,#0D9488,#0f766e);
          color: #fff;
          font-size: 9px;
          font-weight: 900;
          font-family: 'Arial Black', Arial, sans-serif;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          animation: fadeUp 0.3s ease both;
        }
      `}</style>

      {/* Header */}
      <div style={{
        background:'var(--bg-card,#0B1826)',
        borderBottom:'1px solid var(--border,rgba(255,255,255,0.07))',
        padding:'14px 16px 12px',
        display:'flex', alignItems:'center', gap:12,
        position:'sticky', top:0, zIndex:10,
      }}>
        <button onClick={() => navigate(backRoute)} style={{
          background:'none', border:'none', cursor:'pointer',
          fontSize:22, color:'#0D9488', fontWeight:900, lineHeight:1, padding:'2px 4px',
        }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:H, fontWeight:900, fontSize:18, color:'var(--text-primary,#F1F5F9)' }}>
            💬 Messages
          </div>
          {totalUnread > 0 && (
            <div style={{ fontSize:12, fontWeight:700, color:'#0D9488', marginTop:2 }}>
              {totalUnread} unread message{totalUnread > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Thread list */}
      <div style={{ padding:'8px 0' }}>
        {loading ? <Spinner /> : threads.length === 0 ? (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:16, padding:'80px 32px', textAlign:'center',
          }}>
            <div style={{ fontSize:56 }}>💬</div>
            <div style={{ fontFamily:H, fontWeight:900, fontSize:18, color:'var(--text-primary,#F1F5F9)' }}>
              No conversations yet
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-muted,#64748B)', lineHeight:1.7 }}>
              Start a conversation from a student's profile or the leaderboard.
            </div>
            <button onClick={() => navigate(leaderboardRoute)} style={{
              marginTop:8, padding:'12px 28px', borderRadius:24,
              background:'linear-gradient(135deg,#0D9488,#0f766e)',
              border:'none', color:'#fff', fontFamily:H, fontWeight:900,
              fontSize:14, cursor:'pointer',
              boxShadow:'0 4px 16px rgba(13,148,136,0.35)',
            }}>
              🏆 Go to Leaderboard
            </button>
          </div>
        ) : threads.map((t, i) => (
          <button
            key={t.id}
            className={`thread-row${t.unread > 0 ? ' has-unread' : ''}`}
            onClick={() => navigate(`${chatBasePath}/${t.otherUid}`, { state:{ name:t.theirName, school:t.theirSchool } })}
            style={{
              display:'flex', alignItems:'center', gap:14,
              width:'100%', textAlign:'left',
              background:'none', border:'none', cursor:'pointer',
              padding:'12px 16px',
              borderBottom:'1px solid var(--border,rgba(255,255,255,0.05))',
              transition:'background 0.12s',
              animation:`fadeUp 0.2s ease ${i * 0.04}s both`,
            }}
          >
            {/* Avatar with online dot placeholder */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <Avatar name={t.theirName} size={50} />
            </div>

            {/* Name + last message */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                  <span style={{
                    fontFamily:H, fontWeight:900,
                    fontSize:15, color:'var(--text-primary,#F1F5F9)',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  }}>
                    {t.theirName}
                  </span>
                  {/* NEW pill — only shown when there are unread messages */}
                  {t.unread > 0 && <span className="new-pill">NEW</span>}
                </div>
                <span style={{
                  fontSize:11, fontWeight: t.unread > 0 ? 900 : 700,
                  color: t.unread > 0 ? '#2dd4bf' : 'var(--text-muted,#64748B)',
                  flexShrink:0,
                }}>
                  {timeAgo(t.updatedAt)}
                </span>
              </div>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <span style={{
                  fontSize:13, fontWeight: t.unread > 0 ? 700 : 400,
                  color: t.unread > 0 ? 'var(--text-primary,#E9EDEF)' : 'var(--text-muted,#64748B)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  flex:1,
                }}>
                  {t.lastSenderId === myUid ? '🫵 ' : ''}
                  {t.lastMessage === '🎤 Voice message' ? '🎤 Voice message'
                    : t.lastMessage === '📷 Photo' ? '📷 Photo'
                    : t.lastMessage || 'Tap to chat'}
                </span>

                {/* Unread badge */}
                {t.unread > 0 && (
                  <div style={{
                    minWidth:20, height:20, borderRadius:10,
                    background:'#0D9488', color:'#fff',
                    fontSize:11, fontWeight:900, fontFamily:H,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    padding:'0 5px', flexShrink:0,
                  }}>
                    {t.unread > 99 ? '99+' : t.unread}
                  </div>
                )}
              </div>

              {/* School tag */}
              {t.theirSchool ? (
                <div style={{
                  fontSize:11, fontWeight:700,
                  color:'var(--text-muted,#475569)', marginTop:3,
                }}>
                  🏫 {t.theirSchool}
                </div>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
