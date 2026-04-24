// src/components/payment/PaymentPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// CHANGE 3: added doc, updateDoc to imports
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const PAYSTACK_PUBLIC_KEY = 'pk_live_25be9012b1233d358dfbab621aac09469f128cd4';

const BANK_DETAILS = {
  bank:    'Moniepoint',
  account: '7054641287',
  name:    'Awarin Elite',
};

const PLANS = [
  { id: 'basic',    label: 'Basic',    price: 2500, days: 30,  color: '#0D9488' },
  { id: 'standard', label: 'Standard', price: 5000, days: 90,  color: '#2563EB' },
  { id: 'premium',  label: 'Premium',  price: 8000, days: 180, color: '#7C3AED' },
];

export default function PaymentPage({ selectedPlan: initialPlan }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [plan,           setPlan]           = useState(initialPlan || PLANS[1]);
  const [method,         setMethod]         = useState(null);
  const [proof,          setProof]          = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [done,           setDone]           = useState(false);
  const [error,          setError]          = useState('');
  const [paystackReady,  setPaystackReady]  = useState(false);

  /* ── Load Paystack script ── */
  useEffect(() => {
    if (window.PaystackPop) { setPaystackReady(true); return; }
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) { existing.addEventListener('load', () => setPaystackReady(true)); return; }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => setPaystackReady(true);
    script.onerror = () => setError('Could not load Paystack. Check your internet connection.');
    document.head.appendChild(script);
  }, []);

  /* ── Paystack inline handler ── */
  const handlePaystack = () => {
    if (!paystackReady || typeof window.PaystackPop === 'undefined') {
      setError('Paystack is not loaded yet. Please wait a moment and try again.');
      return;
    }
    setError('');
    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_PUBLIC_KEY,
      email:    currentUser.email,
      amount:   plan.price * 100,
      currency: 'NGN',
      ref:      `NMCN-${Date.now()}`,
      metadata: { userId: currentUser.uid, plan: plan.id },
      callback: async (response) => {
        try {
          const expiresAt = new Date(Date.now() + plan.days * 86400000);

          // Save payment record
          await addDoc(collection(db, 'payments'), {
            userId:    currentUser.uid,
            userName:  currentUser.displayName || currentUser.email,
            userEmail: currentUser.email,
            plan:      plan.id,
            amount:    plan.price,
            days:      plan.days,
            method:    'paystack',
            reference: response.reference,
            status:    'confirmed',
            createdAt: serverTimestamp(),
            expiresAt,
          });

          // CHANGE 3: Activate subscription on the user's profile immediately
          await updateDoc(doc(db, 'users', currentUser.uid), {
            subscribed:         true,
            accessLevel:        'full',
            subscriptionPlan:   plan.id,
            subscriptionExpiry: expiresAt.toISOString(),
            subscribedAt:       serverTimestamp(),
          });

          setDone(true);
          setTimeout(() => navigate('/dashboard'), 2500);
        } catch (e) {
          setError('Payment successful but failed to save. Contact support with ref: ' + response.reference);
        }
      },
      onClose: () => {},
    });
    handler.openIframe();
  };

  /* ── Manual payment submit ── */
  const handleManual = async () => {
    if (!proof.trim()) { setError('Please enter your payment reference or transaction note.'); return; }
    setUploading(true);
    setError('');
    try {
      await addDoc(collection(db, 'payments'), {
        userId:    currentUser.uid,
        userName:  currentUser.displayName || currentUser.email,
        userEmail: currentUser.email,
        plan:      plan.id,
        amount:    plan.price,
        days:      plan.days,
        method:    'manual',
        proof:     proof.trim(),
        status:    'pending',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (e) {
      setError('Failed to submit. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  /* ── Success screen ── */
  if (done) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize: 64, textAlign: 'center', padding: '32px 20px 8px' }}>
            {method === 'paystack' ? '🎉' : '⏳'}
          </div>
          <h2 style={{ ...s.heading, textAlign: 'center', marginTop: 12, padding: '0 20px' }}>
            {method === 'paystack' ? 'Access Granted!' : 'Submitted for Review!'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', fontSize: 14, padding: '0 24px 32px' }}>
            {method === 'paystack'
              ? 'Your subscription is now active. Redirecting to dashboard…'
              : 'Your payment proof has been received. Admin will confirm within a few hours and activate your access.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.headerBand}>
          <div style={s.headerGlow} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={s.heading}>💳 Complete Your Subscription</h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>
              Unlock full NMCN CBT access
            </p>
          </div>
        </div>

        {/* Plan selector */}
        <div style={{ padding: '20px 20px 0' }}>
          <p style={s.label}>Select Plan</p>
          <div style={s.planRow}>
            {PLANS.map(p => (
              <button
                key={p.id}
                onClick={() => setPlan(p)}
                style={{
                  ...s.planBtn,
                  borderColor: plan.id === p.id ? p.color : 'rgba(255,255,255,0.1)',
                  background:  plan.id === p.id ? `${p.color}22` : 'rgba(255,255,255,0.02)',
                  color:       plan.id === p.id ? p.color : 'rgba(255,255,255,0.45)',
                  boxShadow:   plan.id === p.id ? `0 0 16px ${p.color}33` : 'none',
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 14 }}>{p.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>₦{p.price.toLocaleString()}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{p.days} days</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount summary */}
        <div style={s.summary}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Total Due</div>
            <div style={{ color: '#0D9488', fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
              ₦{plan.price.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Duration</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{plan.days} days</div>
          </div>
        </div>

        {/* Method selector */}
        <div style={{ padding: '0 20px' }}>
          <p style={s.label}>Payment Method</p>
          <div style={s.methodRow}>
            <button
              onClick={() => { setMethod('paystack'); setError(''); }}
              style={{
                ...s.methodBtn,
                borderColor: method === 'paystack' ? '#0D9488' : 'rgba(255,255,255,0.1)',
                background:  method === 'paystack' ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.02)',
                boxShadow:   method === 'paystack' ? '0 0 16px rgba(13,148,136,0.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 24 }}>💳</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Pay Online</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.4 }}>
                Card · Transfer · USSD
              </span>
              {method === 'paystack' && (
                <span style={{ fontSize: 10, color: '#0D9488', fontWeight: 700 }}>✓ Selected</span>
              )}
            </button>

            <button
              onClick={() => { setMethod('manual'); setError(''); }}
              style={{
                ...s.methodBtn,
                borderColor: method === 'manual' ? '#F59E0B' : 'rgba(255,255,255,0.1)',
                background:  method === 'manual' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.02)',
                boxShadow:   method === 'manual' ? '0 0 16px rgba(245,158,11,0.15)' : 'none',
              }}
            >
              <span style={{ fontSize: 24 }}>🏦</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Bank Transfer</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.4 }}>
                Manual confirmation
              </span>
              {method === 'manual' && (
                <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>✓ Selected</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Paystack section ── */}
        {method === 'paystack' && (
          <div style={s.section}>
            <div style={s.infoBox}>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                🔒 You'll be taken to Paystack's secure checkout. Pay with <strong style={{ color: '#fff' }}>debit card</strong>, <strong style={{ color: '#fff' }}>bank transfer</strong>, or <strong style={{ color: '#fff' }}>USSD</strong>. Access is granted instantly after payment.
              </p>
            </div>
            {error && <p style={s.error}>⚠️ {error}</p>}
            <button
              onClick={handlePaystack}
              disabled={!paystackReady}
              style={{
                ...s.primaryBtn,
                background: paystackReady
                  ? 'linear-gradient(135deg, #0D9488, #0891B2)'
                  : 'rgba(255,255,255,0.1)',
                cursor: paystackReady ? 'pointer' : 'not-allowed',
              }}
            >
              {paystackReady ? `🔒 Pay ₦${plan.price.toLocaleString()} Securely` : '⏳ Loading Paystack…'}
            </button>
          </div>
        )}

        {/* ── Manual section ── */}
        {method === 'manual' && (
          <div style={s.section}>
            <div style={s.bankBox}>
              <p style={s.bankTitle}>🏦 Transfer Details</p>
              {[
                { label: 'Bank',         value: BANK_DETAILS.bank },
                { label: 'Account No.',  value: BANK_DETAILS.account, mono: true },
                { label: 'Account Name', value: BANK_DETAILS.name },
                { label: 'Amount',       value: `₦${plan.price.toLocaleString()}`, teal: true },
              ].map(row => (
                <div key={row.label} style={s.bankRow}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{row.label}</span>
                  <strong style={{
                    color: row.teal ? '#0D9488' : '#fff',
                    letterSpacing: row.mono ? 2 : 0,
                    fontSize: row.mono ? 15 : 13,
                  }}>
                    {row.value}
                  </strong>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ color: '#F59E0B', fontSize: 11, margin: 0 }}>
                  ⚠️ Use your registered email as payment description
                </p>
              </div>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '4px 0 8px', lineHeight: 1.6 }}>
              After transferring, enter your bank reference or transaction ID below so admin can verify:
            </p>
            <input
              value={proof}
              onChange={e => { setProof(e.target.value); setError(''); }}
              placeholder="e.g. FBN2504130001 or any note"
              style={s.input}
            />
            {error && <p style={s.error}>⚠️ {error}</p>}
            <button
              onClick={handleManual}
              disabled={uploading}
              style={{
                ...s.primaryBtn,
                background: uploading ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg, #D97706, #F59E0B)',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? '⏳ Submitting…' : '📤 Submit Payment Proof'}
            </button>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 10 }}>
              Admin confirms within a few hours · You'll be notified once access is activated
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 16,
    background: 'linear-gradient(135deg,#010810,#0A1628)',
  },
  card: {
    width: '100%', maxWidth: 480,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, overflow: 'hidden', backdropFilter: 'blur(12px)',
  },
  headerBand: {
    background: 'linear-gradient(135deg,#010810,#0F2A4A)',
    borderBottom: '1px solid rgba(13,148,136,0.3)',
    padding: '22px 20px', position: 'relative', overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 80% 50%, rgba(13,148,136,0.2) 0%, transparent 60%)',
  },
  heading: {
    color: '#fff', fontFamily: "'Playfair Display', serif",
    fontSize: '1.3rem', margin: 0, marginBottom: 4,
  },
  label: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 0,
  },
  planRow: { display: 'flex', gap: 8, marginBottom: 16 },
  planBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 3, padding: '12px 6px', border: '1.5px solid', borderRadius: 12,
    cursor: 'pointer', transition: 'all 0.2s',
  },
  summary: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    margin: '0 20px 16px', padding: '14px 16px',
    background: 'rgba(13,148,136,0.08)', borderRadius: 10,
    border: '1px solid rgba(13,148,136,0.2)',
  },
  methodRow: { display: 'flex', gap: 10, marginBottom: 4 },
  methodBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 5, padding: '16px 8px', border: '1.5px solid', borderRadius: 12,
    cursor: 'pointer', transition: 'all 0.2s',
  },
  section: { padding: '16px 20px 20px' },
  infoBox: {
    background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)',
    borderRadius: 10, padding: '12px 14px', marginBottom: 14,
  },
  bankBox: {
    background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 12, padding: '14px 16px', marginBottom: 12,
  },
  bankTitle: {
    color: 'rgba(255,255,255,0.45)', fontSize: 11, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 10, marginTop: 0, fontWeight: 700,
  },
  bankRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
  },
  input: {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', marginBottom: 12,
  },
  primaryBtn: {
    width: '100%', padding: '14px', border: 'none', borderRadius: 12,
    color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
    transition: 'opacity 0.2s',
  },
  error: {
    color: '#EF4444', fontSize: 13, margin: '0 0 12px', padding: '9px 12px',
    background: 'rgba(239,68,68,0.1)', borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.5,
  },
};
