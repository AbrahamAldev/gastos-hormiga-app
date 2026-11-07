import { useEffect, useState, type ChangeEvent } from 'react';
import { client, type UserData } from '../store';
import { cardPayoff, daysBetween, fmt, hoursText, parseDate, prettyDate, realYield, subMonthly, sum, today, type Period } from '../lib';
import { Empty, Segmented } from '../ui';

type View = 'subs' | 'antojos' | 'calc' | 'perfil';

export default function More({ data, email, signOut }: { data: UserData; email: string; signOut?: () => void }) {
  const [view, setView] = useState<View>('subs');
  return (
    <>
      <header className="page-head">
        <h1>Más</h1>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'subs', label: 'Suscripciones' },
            { id: 'antojos', label: 'Antojos' },
            { id: 'calc', label: 'Calculadoras' },
            { id: 'perfil', label: 'Perfil' },
          ]}
        />
      </header>
      {view === 'subs' && <Subs data={data} />}
      {view === 'antojos' && <Wishes data={data} />}
      {view === 'calc' && <Calculators data={data} />}
      {view === 'perfil' && <ProfileView data={data} email={email} signOut={signOut} />}
    </>
  );
}

/* ---------- Suscripciones olvidadas ---------- */

function Subs({ data }: { data: UserData }) {
  const cur = data.profile?.currency ?? 'MXN';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('mensual');
  const [next, setNext] = useState('');
  const active = data.subs.filter((s) => s.active !== false);
  const cancelled = data.subs.filter((s) => s.active === false);
  const monthly = sum(active.map(subMonthly));
  const savedByCancel = sum(cancelled.map(subMonthly)) * 12;
  const now = parseDate(today());

  async function add() {
    const a = parseFloat(amount);
    if (!name.trim() || !a) return;
    await client.models.Recurring.create({ name: name.trim(), amount: a, cycle, nextCharge: next || null, lastUsed: today(), active: true });
    setName('');
    setAmount('');
    setNext('');
  }

  return (
    <>
      <div className="glass card hero-ants">
        <small>Pagas en suscripciones</small>
        <strong className="big">{fmt(monthly, cur)}<span className="unit">/mes</span></strong>
        <p className="muted">
          {fmt(monthly * 12, cur)} al año{hoursText(monthly * 12, data.profile) ? ` · ${hoursText(monthly * 12, data.profile)}` : ''}
        </p>
        {savedByCancel > 0 && <p className="pos">✓ Ya te ahorras {fmt(savedByCancel, cur)} al año por cancelar.</p>}
      </div>

      <div className="glass card">
        <p className="muted">Casi todos pagamos más de lo que creemos en suscripciones. Anótalas todas, incluidas las pruebas gratis.</p>
        <div className="grid2">
          <input value={name} placeholder="Netflix, Spotify, gym…" onChange={(e) => setName(e.target.value)} />
          <input inputMode="decimal" value={amount} placeholder="Monto" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <div className="grid2 mt">
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
            <option value="semanal">Semanal</option>
          </select>
          <label className="field inline">
            <span>Próximo cobro</span>
            <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
        </div>
        <button className="btn primary block mt" onClick={add}>
          Agregar suscripción
        </button>
      </div>

      {active.length === 0 ? (
        <div className="glass card">
          <Empty emoji="🔁" title="Sin suscripciones" text="Agrega las que pagas para verlas sumadas." />
        </div>
      ) : (
        <div className="glass card list">
          {active.map((s) => {
            const ref = s.lastUsed ?? s.createdAt?.slice(0, 10);
            const idle = ref ? daysBetween(parseDate(ref), now) : 0;
            return (
              <div key={s.id} className="list-row wrap-row">
                <span className="cat-emoji">🔁</span>
                <div className="grow">
                  <b>{s.name}</b>
                  <small>
                    {fmt(s.amount, cur)} {s.cycle} · {fmt(subMonthly(s) * 12, cur)}/año
                    {s.nextCharge ? ` · cobra ${prettyDate(s.nextCharge).toLowerCase()}` : ''}
                  </small>
                  {idle > 30 && <small className="warn-text">💤 Sin uso hace {idle} días</small>}
                </div>
                <div className="row">
                  <button className="btn ghost sm" onClick={() => client.models.Recurring.update({ id: s.id, lastUsed: today() })}>
                    La usé
                  </button>
                  <button className="btn danger sm" onClick={() => client.models.Recurring.update({ id: s.id, active: false })}>
                    Cancelé
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- Antojos: regla de 48 horas ---------- */

const WAIT_H = 48;

/** Hora actual guardada en estado y refrescada cada minuto: el render se mantiene puro y la cuenta regresiva avanza sola. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Wishes({ data }: { data: UserData }) {
  const now = useNow();
  const cur = data.profile?.currency ?? 'MXN';
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const waiting = data.wishes.filter((w) => w.status === 'esperando' || !w.status);
  const resisted = sum(data.wishes.filter((w) => w.status === 'descartado').map((w) => w.price));

  async function add() {
    const p = parseFloat(price);
    if (!name.trim() || !p) return;
    await client.models.Wish.create({ name: name.trim(), price: p, status: 'esperando' });
    setName('');
    setPrice('');
  }

  async function buy(id: string, wname: string, wprice: number) {
    await client.models.Wish.update({ id, status: 'comprado' });
    await client.models.Expense.create({ amount: wprice, category: 'otros', merchant: wname, necessity: 'deseo', date: today(), note: 'Antojo meditado 48 h' });
  }

  return (
    <>
      <div className="glass card hero-ants">
        <small>Dinero que decidiste no gastar</small>
        <strong className="big pos">{fmt(resisted, cur)}</strong>
        <p className="muted">¿Se te antoja algo? Anótalo aquí y espera {WAIT_H} horas. Casi siempre las ganas se pasan.</p>
      </div>
      <div className="glass card">
        <div className="grid2">
          <input value={name} placeholder="¿Qué quieres comprar?" onChange={(e) => setName(e.target.value)} />
          <input inputMode="decimal" value={price} placeholder="Precio" onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        {parseFloat(price) > 0 && hoursText(parseFloat(price), data.profile) && (
          <p className="hours-tag">⏳ Te costaría {hoursText(parseFloat(price), data.profile)}</p>
        )}
        <button className="btn primary block mt" onClick={add}>
          Esperar {WAIT_H} h
        </button>
      </div>

      {waiting.length === 0 ? (
        <div className="glass card">
          <Empty emoji="🧘" title="Nada en espera" text="Cuando te den ganas de comprar algo por impulso, anótalo aquí." />
        </div>
      ) : (
        <div className="stack">
          {waiting.map((w) => {
            const created = w.createdAt ? new Date(w.createdAt).getTime() : now;
            const hrs = (now - created) / 3600000;
            const left = Math.max(0, WAIT_H - hrs);
            const ready = left === 0;
            return (
              <div key={w.id} className="glass card">
                <div className="row-between">
                  <div>
                    <b>{w.name}</b>
                    <small>{fmt(w.price, cur)}</small>
                  </div>
                  <span className={`pill ${ready ? 'ok' : ''}`}>{ready ? 'Listo para decidir' : `⏳ ${Math.ceil(left)} h`}</span>
                </div>
                <div className="row mt">
                  <button className="btn ghost sm" onClick={() => client.models.Wish.update({ id: w.id, status: 'descartado' })}>
                    Ya no lo quiero 💪
                  </button>
                  <button className="btn primary sm" disabled={!ready} onClick={() => buy(w.id, w.name, w.price)}>
                    Lo compré
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- Calculadoras: tarjeta y rendimiento real ---------- */

function Calculators({ data }: { data: UserData }) {
  const cur = data.profile?.currency ?? 'MXN';
  const [balance, setBalance] = useState('20000');
  const [cat, setCat] = useState('60');
  const [pay, setPay] = useState('2000');
  const [nominal, setNominal] = useState(String(data.profile?.yieldPct ?? 10));
  const [infl, setInfl] = useState(String(data.profile?.inflationPct ?? 4));
  const [amount, setAmount] = useState('50000');

  const b = parseFloat(balance) || 0;
  const c = parseFloat(cat) || 0;
  const pmt = parseFloat(pay) || 0;
  const min = cardPayoff(b, c, 'min');
  const fixed = cardPayoff(b, c, pmt);

  const n = parseFloat(nominal) || 0;
  const i = parseFloat(infl) || 0;
  const amt = parseFloat(amount) || 0;
  const options = [
    { label: 'Debajo del colchón', rate: 0 },
    { label: 'Cuenta de nómina típica', rate: 1 },
    { label: 'Tu rendimiento', rate: n },
  ];

  const months = (x: number) => (x === Infinity ? 'Nunca' : x >= 12 ? `${(x / 12).toFixed(1)} años` : `${x} meses`);

  return (
    <>
      <section className="glass card">
        <h3>💳 La trampa del pago mínimo</h3>
        <p className="muted">Mira cuánto te cuesta pagar sólo el mínimo de tu tarjeta frente a un pago fijo.</p>
        <div className="grid3">
          <label className="field">
            <span>Deuda</span>
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Tasa anual %</span>
            <input inputMode="decimal" value={cat} onChange={(e) => setCat(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Pago fijo</span>
            <input inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <div className="compare">
          <div className="bad-box">
            <small>Pagando el mínimo</small>
            <b>{months(min.months)}</b>
            <span>{min.interest === Infinity ? '—' : `${fmt(min.interest, cur)} en intereses`}</span>
          </div>
          <div className="good-box">
            <small>Pagando {fmt(pmt, cur)}/mes</small>
            <b>{months(fixed.months)}</b>
            <span>{fixed.interest === Infinity ? 'El pago no cubre ni los intereses' : `${fmt(fixed.interest, cur)} en intereses`}</span>
          </div>
        </div>
        {min.interest !== Infinity && fixed.interest !== Infinity && (
          <p className="hint pos">Te ahorras {fmt(min.interest - fixed.interest, cur)} si pagas el monto fijo.</p>
        )}
        <p className="hint">Es una estimación: incluye el IVA de los intereses y toma como mínimo el interés del mes más el 1.5% de la deuda.</p>
      </section>

      <section className="glass card">
        <h3>📈 ¿Tu dinero crece o se encoge?</h3>
        <p className="muted">Si tu ahorro rinde menos que la inflación, cada año puedes comprar menos con él.</p>
        <div className="grid3">
          <label className="field">
            <span>Monto</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Rendimiento %</span>
            <input inputMode="decimal" value={nominal} onChange={(e) => setNominal(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Inflación %</span>
            <input inputMode="decimal" value={infl} onChange={(e) => setInfl(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <div className="stack-sm mt">
          {options.map((o) => {
            const real = realYield(o.rate, i);
            const after5 = amt * Math.pow(1 + real / 100, 5);
            return (
              <div key={o.label} className="row-between">
                <span>
                  {o.label} <small className="muted">({o.rate}%)</small>
                </span>
                <span className={real < 0 ? 'neg' : 'pos'}>
                  {real >= 0 ? '+' : ''}
                  {real.toFixed(1)}% real · {fmt(after5, cur)} en 5 años
                </span>
              </div>
            );
          })}
        </div>
        <p className="hint">Los montos están en pesos de hoy. Compara opciones protegidas por el IPAB o respaldadas por el gobierno (como Cetes) antes de invertir. Esto no es asesoría financiera.</p>
        <button
          className="btn ghost block"
          onClick={() => data.profile && client.models.Profile.update({ id: data.profile.id, yieldPct: n, inflationPct: i })}
        >
          Guardar como mis supuestos
        </button>
      </section>
    </>
  );
}

/* ---------- Perfil / memoria del usuario ---------- */

function ProfileView({ data, email, signOut }: { data: UserData; email: string; signOut?: () => void }) {
  const p = data.profile!;
  const [f, setF] = useState({
    displayName: p.displayName ?? '',
    monthlyIncome: String(p.monthlyIncome ?? 0),
    incomeType: p.incomeType ?? 'fijo',
    payPeriod: (p.payPeriod as Period) ?? 'quincenal',
    hoursPerMonth: String(p.hoursPerMonth ?? 160),
    savingsRatePct: String(p.savingsRatePct ?? 10),
    antLimit: String(p.antLimit ?? 100),
  });
  const [msg, setMsg] = useState('');

  async function save() {
    const { errors } = await client.models.Profile.update({
      id: p.id,
      displayName: f.displayName,
      monthlyIncome: parseFloat(f.monthlyIncome) || 0,
      incomeType: f.incomeType,
      payPeriod: f.payPeriod,
      hoursPerMonth: parseFloat(f.hoursPerMonth) || 160,
      savingsRatePct: parseFloat(f.savingsRatePct) || 0,
      antLimit: parseFloat(f.antLimit) || 100,
    });
    setMsg(errors?.length ? errors[0].message : '✓ Guardado');
    setTimeout(() => setMsg(''), 2000);
  }

  const num = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') });

  return (
    <>
      <div className="glass card profile-head">
        <div className="avatar">{(p.displayName ?? email).slice(0, 1).toUpperCase()}</div>
        <div>
          <b>{p.displayName}</b>
          <small>{email}</small>
        </div>
      </div>
      <div className="glass card">
        <label className="field">
          <span>Nombre</span>
          <input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Ingreso mensual</span>
            <input inputMode="decimal" value={f.monthlyIncome} onChange={num('monthlyIncome')} />
          </label>
          <label className="field">
            <span>Horas al mes</span>
            <input inputMode="decimal" value={f.hoursPerMonth} onChange={num('hoursPerMonth')} />
          </label>
        </div>
        <label className="field">
          <span>Tipo de ingreso</span>
          <Segmented value={f.incomeType} onChange={(incomeType) => setF({ ...f, incomeType })} options={[{ id: 'fijo', label: 'Fijo' }, { id: 'variable', label: 'Variable' }]} />
        </label>
        <label className="field">
          <span>Periodo</span>
          <Segmented
            value={f.payPeriod}
            onChange={(payPeriod) => setF({ ...f, payPeriod })}
            options={[
              { id: 'semanal', label: 'Semana' },
              { id: 'quincenal', label: 'Quincena' },
              { id: 'mensual', label: 'Mes' },
            ]}
          />
        </label>
        <div className="grid2">
          <label className="field">
            <span>% ahorro primero</span>
            <input inputMode="decimal" value={f.savingsRatePct} onChange={num('savingsRatePct')} />
          </label>
          <label className="field">
            <span>Umbral hormiga</span>
            <input inputMode="decimal" value={f.antLimit} onChange={num('antLimit')} />
          </label>
        </div>
        <button className="btn primary block" onClick={save}>
          Guardar cambios
        </button>
        {msg && <p className="hint pos">{msg}</p>}
      </div>
      <div className="glass card">
        <p className="muted">
          🔒 Tus datos se guardan cifrados en tu cuenta y sólo tú puedes verlos. No pedimos acceso a tu banco. Llevas {data.expenses.length} gastos registrados.
        </p>
        <button className="btn danger block" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    </>
  );
}
