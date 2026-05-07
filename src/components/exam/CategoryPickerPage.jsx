// src/components/exam/CategoryPickerPage.jsx
// Step 1 of the Quick Actions flow:
// Student picks a nursing category, then gets sent to ExamConfigPage

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function CategoryPickerPage() {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const examType     = params.get('type') || '';

  const [selected, setSelected] = useState('');
  const [search,   setSearch]   = useState('');

  const filtered = NURSING_CATEGORIES.filter(c =>
    c.shortLabel.toLowerCase().includes(search.toLowerCase()) ||
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id) => {
    setSelected(id);
    setTimeout(() => {
      // Course Drill has its own dedicated page — pass category there
      if (examType === 'course_drill') {
        navigate(`/course-drill?category=${id}`);
        return;
      }
      const next = new URLSearchParams({ category: id });
      if (examType) next.set('type', examType);
      navigate(`/exam/config?${next.toString()}`);
    }, 180);
  };

  const handleContinue = () => {
    if (!selected) return;
    if (examType === 'course_drill') {
      navigate(`/course-drill?category=${selected}`);
      return;
    }
    const next = new URLSearchParams({ category: selected });
    if (examType) next.set('type', examType);
    navigate(`/exam/config?${next.toString()}`);
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--teal)', fontWeight: 700, fontSize: 13,
            padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Dashboard
        </button>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={styles.stepActive}>1</div>
          <div style={styles.stepLine} />
          <div style={styles.stepInactive}>2</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
            {examType === 'course_drill' ? 'Specialty → Course → Exam' : 'Category → Exam Setup'}
          </div>
        </div>

        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 6px', color: 'var(--text-primary)' }}>
          🏥 Choose a Nursing Category
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Select the specialty you want to practise
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 18 }}>
        <input
          className="form-input"
          placeholder="🔍 Search categories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 340 }}
        />
      </div>

      {/* Category grid */}
      <div style={styles.grid}>
        {filtered.map(cat => {
          const active = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              style={{
                ...styles.catBtn,
                borderColor:  active ? cat.color : 'var(--border)',
                background:   active ? `${cat.color}18` : 'var(--bg-card)',
                transform:    active ? 'scale(1.03)' : 'scale(1)',
                boxShadow:    active ? `0 0 0 3px ${cat.color}30` : 'none',
              }}
            >
              {/* Color stripe top */}
              <div style={{
                height: 3, borderRadius: '10px 10px 0 0',
                background: cat.color,
                margin: '-14px -14px 12px',
                opacity: active ? 1 : 0.35,
                transition: 'opacity 0.2s',
              }} />

              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${cat.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, marginBottom: 10,
              }}>
                {cat.icon}
              </div>

              <div style={{
                fontWeight: 700, fontSize: 13,
                color: active ? cat.color : 'var(--text-primary)',
                textAlign: 'center', lineHeight: 1.3, marginBottom: 4,
                transition: 'color 0.2s',
              }}>
                {cat.shortLabel}
              </div>

              <div style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: cat.examType === 'basic' ? 'rgba(13,148,136,0.15)' : 'rgba(124,58,237,0.15)',
                color:      cat.examType === 'basic' ? '#0D9488' : '#7C3AED',
              }}>
                {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
              </div>

              {active && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 20, height: 20, borderRadius: '50%',
                  background: cat.color, color: '#fff',
                  fontSize: 11, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✓</div>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No categories match "{search}"
        </div>
      )}

      {/* Sticky bottom bar */}
      {selected && (
        <div style={styles.stickyBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <span style={{ fontSize: 20 }}>
              {NURSING_CATEGORIES.find(c => c.id === selected)?.icon}
            </span>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Selected</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {NURSING_CATEGORIES.find(c => c.id === selected)?.shortLabel}
              </div>
            </div>
          </div>
          <button className="btn btn-gold" onClick={handleContinue}>
            Continue → Set Up Exam
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  stepActive: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--teal)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
  },
  stepInactive: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
    border: '2px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, flexShrink: 0,
  },
  stepLine: {
    flex: 'none', width: 32, height: 2,
    background: 'var(--border)', borderRadius: 2,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
    paddingBottom: 100, // space for sticky bar
  },
  catBtn: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '14px 14px 12px',
    border: '2px solid', borderRadius: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.18s',
    background: 'var(--bg-card)',
  },
  stickyBar: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: 'linear-gradient(135deg, #1E3A8A, #0D9488)',
    padding: '14px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    zIndex: 100,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
  },
};