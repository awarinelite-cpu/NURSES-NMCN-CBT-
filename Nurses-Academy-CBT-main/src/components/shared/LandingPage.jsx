// src/components/shared/LandingPage.jsx
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { NURSING_CATEGORIES, ACCESS_PLANS } from '../../data/categories';

function PlatformBanner({ platform, icon, title, subtitle, tags, gradient, accentColor, borderColor, glowColor, delay }) {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={() => navigate(`/auth?platform=${platform}`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 300px',
        background: hov ? gradient.hover : gradient.base,
        border: `2px solid ${hov ? borderColor.hover : borderColor.base}`,
        borderRadius: 20,
        padding: 'clamp(24px, 4vw, 36px)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hov ? `0 12px 48px ${glowColor}` : '0 4px 24px rgba(0,0,0,0.3)',
        transition: 'all 0.3s ease',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse at 80% 30%, ${glowColor} 0%, transparent 60%)`,
        opacity: hov ? 1 : 0.5,
        transition: 'opacity 0.3s',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, flexShrink: 0,
            background: `${accentColor}25`,
            border: `2px solid ${accentColor}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            boxShadow: hov ? `0 0 20px ${accentColor}44` : 'none',
            transition: 'box-shadow 0.3s',
          }}>
            {icon}
          </div>
          <div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 900, fontSize: 'clamp(1.2rem, 3vw, 1.7rem)',
              color: '#fff', margin: 0, lineHeight: 1.2,
            }}>
              {title}
            </h2>
          </div>
        </div>

        <p style={{
          fontSize: 14, color: 'rgba(255,255,255,0.75)',
          lineHeight: 1.7, margin: '0 0 20px',
          fontFamily: "'Times New Roman', Times, serif",
          fontWeight: 700,
        }}>
          {subtitle}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {tags.map(tag => (
            <span key={tag} style={{
              fontSize: 11, fontWeight: 700,
              color: accentColor,
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}40`,
              borderRadius: 20, padding: '4px 12px',
              fontFamily: "'Times New Roman', Times, serif",
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: accentColor,
          color: platform === 'nmcn' ? '#fff' : '#000',
          fontWeight: 800, fontSize: 15,
          padding: '13px 28px', borderRadius: 12,
          fontFamily: "'Times New Roman', Times, serif",
          boxShadow: hov ? `0 6px 20px ${accentColor}55` : 'none',
          transform: hov ? 'translateX(4px)' : 'translateX(0)',
          transition: 'all 0.25s ease',
        }}>
          {platform === 'nmcn' ? '🚀 Start NMCN Prep' : '🏫 Start Entrance Prep'}
          <span style={{ fontSize: 18, fontWeight: 900 }}>→</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#020B18', color: '#fff' }}>
      {/* Navbar — NO buttons, unified brand */}
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
        {/* Right side intentionally empty — no Sign In / Get Started buttons */}
      </nav>

      {/* ── Platform Selection Hero ── */}
      <section style={{
        minHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(40px, 8vw, 80px) clamp(16px, 4vw, 40px)',
        background: 'radial-gradient(ellipse at 20% 50%, rgba(13,148,136,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 50%, rgba(30,58,138,0.18) 0%, transparent 55%)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: '10%', left: '5%',
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '5%',
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 6vw, 56px)', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B',
            color: '#FCD34D', fontSize: 12, fontWeight: 700,
            letterSpacing: 1.5, textTransform: 'uppercase',
            padding: '6px 18px', borderRadius: 20, marginBottom: 20,
          }}>
            🏥 Nigeria's #1 Nursing Exam Platform
          </div>

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            color: '#fff', fontSize: 'clamp(1.8rem, 5vw, 3rem)',
            lineHeight: 1.25, marginBottom: 16, fontWeight: 900,
          }}>
            Choose Your <span style={{ color: '#14B8A8' }}>Exam Path</span>
          </h1>

          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(14px, 2vw, 16px)',
            lineHeight: 1.7, maxWidth: 520, margin: '0 auto',
            fontFamily: "'Times New Roman', Times, serif", fontWeight: 700,
          }}>
            Select the platform that matches your goal. Each platform is fully independent with its own questions, analytics, and experience.
          </p>
        </div>

        {/* ── Two Banners ── */}
        <div style={{
          display: 'flex', gap: 'clamp(16px, 3vw, 28px)',
          flexWrap: 'wrap', width: '100%', maxWidth: 960,
          position: 'relative', zIndex: 1,
        }}>
          <PlatformBanner
            platform="nmcn"
            icon="📚"
            title="NMCN CBT — Nursing Council Exams"
            subtitle="Study real NMCN past questions from 2020–2025. AI-powered explanations, timed mock exams, course drills, topic drills and real-time analytics. All 17 nursing specialties covered."
            tags={['10,000+ Questions', '17 Specialties', '2020–2025', 'AI Explanations', 'Mock Exams']}
            accentColor="#14B8A8"
            gradient={{
              base: 'linear-gradient(145deg, #051428 0%, #0A2540 100%)',
              hover: 'linear-gradient(145deg, #071C38 0%, #0D2F50 100%)',
            }}
            borderColor={{ base: 'rgba(13,148,136,0.25)', hover: 'rgba(13,148,136,0.65)' }}
            glowColor="rgba(13,148,136,0.2)"
          />

          <PlatformBanner
            platform="entrance"
            icon="🏫"
            title="Nursing Schools Entrance Exam"
            subtitle="Prepare for nursing school entrance exams and Post-UTME. School-specific past questions, subject drills and daily mock exams to help you pass and enter your dream school."
            tags={['7+ Schools', '3,000+ Questions', 'Post-UTME', 'Daily Mocks', 'Updated 2025']}
            accentColor="#F59E0B"
            gradient={{
              base: 'linear-gradient(145deg, #0C1F08 0%, #142B0A 100%)',
              hover: 'linear-gradient(145deg, #112508 0%, #1A360C 100%)',
            }}
            borderColor={{ base: 'rgba(245,158,11,0.25)', hover: 'rgba(245,158,11,0.65)' }}
            glowColor="rgba(245,158,11,0.18)"
          />
        </div>

        {/* NO "Already have an account?" text here */}
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
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: `${c.color}12`, border: `1px solid ${c.color}30`,
                borderRadius: 10,
              }}>
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
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: p.color, color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                  }}>⭐ POPULAR</div>
                )}
                <div style={{ fontWeight: 900, fontSize: 15, color: '#fff', marginBottom: 6 }}>{p.label}</div>
                <div style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: p.price === 0 ? '1.6rem' : '1.9rem',
                  fontWeight: 900, color: p.color, marginBottom: 4,
                }}>
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
                <a href="/auth" className="btn btn-sm btn-full" style={{ marginTop: 16, background: p.color, color: '#fff', border: 'none', fontFamily: 'inherit', display: 'block', textAlign: 'center' }}>
                  {p.id === 'free' ? 'Start Free' : 'Get Plan'}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', marginBottom: 12 }}>
          Ready to Pass Your Exam?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
          Join thousands of Nigerian nursing students who trust this platform
        </p>
        <a href="/auth" className="btn btn-primary btn-lg">🚀 Start Preparing Today — It's Free</a>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(13,148,136,0.3)',
        padding: '24px', textAlign: 'center',
        color: 'rgba(255,255,255,0.35)', fontSize: 13,
      }}>
        © {new Date().getFullYear()} Nurses Academy · Built for Nigerian Nursing Students
      </footer>
    </div>
  );
}
