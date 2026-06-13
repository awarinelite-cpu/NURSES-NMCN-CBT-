// src/components/shared/Sidebar.jsx
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STUDENT_NAV = [
  { to: '/dashboard',      icon: '🏠', label: 'Dashboard'      },
  { to: '/daily-practice', icon: '⚡', label: 'Daily Practice' },
  { to: '/course-drill',   icon: '📖', label: 'Course Drill'   },
  { to: '/topic-drill',    icon: '🎯', label: 'Topic Drill'    },
  { to: '/mock-exams',     icon: '📋', label: 'Mock Exams'     },
  { to: '/bookmarks',      icon: '🔖', label: 'Bookmarked'     },
  { to: '/results',        icon: '📊', label: 'My Results'     },
  { to: '/performance',    icon: '📈', label: 'Analysis'       },
  { to: '/leaderboard',    icon: '🏆', label: 'Leaderboard'    },
  { to: '/subscription',   icon: '💳', label: 'Subscription'   },
  { to: '/profile',        icon: '👤', label: 'Profile'        },
];

const ENTRANCE_NAV = [
  { to: '/entrance-exam',                 icon: '🏠', label: 'Dashboard'            },
  { to: '/entrance-exam/daily-mock',      icon: '📅', label: 'Daily Mock Exam'      },
  { to: '/entrance-exam/schools',         icon: '🏫', label: 'School Past Questions' },
  { to: '/entrance-exam/subject-drill',   icon: '📚', label: 'Subject Drill'        },
  { to: '/entrance-exam/exams-taken',     icon: '📋', label: 'Exams Taken'          },
  { to: '/entrance-exam/bookmarks',       icon: '🔖', label: 'Bookmarks'            },
  { to: '/entrance-exam/my-results',      icon: '📊', label: 'My Results'           },
  { to: '/entrance-exam/analysis',        icon: '📈', label: 'Analysis'             },
  { to: '/entrance-exam/leaderboard',     icon: '🏆', label: 'Leaderboard'          },
  { to: '/entrance-exam/payment',          icon: '💳', label: 'Registration'         },
  { to: '/profile',                       icon: '👤', label: 'Profile'              },
];

const ADMIN_NAV = [
  { to: '/admin',                  icon: '🛡️', label: 'Admin Overview'  },
  { to: '/admin/questions',        icon: '❓',  label: 'Questions'       },
  { to: '/admin/users',            icon: '👥',  label: 'Users'           },
  { to: '/admin/payments',         icon: '💰',  label: 'Payments'        },
  { to: '/admin/access-codes',     icon: '🔑',  label: 'Access Codes'    },
  { to: '/admin/announcements',    icon: '📢',  label: 'Announcements'   },
  { to: '/admin/analytics',        icon: '📈',  label: 'Analytics'       },
  { to: '/admin/entrance-exam',    icon: '🏫',  label: 'Entrance Exam'   },
];

const SUBADMIN_NAV = [
  { to: '/subadmin',                        icon: '🔧', label: 'Sub-Admin Home'   },
  { to: '/admin/questions',                 icon: '❓',  label: 'NMCN Questions'   },
  { to: '/admin/entrance-exam',             icon: '🏫',  label: 'Entrance Exam'    },
  { to: '/admin/payments',                  icon: '💰',  label: 'Payments'         },
  { to: '/admin/announcements',             icon: '📢',  label: 'Announcements'    },
  { to: '/admin/scheduled-exams',           icon: '📅',  label: 'Scheduled Exams'  },
];

export default function Sidebar({ open, onClose }) {
  const { profile, logout, isAdmin } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const isSubAdmin    = profile?.role === 'subadmin';
  const isEntranceRoute = location.pathname.startsWith('/entrance-exam');

  const navItems = isAdmin
    ? ADMIN_NAV
    : isSubAdmin
      ? SUBADMIN_NAV
      : isEntranceRoute
        ? ENTRANCE_NAV
        : STUDENT_NAV;

  const brandLabel = isEntranceRoute && !isAdmin && !isSubAdmin
    ? '🏫 Entrance Exam'
    : isAdmin
      ? '🛡️ Admin Mode'
      : isSubAdmin
        ? '🔧 Sub-Admin Mode'
        : '🎓 Student Mode';

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 199, display: 'none',
          }}
          onClick={onClose}
          className="sidebar-overlay"
        />
      )}

      <aside className={`sidebar${open ? ' open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>📚</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, color: '#fff', fontSize: 16 }}>
                NMCN CBT
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {brandLabel}
              </div>
            </div>
          </div>
        </div>

        {/* User badge */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0D9488, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: 15,
            }}>
              {(profile?.name || 'S')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.name || 'Student'}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {profile?.subscribed ? '✅ Subscribed' : '🔒 Free Plan'}
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <ul className="sidebar-nav" style={{ padding: 0 }}>
            {navItems.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={
                    item.to === '/dashboard' ||
                    item.to === '/admin' ||
                    item.to === '/subadmin' ||
                    item.to === '/entrance-exam'
                  }
                  className={({ isActive }) => isActive ? 'active' : ''}
                  onClick={onClose}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Switch section — lets user jump between sections */}
          {isAdmin && (
            <div style={{ marginTop: 16, padding: '0 6px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>
                Switch to
              </div>
              <NavLink
                to="/dashboard"
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.55)', fontSize: 13,
                  fontWeight: 700, textDecoration: 'none',
                  transition: 'all .2s',
                }}
              >
                <span>🎓</span> Student View
              </NavLink>
            </div>
          )}
          {!isAdmin && (
            <div style={{ marginTop: 16, padding: '0 6px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>
                Switch to
              </div>
              {isEntranceRoute ? (
                <NavLink
                  to="/dashboard"
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.55)', fontSize: 13,
                    fontWeight: 700, textDecoration: 'none',
                    transition: 'all .2s',
                  }}
                >
                  <span>📝</span> NMCN CBT Exams
                </NavLink>
              ) : (
                <NavLink
                  to="/entrance-exam"
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.55)', fontSize: 13,
                    fontWeight: 700, textDecoration: 'none',
                    transition: 'all .2s',
                  }}
                >
                  <span>🏫</span> Entrance Exams
                </NavLink>
              )}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={async () => { await logout(); navigate('/'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px', background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10,
              color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
