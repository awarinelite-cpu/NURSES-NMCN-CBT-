// src/components/shared/LandingPage.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [hovNmcn, setHovNmcn] = useState(false);
  const [hovEntrance, setHovEntrance] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#020B18', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* ── Navbar ── */}
      <nav style={{
        padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(13,148,136,0.3)',
        position: 'sticky', top: 0, zIndex: 10, background: '#010810',
      }}>
        <div style={{
          fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>📚</span>
          Nurses<span style={{ color: '#14B8A8' }}>Academy</span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
          🏥 Nigeria's #1 Nursing Exam Prep
        </div>
      </nav>

      {/* ── Main Content: Two Big Banners ── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
        background: 'radial-gradient(ellipse at 30% 50%, rgba(13,148,136,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(30,58,138,0.18) 0%, transparent 60%)',
      }}>
        <div style={{
          maxWidth: 900, width: '100%',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 28,
        }}>

          {/* ═══════════════════════════════════════════════════════════
              BANNER 1: NMCN CBT
          ═══════════════════════════════════════════════════════════ */}
          <div
            onClick={() => navigate('/auth?redirect=/dashboard')}
            onMouseEnter={() => setHovNmcn(true)}
            onMouseLeave={() => setHovNmcn(false)}
            style={{
              background: hovNmcn
                ? 'linear-gradient(135deg, #0F3460 0%, #0D5C45 100%)'
                : 'linear-gradient(135deg, #0C2340 0%, #064534 100%)',
              border: `2px solid ${hovNmcn ? 'rgba(13,148,136,0.6)' : 'rgba(13,148,136,0.25)'}`,
              borderRadius: 24, padding: '36px 32px',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
              transition: 'all .35s ease',
              boxShadow: hovNmcn ? '0 12px 40px rgba(13,148,136,0.25)' : '0 4px 16px rgba(0,0,0,0.3)',
              transform: hovNmcn ? 'translateY(-6px)' : 'translateY(0)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            {/* Glow */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at 85% 50%, rgba(13,148,136,0.22) 0%, transparent 60%)',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
                color: '#FCD34D', fontSize: 11, fontWeight: 700,
                letterSpacing: 1, textTransform: 'uppercase',
                padding: '5px 14px', borderRadius: 20, marginBottom: 14,
              }}>
                🏥 NMCN CBT
              </div>

              <h2 style={{
                fontFamily: "'Playfair Display',serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 900, color: '#fff', lineHeight: 1.2, margin: 0,
              }}>
                NMCN CBT <span style={{ color: '#14B8A8' }}>Platform</span>
              </h2>

              <p style={{
                color: 'rgba(255,255,255,0.65)', fontSize: 14,
                lineHeight: 1.7, marginTop: 10, maxWidth: 340,
              }}>
                Thousands of past questions (2020–2025), AI-powered explanations, timed mock exams, and real-time performance analytics — all 17 nursing specialties covered.
              </p>

              {/* Stats pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {['10,000+ Questions', '17 Specialties', 'AI Explanations'].map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, fontWeight: 700, color: '#5EEAD4',
                    background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.3)',
                    borderRadius: 20, padding: '4px 10px',
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* CTA Button */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 'auto', paddingTop: 8,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              }}>
                For NMCN-registered nursing students
              </span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(13,148,136,0.2)', border: '1.5px solid rgba(13,148,136,0.4)',
                borderRadius: 12, padding: '10px 18px',
                color: '#5EEAD4', fontWeight: 800, fontSize: 14,
                transform: hovNmcn ? 'translateX(4px)' : 'translateX(0)',
                transition: 'transform .25s',
              }}>
                Enter →
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              BANNER 2: ENTRANCE EXAM
          ═══════════════════════════════════════════════════════════ */}
          <div
            onClick={() => navigate('/auth?redirect=/entrance-exam')}
            onMouseEnter={() => setHovEntrance(true)}
            onMouseLeave={() => setHovEntrance(false)}
            style={{
              background: hovEntrance
                ? 'linear-gradient(135deg, #3D0C60 0%, #5C0D45 100%)'
                : 'linear-gradient(135deg, #240C40 0%, #450634 100%)',
              border: `2px solid ${hovEntrance ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.25)'}`,
              borderRadius: 24, padding: '36px 32px',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
              transition: 'all .35s ease',
              boxShadow: hovEntrance ? '0 12px 40px rgba(168,85,247,0.25)' : '0 4px 16px rgba(0,0,0,0.3)',
              transform: hovEntrance ? 'translateY(-6px)' : 'translateY(0)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            {/* Glow */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at 85% 50%, rgba(168,85,247,0.22) 0%, transparent 60%)',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(168,85,247,0.15)', border: '1px solid #A855F7',
                color: '#C4B5FD', fontSize: 11, fontWeight: 700,
                letterSpacing: 1, textTransform: 'uppercase',
                padding: '5px 14px', borderRadius: 20, marginBottom: 14,
              }}>
                🏫 ENTRANCE EXAM
              </div>

              <h2 style={{
                fontFamily: "'Playfair Display',serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 900, color: '#fff', lineHeight: 1.2, margin: 0,
              }}>
                Nursing Schools <span style={{ color: '#C4B5FD' }}>Entrance Exam</span>
              </h2>

              <p style={{
                color: 'rgba(255,255,255,0.65)', fontSize: 14,
                lineHeight: 1.7, marginTop: 10, maxWidth: 340,
              }}>
                Past questions & daily mock exams for nursing school entrance. Practice smart, pass first, and enter your dream school with confidence.
              </p>

              {/* Stats pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {['7+ Schools', '3,168+ Questions', 'Updated 2025'].map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, fontWeight: 700, color: '#C4B5FD',
                    background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: 20, padding: '4px 10px',
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* CTA Button */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 'auto', paddingTop: 8,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              }}>
                For aspiring nursing school students
              </span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(168,85,247,0.2)', border: '1.5px solid rgba(168,85,247,0.4)',
                borderRadius: 12, padding: '10px 18px',
                color: '#C4B5FD', fontWeight: 800, fontSize: 14,
                transform: hovEntrance ? 'translateX(4px)' : 'translateX(0)',
                transition: 'transform .25s',
              }}>
                Enter →
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(13,148,136,0.3)',
        padding: '20px 24px', textAlign: 'center',
        color: 'rgba(255,255,255,0.35)', fontSize: 13,
      }}>
        © {new Date().getFullYear()} Nurses Academy · Built for Nigerian Nursing Students
      </footer>
    </div>
  );
}
