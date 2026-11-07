import { useState } from 'react';
import { client, type UserData } from '../store';
import { CATEGORIES, catOf, daysBetween, fmt, inRange, parseDate, periodRange, sum, today, type Goal } from '../lib';
import { Empty, Progress, Segmented, Sheet } from '../ui';

export default function Plan({ data }: { data: UserData }) {
  const [view, setView] = useState<'presupuestos' | 'metas'>('presupuestos');
  return (
    <>
      <header className="page-head">
        <h1>Tu plan</h1>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'presupuestos', label: 'Presupuestos' },
            { id: 'metas', label: 'Metas de ahorro' },
          ]}
        />
      </header>
      {view === 'presupuestos' ? <Budgets data={data} /> : <Goals data={data} />}
    </>
  );
}

function Budgets({ data }: { data: UserData }) {
  const cur = data.profile?.currency ?? 'MXN';
  const [category, setCategory] = useState('cafe');
  const [limit, setLimit] = useState('');
  const month = periodRange('mensual');
  const used = new Set(data.budgets.map((b) => b.category));
  const totalLimit = sum(data.budgets.map((b) => b.monthlyLimit));
  const income = data.profile?.monthlyIncome ?? 0;

  async function add() {
    const l = parseFloat(limit);
    if (!l) return;
    const existing = data.budgets.find((b) => b.category === category);
    if (existing) await client.models.Budget.update({ id: existing.id, monthlyLimit: l });
    else await client.models.Budget.create({ category, monthlyLimit: l });
    setLimit('');
  }

  return (
    <>
      <div className="glass card">
        <p className="muted">Pon un tope mensual por categoría. Te avisamos al llegar al 80% y al 100%.</p>
        <div className="grid2">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
                {used.has(c.id) ? ' (editar)' : ''}
              </option>
            ))}
          </select>
          <input inputMode="decimal" placeholder="Límite mensual" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <button className="btn primary block mt" onClick={add}>
          Guardar límite
        </button>
        {income > 0 && totalLimit > 0 && (
          <p className="hint">
            Tus límites suman {fmt(totalLimit, cur)} ({Math.round((totalLimit / income) * 100)}% de tu ingreso).
          </p>
        )}
      </div>

      {data.budgets.length === 0 ? (
        <div className="glass card">
          <Empty emoji="📊" title="Sin presupuestos" text="Empieza por tus hormigas: café, antojos y delivery." />
        </div>
      ) : (
        <div className="glass card stack">
          {[...data.budgets]
            .sort((a, b) => a.category.localeCompare(b.category))
            .map((b) => {
              const c = catOf(b.category);
              const s = sum(data.expenses.filter((e) => e.category === b.category && inRange(e.date, month.start, month.end)).map((e) => e.amount));
              const left = b.monthlyLimit - s;
              return (
                <div key={b.id}>
                  <div className="row-between">
                    <span>
                      {c.emoji} {c.label}
                    </span>
                    <span className="row">
                      <b>
                        {fmt(s, cur)} / {fmt(b.monthlyLimit, cur)}
                      </b>
                      <button className="icon-btn danger" aria-label="Eliminar" onClick={() => client.models.Budget.delete({ id: b.id })}>
                        ✕
                      </button>
                    </span>
                  </div>
                  <Progress value={s} max={b.monthlyLimit} />
                  <small className={left < 0 ? 'neg' : 'muted'}>{left >= 0 ? `Te quedan ${fmt(left, cur)}` : `Excedido por ${fmt(-left, cur)}`}</small>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}

const GOAL_EMOJIS = ['🛟', '✈️', '🏠', '🚗', '🎓', '💻', '💍', '💳', '🎁', '🌴'];

function Goals({ data }: { data: UserData }) {
  const cur = data.profile?.currency ?? 'MXN';
  const [open, setOpen] = useState(false);
  const [deposit, setDeposit] = useState<Goal | null>(null);
  const [amt, setAmt] = useState('');

  // Fondo de emergencia sugerido: 3 meses de gasto promedio (últimos 90 días)
  const now = parseDate(today());
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
  const spent90 = sum(data.expenses.filter((e) => inRange(e.date, from, now)).map((e) => e.amount));
  const monthlyAvg = spent90 > 0 ? spent90 / 3 : data.profile?.monthlyIncome ?? 0;
  const hasEmergency = data.goals.some((g) => g.kind === 'emergencia');

  async function addDeposit() {
    const a = parseFloat(amt);
    if (!deposit || !a) return;
    await client.models.Goal.update({ id: deposit.id, saved: (deposit.saved ?? 0) + a });
    setDeposit(null);
    setAmt('');
  }

  return (
    <>
      {!hasEmergency && monthlyAvg > 0 && (
        <button
          className="glass card insight good"
          onClick={() => client.models.Goal.create({ name: 'Fondo de emergencia', emoji: '🛟', target: Math.round(monthlyAvg * 3), saved: 0, kind: 'emergencia' })}
        >
          <span className="insight-icon">🛟</span>
          <span>
            <b>Crea tu fondo de emergencia: {fmt(Math.round(monthlyAvg * 3), cur)}</b>
            <small>Equivale a 3 meses de tus gastos. Te protege de endeudarte cuando surge un imprevisto. Toca para crearlo.</small>
          </span>
        </button>
      )}

      {data.goals.length === 0 ? (
        <div className="glass card">
          <Empty emoji="🎯" title="Sin metas todavía" text="Una meta con nombre y fecha hace que ahorrar sea más fácil." />
        </div>
      ) : (
        <div className="stack">
          {data.goals.map((g) => {
            const saved = g.saved ?? 0;
            const left = Math.max(0, g.target - saved);
            const days = g.deadline ? daysBetween(now, parseDate(g.deadline)) : 0;
            const perMonth = days > 0 ? left / (days / 30.4) : 0;
            return (
              <div key={g.id} className="glass card goal">
                <div className="row-between">
                  <div className="row">
                    <span className="cat-emoji lg">{g.emoji ?? '🎯'}</span>
                    <div>
                      <b>{g.name}</b>
                      <small>
                        {fmt(saved, cur)} de {fmt(g.target, cur)}
                      </small>
                    </div>
                  </div>
                  <b className="pos">{Math.round((saved / g.target) * 100)}%</b>
                </div>
                <Progress value={saved} max={g.target} tone="accent" />
                {left === 0 ? (
                  <p className="hint">🎉 ¡Meta cumplida!</p>
                ) : g.deadline ? (
                  <p className="hint">
                    {days > 0 ? `Aparta ${fmt(perMonth, cur)} al mes para llegar a tiempo (${days} días).` : 'La fecha ya pasó: ajústala o sigue sumando.'}
                  </p>
                ) : null}
                <div className="row mt">
                  <button className="btn primary sm" onClick={() => setDeposit(g)}>
                    + Abonar
                  </button>
                  <button className="btn ghost sm" onClick={() => confirm(`¿Eliminar la meta "${g.name}"?`) && client.models.Goal.delete({ id: g.id })}>
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn ghost block" onClick={() => setOpen(true)}>
        + Nueva meta
      </button>

      <NewGoal open={open} onClose={() => setOpen(false)} />

      <Sheet open={!!deposit} onClose={() => setDeposit(null)} title={`Abonar a ${deposit?.name ?? ''}`}>
        <div className="amount-input">
          <span>$</span>
          <input autoFocus inputMode="decimal" placeholder="0" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <button className="btn primary block" onClick={addDeposit}>
          Guardar abono
        </button>
      </Sheet>
    </>
  );
}

function NewGoal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [kind, setKind] = useState('meta');

  async function save() {
    const t = parseFloat(target);
    if (!name.trim() || !t) return;
    await client.models.Goal.create({ name: name.trim(), emoji, target: t, saved: 0, deadline: deadline || null, kind });
    setName('');
    setTarget('');
    setDeadline('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nueva meta">
      <div className="chips wrap">
        {GOAL_EMOJIS.map((e) => (
          <button key={e} className={`chip ${emoji === e ? 'on' : ''}`} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Tipo</span>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { id: 'meta', label: 'Meta' },
            { id: 'emergencia', label: 'Emergencia' },
            { id: 'deuda', label: 'Pagar deuda' },
          ]}
        />
      </label>
      <label className="field">
        <span>Nombre</span>
        <input value={name} placeholder="Ej. Viaje a Oaxaca" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Monto objetivo</span>
          <input inputMode="decimal" value={target} placeholder="0" onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="field">
          <span>Fecha (opcional)</span>
          <input type="date" value={deadline} min={today()} onChange={(e) => setDeadline(e.target.value)} />
        </label>
      </div>
      <button className="btn primary block" onClick={save}>
        Crear meta
      </button>
    </Sheet>
  );
}
