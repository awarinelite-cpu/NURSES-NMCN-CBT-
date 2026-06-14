// src/components/entrance/EntranceExamPaymentPage.jsx
// Route: /entrance-exam/payment
//
// STANDALONE — completely separate from NMCN CBT subscription.
// Has its own plan tiers, pricing, and Firestore fields.
//
// Plans write to:
//   users/{uid}.entranceExamPaid      = true
//   users/{uid}.entranceExamPlan      = 'basic' | 'standard' | 'premium'
//   users/{uid}.entranceExamExpiry    = ISO date string
//   users/{uid}.entranceExamPaidAt    = serverTimestamp
//   users/{uid}.entranceExamRef       = paystack reference
//
// Payments collection: same 'payments' collection, type = 'entrance_exam'

import { useState, useEffect, useRef } from 'react';
import { useNavigate }                 from 'react-router-dom';
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc,
} from 'firebase/firestore';
import { db }       from '../../firebase/config';
import { useAuth }  from '../../context/AuthContext';

/* ─── Constants ─────────────────────────────────────────────────────────── */
const PAYSTACK_KEY = 'pk_live_25be9012b1233d358dfbab621aac09469f128cd4';

const BANK = {
  bank:    'Moniepoint',
  account: '7054641287',
  name:    'Awarin Elite',
};

// Entrance exam — single one-time payment plan
const ENTRANCE_PLANS = [
  {
    id:       'full',
    label:    'Full Access',
    price:    3000,
    duration: 'Lifetime',
    days:     36500,
    color:    '#0D9488',
    icon:     '🎯',
    features: [
      'All school past questions',
      'Daily mock exams',
      'Subject drills',
      'Results & analytics',
      'Bookmarks',
      'Leaderboard ranking',
      'AI-powered explanations',
    ],
  },
];

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ─── Tiny helpers ───────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff', borderRadius: '50%',
      animation: 'spin 0.75s linear infinite', flexShrink: 0,
    }} />
  );
}

function ErrorBox({ msg }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 10, padding: '11px 14px', marginBottom: 16,
      color: '#EF4444', fontSize: 13, fontWeight: 700, fontFamily: F,
      display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6,
    }}>
      <span>⚠️</span>{msg}
    </div>
  );
}

