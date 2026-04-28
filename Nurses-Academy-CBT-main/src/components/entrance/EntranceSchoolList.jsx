// src/components/entrance/EntranceSchoolList.jsx
// Route: /entrance-exam/schools
// Shows all schools alphabetically with search, filter, and alphabet jump bar.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function EntranceSchoolList() {
  const navigate = useNavigate();
  const [schools, setSchools]   = useState([]);
  const [search,  setSearch]    = useState('');
  const [loading, setLoading]   = useState(true);
  const [jumpLetter, setJump]   = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'entranceExamSchools'),
          orderBy('name', 'asc'),
        ));
        // isActive !== false means: show schools where field is true OR missing (backwards compat)
        setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.isActive !== false));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return schools;
    const q = search.toLowerCase();
    return schools.filter(s => s.name?.toLowerCase().includes(q) || s.state?.toLowerCase().includes(q));
  }, [schools, search]);

  // Group by first letter
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const letter = (s.name?.[0] || '#').toUpperCase();
      if (!map[letter]) map[letter] = [];
      map[letter].push(s);
    });
    return map;
  }, [filtered]);

  const letters = Object.keys(grouped).sort();

  const handleSchoolClick = (school) => {
    navigate('/entrance-exam/setup', { state: { school } });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      {/* Back */}
      <button onClick={() => navigate('/entrance-exam')} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)',
        fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>← Back to Entrance Exam Hub</button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
          🏫 Select a Nursing School
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          {loading ? 'Loading schools…' : `${schools.length} school${schools.length !== 1 ? 's' : ''} available — click one to start practicing`}
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
        <input
          type="text"
          placeholder="Search schools by name or state…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ paddingLeft: 42, width: '100%', boxSizing: 'border-box' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16,
          }}>✕</button>
        )}
      </div>

      {/* Alphabet jump bar */}
      {!search && letters.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20,
          padding: '10px 14px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {letters.map(l => (
            <button
              key={l}
              onClick={() => {
                setJump(l);
                document.getElementById(`letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                width: 30, height: 30, borderRadius: 6, border: '1.5px solid',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                borderColor: jumpLetter === l ? 'var(--teal)' : 'var(--border)',
                background:  jumpLetter === l ? 'rgba(13,148,136,0.15)' : 'var(--bg-tertiary)',
                color:       jumpLetter === l ? 'var(--teal)' : 'var(--text-secondary)',
              }}
            >{l}</button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Loading schools…
        </div>
      )}

      {/* Empty search */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>No school found for "{search}"</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>The school may not be available yet.</p>
          <button
            onClick={() => {/* TODO: school request */}}
            className="btn btn-ghost"
          >📩 Request This School</button>
        </div>
      )}

      {/* School list grouped by letter */}
      {!loading && letters.map(letter => (
        <div key={letter} id={`letter-${letter}`} style={{ marginBottom: 24 }}>
          {/* Letter header */}
          <div style={{
            fontWeight: 800, fontSize: 13, color: 'var(--teal)', letterSpacing: 1,
            textTransform: 'uppercase', borderBottom: '2px solid var(--teal)',
            paddingBottom: 6, marginBottom: 10, display: 'inline-block',
          }}>{letter}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grouped[letter].map(school => (
              <SchoolCard key={school.id} school={school} onClick={() => handleSchoolClick(school)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SchoolCard({ school, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: hov ? 'rgba(13,148,136,0.06)' : 'var(--bg-card)',
        border: `1.5px solid ${hov ? 'rgba(13,148,136,0.4)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        transform: hov ? 'translateX(4px)' : 'translateX(0)',
        transition: 'background .2s, border-color .2s, transform .2s',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: 'rgba(13,148,136,0.12)', border: '1.5px solid rgba(13,148,136,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>🏫</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {school.name}
          {school.isNew && (
            <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '1px 7px' }}>
              🆕 New
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {school.state && <span>📍 {school.state}</span>}
          {school.questionCount > 0 && <span>❓ {school.questionCount} questions</span>}
          {school.yearsAvailable && <span>📅 {school.yearsAvailable}</span>}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ color: 'var(--teal)', fontWeight: 900, fontSize: 18, opacity: hov ? 1 : 0.3, transition: 'opacity .2s' }}>→</div>
    </div>
  );
}
