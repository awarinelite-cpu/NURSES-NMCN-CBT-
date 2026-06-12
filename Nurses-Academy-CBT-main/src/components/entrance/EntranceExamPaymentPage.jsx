// src/components/entrance/EntranceExamPaymentPage.jsx
// Route: /entrance-exam/payment
//
// Fonts  : headings → Arial Black | body → Times New Roman Bold
// Colors : CSS variables throughout → light + dark mode
// Methods: Paystack (instant) + Manual bank transfer (pending admin confirm)
//
// After successful Paystack payment:
//   - Writes to 'payments' collection (picked up by admin PaymentsManager)
//   - Sets user.entranceExamPaid = true
//   - Navigates to /entrance-exam
//
// After manual submission:
//   - Writes to 'payments' collection with status: 'pending'
//   - Admin confirms via PaymentsManager (existing flow)
//   - Notifies admin via 'notifications' collection

import { useState, useEffect, useRef } from 'react';
import { useNavigate }                 from 'react-router-dom';
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const PAYSTACK_PUBLIC_KEY = 'pk_live_25be9012b1233d358dfbab621aac09469f128cd4';

const BANK = {
  bank:    'Moniepoint',
  account: '7054641287',
  name:    'Awarin Elite',
};

const EXAM = {
  label:  'Hospital Nursing School Entrance Examination',
  amount: 3000,
  type:   'entrance_exam_registration',
};

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ─── Animated card wrapper ─────────────────────────────────────────────── */
function ACard({ children, delay = 0, style: extra = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity:   vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(18px)',
      transition: 'opacity .5s ease, transform .5s ease',
      ...extra,
    }}>
      {children}
    </div>
  );
}

