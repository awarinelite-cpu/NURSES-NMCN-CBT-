// src/components/student/ChatPage.jsx
// Route: /chat/:uid
// Real-time 1-on-1 chat between the logged-in student and any other student.
//
// Firestore structure:
//   directChats/{chatId}/messages/{messageId}
//   chatId = sorted([myUid, theirUid]).join('_')
//
// Firestore rules needed (add to firestore.rules):
//   match /directChats/{chatId} {
//     allow read, write: if isAuth() && chatId.matches('.*' + request.auth.uid + '.*');
//     match /messages/{msgId} {
//       allow read, write: if isAuth() && get(/databases/$(database)/documents/directChats/$(chatId)).data.participants.hasAny([request.auth.uid]);
//     }
//   }

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate }       from 'react-router-dom';
import {
  collection, doc, getDoc, addDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, updateDoc, setDoc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── helpers ── */
function getChatId(a, b) {
  return [a, b].sort().join('_');
}

function timeLabel(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ── sub-components ── */
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid rgba(13,148,136,0.15)',
        borderTopColor: '#0D9488',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function Avatar({ name = '', size = 38 }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: H, fontWeight: 900, color: '#fff',
      fontSize: size * 0.38,
    }}>
      {initials}
    </div>
  );
}

function Bubble({ msg, isMe, theirName }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMe ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 12,
      animation: 'bubblePop 0.22s ease',
    }}>
      {!isMe && <Avatar name={theirName} size={30} />}
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isMe
            ? 'linear-gradient(135deg, #0D9488, #0891B2)'
            : 'var(--bg-secondary, rgba(255,255,255,0.06))',
          border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
          color: isMe ? '#fff' : 'var(--text-primary, #F1F5F9)',
          fontFamily: F, fontWeight: 700, fontSize: 14,
          lineHeight: 1.55,
          boxShadow: isMe ? '0 2px 12px rgba(13,148,136,0.3)' : 'none',
          wordBreak: 'break-word',
        }}>
          {msg.text}
        </div>
        <div style={{
          fontSize: 10, fontFamily: F, fontWeight: 700,
          color: 'var(--text-muted, #64748B)',
          marginTop: 4, paddingLeft: 2,
        }}>
          {timeLabel(msg.createdAt)}
          {isMe && msg.read && (
            <span style={{ marginLeft: 5, color: '#0D9488' }}>✓✓</span>
          )}
          {isMe && !msg.read && (
            <span style={{ marginLeft: 5, color: '#64748B' }}>✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      margin: '16px 0', padding: '0 4px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      <span style={{
        fontSize: 11, fontFamily: F, fontWeight: 700,
        color: 'var(--text-muted, #64748B)',
        padding: '3px 10px',
        background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
        borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );
}

