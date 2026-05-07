// src/components/student/BookmarksPage.jsx
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function BookmarksPage() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'bookmarks'),
          where('userId', '==', user.uid),
        ));
        const bm = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Enrich with question data
        const qIds = [...new Set(bm.map(b => b.questionId))];
        const qDocs = await Promise.all(
          qIds.map(id => getDocs(query(collection(db, 'questions'), where('__name__', '==', id))))
        );
        const qMap = {};
        qDocs.forEach(snap => snap.docs.forEach(d => { qMap[d.id] = { id: d.id, ...d.data() }; }));
        setBookmarks(bm.map(b => ({ ...b, question: qMap[b.questionId] || null })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const removeBookmark = async (id) => {
    try {
      await deleteDoc(doc(db, 'bookmarks', id));
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error(e); }
  };

  const filtered = bookmarks.filter(b =>
    !search || b.question?.question?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>🔖 Bookmarked Questions</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>{bookmarks.length} saved questions</p>
        </div>
        <input className="form-input" placeholder="🔍 Search bookmarks…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 250 }} />
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: 40 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>🔖</div>
          <p style={{ marginTop: 12 }}>
            {bookmarks.length === 0 ? 'No bookmarks yet. Click the bookmark icon during exams!' : 'No matching questions.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(b => {
            const q   = b.question;
            const cat = NURSING_CATEGORIES.find(c => c.id === q?.category);
            return (
              <div key={b.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  {cat && <span style={{ fontSize: 13, color: cat.color, fontWeight: 700 }}>{cat.icon} {cat.shortLabel}</span>}
                  {q?.subject && <span className="badge badge-blue" style={{ fontSize: 10 }}>{q.subject}</span>}
                  {q?.year && <span className="badge badge-gold" style={{ fontSize: 10 }}>{q.year}</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                  {q?.question || 'Question not found'}
                </div>
                {q?.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {q.options.map((opt, i) => (
                      <div key={i} style={{
                        fontSize: 13, padding: '6px 10px', borderRadius: 6,
                        background: i === q.correctIndex ? 'rgba(22,163,74,0.1)' : 'var(--bg-tertiary)',
                        color: i === q.correctIndex ? 'var(--green)' : 'var(--text-secondary)',
                        fontWeight: i === q.correctIndex ? 700 : 400,
                        border: `1px solid ${i === q.correctIndex ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                      }}>
                        {String.fromCharCode(65 + i)}. {opt} {i === q.correctIndex && '✓'}
                      </div>
                    ))}
                  </div>
                )}
                {q?.explanation && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px' }}>
                    💡 {q.explanation}
                  </div>
                )}
                <button
                  className="btn btn-danger btn-sm"
                  style={{ position: 'absolute', top: 14, right: 14 }}
                  onClick={() => removeBookmark(b.id)}
                >
                  🗑️
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