/* ─── Error box ─────────────────────────────────────────────────────────── */
function ErrorBox({ msg }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 10, padding: '11px 14px', marginBottom: 14,
      color: '#EF4444', fontSize: 13, fontWeight: 700, fontFamily: F,
      display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.55,
    }}>
      <span style={{ flexShrink: 0 }}>⚠️</span>
      {msg}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function EntranceExamPaymentPage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [method,        setMethod]        = useState(null);  // 'paystack' | 'manual'
  const [proof,         setProof]         = useState('');
  const [fullName,      setFullName]      = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [done,          setDone]          = useState(false);
  const [doneMethod,    setDoneMethod]    = useState(null);
  const [error,         setError]         = useState('');
  const [paystackReady, setPaystackReady] = useState(false);
  const [bannerVis,     setBannerVis]     = useState(false);
  const listenerRef     = useRef(null);

  useEffect(() => { setTimeout(() => setBannerVis(true), 60); }, []);

  /* ── Load Paystack script ────────────────────────────────────────────── */
  useEffect(() => {
    if (window.PaystackPop) { setPaystackReady(true); return; }
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) {
      const onLoad = () => { if (window.PaystackPop) setPaystackReady(true); };
      existing.addEventListener('load', onLoad);
      listenerRef.current = { el: existing, fn: onLoad };
      if (existing.dataset.loaded === '1') setPaystackReady(true);
      return;
    }
    const script   = document.createElement('script');
    script.src     = 'https://js.paystack.co/v1/inline.js';
    script.async   = true;
    script.onload  = () => { script.dataset.loaded = '1'; setPaystackReady(true); };
    script.onerror = () => setError('Could not load Paystack. Check your internet connection.');
    document.head.appendChild(script);
    return () => {
      if (listenerRef.current) {
        const { el, fn } = listenerRef.current;
        el.removeEventListener('load', fn);
      }
    };
  }, []);

  /* ── Paystack inline checkout ────────────────────────────────────────── */
  const handlePaystack = () => {
    if (!paystackReady || typeof window.PaystackPop === 'undefined') {
      setError('Paystack is still loading. Please wait a moment and try again.');
      return;
    }
    setError('');

    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_PUBLIC_KEY,
      email:    user.email,
      amount:   EXAM.amount * 100, // kobo
      currency: 'NGN',
      ref:      `NMCN-ENT-${Date.now()}`,
      metadata: { userId: user.uid, type: EXAM.type, examLabel: EXAM.label },

      // IMPORTANT: must be synchronous — no async/await inside
      callback: (response) => {
        // 1. Write payment record (admin/webhook verifies reference server-side)
        // 2. Immediately grant entranceExamPaid — without this the EntranceExamRoute
        //    bounces the user back to this page right after the 3-second redirect.
        addDoc(collection(db, 'payments'), {
          userId:    user.uid,
          userName:  profile?.name || user.displayName || user.email,
          userEmail: user.email,
          type:      EXAM.type,
          examLabel: EXAM.label,
          amount:    EXAM.amount,
          method:    'paystack',
          reference: response.reference,
          status:    'pending',
          createdAt: serverTimestamp(),
        })
        .then(() =>
          updateDoc(doc(db, 'users', user.uid), {
            entranceExamPaid:   true,
            entranceExamPaidAt: serverTimestamp(),
            entranceExamRef:    response.reference,
          })
        )
        .then(() => {
          setDoneMethod('paystack');
          setDone(true);
          setTimeout(() => navigate('/entrance-exam'), 3000);
        })
        .catch(() => {
          setError(
            'Payment received but record failed to save. ' +
            'Contact support with your reference: ' + response.reference
          );
        });
      },
      onClose: () => {},
    });

    handler.openIframe(); // synchronous — no delay before this line
  };

  /* ── Manual bank transfer submission ─────────────────────────────────── */
  const handleManual = async () => {
    if (!proof.trim())    { setError('Please enter your payment reference or transaction ID.'); return; }
    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await addDoc(collection(db, 'payments'), {
        userId:    user.uid,
        userName:  fullName.trim() || profile?.name || user.displayName || user.email,
        userEmail: user.email,
        type:      EXAM.type,
        examLabel: EXAM.label,
        amount:    EXAM.amount,
        method:    'manual',
        proof:     proof.trim(),
        status:    'pending',
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        userId:    'admin',
        title:     '📋 New Entrance Exam Payment',
        body:      `${fullName.trim() || user.email} submitted a manual payment of ₦${EXAM.amount.toLocaleString()} for ${EXAM.label}`,
        type:      'entrance_exam_payment',
        read:      false,
        createdAt: serverTimestamp(),
      });
      setDoneMethod('manual');
      setDone(true);
    } catch (e) {
      setError('Submission failed. Please try again. (' + e.message + ')');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Already paid ────────────────────────────────────────────────────── */
  if (profile?.entranceExamPaid) {
    return (
      <div style={s.wrap}>
        <div style={s.successCard}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: H, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px', fontSize: 'clamp(1.4rem,3vw,2rem)' }}>
            Registration Confirmed!
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 700, fontFamily: F, margin: '0 0 28px', lineHeight: 1.7, maxWidth: 400 }}>
            Your entrance exam registration fee has already been paid. You have full access to all entrance exam features.
          </p>
          <button onClick={() => navigate('/entrance-exam')} style={s.primaryBtn}>
            🏫 Go to Entrance Exam Hub →
          </button>
        </div>
      </div>
    );
  }

  /* ── Success screen ──────────────────────────────────────────────────── */
  if (done) {
    return (
      <div style={s.wrap}>
        <ACard delay={60}>
          <div style={s.successCard}>
            <div style={{ fontSize: 64, marginBottom: 18 }}>
              {doneMethod === 'paystack' ? '🎉' : '⏳'}
            </div>
            <h2 style={{ fontFamily: H, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 12px', fontSize: 'clamp(1.4rem,3vw,2rem)' }}>
              {doneMethod === 'paystack' ? 'Registration Confirmed!' : 'Submitted for Review!'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 700, fontFamily: F, margin: '0 0 28px', lineHeight: 1.7, maxWidth: 440 }}>
              {doneMethod === 'paystack'
                ? 'Your entrance exam access is now active. Taking you to your exam hub in 3 seconds…'
                : 'Your payment proof has been received. Admin will confirm within a few hours and activate your exam access.'}
            </p>
            {doneMethod === 'manual' && (
              <button onClick={() => navigate('/entrance-exam')} style={s.primaryBtn}>
                🏫 Go to Entrance Exam Hub →
              </button>
            )}
          </div>
        </ACard>
      </div>
    );
  }

  /* ── Main page ───────────────────────────────────────────────────────── */
  return (
    <div style={s.wrap}>

      {/* Back */}
      <button onClick={() => navigate('/entrance-exam')} style={s.backBtn}>
        ← Back to Entrance Exam
      </button>

      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A5E 0%, #065F46 100%)',
        borderRadius: 20, marginBottom: 32, overflow: 'hidden', position: 'relative',
        opacity:    bannerVis ? 1 : 0,
        transform:  bannerVis ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'opacity .6s ease, transform .6s ease',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 75% 50%, rgba(13,148,136,0.35) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px,4vw,36px)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, fontFamily: F }}>
            🏥 NMCN CBT Platform
          </div>
          <h2 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.5rem,4vw,2.2rem)', color: '#fff', margin: '0 0 10px', lineHeight: 1.2 }}>
            🏫 Entrance Exam Registration
          </h2>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.82)', margin: '0 0 22px', lineHeight: 1.6 }}>
            Complete your one-time registration fee to unlock all entrance exam features — past questions, daily mock, subject drill, leaderboard and more.
          </p>

          {/* Fee pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 14,
            background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: 14, padding: '14px 22px',
          }}>
            <div style={{ fontSize: 28 }}>💳</div>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 30, color: '#fff', lineHeight: 1 }}>
                ₦3,000
              </div>
              <div style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
                One-time · Non-refundable
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What you unlock */}
      <ACard delay={200} style={{ marginBottom: 28 }}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>🎁 What You Unlock</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(195px,1fr))', gap: 10 }}>
            {[
              { icon: '🏫', label: 'School Past Questions', sub: 'All nursing schools' },
              { icon: '🗓️', label: 'Daily Mock Exams',      sub: 'Fresh questions every day' },
              { icon: '📚', label: 'Subject Drills',          sub: 'Topic-by-topic practice' },
              { icon: '📊', label: 'Results & Analysis',      sub: 'Track your progress' },
              { icon: '🔖', label: 'Bookmarks',               sub: 'Save tricky questions' },
              { icon: '🏆', label: 'Leaderboard',             sub: 'Compete with peers' },
            ].map(f => (
              <div key={f.label} style={s.featurePill}>
                <span style={{ fontSize: 22 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', fontFamily: F }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginTop: 2 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ACard>

      {/* Method selector */}
      <ACard delay={350} style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, fontFamily: F }}>
          Choose Payment Method
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

          {/* Paystack card */}
          <div
            onClick={() => { setMethod('paystack'); setError(''); }}
            style={{
              ...s.methodCard,
              borderColor: method === 'paystack' ? 'var(--teal)' : 'var(--border)',
              background:  method === 'paystack' ? 'rgba(13,148,136,0.1)' : 'var(--bg-card)',
              boxShadow:   method === 'paystack' ? '0 0 0 3px rgba(13,148,136,0.12)' : 'none',
            }}
          >
            {method === 'paystack' && <div style={{ ...s.selectedBadge, background: 'var(--teal)', color: '#fff' }}>✓ Selected</div>}
            <div style={{ fontSize: 32, marginBottom: 6 }}>💳</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F, marginBottom: 4 }}>Pay Online</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, textAlign: 'center', lineHeight: 1.5 }}>
              Card · Transfer · USSD
            </div>
            <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginTop: 8, fontFamily: F }}>
              ✓ Instant Access
            </div>
          </div>

          {/* Manual card */}
          <div
            onClick={() => { setMethod('manual'); setError(''); }}
            style={{
              ...s.methodCard,
              borderColor: method === 'manual' ? '#F59E0B' : 'var(--border)',
              background:  method === 'manual' ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
              boxShadow:   method === 'manual' ? '0 0 0 3px rgba(245,158,11,0.1)' : 'none',
            }}
          >
            {method === 'manual' && <div style={{ ...s.selectedBadge, background: '#F59E0B', color: '#000' }}>✓ Selected</div>}
            <div style={{ fontSize: 32, marginBottom: 6 }}>🏦</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F, marginBottom: 4 }}>Bank Transfer</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, textAlign: 'center', lineHeight: 1.5 }}>
              Manual · Admin confirms
            </div>
            <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginTop: 8, fontFamily: F }}>
              ⏳ 1–4 Hours
            </div>
          </div>
        </div>

        {/* ── Paystack panel ── */}
        {method === 'paystack' && (
          <ACard delay={60}>
            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65, fontFamily: F, fontWeight: 700 }}>
                  You'll be taken to Paystack's secure checkout. Pay with{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>debit card</strong>,{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>bank transfer</strong>, or{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>USSD</strong>. Access is granted{' '}
                  <strong style={{ color: 'var(--teal)' }}>instantly</strong> after payment.
                </p>
              </div>
              {error && <ErrorBox msg={error} />}
              <button
                onClick={handlePaystack}
                disabled={!paystackReady}
                style={{ ...s.primaryBtn, opacity: paystackReady ? 1 : 0.55, cursor: paystackReady ? 'pointer' : 'not-allowed' }}
              >
                {paystackReady ? `🔒 Pay ₦${EXAM.amount.toLocaleString()} Securely` : '⏳ Loading Paystack…'}
              </button>
            </div>
          </ACard>
        )}

        {/* ── Manual transfer panel ── */}
        {method === 'manual' && (
          <ACard delay={60}>
            <div style={s.card}>
              {/* Bank details box */}
              <div style={s.bankBox}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: F }}>
                  🏦 Transfer Details
                </div>
                {[
                  { label: 'Bank',         value: BANK.bank,    mono: false, teal: false },
                  { label: 'Account No.',  value: BANK.account, mono: true,  teal: false },
                  { label: 'Account Name', value: BANK.name,    mono: false, teal: false },
                  { label: 'Amount',       value: `₦${EXAM.amount.toLocaleString()}`, mono: false, teal: true },
                ].map(row => (
                  <div key={row.label} style={s.bankRow}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, fontSize: 13 }}>
                      {row.label}
                    </span>
                    <strong style={{
                      color:         row.teal ? 'var(--teal)' : 'var(--text-primary)',
                      fontFamily:    row.mono ? 'monospace' : F,
                      letterSpacing: row.mono ? 2 : 0,
                      fontSize:      row.mono ? 15 : 13,
                    }}>
                      {row.value}
                    </strong>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                  <p style={{ color: '#F59E0B', fontSize: 11, margin: 0, fontWeight: 700, fontFamily: F }}>
                    ⚠️ Use your registered email address as the payment description / narration.
                  </p>
                </div>
              </div>

              {/* Full name */}
              <div style={{ marginBottom: 14 }}>
                <label style={s.formLabel}>Full Name *</label>
                <input
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setError(''); }}
                  placeholder="As used during registration"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: F }}
                />
              </div>

              {/* Reference */}
              <div style={{ marginBottom: 14 }}>
                <label style={s.formLabel}>Payment Reference / Transaction ID *</label>
                <input
                  value={proof}
                  onChange={e => { setProof(e.target.value); setError(''); }}
                  placeholder="e.g. FBN2504130001 or any bank reference"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: 1 }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, fontFamily: F, fontWeight: 700 }}>
                  After transferring, enter the reference so admin can verify your payment.
                </p>
              </div>

              {error && <ErrorBox msg={error} />}

              <button
                onClick={handleManual}
                disabled={submitting}
                style={{
                  ...s.primaryBtn,
                  background: submitting ? 'rgba(245,158,11,0.45)' : 'linear-gradient(135deg,#D97706,#F59E0B)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '⏳ Submitting…' : '📤 Submit Payment Proof'}
              </button>

              <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 12, fontFamily: F, fontWeight: 700 }}>
                Admin confirms within a few hours · You'll be notified once access is activated
              </p>
            </div>
          </ACard>
        )}
      </ACard>

      {/* Hint when no method selected */}
      {!method && (
        <ACard delay={500}>
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 14, fontFamily: F, fontWeight: 700 }}>
            ☝️ Select a payment method above to continue
          </div>
        </ACard>
      )}

    </div>
  );
}

