// src/components/admin/PaymentsManager.jsx
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { ACCESS_PLANS, BANK_DETAILS } from '../../data/categories';

export default function PaymentsManager() {
  const { toast }         = useToast();
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all'); // all | pending | confirmed | rejected
  const [viewing,  setViewing]  = useState(null);  // payment with receipt image open

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc')));
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Failed to load payments', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p => filter === 'all' ? true : p.status === filter);

  const confirmPayment = async (p) => {
    if (!window.confirm(`Confirm payment and grant ${p.plan} access to ${p.userName}?`)) return;
    try {
      // Update payment status
      await updateDoc(doc(db, 'payments', p.id), { status: 'confirmed', confirmedAt: serverTimestamp() });
      // Update user subscription
      const planData = ACCESS_PLANS.find(pl => pl.id === p.plan);
      const expiry   = new Date();
      expiry.setDate(expiry.getDate() + (p.plan === 'basic' ? 30 : p.plan === 'standard' ? 90 : 180));
      await updateDoc(doc(db, 'users', p.userId), {
        subscribed: true, accessLevel: p.plan, subscriptionPlan: p.plan,
        subscriptionExpiry: expiry.toISOString(), updatedAt: serverTimestamp(),
      });
      // Notify user
      await addDoc(collection(db, 'notifications'), {
        userId: p.userId, title: '✅ Payment Confirmed!',
        body: `Your ${planData?.label || p.plan} subscription has been activated. Enjoy full access!`,
        type: 'payment', read: false, createdAt: serverTimestamp(),
      });
      setPayments(prev => prev.map(x => x.id === p.id ? { ...x, status: 'confirmed' } : x));
      toast('Payment confirmed & subscription activated!', 'success');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const rejectPayment = async (p) => {
    const reason = prompt('Reason for rejection (will be sent to student):');
    if (reason === null) return;
    try {
      await updateDoc(doc(db, 'payments', p.id), { status: 'rejected', rejectionReason: reason, updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'notifications'), {
        userId: p.userId, title: '❌ Payment Rejected',
        body: `Your payment was not confirmed. Reason: ${reason || 'Please contact admin.'}`,
        type: 'payment', read: false, createdAt: serverTimestamp(),
      });
      setPayments(prev => prev.map(x => x.id === p.id ? { ...x, status: 'rejected' } : x));
      toast('Payment rejected & user notified', 'success');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const totals = {
    pending:   payments.filter(p => p.status === 'pending').length,
    confirmed: payments.filter(p => p.status === 'confirmed').length,
    revenue:   payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + (p.amount || 0), 0),
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>💰 Payments Manager</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>Confirm or reject manual payment receipts</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Pending Review', value: totals.pending,   icon: '⏳', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
          { label: 'Confirmed',      value: totals.confirmed, icon: '✅', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
          { label: 'Total Revenue',  value: `₦${totals.revenue.toLocaleString()}`, icon: '💰', color: '#0D9488', bg: 'rgba(13,148,136,0.12)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bank details reminder */}
      <div className="alert alert-info" style={{ marginBottom: 20, fontSize: 13 }}>
        <div>
          <strong>🏦 Bank Account:</strong> {BANK_DETAILS.bank} · {BANK_DETAILS.accountNumber} · {BANK_DETAILS.accountName}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, marginBottom: 18, width: 'fit-content' }}>
        {[['all','All'], ['pending','Pending'], ['confirmed','Confirmed'], ['rejected','Rejected']].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              background: filter === v ? 'var(--teal)' : 'transparent', color: filter === v ? '#fff' : 'var(--text-muted)',
            }}>
            {l} {v !== 'all' && `(${payments.filter(p => v === 'all' || p.status === v).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: 40 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No payments found</div>
          )}
          {filtered.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-card)', border: `1.5px solid ${p.status === 'confirmed' ? 'rgba(22,163,74,0.3)' : p.status === 'rejected' ? 'rgba(220,38,38,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: 14, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                {/* User info */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, color: '#fff', fontSize: 18,
                  }}>
                    {(p.userName || 'U')[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.userName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.userEmail}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 700 }}>₦{(p.amount || 0).toLocaleString()}</span>
                      {' · '}
                      <span className={`badge ${p.plan === 'premium' ? 'badge-teal' : 'badge-blue'}`} style={{ fontSize: 10 }}>{p.plan}</span>
                    </div>
                  </div>
                </div>

                {/* Status & actions */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span className={`badge ${p.status === 'confirmed' ? 'badge-green' : p.status === 'rejected' ? 'badge-red' : 'badge-gold'}`}>
                    {p.status === 'confirmed' ? '✅ Confirmed' : p.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {p.createdAt?.toDate ? new Date(p.createdAt.toDate()).toLocaleString() : 'Just now'}
                  </div>
                  {p.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {p.receiptData && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewing(p)}>
                          🖼️ View Receipt
                        </button>
                      )}
                      <button className="btn btn-primary btn-sm" onClick={() => confirmPayment(p)}>
                        ✅ Confirm
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => rejectPayment(p)}>
                        ❌ Reject
                      </button>
                    </div>
                  )}
                  {p.status !== 'pending' && p.receiptData && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setViewing(p)}>🖼️ View Receipt</button>
                  )}
                </div>
              </div>
              {p.note && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  📝 {p.note}
                </div>
              )}
              {p.rejectionReason && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--red)' }}>
                  Rejection reason: {p.rejectionReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Receipt modal */}
      {viewing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, padding: 20,
        }} onClick={() => setViewing(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 24,
            maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>🧾 Payment Receipt</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewing(null)}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>{viewing.userName}</strong> · ₦{(viewing.amount || 0).toLocaleString()} · {viewing.plan}
            </div>
            {viewing.receiptData?.startsWith('data:image') ? (
              <img src={viewing.receiptData} alt="Receipt" style={{ width: '100%', borderRadius: 10 }} />
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                📄 Non-image receipt uploaded. Download link not available in preview.
              </div>
            )}
            {viewing.status === 'pending' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-primary btn-full" onClick={() => { confirmPayment(viewing); setViewing(null); }}>✅ Confirm Payment</button>
                <button className="btn btn-danger" onClick={() => { rejectPayment(viewing); setViewing(null); }}>❌ Reject</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