/* ─── Plan card ──────────────────────────────────────────────────────────── */
function PlanCard({ plan, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(plan.id)}
      style={{
        position: 'relative', borderRadius: 18, padding: '22px 18px 20px',
        border: `2px solid ${selected ? plan.color : 'var(--border)'}`,
        background: selected ? `${plan.color}14` : 'var(--bg-card)',
        cursor: 'pointer', transition: 'all 0.2s',
        boxShadow: selected ? `0 0 0 4px ${plan.color}22` : 'none',
      }}
    >
      {/* Popular badge */}
      {plan.popular && (
        <div style={{
          position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
          background: plan.color, color: '#fff', fontSize: 10, fontWeight: 900,
          padding: '3px 14px', borderRadius: '0 0 10px 10px',
          fontFamily: H, letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>
          ⭐ MOST POPULAR
        </div>
      )}

      {/* Selected checkmark */}
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 22, height: 22, borderRadius: '50%',
          background: plan.color, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900,
        }}>✓</div>
      )}

      {/* Plan icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: plan.popular ? 10 : 0 }}>
        <span style={{ fontSize: 24 }}>{plan.icon}</span>
        <span style={{
          fontFamily: H, fontWeight: 900, fontSize: 14,
          color: plan.color, letterSpacing: 0.3,
        }}>{plan.label}</span>
      </div>

      {/* Price */}
      <div style={{
        fontFamily: H, fontWeight: 900,
        fontSize: 'clamp(1.8rem,5vw,2.4rem)',
        color: plan.color, lineHeight: 1, marginBottom: 4,
      }}>
        ₦{plan.price.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginBottom: 16 }}>
        {plan.duration} · One-time payment
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {plan.features.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', fontFamily: F, fontWeight: 700 }}>
            <span style={{ color: plan.color, flexShrink: 0, marginTop: 1 }}>✓</span>
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function EntranceExamPaymentPage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [selectedPlan,   setSelectedPlan]   = useState('full');
  const [method,         setMethod]         = useState(null);   // 'paystack' | 'manual'
  const [step,           setStep]           = useState(1);      // 1=plans, 2=pay, 3=done
  const [fullName,       setFullName]       = useState('');
  const [receiptFile,    setReceiptFile]    = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [submitStatus,   setSubmitStatus]   = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [doneMethod,     setDoneMethod]     = useState(null);
  const [error,          setError]          = useState('');
  const [paystackReady,  setPaystackReady]  = useState(false);
  const listenerRef = useRef(null);

  const plan = ENTRANCE_PLANS.find(p => p.id === selectedPlan);

  /* ── Load Paystack ───────────────────────────────────────────────────── */
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
    const script = document.createElement('script');
    script.src   = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => { script.dataset.loaded = '1'; setPaystackReady(true); };
    script.onerror = () => setError('Could not load Paystack. Check your connection.');
    document.head.appendChild(script);
    return () => {
      if (listenerRef.current) {
        listenerRef.current.el.removeEventListener('load', listenerRef.current.fn);
      }
    };
  }, []);

  /* ── Grant access helper ─────────────────────────────────────────────── */
  const grantAccess = (ref) => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.days);
    return updateDoc(doc(db, 'users', user.uid), {
      entranceExamPaid:    true,
      entranceExamPlan:    plan.id,
      entranceExamExpiry:  expiry.toISOString(),
      entranceExamPaidAt:  serverTimestamp(),
      ...(ref && { entranceExamRef: ref }),
    });
  };

  /* ── Paystack ────────────────────────────────────────────────────────── */
  const handlePaystack = () => {
    if (!paystackReady || !window.PaystackPop) {
      setError('Paystack is still loading — please wait a moment.');
      return;
    }
    setError('');
    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_KEY,
      email:    user.email,
      amount:   plan.price * 100,
      currency: 'NGN',
      ref:      `ENT-${plan.id.toUpperCase()}-${Date.now()}`,
      metadata: { userId: user.uid, type: 'entrance_exam', plan: plan.id },
      callback: (response) => {
        addDoc(collection(db, 'payments'), {
          userId:    user.uid,
          userName:  profile?.name || user.displayName || user.email,
          userEmail: user.email,
          type:      'entrance_exam',
          plan:      plan.id,
          planLabel: plan.label,
          amount:    plan.price,
          duration:  plan.duration,
          method:    'paystack',
          reference: response.reference,
          status:    'confirmed',
          createdAt: serverTimestamp(),
        })
        .then(() => grantAccess(response.reference))
        .then(() => { setDoneMethod('paystack'); setStep(3); setTimeout(() => navigate('/entrance-exam'), 3000); })
        .catch(() => setError('Payment received but activation failed. Contact support with ref: ' + response.reference));
      },
      onClose: () => {},
    });
    handler.openIframe();
  };

  /* ── Image compressor ────────────────────────────────────────────────── */
  const compressImage = (file, maxW = 1200, quality = 0.75) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale  = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });

  /* ── Manual transfer ─────────────────────────────────────────────────── */
  const handleManual = async () => {
    if (!receiptFile)     { setError('Please upload your payment receipt.'); return; }
    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    setSubmitting(true); setError('');
    try {
      setSubmitStatus('Compressing receipt…');
      const receiptBase64 = await compressImage(receiptFile);
      setSubmitStatus('Saving record…');
      await addDoc(collection(db, 'payments'), {
        userId:       user.uid,
        userName:     fullName.trim() || profile?.name || user.email,
        userEmail:    user.email,
        type:         'entrance_exam',
        plan:         plan.id,
        planLabel:    plan.label,
        amount:       plan.price,
        duration:     plan.duration,
        method:       'manual',
        receiptImage: receiptBase64,
        status:       'pending',
        createdAt:    serverTimestamp(),
      });
      setSubmitStatus('Notifying admin…');
      await addDoc(collection(db, 'notifications'), {
        userId:    'admin',
        title:     '📋 New Entrance Exam Payment',
        body:      `${fullName.trim() || user.email} paid ₦${plan.price.toLocaleString()} for ${plan.label} (${plan.duration}) — awaiting confirmation`,
        type:      'entrance_exam_payment',
        read:      false,
        createdAt: serverTimestamp(),
      });
      setDoneMethod('manual'); setStep(3);
    } catch (e) {
      setError('Submission failed. Please try again. (' + e.message + ')');
    } finally { setSubmitting(false); setSubmitStatus(''); }
  };

  /* ── Already paid guard ──────────────────────────────────────────────── */
  if (profile?.entranceExamPaid) {
    return (
      <div style={S.wrap}>
        <div style={S.doneCard}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={S.doneTitle}>Already Registered!</h2>
          <p style={S.doneSub}>
            Your entrance exam access is active
            {profile.entranceExamPlan ? ` (${ENTRANCE_PLANS.find(p => p.id === profile.entranceExamPlan)?.label || profile.entranceExamPlan})` : ''}.
          </p>
          <button onClick={() => navigate('/entrance-exam')} style={S.btn('#0D9488')}>
            🏫 Go to Entrance Exam Hub →
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 3 — Done ───────────────────────────────────────────────────── */
  if (step === 3) {
    return (
      <div style={S.wrap}>
        <div style={S.doneCard}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {doneMethod === 'paystack' ? '🎉' : '⏳'}
          </div>
          <h2 style={S.doneTitle}>
            {doneMethod === 'paystack' ? 'Access Activated!' : 'Submitted for Review!'}
          </h2>
          <p style={S.doneSub}>
            {doneMethod === 'paystack'
              ? `Your ${plan.label} is now active. Redirecting to your exam hub in 3 seconds…`
              : 'Your payment proof has been received. Admin will confirm and activate your access within a few hours.'}
          </p>
          {doneMethod === 'manual' && (
            <button onClick={() => navigate('/entrance-exam')} style={S.btn('#0D9488')}>
              🏫 Go to Entrance Exam Hub →
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Step 1 — Choose plan ────────────────────────────────────────────── */
  if (step === 1) {
    return (
      <div style={S.wrap}>
        <button onClick={() => navigate('/entrance-exam')} style={S.back}>
          ← Back
        </button>

        {/* Hero */}
        <div style={S.hero}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 40%, rgba(13,148,136,0.4) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 }}>
              🏫 Nurses Academy — Entrance Exam
            </div>
            <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.6rem,5vw,2.4rem)', color: '#fff', margin: '0 0 10px', lineHeight: 1.15 }}>
              Unlock Full Exam Access
            </h1>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.8)', margin: '0 0 6px', lineHeight: 1.7, maxWidth: 480 }}>
              Get access to every school's past questions, daily mock exams, subject drills, analytics and more — all in one place.
            </p>
            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, fontFamily: F, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              ✅ Separate from NMCN CBT subscription
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16, marginBottom: 28 }}>
          {ENTRANCE_PLANS.map(p => (
            <PlanCard key={p.id} plan={p} selected={selectedPlan === p.id} onSelect={setSelectedPlan} />
          ))}
        </div>

        {/* What you unlock (condensed) */}
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>
            🎁 Included in all plans
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            {[
              ['🏫', 'All School Past Questions'],
              ['🗓️', 'Daily Mock Exams'],
              ['📚', 'Subject-by-Subject Drills'],
              ['📊', 'Results & Performance Tracking'],
              ['🔖', 'Question Bookmarks'],
              ['🏆', 'Leaderboard & Rankings'],
            ].map(([icon, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => { setMethod(null); setError(''); setStep(2); }}
          style={S.btn(plan?.color || '#0D9488')}
        >
          {plan?.icon} Continue with {plan?.label} — ₦{plan?.price?.toLocaleString()} →
        </button>
      </div>
    );
  }

  /* ── Step 2 — Payment method ─────────────────────────────────────────── */
  return (
    <div style={S.wrap}>
      <button onClick={() => { setStep(1); setMethod(null); setError(''); }} style={S.back}>
        ← Change Plan
      </button>

      {/* Order summary */}
      <div style={{ ...S.card, marginBottom: 24, borderColor: plan?.color + '55' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Selected Plan</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color: plan?.color, marginTop: 4 }}>
              {plan?.icon} {plan?.label}
            </div>
            <div style={{ fontSize: 13, fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{plan?.duration} access</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.8rem,5vw,2.6rem)', color: plan?.color, lineHeight: 1 }}>
              ₦{plan?.price?.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>One-time · Non-refundable</div>
          </div>
        </div>
      </div>

      {/* Method selector */}
      <div style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
        Choose Payment Method
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { id: 'paystack', icon: '💳', title: 'Pay Online', sub: 'Card · Transfer · USSD', badge: '✓ Instant Access', badgeColor: '#0D9488' },
          { id: 'manual',   icon: '🏦', title: 'Bank Transfer', sub: 'Manual · Admin confirms', badge: '⏳ 1–4 Hours', badgeColor: '#F59E0B' },
        ].map(m => (
          <div
            key={m.id}
            onClick={() => { setMethod(m.id); setError(''); }}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4, padding: '20px 12px',
              border: `2px solid ${method === m.id ? (m.id === 'paystack' ? '#0D9488' : '#F59E0B') : 'var(--border)'}`,
              borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
              background: method === m.id ? (m.id === 'paystack' ? 'rgba(13,148,136,0.09)' : 'rgba(245,158,11,0.08)') : 'var(--bg-card)',
            }}
          >
            {method === m.id && (
              <div style={{
                position: 'absolute', top: -1, right: -1, fontSize: 10, fontWeight: 900,
                padding: '3px 10px', borderRadius: '0 12px 0 10px',
                background: m.id === 'paystack' ? '#0D9488' : '#F59E0B',
                color: m.id === 'paystack' ? '#fff' : '#000', fontFamily: F,
              }}>✓ Selected</div>
            )}
            <span style={{ fontSize: 30, marginBottom: 4 }}>{m.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F }}>{m.title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, textAlign: 'center' }}>{m.sub}</span>
            <span style={{ fontSize: 11, color: m.badgeColor, fontWeight: 700, marginTop: 6, fontFamily: F }}>{m.badge}</span>
          </div>
        ))}
      </div>

      {/* Paystack panel */}
      {method === 'paystack' && (
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65, fontFamily: F, fontWeight: 700 }}>
              You'll pay through Paystack's secure checkout using <strong style={{ color: 'var(--text-primary)' }}>debit card</strong>,{' '}
              <strong style={{ color: 'var(--text-primary)' }}>bank transfer</strong>, or{' '}
              <strong style={{ color: 'var(--text-primary)' }}>USSD</strong>.
              Access is granted <strong style={{ color: 'var(--teal)' }}>immediately</strong> after payment.
            </p>
          </div>
          {error && <ErrorBox msg={error} />}
          <button
            onClick={handlePaystack}
            disabled={!paystackReady}
            style={{ ...S.btn('#0D9488'), opacity: paystackReady ? 1 : 0.55, cursor: paystackReady ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {paystackReady ? `🔒 Pay ₦${plan?.price?.toLocaleString()} Securely` : <><Spinner /> Loading Paystack…</>}
          </button>
        </div>
      )}

      {/* Manual panel */}
      {method === 'manual' && (
        <div style={S.card}>
          {/* Bank details */}
          <div style={{ background: 'var(--bg-secondary)', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: F }}>
              🏦 Transfer Details
            </div>
            {[
              { label: 'Bank',         value: BANK.bank,                           mono: false, color: 'var(--text-primary)' },
              { label: 'Account No.',  value: BANK.account,                        mono: true,  color: 'var(--text-primary)' },
              { label: 'Account Name', value: BANK.name,                           mono: false, color: 'var(--text-primary)' },
              { label: 'Amount',       value: `₦${plan?.price?.toLocaleString()}`, mono: false, color: 'var(--teal)' },
              { label: 'Plan',         value: plan?.label,                         mono: false, color: plan?.color },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, fontSize: 13 }}>{row.label}</span>
                <strong style={{ color: row.color, fontFamily: row.mono ? 'monospace' : F, letterSpacing: row.mono ? 2 : 0, fontSize: row.mono ? 15 : 13 }}>
                  {row.value}
                </strong>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
              <p style={{ color: '#F59E0B', fontSize: 11, margin: 0, fontWeight: 700, fontFamily: F }}>
                ⚠️ Use your registered email as payment narration/description.
              </p>
            </div>
          </div>

          {/* Full name */}
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Full Name *</label>
            <input
              value={fullName}
              onChange={e => { setFullName(e.target.value); setError(''); }}
              placeholder="As used during registration"
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: F }}
            />
          </div>

          {/* Receipt upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>
              Upload Payment Receipt *{' '}
              <span style={{ color: 'var(--teal)' }}>(Required)</span>
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 8, padding: '20px 12px',
              border: `2px dashed ${receiptPreview ? 'rgba(13,148,136,0.5)' : 'rgba(13,148,136,0.25)'}`,
              borderRadius: 12, background: receiptPreview ? 'rgba(13,148,136,0.06)' : 'transparent',
              cursor: 'pointer', transition: 'border-color 0.2s',
            }}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                setReceiptFile(file);
                setReceiptPreview(URL.createObjectURL(file));
              }} />
              {receiptPreview
                ? <img src={receiptPreview} alt="Receipt" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain' }} />
                : (<>
                    <span style={{ fontSize: 30 }}>🧾</span>
                    <span style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700, fontFamily: F }}>Tap to upload receipt</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: F, fontWeight: 700 }}>JPG, PNG or screenshot</span>
                  </>)
              }
            </label>
            {receiptPreview && (
              <button onClick={() => { setReceiptFile(null); setReceiptPreview(''); }}
                style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', marginTop: 6, padding: 0, fontFamily: F, fontWeight: 700 }}>
                ✕ Remove
              </button>
            )}
          </div>

          {/* Status */}
          {submitting && submitStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 8 }}>
              <Spinner />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', fontFamily: F }}>{submitStatus}</span>
            </div>
          )}

          {error && <ErrorBox msg={error} />}

          <button
            onClick={handleManual} disabled={submitting}
            style={{ ...S.btn('#D97706'), opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {submitting ? <><Spinner /> Submitting…</> : '📤 Submit Payment Proof'}
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 12, fontFamily: F, fontWeight: 700 }}>
            Admin confirms within a few hours · You'll be notified once activated
          </p>
        </div>
      )}

      {!method && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 14, fontFamily: F, fontWeight: 700 }}>
          ☝️ Select a payment method above to continue
        </div>
      )}
    </div>
  );
}