/* ─── Shared styles ──────────────────────────────────────────────────────── */
const s = {
  wrap: {
    padding: '24px 16px 60px',
    maxWidth: 720,
    margin: '0 auto',
    color: 'var(--text-primary)',
    fontFamily: "'Times New Roman', Times, serif",
  },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20,
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'Times New Roman', Times, serif",
  },
  card: {
    background: 'var(--bg-card)',
    border: '1.5px solid var(--border)',
    borderRadius: 16, padding: '20px 22px',
  },
  cardTitle: {
    fontFamily: "'Arial Black', Arial, sans-serif",
    fontWeight: 900, fontSize: 'clamp(1rem,2vw,1.25rem)',
    color: 'var(--text-primary)', margin: '0 0 16px',
  },
  featurePill: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 14px',
  },
  methodCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, padding: '22px 12px',
    border: '2px solid', borderRadius: 14,
    cursor: 'pointer', position: 'relative',
    transition: 'all 0.2s', overflow: 'hidden',
  },
  selectedBadge: {
    position: 'absolute', top: -1, right: -1,
    fontSize: 10, fontWeight: 700, padding: '4px 10px',
    borderRadius: '0 12px 0 10px',
    fontFamily: "'Times New Roman', Times, serif",
  },
  bankBox: {
    background: 'var(--bg-secondary)',
    border: '1.5px solid rgba(13,148,136,0.25)',
    borderRadius: 12, padding: '14px 16px', marginBottom: 18,
  },
  bankRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
  formLabel: {
    display: 'block', fontSize: 12,
    color: 'var(--text-muted)', fontWeight: 700,
    letterSpacing: 0.4, marginBottom: 6,
    fontFamily: "'Times New Roman', Times, serif",
  },
  primaryBtn: {
    width: '100%', padding: '14px', border: 'none', borderRadius: 12,
    background: 'linear-gradient(135deg,#0D9488,#0891B2)',
    color: '#fff', fontWeight: 900, fontSize: 15,
    fontFamily: "'Arial Black', Arial, sans-serif",
    letterSpacing: 0.3, transition: 'opacity 0.2s',
    cursor: 'pointer',
  },
  successCard: {
    background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 20, padding: '48px 32px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginTop: 20,
  },
};
