// src/components/entrance/EntranceGroupChatHub.jsx
// Route: /entrance-exam/group-chat
// Hub showing all 6 entrance exam subject subgroups.
// No page switching — entrance exam only.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, doc, onSnapshot, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// The 6 entrance exam subjects as subgroups
export const ENTRANCE_GROUP_SUBJECTS = [
  { id: 'entrance_english',     label: 'Use of English',          icon: '📖', color: '#0D9488' },
  { id: 'entrance_biology',     label: 'Biology',                  icon: '🧬', color: '#16A34A' },
  { id: 'entrance_chemistry',   label: 'Chemistry',                icon: '⚗️', color: '#7C3AED' },
  { id: 'entrance_physics',     label: 'Physics',                  icon: '⚡', color: '#2563EB' },
  { id: 'entrance_mathematics', label: 'Mathematics',              icon: '📐', color: '#D97706' },
  { id: 'entrance_general',     label: 'General Knowledge',        icon: '🌍', color: '#DC2626' },
];

function Avatar({ icon, color, size = 48 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42,
      boxShadow: `0 4px 12px ${color}44`,
    }}>{icon}</div>
  );
}

function GroupCard({ group, lastMsg, unread, onJoin }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => onJoin(group)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderLeft: unread ? `3px solid ${group.color}` : '3px solid transparent',
      }}
    >
      <Avatar icon={group.icon} color={group.color} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: H, fontWeight: 900,
          fontSize: 'clamp(0.85rem,2.2vw,1rem)',
          color: '#E9EDEF',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{group.label}</div>
        <div style={{
          fontSize: 12, fontFamily: F, fontWeight: 700,
          color: '#8696A0', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {lastMsg ? (
            <><span style={{ color: '#aaa' }}>{lastMsg.senderName?.split(' ')[0]}:</span> {lastMsg.preview}</>
          ) : (
            'Tap to join discussion →'
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {lastMsg?.time && (
          <div style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: '#8696A0' }}>
            {lastMsg.time}
          </div>
        )}
        {unread > 0 && (
          <div style={{
            background: group.color,
            color: '#fff', borderRadius: 20,
            minWidth: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontFamily: H, fontWeight: 900,
            padding: '0 6px',
          }}>{unread > 99 ? '99+' : unread}</div>
        )}
      </div>
    </div>
  );
}

export default function EntranceGroupChatHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [groupMeta, setGroupMeta] = useState({});

  // Listen to last-message meta for each entrance group
  useEffect(() => {
    if (!user) return;
    const unsubs = ENTRANCE_GROUP_SUBJECTS.map(grp => {
      const metaRef = doc(db, 'entranceGroupChats', grp.id);
      return onSnapshot(metaRef, snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        const unreadMap = d.unreadCounts || {};
        const unread = unreadMap[user.uid] || 0;
        let time = '';
        if (d.updatedAt) {
          const ts = d.updatedAt.toDate ? d.updatedAt.toDate() : new Date(d.updatedAt);
          const now = new Date();
          if (ts.toDateString() === now.toDateString()) {
            time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else {
            time = ts.toLocaleDateString([], { day: 'numeric', month: 'short' });
          }
        }
        setGroupMeta(prev => ({
          ...prev,
          [grp.id]: {
            unread,
            lastMsg: d.lastMessage ? {
              preview: d.lastMessage,
              senderName: d.lastSenderName || '',
              time,
            } : null,
          },
        }));
      }, () => {});
    });
    return () => unsubs.forEach(u => u());
  }, [user]);

  const filtered = ENTRANCE_GROUP_SUBJECTS.filter(g =>
    !search || g.label.toLowerCase().includes(search.toLowerCase())
  );

  const joinGroup = (group) => {
    navigate(`/entrance-exam/group-chat/${group.id}`, { state: { group } });
  };

  const totalUnread = Object.values(groupMeta).reduce((s, m) => s + (m?.unread || 0), 0);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - 60px)',
      background: '#0B141A',
      color: '#E9EDEF',
      fontFamily: F,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: '#1F2C34',
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: '#E9EDEF' }}>
              💬 Entrance Exam Chats
            </div>
            <div style={{ fontSize: 12, color: '#8696A0', fontFamily: F, fontWeight: 700, marginTop: 2 }}>
              {ENTRANCE_GROUP_SUBJECTS.length} subject groups
              {totalUnread > 0 && (
                <span style={{ marginLeft: 8, background: '#0D9488', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>
                  {totalUnread} new
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#2A3942',
              border: 'none', borderRadius: 22,
              padding: '9px 14px 9px 36px',
              color: '#E9EDEF',
              fontFamily: F, fontWeight: 700, fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Group list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map(group => (
          <GroupCard
            key={group.id}
            group={group}
            lastMsg={groupMeta[group.id]?.lastMsg}
            unread={groupMeta[group.id]?.unread || 0}
            onJoin={joinGroup}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: '#8696A0', fontFamily: F, fontWeight: 700 }}>
            No groups match your search.
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}
