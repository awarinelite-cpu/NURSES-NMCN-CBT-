// src/components/shared/AdminWhatsAppButton.jsx
// Persistent floating "Contact Admin on WhatsApp" button.
// Always visible (not just on error) so students can reach out anytime —
// on the subject/course lists, the upgrade/payment screens, etc.

const WHATSAPP_NUMBER = '2348134106745';

function buildLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export default function AdminWhatsAppButton({
  message = 'Hi, I need help with The Elite Nurses app.',
  style = {},
}) {
  return (
    <a
      href={buildLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        borderRadius: 999,
        background: '#25D366',
        color: '#0B1220',
        fontWeight: 800,
        fontSize: 13,
        textDecoration: 'none',
        boxShadow: '0 6px 18px rgba(37,211,102,0.4)',
        border: '1px solid rgba(255,255,255,0.25)',
        ...style,
      }}
      aria-label="Contact Admin on WhatsApp"
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
      <span style={{ display: 'inline-block' }}>Admin on WhatsApp</span>
    </a>
  );
}

// Same link builder, exported for inline (non-floating) uses on the
// payment pages, so those keep their existing button styling.
export { buildLink as buildWhatsAppLink, WHATSAPP_NUMBER };
