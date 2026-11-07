import { useEffect, type ReactNode } from 'react';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet glass" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, max, tone }: { value: number; max: number; tone?: 'auto' | 'accent' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = tone === 'accent' ? 'ok' : pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="progress" aria-valuenow={Math.round(pct)} role="progressbar">
      <span className={cls} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, max, size = 132, children }: { value: number; max: number; size?: number; children?: ReactNode }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 1 ? 'var(--red)' : pct >= 0.8 ? 'var(--orange)' : 'var(--accent)';
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="ring-value"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
