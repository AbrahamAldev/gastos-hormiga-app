import { useMemo } from 'react';
import type { UserData } from '../store';
import type { Tab } from '../App';
import {
  catOf,
  daysBetween,
  detectAnts,
  fmt,
  futureValue,
  hoursText,
  inRange,
  parseDate,
  periodRange,
  prettyDate,
  subMonthly,
  sum,
  today,
  type Period,
} from '../lib';
import { Empty, Progress, Ring } from '../ui';

type Insight = { icon: string; title: string; text: string; tab?: Tab; tone?: 'warn' | 'bad' | 'good' };

export default function Home({ data, go, openCoach }: { data: UserData; go: (t: Tab) => void; openCoach: () => void }) {
  const p = data.profile!;
  const cur = p.currency ?? 'MXN';
  const period = (p.payPeriod as Period) ?? 'quincenal';

  const m = useMemo(() => {
    const r = periodRange(period);
    const inP = data.expenses.filter((e) => inRange(e.date, r.start, r.end));
    const spent = sum(inP.map((e) => e.amount));
    const realIncome = sum(data.incomes.filter((i) => inRange(i.date, r.start, r.end)).map((i) => i.amount));
    const expected = (p.monthlyIncome ?? 0) / r.perMonth;
    // Ingreso variable: presupuesta sólo con lo que ya cobraste
    const income = p.incomeType === 'variable' ? realIncome : Math.max(expected, realIncome);
    const saveTarget = income * ((p.savingsRatePct ?? 0) / 100);
    const available = income - saveTarget - spent;
    const daysLeft = Math.max(1, daysBetween(parseDate(today()), r.end) + 1);
    const antLimit = p.antLimit ?? 100;
    const antsSpent = sum(
      inP.filter((e) => e.necessity === 'hormiga' || (e.amount <= antLimit && e.necessity !== 'necesario')).map((e) => e.amount),
    );
    const byCat = new Map<string, number>();
    inP.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    return { r, spent, income, saveTarget, available, daysLeft, antsSpent, cats };
  }, [data.expenses, data.incomes, p, period]);

  const insights = useMemo(() => {
    const out: Insight[] = [];
    const ants = detectAnts(data.expenses, p.antLimit ?? 100);
    const top = ants[0];
    if (top) {
      const half = top.annual / 2;
      out.push({
        icon: '🐜',
        tone: 'warn',
        title: `${top.emoji} ${top.label}: ${fmt(top.annual, cur)} al año`,
        text: `${top.count} veces en 30 días${hoursText(top.annual, p) ? ` — equivale a ${hoursText(top.annual, p)}` : ''}. Si lo reduces a la mitad e inviertes la diferencia, en 5 años tendrías ${fmt(futureValue(half / 12, p.yieldPct ?? 10, 5), cur)}.`,
        tab: 'hormiga',
      });
    }

    const mr = periodRange('mensual');
    for (const b of data.budgets) {
      const s = sum(data.expenses.filter((e) => e.category === b.category && inRange(e.date, mr.start, mr.end)).map((e) => e.amount));
      const pct = b.monthlyLimit ? s / b.monthlyLimit : 0;
      if (pct >= 0.8) {
        const c = catOf(b.category);
        out.push({
          icon: pct >= 1 ? '⛔' : '⚠️',
          tone: pct >= 1 ? 'bad' : 'warn',
          title: `${c.emoji} ${c.label} al ${Math.round(pct * 100)}% de tu límite`,
          text: pct >= 1 ? `Te pasaste por ${fmt(s - b.monthlyLimit, cur)} este mes.` : `Te quedan ${fmt(b.monthlyLimit - s, cur)} para el resto del mes.`,
          tab: 'plan',
        });
      }
    }

    const now = parseDate(today());
    for (const s of data.subs.filter((x) => x.active !== false)) {
      if (s.nextCharge) {
        const dd = daysBetween(now, parseDate(s.nextCharge));
        if (dd >= 0 && dd <= 5)
          out.push({ icon: '🔔', title: `${s.name} cobra ${dd === 0 ? 'hoy' : `en ${dd} días`}`, text: `${fmt(s.amount, cur)}. ¿Todavía lo usas?`, tab: 'mas' });
      }
      const ref = s.lastUsed ?? s.createdAt?.slice(0, 10);
      if (ref && daysBetween(parseDate(ref), now) > 30)
        out.push({
          icon: '💤',
          tone: 'warn',
          title: `¿Sigues usando ${s.name}?`,
          text: `No la marcas como usada desde hace más de 30 días. Cancelarla te ahorra ${fmt(subMonthly(s) * 12, cur)} al año.`,
          tab: 'mas',
        });
    }

    // Detonantes emocionales
    const moods = new Map<string, number>();
    data.expenses.filter((e) => e.mood && e.necessity !== 'necesario').forEach((e) => moods.set(e.mood!, (moods.get(e.mood!) ?? 0) + e.amount));
    const topMood = [...moods.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topMood && topMood[1] > 0)
      out.push({ icon: '🧠', title: `Tu detonante: ${topMood[0]}`, text: `Has gastado ${fmt(topMood[1], cur)} en gustos cuando te sientes así. Antes de comprar, anótalo en Antojos y espera 48 h.`, tab: 'mas' });

    if (!data.goals.length)
      out.push({ icon: '🎯', tone: 'good', title: 'Ponle nombre a tu ahorro', text: 'Las personas con una meta concreta ahorran más. Crea tu fondo de emergencia en Plan.', tab: 'plan' });

    if (!data.expenses.length)
      out.push({ icon: '👆', tone: 'good', title: 'Registra tu primer gasto', text: 'Usa el botón + . Con tus favoritos, registrar te tomará 2 toques.' });

    return out.slice(0, 5);
  }, [data, p, cur]);

  const recent = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 5);
  const budgetForPeriod = m.income - m.saveTarget;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{hello}</p>
        <h1>{p.displayName}</h1>
      </header>

      <section className="glass card hero">
        <Ring value={m.spent} max={budgetForPeriod || 1}>
          <small>Disponible</small>
          <strong className={m.available < 0 ? 'neg' : ''}>{fmt(m.available, cur)}</strong>
        </Ring>
        <div className="hero-stats">
          <div>
            <small>Gastado {m.r.label}</small>
            <b>{fmt(m.spent, cur)}</b>
          </div>
          <div>
            <small>Por día (quedan {m.daysLeft})</small>
            <b>{fmt(Math.max(0, m.available / m.daysLeft), cur)}</b>
          </div>
          <div>
            <small>Ahorro primero ({p.savingsRatePct ?? 0}%)</small>
            <b className="pos">{fmt(m.saveTarget, cur)}</b>
          </div>
          <div>
            <small>🐜 Hormiga {m.r.label}</small>
            <b className="warn-text">{fmt(m.antsSpent, cur)}</b>
          </div>
        </div>
        {p.incomeType === 'variable' && m.income === 0 && (
          <p className="hint">Ingreso variable: registra lo que cobres en Gastos → Ingresos para presupuestar sólo con dinero real.</p>
        )}
      </section>

      <button className="glass card coach-cta" onClick={openCoach}>
        <span className="coach-orb sm" />
        <span>
          <b>¿Cómo van mis finanzas?</b>
          <small>Pregúntale a tu Coach con IA: diagnóstico, consejos y proyecciones.</small>
        </span>
        <span className="chev">›</span>
      </button>

      {insights.length > 0 && (
        <section>
          <h2 className="section-title">Para ti</h2>
          <div className="stack">
            {insights.map((i, k) => (
              <button key={k} className={`glass card insight ${i.tone ?? ''}`} onClick={() => i.tab && go(i.tab)}>
                <span className="insight-icon">{i.icon}</span>
                <span>
                  <b>{i.title}</b>
                  <small>{i.text}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">En qué se va {m.r.label}</h2>
        <div className="glass card">
          {m.cats.length === 0 ? (
            <Empty emoji="🌱" title="Sin gastos aún" text="Tus categorías aparecerán aquí." />
          ) : (
            <div className="stack-sm">
              {m.cats.slice(0, 6).map(([id, v]) => {
                const c = catOf(id);
                return (
                  <div key={id} className="cat-row">
                    <span className="cat-emoji">{c.emoji}</span>
                    <div className="grow">
                      <div className="row-between">
                        <span>{c.label}</span>
                        <b>{fmt(v, cur)}</b>
                      </div>
                      <Progress value={v} max={m.cats[0][1]} tone="accent" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="row-between">
            <h2 className="section-title">Recientes</h2>
            <button className="link" onClick={() => go('gastos')}>Ver todo</button>
          </div>
          <div className="glass card list">
            {recent.map((e) => {
              const c = catOf(e.category);
              return (
                <div key={e.id} className="list-row">
                  <span className="cat-emoji">{c.emoji}</span>
                  <div className="grow">
                    <b>{e.merchant || c.label}</b>
                    <small>{prettyDate(e.date)}{e.necessity === 'hormiga' ? ' · 🐜' : ''}</small>
                  </div>
                  <b>-{fmt(e.amount, cur)}</b>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
