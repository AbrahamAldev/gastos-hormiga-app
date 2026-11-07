import { useMemo, useState } from 'react';
import type { UserData } from '../store';
import { detectAnts, fmt, futureValue, hoursText, sum } from '../lib';
import { Empty } from '../ui';

export default function Ants({ data }: { data: UserData }) {
  const p = data.profile!;
  const cur = p.currency ?? 'MXN';
  const [cut, setCut] = useState(50);
  const ants = useMemo(() => detectAnts(data.expenses, p.antLimit ?? 100), [data.expenses, p.antLimit]);
  const annual = sum(ants.map((a) => a.annual));
  const saved = (annual * cut) / 100;
  const yieldPct = p.yieldPct ?? 10;
  const topGoal = data.goals.find((g) => (g.saved ?? 0) < g.target);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Detector</p>
        <h1>Gastos hormiga</h1>
        <p className="muted">
          Compras pequeñas (≤ {fmt(p.antLimit ?? 100, cur)}) que se repiten. Una sola no duele, pero juntas pueden llevarse hasta el 15% de lo que ganas.
        </p>
      </header>

      {ants.length === 0 ? (
        <div className="glass card">
          <Empty emoji="🐜" title="Aún no detecto hábitos" text="Registra tus gastos del día a día (cafés, antojos, delivery…) y en unos días verás aquí tus fugas." />
        </div>
      ) : (
        <>
          <section className="glass card hero-ants">
            <small>Tus hormigas cuestan al año</small>
            <strong className="big warn-text">{fmt(annual, cur)}</strong>
            {hoursText(annual, p) && <p className="muted">⏳ {hoursText(annual, p)}</p>}

            <label className="field mt">
              <span>
                Si recortas un <b>{cut}%</b> ahorras <b className="pos">{fmt(saved, cur)}</b> al año
              </span>
              <input type="range" min={10} max={100} step={10} value={cut} onChange={(e) => setCut(+e.target.value)} />
            </label>
            <div className="split">
              <div>
                <small>Invertido 5 años al {yieldPct}%</small>
                <b className="pos">{fmt(futureValue(saved / 12, yieldPct, 5), cur)}</b>
              </div>
              <div>
                <small>En 10 años</small>
                <b className="pos">{fmt(futureValue(saved / 12, yieldPct, 10), cur)}</b>
              </div>
            </div>
            {topGoal && saved > 0 && (
              <p className="hint">
                🎯 Con ese recorte llegarías a <b>{topGoal.name}</b> en ~{Math.ceil((topGoal.target - (topGoal.saved ?? 0)) / (saved / 12))} meses.
              </p>
            )}
          </section>

          <h2 className="section-title">Tus hábitos (últimos 30 días)</h2>
          <div className="stack">
            {ants.map((a) => (
              <div key={a.key} className="glass card ant">
                <div className="row-between">
                  <div className="row">
                    <span className="cat-emoji lg">{a.emoji}</span>
                    <div>
                      <b>{a.label}</b>
                      <small>
                        {a.count} veces · promedio {fmt(a.avg, cur)}
                      </small>
                    </div>
                  </div>
                  <div className="right-col">
                    <b className="warn-text">{fmt(a.annual, cur)}</b>
                    <small>al año</small>
                  </div>
                </div>
                <p className="hint">
                  {hoursText(a.annual, p) ? `Equivale a ${hoursText(a.annual, p)}. ` : ''}
                  Reto: bájalo a {Math.max(1, Math.floor(a.count / 2))} veces al mes y recuperas {fmt(a.annual / 2, cur)} al año.
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <section className="glass card tips">
        <h3>Cómo frenar a las hormigas</h3>
        <ul>
          <li>☕ <b>Prepara en casa</b> lo que más repites: el café diario es el gasto hormiga más común en México.</li>
          <li>🛵 <b>Ojo con el delivery</b>: entre comisiones, envío y propina pagas 30–40% más que en el local.</li>
          <li>💳 <b>Paga con efectivo o débito</b> tus gustos; con la tarjeta de crédito se siente menos.</li>
          <li>⏸️ <b>Regla de 48 h</b>: manda los antojos a la lista de Antojos (en Más) antes de comprarlos.</li>
          <li>📲 <b>Quita las tarjetas guardadas</b> de las apps de compras y comida.</li>
        </ul>
      </section>
    </>
  );
}
