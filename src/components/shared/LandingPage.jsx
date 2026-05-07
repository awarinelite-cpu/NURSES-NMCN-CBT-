// src/components/shared/LandingPage.jsx
import { Link } from 'react-router-dom';
import { NURSING_CATEGORIES, ACCESS_PLANS } from '../../data/categories';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#020B18', color: '#fff' }}>
      {/* Navbar */}
      <nav style={{ padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(13,148,136,0.3)', position: 'sticky', top: 0, zIndex: 10, background: '#010810' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>📚</span>
          NMCN<span style={{ color: '#14B8A8' }}>CBT</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/auth" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Sign In</Link>
          <Link to="/auth" className="btn btn-primary btn-sm">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        minHeight: '88vh', display: 'flex', alignItems: 'center',
        background: 'radial-gradient(ellipse at 30% 50%, rgba(13,148,136,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(30,58,138,0.2) 0%, transparent 60%)',
        padding: '60px 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B', color: '#FCD34D', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '6px 16px', borderRadius: 20, marginBottom: 20 }}>
              🏥 Nigeria's #1 NMCN CBT Platform
            </div>
            <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', fontSize: 'clamp(2rem,5vw,3.2rem)', lineHeight: 1.25, marginBottom: 20 }}>
              Ace Your <span style={{ color: '#14B8A8' }}>NMCN</span> Nursing Exam with Smart CBT Prep
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, lineHeight: 1.8, marginBottom: 28, maxWidth: 520 }}>
              Thousands of past questions (2020–2025), AI-powered explanations, timed mock exams, and real-time performance analytics — all 17 nursing specialties covered.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/auth" className="btn btn-primary btn-lg">🚀 Start Free Trial</Link>
              <Link to="/auth" className="btn btn-outline btn-lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>📖 View Plans</Link>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[['10,000+','Questions'],['17','Specialties'],['2020–2025','Past Questions'],['AI','Explanations']].map(([v,l]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 900, color: '#14B8A8' }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { icon: '⏱️', title: 'Timed Simulation', desc: 'Real exam-like timer pressure' },
              { icon: '🤖', title: 'AI Explanations',  desc: 'Understand every answer deeply' },
              { icon: '📊', title: 'Analytics',        desc: 'Track weak areas & progress' },
              { icon: '🔖', title: 'Bookmarks',        desc: 'Save hard questions for review' },
              { icon: '📱', title: 'Works Offline',    desc: 'Study anywhere without data' },
              { icon: '🏆', title: 'Leaderboard',      desc: 'Compete with other students' },
            ].map(f => (
              <div key={f.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 14px' }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section style={{ padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff' }}>17 Nursing Specialties Covered</h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15 }}>General Nursing + all Post-Basic specialties</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            {NURSING_CATEGORIES.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${c.color}12`, border: `1px solid ${c.color}30`, borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.shortLabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff' }}>Simple, Affordable Plans</h2>
            <p style={{ color: 'rgba(255,255,255,0.55)' }}>Pay once via bank transfer — no recurring charges</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 18 }}>
            {ACCESS_PLANS.map(p => (
              <div key={p.id} style={{
                background: p.popular ? `${p.color}15` : 'rgba(255,255,255,0.04)',
                border: `2px solid ${p.popular ? p.color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16, padding: '24px 20px', position: 'relative',
              }}>
                {p.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: p.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>⭐ POPULAR</div>}
                <div style={{ fontWeight: 900, fontSize: 15, color: '#fff', marginBottom: 6 }}>{p.label}</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: p.price === 0 ? '1.6rem' : '1.9rem', fontWeight: 900, color: p.color, marginBottom: 4 }}>
                  {p.price === 0 ? 'FREE' : `₦${p.price.toLocaleString()}`}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>{p.duration}</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 6 }}>
                      <span style={{ color: p.color }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth" className="btn btn-sm btn-full" style={{ marginTop: 16, background: p.color, color: '#fff', border: 'none', fontFamily: 'inherit' }}>
                  {p.id === 'free' ? 'Start Free' : 'Get Plan'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', marginBottom: 12 }}>
          Ready to Pass Your NMCN Exam?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>Join thousands of nursing students who have used NMCN CBT to succeed</p>
        <Link to="/auth" className="btn btn-primary btn-lg">🚀 Start Preparing Today — It's Free</Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(13,148,136,0.3)', padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
        © {new Date().getFullYear()} NMCN CBT Platform · Built for Nigerian Nursing Students
      </footer>
    </div>
  );
}
