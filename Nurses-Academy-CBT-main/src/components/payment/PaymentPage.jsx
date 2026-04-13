// src/components/payment/PaymentPage.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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

  const [plan,      setPlan]      = useState(initialPlan || PLANS[1]);
  const [method,    setMethod]    = useState(null);      // 'paystack' | 'manual'
  const [proof,     setProof]     = useState('');        // reference / screenshot note
  const [uploading, setUploading] = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState('');

  /* ── Paystack inline ── */
  const paystackRef = useRef(null);

  const handlePaystack = () => {
    if (typeof window.PaystackPop === 'undefined') {
      setError('Paystack is not loaded. Check your internet connection.');
      return;
    }
    const handler = window.PaystackPop.setup({
      key:       PAYSTACK_PUBLIC_KEY,
      email:     currentUser.email,
      amount:    plan.price * 100,            // kobo
      currency:  'NGN',
      ref:       `NMCN-${Date.now()}`,
      metadata:  { userId: currentUser.uid, plan: plan.id },
      callback:  async (response) => {
        // Payment successful – save to Firestore
        try {
          await addDoc(collection(db, 'payments'), {
            userId:    currentUser.uid,
            userName:  currentUser.displayName || currentUser.email,
            userEmail: currentUser.email,
            plan:      plan.id,
            amount:    plan.price,
            days:      plan.days,
            method:    'paystack',
            reference: response.reference,
            status:    'confirmed',            // Paystack auto-confirmed
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + plan.days * 86400000),
          });
          setDone(true);
          setTimeout(() => navigate('/dashboard'), 2500);
        } catch (e) {
          setError('Payment recorded but failed to save. Contact support.');
        }
      },
      onClose: () => {},
    });
    handler.openIframe();
  };

  /* ── Manual payment submit ── */
  const handleManual = async () => {
    if (!proof.trim()) { setError('Please enter your payment reference or note.'); return; }
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
        status:    'pending',                  // Admin must confirm
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (e) {
      setError('Failed to submit. Try again.');
    } finally {
      setUploading(false);
    }
  };

  /* ── Success screen ── */
  if (done) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize: 64, textAlign: 'center' }}>
            {method === 'paystack' ? '🎉' : '⏳'}
          </div>
          <h2 style={{ ...s.heading, textAlign: 'center', marginTop: 12 }}>
            {method === 'paystack' ? 'Access Granted!' : 'Submitted!'}
          </h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14 }}>
            {method === 'paystack'
              ? 'Your subscription is now active. Redirecting…'
              : 'Your payment is pending admin confirmation. You\'ll be notified once approved.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Paystack inline script */}
      <script src="https://js.paystack.co/v1/inline.js" async />

      <div style={s.page}>
        <div style={s.card}>
          {/* Header */}
          <div style={s.headerBand}>
            <h2 style={s.heading}>💳 Complete Your Subscription</h2>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>
              Unlock full NMCN CBT access
            </p>
          </div>

          {/* Plan selector */}
          <div style={{ padding: '20px 20px 0' }}>
            <p style={s.label}>Selected Plan</p>
            <div style={s.planRow}>
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlan(p)}
                  style={{
                    ...s.planBtn,
                    borderColor:      plan.id === p.id ? p.color : 'rgba(255,255,255,0.1)',
                    background:       plan.id === p.id ? `${p.color}22` : 'transparent',
                    color:            plan.id === p.id ? p.color : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{p.label}</span>
                  <span style={{ fontSize: 12 }}>₦{p.price.toLocaleString()}</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{p.days} days</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount summary */}
          <div style={s.summary}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Total</span>
            <span style={{ color: '#0D9488', fontWeight: 900, fontSize: 26 }}>
              ₦{plan.price.toLocaleString()}
            </span>
          </div>

          {/* Method selector */}
          <div style={{ padding: '0 20px' }}>
            <p style={s.label}>Payment Method</p>
            <div style={s.methodRow}>
              <button
                onClick={() => setMethod('paystack')}
                style={{ ...s.methodBtn, borderColor: method === 'paystack' ? '#0D9488' : 'rgba(255,255,255,0.1)', background: method === 'paystack' ? 'rgba(13,148,136,0.15)' : 'transparent' }}
              >
                <span style={{ fontSize: 22 }}>💳</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Pay Online</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Card / Transfer / USSD</span>
              </button>
              <button
                onClick={() => setMethod('manual')}
                style={{ ...s.methodBtn, borderColor: method === 'manual' ? '#F59E0B' : 'rgba(255,255,255,0.1)', background: method === 'manual' ? 'rgba(245,158,11,0.15)' : 'transparent' }}
              >
                <span style={{ fontSize: 22 }}>🏦</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Bank Transfer</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Manual confirmation</span>
              </button>
            </div>
          </div>

          {/* ── Paystack section ── */}
          {method === 'paystack' && (
            <div style={s.section}>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 16 }}>
                You'll be redirected to Paystack's secure payment page. Pay with card, bank transfer, or USSD.
              </p>
              <button onClick={handlePaystack} style={{ ...s.primaryBtn, background: '#0D9488' }}>
                🔒 Pay ₦{plan.price.toLocaleString()} Securely
              </button>
            </div>
          )}

          {/* ── Manual section ── */}
          {method === 'manual' && (
            <div style={s.section}>
              <div style={s.bankBox}>
                <p style={s.bankTitle}>Transfer to this account:</p>
                <div style={s.bankRow}><span>Bank</span><strong>{BANK_DETAILS.bank}</strong></div>
                <div style={s.bankRow}><span>Account No.</span><strong style={{ letterSpacing: 2 }}>{BANK_DETAILS.account}</strong></div>
                <div style={s.bankRow}><span>Account Name</span><strong>{BANK_DETAILS.name}</strong></div>
                <div style={s.bankRow}><span>Amount</span><strong style={{ color: '#0D9488' }}>₦{plan.price.toLocaleString()}</strong></div>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '12px 0 6px' }}>
                After transferring, enter your bank reference or transaction ID below:
              </p>
              <input
                value={proof}
                onChange={e => setProof(e.target.value)}
                placeholder="e.g. FBN2504130001 or any note"
                style={s.input}
              />
              {error && <p style={s.error}>⚠️ {error}</p>}
              <button
                onClick={handleManual}
                disabled={uploading}
                style={{ ...s.primaryBtn, background: '#F59E0B', opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? 'Submitting…' : '📤 Submit Payment Proof'}
              </button>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                Admin will confirm within a few hours and activate your access.
              </p>
            </div>
          )}

          {method === 'paystack' && error && <p style={{ ...s.error, margin: '0 20px 16px' }}>⚠️ {error}</p>}
        </div>
      </div>
    </>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'linear-gradient(135deg,#010810,#0A1628)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    overflow: 'hidden',
    backdropFilter: 'blur(12px)',
  },
  headerBand: {
    background: 'linear-gradient(135deg,#010810,#0F2A4A)',
    borderBottom: '1px solid rgba(13,148,136,0.3)',
    padding: '22px 20px',
  },
  heading: {
    color: '#fff',
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.3rem',
    margin: 0,
    marginBottom: 4,
  },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 0 },
  planRow: { display: 'flex', gap: 8, marginBottom: 16 },
  planBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '10px 6px',
    border: '1.5px solid',
    borderRadius: 12,
    cursor: 'pointer',
    background: 'transparent',
    transition: 'all 0.2s',
  },
  summary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '0 20px 16px',
    padding: '12px 16px',
    background: 'rgba(13,148,136,0.08)',
    borderRadius: 10,
    border: '1px solid rgba(13,148,136,0.2)',
  },
  methodRow: { display: 'flex', gap: 10, marginBottom: 4 },
  methodBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '14px 8px',
    border: '1.5px solid',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  section: { padding: '16px 20px 20px' },
  bankBox: {
    background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  bankTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 0 },
  bankRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
  },
  primaryBtn: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: 12,
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
  error: { color: '#EF4444', fontSize: 13, margin: '0 0 10px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' },
};