/* ── Main component ── */
export default function ChatPage() {
  const { uid: theirUid }  = useParams();
  const { state }           = useLocation();
  const { user, profile }   = useAuth();
  const navigate            = useNavigate();

  const myUid     = user?.uid;
  const chatId    = myUid && theirUid ? getChatId(myUid, theirUid) : null;

  const [theirProfile, setTheirProfile] = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [sendError,    setSendError]    = useState('');
  const [typing,       setTyping]       = useState(false);  // they are typing
  const [myTyping,     setMyTyping]     = useState(false);

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const typingTimer  = useRef(null);

  /* names / display */
  const theirName   = state?.name || theirProfile?.name || theirProfile?.displayName || 'Student';
  const theirSchool = state?.school || theirProfile?.school || '';
  const myName      = profile?.name || user?.displayName || 'Me';

  /* ── Load their profile ── */
  useEffect(() => {
    if (!theirUid) return;
    getDoc(doc(db, 'users', theirUid))
      .then(snap => { if (snap.exists()) setTheirProfile(snap.data()); })
      .catch(console.error);
  }, [theirUid]);

  /* ── Ensure chat document exists ── */
  useEffect(() => {
    if (!chatId || !myUid) return;
    const chatRef = doc(db, 'directChats', chatId);
    setDoc(chatRef, {
      participants: [myUid, theirUid],
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(console.error);
  }, [chatId, myUid, theirUid]);

  /* ── Realtime messages listener ── */
  useEffect(() => {
    if (!chatId) return;
    setLoading(true);
    const q = query(
      collection(db, 'directChats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200),
    );
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setLoading(false);
      // Mark unread messages from them as read
      snap.docs.forEach(d => {
        const m = d.data();
        if (m.senderId !== myUid && !m.read) {
          updateDoc(d.ref, { read: true }).catch(() => {});
        }
      });
    }, err => {
      console.error('Chat listener error:', err);
      setLoading(false);
    });
    return unsub;
  }, [chatId, myUid]);

  /* ── Typing indicator listener ── */
  useEffect(() => {
    if (!chatId || !theirUid) return;
    const typingRef = doc(db, 'directChats', chatId, 'typing', theirUid);
    const unsub = onSnapshot(typingRef, snap => {
      if (!snap.exists()) { setTyping(false); return; }
      const d = snap.data();
      const isRecent = d.updatedAt?.toDate
        ? (Date.now() - d.updatedAt.toDate().getTime()) < 5000
        : false;
      setTyping(d.isTyping && isRecent);
    });
    return unsub;
  }, [chatId, theirUid]);

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [messages, loading]);

  /* ── Send typing indicator ── */
  const updateTyping = useCallback(async (isTyping) => {
    if (!chatId || !myUid) return;
    try {
      await setDoc(
        doc(db, 'directChats', chatId, 'typing', myUid),
        { isTyping, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (_) {}
  }, [chatId, myUid]);

  const handleInput = (e) => {
    setText(e.target.value);
    if (!myTyping) {
      setMyTyping(true);
      updateTyping(true);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setMyTyping(false);
      updateTyping(false);
    }, 2500);
  };

  /* ── Send message ── */
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chatId || !myUid || sending) return;
    setText('');
    setSending(true);
    clearTimeout(typingTimer.current);
    updateTyping(false);
    setMyTyping(false);

    setSendError('');
    try {
      await addDoc(collection(db, 'directChats', chatId, 'messages'), {
        text: trimmed,
        senderId: myUid,
        senderName: myName,
        createdAt: serverTimestamp(),
        read: false,
      });
      // Update chat metadata
      await setDoc(doc(db, 'directChats', chatId), {
        participants: [myUid, theirUid],
        lastMessage: trimmed,
        lastSenderId: myUid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('Send error:', e);
      setText(trimmed); // restore on failure
      setSendError('Message failed to send. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── Group messages by date ── */
  function groupByDate(msgs) {
    const groups = [];
    let lastDate = '';
    msgs.forEach(msg => {
      const d = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
      const dateStr = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (dateStr !== lastDate) {
        groups.push({ type: 'date', label: dateStr, key: dateStr });
        lastDate = dateStr;
      }
      groups.push({ type: 'msg', ...msg });
    });
    return groups;
  }

  const grouped = groupByDate(messages);

  /* ── UI ── */
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 60px)',
      background: 'var(--bg-primary, #020B18)',
      color: 'var(--text-primary, #F1F5F9)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bubblePop {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-5px); }
        }
        .send-btn:hover  { background: #0F766E !important; }
        .send-btn:active { transform: scale(0.93) !important; }
        .chat-input:focus { outline: none; border-color: #0D9488 !important; }
        .chat-input { resize: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--bg-card, #0B1826)',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: '#0D9488', padding: '2px 4px',
            fontWeight: 700, lineHeight: 1, flexShrink: 0,
          }}
        >←</button>

        <Avatar name={theirName} size={42} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: H, fontWeight: 900, fontSize: 'clamp(1rem,3vw,1.25rem)',
            color: 'var(--text-primary, #F1F5F9)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {theirName}
          </div>
          <div style={{
            fontSize: 12, fontFamily: F, fontWeight: 700,
            color: typing ? '#0D9488' : 'var(--text-muted, #64748B)',
            transition: 'color 0.2s',
          }}>
            {typing ? '✍️ typing…' : theirSchool || 'Nursing Student'}
          </div>
        </div>

        {/* View profile shortcut */}
        <button
          onClick={() => navigate(`/student/${theirUid}`, { state: { name: theirName, school: theirSchool } })}
          style={{
            background: 'rgba(13,148,136,0.12)',
            border: '1px solid rgba(13,148,136,0.3)',
            borderRadius: 8, padding: '6px 10px',
            cursor: 'pointer', color: '#0D9488',
            fontSize: 12, fontFamily: F, fontWeight: 700,
            flexShrink: 0,
          }}
        >
          👤 Profile
        </button>
      </div>

      {/* ── Messages area ── */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '16px 14px 8px',
        display: 'flex', flexDirection: 'column',
      }}>
        {loading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14, textAlign: 'center', padding: 32,
          }}>
            <div style={{ fontSize: 54 }}>💬</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color: 'var(--text-primary, #F1F5F9)' }}>
              Start a conversation
            </div>
            <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: 'var(--text-muted, #64748B)', maxWidth: 260, lineHeight: 1.6 }}>
              Send a message to {theirName} and start discussing nursing topics, share exam tips, and more!
            </div>
          </div>
        ) : (
          <>
            {grouped.map((item, i) =>
              item.type === 'date' ? (
                <DateDivider key={item.key + i} label={item.label} />
              ) : (
                <Bubble
                  key={item.id}
                  msg={item}
                  isMe={item.senderId === myUid}
                  theirName={theirName}
                />
              )
            )}

            {/* Typing indicator bubble */}
            {typing && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
                <Avatar name={theirName} size={30} />
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '18px 18px 18px 4px',
                  background: 'var(--bg-secondary, rgba(255,255,255,0.06))',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#0D9488', display: 'inline-block',
                      animation: `typingBounce 1.2s ease infinite`,
                      animationDelay: `${i * 0.2}s`,
                    }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Send error banner ── */}
      {sendError && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          borderTop: '1px solid rgba(239,68,68,0.3)',
          padding: '8px 16px',
          fontSize: 12, fontFamily: F, fontWeight: 700,
          color: '#EF4444', textAlign: 'center',
          flexShrink: 0,
        }}>
          ⚠️ {sendError}
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={{
        background: 'var(--bg-card, #0B1826)',
        borderTop: '1px solid var(--border, rgba(255,255,255,0.07))',
        padding: '12px 14px',
        display: 'flex', alignItems: 'flex-end', gap: 10,
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKey}
          placeholder={`Message ${theirName}…`}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--bg-secondary, rgba(255,255,255,0.05))',
            border: '1.5px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 22,
            padding: '10px 16px',
            color: 'var(--text-primary, #F1F5F9)',
            fontFamily: F, fontWeight: 700, fontSize: 14,
            lineHeight: 1.5,
            maxHeight: 100,
            overflowY: 'auto',
            transition: 'border-color 0.2s',
          }}
          onInput={e => {
            // auto-grow
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          }}
        />
        <button
          className="send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: text.trim() ? '#0D9488' : 'rgba(255,255,255,0.08)',
            border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s, transform 0.12s',
            boxShadow: text.trim() ? '0 3px 14px rgba(13,148,136,0.4)' : 'none',
          }}
          title="Send message"
        >
          {sending ? (
            <div style={{
              width: 18, height: 18,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                stroke={text.trim() ? '#fff' : '#4B5563'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
