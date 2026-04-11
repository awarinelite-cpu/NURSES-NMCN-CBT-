// src/components/exam/CourseDrillPage.jsx
//
// Route: /course-drill
// Students pick a nursing course, then start a focused exam on that course.
// Courses come from DEFAULT_NURSING_COURSES (categories.js) + any extra ones
// admin has added to the Firestore 'courses' collection.

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';

export default function CourseDrillPage() {
  const navigate   = useNavigate();
  const [params]   = useSearchParams();
  const category   = params.get('category') || 'general_nursing';
  const catInfo    = NURSING_CATEGORIES.find(c => c.id === category);

  const [courses,      setCourses]      = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [count,        setCount]        = useState(20);
  const [timeLimit,    setTimeLimit]    = useState(30);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');

  const COUNTS = [10, 20, 30, 50, 100];

  // Load default courses + any custom ones admin added to Firestore
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'courses'), orderBy('label', 'asc')));
        const custom = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Merge: default list first, then any Firestore additions not already in the list
        const defaultIds = DEFAULT_NURSING_COURSES.map(c => c.id);
        const extras     = custom.filter(c => !defaultIds.includes(c.id));
        setCourses([...DEFAULT_NURSING_COURSES, ...extras]);
      } catch (e) {
        // Firestore 'courses' collection may not exist yet — just use defaults
        setCourses(DEFAULT_NURSING_COURSES);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = courses.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleStart = () => {
    if (!selected) return;
    // Send student to the archive page filtered to this course
    // Archive shows all published exams — student picks which one to take
    navigate(`/course-drill-archive?course=${selected.id}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 760 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          ← Back to Categories
        </button>
        {/* Selected specialty pill */}
        {catInfo && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: `${catInfo.color}18`, border: `1.5px solid ${catInfo.color}40`,
            borderRadius: 40, padding: '6px 14px', marginBottom: 14,
          }}>
            <span>{catInfo.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: catInfo.color }}>{catInfo.shortLabel}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📖</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Course Drill
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Pick a course and practice questions specific to that subject.
        </p>
      </div>

      {/* Search */}
      <input
        className="form-input"
        style={{ width: '100%', maxWidth: 320, marginBottom: 20, height: 40 }}
        placeholder="🔍 Search courses…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Course grid */}
      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading courses…</div>
      ) : (
        <div style={styles.grid}>
          {filtered.map(course => {
            const active = selected?.id === course.id;
            return (
              <button
                key={course.id}
                onClick={() => setSelected(course)}
                style={{
                  ...styles.courseBtn,
                  borderColor:  active ? 'var(--teal)' : 'var(--border)',
                  background:   active ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)',
                  boxShadow:    active ? '0 0 0 3px rgba(13,148,136,0.2)' : 'none',
                  transform:    active ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                <div style={{ position: 'absolute', top: 8, right: 8, opacity: active ? 1 : 0, transition: 'opacity 0.2s' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'var(--teal)', color: '#fff',
                    fontSize: 11, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✓</div>
                </div>
                <span style={{ fontSize: 28, marginBottom: 8 }}>{course.icon || '📖'}</span>
                <span style={{
                  fontWeight: 700, fontSize: 13, textAlign: 'center', lineHeight: 1.3,
                  color: active ? 'var(--teal)' : 'var(--text-primary)',
                }}>{course.label}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No courses match "{search}"
            </div>
          )}
        </div>
      )}

      {/* Settings + Start — shows when course selected */}
      {selected && (
        <div style={styles.settingsPanel}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
            {selected.icon || '📖'} {selected.label}
          </div>

          {/* Question count */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Number of Questions
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COUNTS.map(n => (
                <button key={n} onClick={() => setCount(n)} style={{
                  padding: '7px 16px', borderRadius: 8, border: '2px solid',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  borderColor: count === n ? 'var(--teal)' : 'var(--border)',
                  background:  count === n ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                  color:       count === n ? 'var(--teal)' : 'var(--text-secondary)',
                }}>
                  {n} Qs
                </button>
              ))}
            </div>
          </div>

          {/* Time limit */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Time Limit
            </div>
            <select
              className="form-input form-select"
              value={timeLimit}
              onChange={e => setTimeLimit(Number(e.target.value))}
              style={{ maxWidth: 200 }}
            >
              <option value={0}>No Timer</option>
              <option value={15}>15 mins</option>
              <option value={30}>30 mins</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleStart} style={{ fontSize: 15, padding: '13px' }}>
            🚀 Start Course Drill — {selected.label}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12, marginBottom: 28,
  },
  courseBtn: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '18px 12px 14px',
    border: '2px solid', borderRadius: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.18s',
  },
  settingsPanel: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '20px 20px',
    marginTop: 8,
  },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};