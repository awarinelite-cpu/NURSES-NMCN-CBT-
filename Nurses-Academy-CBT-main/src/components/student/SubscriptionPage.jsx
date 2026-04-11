// src/components/student/SubscriptionPage.jsx
import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../shared/Toast';
import { ACCESS_PLANS, BANK_DETAILS } from '../../data/categories';

export default function SubscriptionPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [selectedPlan, setSelectedPlan] = useState('standard');
  const [payMode,  setPayMode]          = useState(null); // 'bank' | 'code'
  const [step,     setStep]             = useState(1);    // 1=plans, 2=pay
  const [file,     setFile]             = useState(null);
  const [preview,  setPreview]          = useState(null);
  const [note,     setNote]             = useState('');
  const [code,     setCode]             = useState('');
  const [loading,  setLoading]          = useState(false);

  const plan = ACCESS_PLANS.find(p => p.id === selectedPlan);

  // ── Bank transfer receipt ────────────────────────────────────────
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'error'); return; }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const r = new FileReader();
      r.onloadend = () => setPreview(r.result);
      r.readAsDataURL(f);
    }
  };

  const submitReceipt = async () => {
    if (!file) { toast('Please select your receipt', 'error'); return; }
    setLoading(true);
    try {
      const fileData = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result);
        r.onerror   = reject;
        r.readAsDataURL(file);
      });
      await addDoc(collection(db, 'payments'), {
        userId:      user.uid,
        userName:    profile?.name || user.displayName,
        userEmail:   user.email,
        plan:        selectedPlan,
        amount:      plan.price,
        receiptData: fileData,
        receiptName: file.name,
        note,
        status:      'pending',
        createdAt:   serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        userId: 'admin', title: '💳 New Payment Receipt',
        body:   `${profile?.name || 'A student'} submitted a receipt for ${plan.label} (₦${plan.price.toLocaleString()})`,
        type: 'payment', read: false, createdAt: serverTimestamp(),
      });
      toast('Receipt submitted! Admin will confirm within 24 hours.', 'success');
      setStep(3);
    } catch (e) { toast('Submission failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── Access code ──────────────────────────────────────────────────
  const redeemCode = async () => {
    if (!code.trim()) { toast('Enter your access code', 'error'); return; }
    setLoading(true);
    try {
      const { getDocs, query, collection: col, where, updateDoc, doc } = await import('firebase/firestore');
      const snap = await getDocs(query(col(db, 'accessCodes'), where('code', '==', code.trim().toUpperCase()), where('used', '==', false)));
      if (snap.empty) { toast('Invalid or already used code', 'error'); setLoading(false); return; }
      const codeDoc = snap.docs[0];
      const codeData = codeDoc.data();
      const planData = ACCESS_PLANS.find(p => p.id === codeData.plan);
      const expiry   = new Date();
      expiry.setDate(expiry.getDate() + (codeData.plan === 'basic' ? 30 : codeData.plan === 'standard' ? 90 : 180));
      // Mark code used
      await updateDoc(doc(db, 'accessCodes', codeDoc.id), { used: true, usedBy: user.uid, usedAt: serverTimestamp() });
      // Grant subscription
      await updateDoc(doc(db, 'users', user.uid), {
        subscribed: true, accessLevel: codeData.plan, subscriptionPlan: codeData.plan,
        subscriptionExpiry: expiry.toISOString(), updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      toast(`🎉 Access code redeemed! ${planData?.label || codeData.plan} plan activated.`, 'success');
      setStep(3);
    } catch (e) { toast('Redemption failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  if (profile?.subscribed) {
    const exp = profile.subscriptionExpiry ? new Date(profile.subscriptionExpiry).toLocaleDateString() : '—';
    return (
      <div style={{ padding: 24, maxWidth: 600 }}>
        <div style={{
          background: 'linear-gradient(135deg,#0D9488,#1E3A8A)', borderRadius: 20, padding: '32px 28px',
          textAlign: 'center', color: '#fff',
        }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🌟</div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', margin: '0 0 8px' }}>
            You're a Premium Member!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', margin: '0 0 16px' }}>
            Plan: <strong>{profile.subscriptionPlan || 'Premium'}</strong>
          </p>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>
            Access valid until: <strong>{exp}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif" }}>💎 Upgrade Your Plan</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
          Unlock full access to all NMCN past questions, AI explanations & analytics
        </p>
      </div>

      {/* Step 1 — Select plan */}
      {step === 1 && (
        <>
          <div style={styles.plansGrid}>
            {ACCESS_PLANS.filter(p => p.id !== 'free').map(p => (
              <div key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                style={{
                  ...styles.planCard,
                  border: `2px solid ${selectedPlan === p.id ? p.color : 'var(--border)'}`,
                  background: selectedPlan === p.id ? `${p.color}12` : 'var(--bg-card)',
                  transform: selectedPlan === p.id ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: p.color, color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                  }}>
                    ⭐ MOST POPULAR
                  </div>
                )}
                <div style={{ ...styles.planBadge, background: p.color }}>{p.label}</div>
                <div style={{ ...styles.planPrice, color: p.color }}>
                  ₦{p.price.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{p.duration}</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: p.color, flexShrink: 0 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                {selectedPlan === p.id && (
                  <div style={{ marginTop: 16, textAlign: 'center', fontWeight: 700, color: p.color, fontSize: 13 }}>
                    ✅ Selected
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button className="btn btn-primary btn-lg" onClick={() => setStep(2)}>
              Continue with {plan?.label} — ₦{plan?.price?.toLocaleString()} →
            </button>
          </div>
        </>
      )}

      {/* Step 2 — Payment method */}
      {step === 2 && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← Back</button>
            <div style={{ fontWeight: 700 }}>
              {plan?.icon} {plan?.label} — ₦{plan?.price?.toLocaleString()}
            </div>
          </div>

          {!payMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { mode: 'bank', icon: '🏦', title: 'Bank Transfer', desc: 'Transfer to our account and upload receipt' },
                { mode: 'code', icon: '🔑', title: 'Access Code', desc: 'Enter an access code from admin' },
              ].map(m => (
                <div key={m.mode} onClick={() => setPayMode(m.mode)}
                  style={{ ...styles.payMethodCard, cursor: 'pointer' }}>
                  <span style={{ fontSize: 36 }}>{m.icon}</span>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>{m.desc}</div>
                </div>
              ))}
            </div>
          ) : payMode === 'bank' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPayMode(null)}>← Choose Method</button>
              {/* Bank details */}
              <div style={styles.bankBox}>
                <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 12, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  🏦 Bank Transfer Details
                </div>
                {[['Bank', BANK_DETAILS.bank], ['Account No.', BANK_DETAILS.accountNumber], ['Account Name', BANK_DETAILS.accountName], ['Amount', `₦${plan?.price?.toLocaleString()}`]].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight: 700, color: k === 'Amount' ? 'var(--gold)' : 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>
                  ⚠️ Use your registered email as payment description
                </div>
              </div>
              {/* Upload receipt */}
              <div className="form-group">
                <label className="form-label">Upload Receipt (JPG, PNG, or PDF)</label>
                <label style={styles.fileZone}>
                  <span style={{ fontSize: 32 }}>{file ? '📎' : '🧾'}</span>
                  <span style={{ fontWeight: 700 }}>{file ? file.name : 'Tap to select receipt'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Max 5MB</span>
                  <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
                </label>
                {preview && <img src={preview} alt="Receipt" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', marginTop: 8 }} />}
              </div>
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input className="form-input" placeholder="e.g. Transferred today at 3pm" value={note} onChange={e => setNote(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-full btn-lg" onClick={submitReceipt} disabled={loading || !file}>
                {loading ? <><span className="spinner spinner-sm" /> Submitting…</> : '📤 Submit Receipt'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPayMode(null)}>← Choose Method</button>
              <div className="form-group">
                <label className="form-label">Enter Access Code</label>
                <input className="form-input" placeholder="e.g. NMCN-XXXX-XXXX" value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 2 }} />
                <div className="form-hint">Access codes are provided by the admin after manual payment.</div>
              </div>
              <button className="btn btn-primary btn-full btn-lg" onClick={redeemCode} disabled={loading || !code.trim()}>
                {loading ? <><span className="spinner spinner-sm" /> Redeeming…</> : '🔑 Redeem Code'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Success */}
      {step === 3 && (
        <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
          <div style={styles.successCard}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h3 style={{ fontFamily: "'Playfair Display',serif" }}>
              {payMode === 'code' ? 'Access Granted!' : 'Receipt Submitted!'}
            </h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {payMode === 'code'
                ? 'Your subscription has been activated. Enjoy full access!'
                : 'Your receipt is under review. Admin will confirm your payment within 24 hours. You will receive a notification once confirmed.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  plansGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 20 },
  planCard: {
    borderRadius: 18, padding: '24px 20px', cursor: 'pointer',
    transition: 'all 0.25s', position: 'relative', overflow: 'visible',
    display: 'flex', flexDirection: 'column',
  },
  planBadge: {
    color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px',
    borderRadius: 20, width: 'fit-content', marginBottom: 12,
  },
  planPrice: { fontFamily: "'Playfair Display',serif", fontSize: '2rem', fontWeight: 900, marginBottom: 4 },
  payMethodCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '28px 20px', background: 'var(--bg-card)', border: '2px solid var(--border)',
    borderRadius: 16, transition: 'all 0.2s',
  },
  bankBox: {
    background: 'var(--bg-secondary)', border: '1.5px solid rgba(13,148,136,0.25)',
    borderRadius: 12, padding: '16px 18px',
  },
  fileZone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    border: '2px dashed var(--border)', borderRadius: 12, padding: '24px',
    cursor: 'pointer', transition: 'border-color 0.2s', background: 'var(--bg-tertiary)',
  },
  successCard: {
    background: 'var(--bg-card)', border: '2px solid var(--teal)',
    borderRadius: 20, padding: '40px 32px',
  },
};
