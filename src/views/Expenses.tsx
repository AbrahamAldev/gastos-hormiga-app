import { useMemo, useState } from 'react';
import { client, type UserData } from '../store';
import { CATEGORIES, catOf, download, fmt, hoursText, inRange, periodRange, prettyDate, sum, toCSV, today, type Period } from '../lib';
import { Empty, Segmented } from '../ui';

type Range = 'periodo' | 'mes' | 'todo';

export default function Expenses({ data }: { data: UserData }) {
  const p = data.profile!;
  const cur = p.currency ?? 'MXN';
  const [view, setView] = useState<'gastos' | 'ingresos'>('gastos');
  const [range, setRange] = useState<Range>('mes');
  const [cat, setCat] = useState('todas');
  const [kind, setKind] = useState('todos');

  const filtered = useMemo(() => {
    const r = range === 'periodo' ? periodRange((p.payPeriod as Period) ?? 'quincenal') : range === 'mes' ? periodRange('mensual') : null;
    return data.expenses
      .filter((e) => (r ? inRange(e.date, r.start, r.end) : true))
      .filter((e) => cat === 'todas' || e.category === cat)
      .filter((e) => kind === 'todos' || e.necessity === kind)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [data.expenses, range, cat, kind, p.payPeriod]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof filtered>();
    filtered.forEach((e) => g.set(e.date, [...(g.get(e.date) ?? []), e]));
    return [...g.entries()];
  }, [filtered]);

  const total = sum(filtered.map((e) => e.amount));
  const byKind = (k: string) => sum(filtered.filter((e) => e.necessity === k).map((e) => e.amount));

  return (
    <>
      <header className="page-head">
        <h1>Movimientos</h1>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'gastos', label: 'Gastos' },
            { id: 'ingresos', label: 'Ingresos' },
          ]}
        />
      </header>

      {view === 'ingresos' ? (
        <Incomes data={data} />
      ) : (
        <>
          <div className="glass card">
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { id: 'periodo', label: p.payPeriod === 'semanal' ? 'Semana' : p.payPeriod === 'mensual' ? 'Periodo' : 'Quincena' },
                { id: 'mes', label: 'Mes' },
                { id: 'todo', label: 'Todo' },
              ]}
            />
            <div className="grid2 mt">
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="todas">Todas las categorías</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="todos">Todos los tipos</option>
                <option value="necesario">Necesarios</option>
                <option value="deseo">Gustos</option>
                <option value="hormiga">🐜 Hormiga</option>
              </select>
            </div>
            <div className="split mt">
              <div>
                <small>Total</small>
                <b>{fmt(total, cur)}</b>
              </div>
              <div>
                <small>Necesario</small>
                <b>{fmt(byKind('necesario'), cur)}</b>
              </div>
              <div>
                <small>Gustos</small>
                <b>{fmt(byKind('deseo'), cur)}</b>
              </div>
              <div>
                <small>🐜</small>
                <b className="warn-text">{fmt(byKind('hormiga'), cur)}</b>
              </div>
            </div>
            {total > 0 && hoursText(total, p) && <p className="hint">Este periodo te costó {hoursText(total, p)}.</p>}
            <button className="btn ghost block mt" disabled={!data.expenses.length} onClick={() => download(`hormiga-gastos-${today()}.csv`, toCSV(data.expenses))}>
              ⬇︎ Exportar todo a CSV (gratis, siempre)
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="glass card">
              <Empty emoji="🧾" title="Nada por aquí" text="Registra gastos con el botón + o cambia los filtros." />
            </div>
          ) : (
            groups.map(([date, items]) => (
              <section key={date}>
                <div className="row-between day-head">
                  <span>{prettyDate(date)}</span>
                  <span>{fmt(sum(items.map((e) => e.amount)), cur)}</span>
                </div>
                <div className="glass card list">
                  {items.map((e) => {
                    const c = catOf(e.category);
                    return (
                      <div key={e.id} className="list-row">
                        <span className="cat-emoji">{c.emoji}</span>
                        <div className="grow">
                          <b>{e.merchant || c.label}</b>
                          <small>
                            {c.label}
                            {e.necessity === 'hormiga' ? ' · 🐜 hormiga' : e.necessity === 'deseo' ? ' · gusto' : ''}
                            {e.mood ? ` · ${e.mood}` : ''}
                            {e.note ? ` · ${e.note}` : ''}
                          </small>
                        </div>
                        <div className="right">
                          <b>-{fmt(e.amount, cur)}</b>
                          <button className="icon-btn danger" aria-label="Eliminar" onClick={() => confirm('¿Eliminar este gasto?') && client.models.Expense.delete({ id: e.id })}>
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}

function Incomes({ data }: { data: UserData }) {
  const cur = data.profile?.currency ?? 'MXN';
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [date, setDate] = useState(today());
  const list = [...data.incomes].sort((a, b) => b.date.localeCompare(a.date));
  const month = periodRange('mensual');
  const monthTotal = sum(data.incomes.filter((i) => inRange(i.date, month.start, month.end)).map((i) => i.amount));

  async function add() {
    const a = parseFloat(amount);
    if (!a) return;
    await client.models.Income.create({ amount: a, source: source || null, date });
    setAmount('');
    setSource('');
  }

  return (
    <>
      <div className="glass card">
        <p className="muted">
          ¿Ingreso irregular o freelance? Registra cada pago al recibirlo: Hormiga presupuesta sólo con dinero que ya tienes.
        </p>
        <div className="grid2">
          <label className="field">
            <span>Monto</span>
            <input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Fuente</span>
          <input value={source} placeholder="Quincena, cliente, venta…" onChange={(e) => setSource(e.target.value)} />
        </label>
        <button className="btn primary block" onClick={add}>
          Agregar ingreso
        </button>
        <p className="hint">Este mes: {fmt(monthTotal, cur)}</p>
      </div>
      {list.length > 0 && (
        <div className="glass card list">
          {list.map((i) => (
            <div key={i.id} className="list-row">
              <span className="cat-emoji">💰</span>
              <div className="grow">
                <b>{i.source || 'Ingreso'}</b>
                <small>{prettyDate(i.date)}</small>
              </div>
              <div className="right">
                <b className="pos">+{fmt(i.amount, cur)}</b>
                <button className="icon-btn danger" aria-label="Eliminar" onClick={() => client.models.Income.delete({ id: i.id })}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
