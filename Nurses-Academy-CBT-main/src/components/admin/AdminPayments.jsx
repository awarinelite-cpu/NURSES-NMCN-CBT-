// src/components/admin/AdminPayments.jsx
// Allows admin to view all payments and confirm/reject manual bank transfers
import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, getDocs, doc, addDoc,
  updateDoc, serverTimestamp, writeBatch, increment,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const STATUS_COLORS = {
  confirmed: { color: '#16A34A', bg: 'rgba(22,163,74,0.12)',  label: '✅ Confirmed' },
  pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: '⏳ Pending'   },
  rejected:  { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  label: '❌ Rejected'  },
};

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');  // 'all' | 'pending' | 'confirmed' | 'rejected'
  const [busy,     setBusy]     = useState({});      // { paymentId: true } while processing

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc')));
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* ── Confirm a manual payment and grant subscription ── */
  const confirm = async (payment) => {
    setBusy(b => ({ ...b, [payment.id]: true }));
    try {
      const planDays = payment.days || (payment.plan === 'basic' ? 30 : payment.plan === 'standard' ? 90 : 180);
      const expiresAt = new Date(Date.now() + planDays * 86400000);

      const batch = writeBatch(db);

      // Update payment status
      batch.update(doc(db, 'payments', payment.id), {
        status:      'confirmed',
        confirmedAt: serverTimestamp(),
      });

      // Grant subscription to user
      batch.update(doc(db, 'users', payment.userId), {
        subscribed:          true,
        plan:                payment.plan,
        accessLevel:         payment.plan,
        subscriptionPlan:    payment.plan,
        subscriptionExpiry:  expiresAt.toISOString(),
        subscribedAt:        serverTimestamp(),
        expiresAt,
      });

      await batch.commit();

      // Notify the student
      await addDoc(collection(db, 'notifications'), {
        userId:    payment.userId,
        title:     '🎉 Payment Confirmed!',
        body:      `Your ${payment.plan} plan has been activated. Enjoy full access for ${planDays} days!`,
        type:      'payment_confirmed',
        read:      false,
        createdAt: serverTimestamp(),
      });

      setPayments(prev =>
        prev.map(p => p.id === payment.id ? { ...p, status: 'confirmed' } : p)
      );
    } catch (e) {
      alert('Error confirming payment: ' + e.message);
    } finally {
      setBusy(b => ({ ...b, [payment.id]: false }));
    }
  };

  /* ── Reject a manual payment ── */
  const reject = async (paymentId) => {
    if (!window.confirm('Reject this payment?')) return;
    setBusy(b => ({ ...b, [paymentId]: true }));
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        status:     'rejected',
        rejectedAt: serverTimestamp(),
      });
      setPayments(prev =>
        prev.map(p => p.id === paymentId ? { ...p, status: 'rejected' } : p)
      );
    } catch (e) {
      alert('Error rejecting payment: ' + e.message);
    } finally {
      setBusy(b => ({ ...b, [paymentId]: false }));
    }
  };

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter);
  const pendingCount = payments.filter(p => p.status === 'pending').length;

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerGlow} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontFamily: "'Playfair Display',serif", margin: 0 }}>
              💰 Payment Management
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '4px 0 0' }}>
              Confirm manual transfers · View Paystack payments
            </p>
          </div>
          {pendingCount > 0 && (
            <div style={s.pendingBadge}>
              ⚠️ {pendingCount} pending
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={s.tabs}>
        {['all', 'pending', 'confirmed', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...s.tab,
              borderBottomColor: filter === f ? '#0D9488' : 'transparent',
              color: filter === f ? '#0D9488' : 'rgba(255,255,255,0.45)',
              fontWeight: filter === f ? 700 : 400,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && (
              <span style={s.dot}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', padding: 32, textAlign: 'center' }}>Loading payments…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', padding: 32, textAlign: 'center' }}>No payments found.</p>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['User', 'Plan', 'Amount', 'Method', 'Reference / Proof', 'Date', 'Status', 'Action'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
                const date = p.createdAt?.toDate?.()?.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) || '—';
                return (
                  <tr key={p.id} style={s.tr}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{p.userName || '—'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.userEmail || ''}</div>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.planChip, background: p.plan === 'premium' ? 'rgba(124,58,237,0.2)' : p.plan === 'standard' ? 'rgba(37,99,235,0.2)' : 'rgba(13,148,136,0.2)', color: p.plan === 'premium' ? '#A78BFA' : p.plan === 'standard' ? '#60A5FA' : '#2DD4BF' }}>
                        {p.plan}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#0D9488' }}>
                      ₦{(p.amount || 0).toLocaleString()}
                    </td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, color: p.method === 'paystack' ? '#60A5FA' : '#FCD34D' }}>
                        {p.method === 'paystack' ? '💳 Paystack' : '🏦 Manual'}
                      </span>
                    </td>
                    <td style={{ ...s.td, maxWidth: 160 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>
                        {p.reference || p.proof || '—'}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{date}</td>
                    <td style={s.td}>
                      <span style={{ ...s.statusChip, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={s.td}>
                      {p.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => confirm(p)}
                            disabled={busy[p.id]}
                            style={{ ...s.actionBtn, background: 'rgba(22,163,74,0.2)', color: '#16A34A', borderColor: 'rgba(22,163,74,0.4)' }}
                          >
                            {busy[p.id] ? '…' : '✅ Confirm'}
                          </button>
                          <button
                            onClick={() => reject(p.id)}
                            disabled={busy[p.id]}
                            style={{ ...s.actionBtn, background: 'rgba(239,68,68,0.1)', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                          >
                            ❌
                          </button>
                        </div>
                      )}
                      {p.status !== 'pending' && (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  header: {
    background: 'linear-gradient(135deg,#010810,#0F2A4A)',
    border: '1px solid rgba(13,148,136,0.3)',
    borderRadius: 20, padding: '24px 28px', marginBottom: 20,
    position: 'relative', overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 80% 50%, rgba(245,158,11,0.15) 0%, transparent 60%)',
  },
  pendingBadge: {
    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
    color: '#F59E0B', fontWeight: 700, fontSize: 13,
    padding: '6px 14px', borderRadius: 20,
  },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 },
  tab: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    padding: '10px 18px', cursor: 'pointer', fontSize: 14,
    transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
  },
  dot: {
    background: '#F59E0B', color: '#000', borderRadius: 20,
    fontSize: 10, fontWeight: 800, padding: '1px 6px',
  },
  tableWrap: { overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '12px 14px', textAlign: 'left',
    color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.8,
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' },
  td: { padding: '12px 14px', verticalAlign: 'middle' },
  planChip: {
    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
  },
  statusChip: {
    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
  },
  actionBtn: {
    padding: '5px 10px', border: '1px solid', borderRadius: 8,
    cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
  },
};