/* ─── Shared styles ──────────────────────────────────────────────────────── */
const S = {
  wrap: {
    padding: '24px 16px 64px', maxWidth: 740,
    margin: '0 auto', color: 'var(--text-primary)',
  },
  back: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex',
    alignItems: 'center', gap: 6,
    fontFamily: "'Times New Roman', Times, serif",
  },
  hero: {
    background: 'linear-gradient(135deg, #0F2A5E 0%, #065F46 100%)',
    borderRadius: 20, marginBottom: 28, overflow: 'hidden',
    position: 'relative', padding: 'clamp(22px,4vw,36px)',
  },
  card: {
    background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 16, padding: '20px 22px',
  },
  label: {
    display: 'block', fontSize: 12, color: 'var(--text-muted)',
    fontWeight: 700, letterSpacing: 0.4, marginBottom: 6,
    fontFamily: "'Times New Roman', Times, serif",
  },
  btn: (color) => ({
    width: '100%', padding: '15px', border: 'none', borderRadius: 12,
    background: color, color: '#fff', fontWeight: 900, fontSize: 15,
    fontFamily: "'Arial Black', Arial, sans-serif",
    letterSpacing: 0.3, cursor: 'pointer', transition: 'opacity 0.2s',
  }),
  doneCard: {
    background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 20, padding: '48px 32px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginTop: 24,
  },
  doneTitle: {
    fontFamily: "'Arial Black', Arial, sans-serif",
    fontWeight: 900, color: 'var(--text-primary)',
    margin: '0 0 12px', fontSize: 'clamp(1.4rem,3vw,2rem)',
  },
  doneSub: {
    color: 'var(--text-muted)', fontSize: 15, fontWeight: 700,
    fontFamily: "'Times New Roman', Times, serif",
    margin: '0 0 28px', lineHeight: 1.7, maxWidth: 420,
  },
};
