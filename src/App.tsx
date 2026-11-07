import { useMemo, useState } from 'react';
import { Authenticator, TextField, useAuthenticator, useTheme, View } from '@aws-amplify/ui-react';
import { signUp, type SignUpInput } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';
import { client, useUserData, type UserData } from './store';
import { ANT_PRONE, CATEGORIES, MOODS, catOf, fmt, hoursText, today, type Period } from './lib';
import { Segmented, Sheet } from './ui';
import Home from './views/Home';
import Expenses from './views/Expenses';
import Ants from './views/Ants';
import Plan from './views/Plan';
import More from './views/More';
import { CoachButton, CoachSheet } from './views/Coach';

const authComponents = {
  Header() {
    const { tokens } = useTheme();
    return (
      <View textAlign="center" padding={tokens.space.large}>
        <div className="brand-mark">🐜</div>
        <h1 className="brand-title">Hormiga</h1>
        <p className="brand-sub">Descubre a dónde se va tu dinero y recupéralo.</p>
      </View>
    );
  },
  Footer() {
    return <p className="auth-foot">Tus datos son privados: sólo tú puedes verlos.</p>;
  },
  SignUp: {
    FormFields() {
      const { validationErrors } = useAuthenticator();
      const error = validationErrors[REFERRAL_FIELD];
      return (
        <>
          <Authenticator.SignUp.FormFields />
          {REFERRAL_REQUIRED && (
            <TextField
              name={REFERRAL_FIELD}
              label="Clave de referido"
              placeholder="La clave que te compartieron"
              autoComplete="off"
              hasError={!!error}
              errorMessage={Array.isArray(error) ? error.join(' ') : error}
            />
          )}
        </>
      );
    },
  },
};

/**
 * Clave de referido: el backend la exige si SIGNUP_REFERRAL_CODE está configurada (ver .env.example).
 * El campo se llama "custom:..." porque Amplify UI sólo reenvía esos campos; antes de llamar a Cognito
 * se saca de los atributos del usuario y se envía como validationData (no se guarda en la cuenta).
 */
const REFERRAL_FIELD = 'custom:referral_code';
const REFERRAL_REQUIRED = (outputs as { custom?: { signupReferralRequired?: boolean } }).custom?.signupReferralRequired === true;

const authServices = {
  async validateCustomSignUp(formData: Record<string, string>) {
    if (REFERRAL_REQUIRED && !formData[REFERRAL_FIELD]?.trim()) {
      return { [REFERRAL_FIELD]: 'Escribe la clave de referido que te compartieron.' };
    }
  },
  async handleSignUp(input: SignUpInput) {
    const { [REFERRAL_FIELD]: referralCode, ...userAttributes } = input.options?.userAttributes ?? {};
    try {
      return await signUp({
        ...input,
        options: {
          ...input.options,
          userAttributes,
          validationData: referralCode ? { referralCode: String(referralCode).trim() } : undefined,
        },
      });
    } catch (err) {
      // Cognito antepone "PreSignUp failed with error" al mensaje del trigger; mostramos sólo el mensaje.
      if (err instanceof Error && err.message.startsWith('PreSignUp failed with error')) {
        throw new Error(err.message.replace(/^PreSignUp failed with error\s*/, ''));
      }
      throw err;
    }
  },
};

export default function App() {
  return (
    <>
      <Backdrop />
      <Authenticator components={authComponents} services={authServices} loginMechanisms={['email']}>
        {({ signOut, user }) => <Main signOut={signOut} email={user?.signInDetails?.loginId ?? ''} />}
      </Authenticator>
    </>
  );
}

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
    </div>
  );
}

export type Tab = 'inicio' | 'gastos' | 'hormiga' | 'plan' | 'mas';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '◎' },
  { id: 'gastos', label: 'Gastos', icon: '≡' },
  { id: 'hormiga', label: 'Hormiga', icon: '🐜' },
  { id: 'plan', label: 'Plan', icon: '◔' },
  { id: 'mas', label: 'Más', icon: '•••' },
];

function Main({ signOut, email }: { signOut?: () => void; email: string }) {
  const data = useUserData();
  const [tab, setTab] = useState<Tab>('inicio');
  const [adding, setAdding] = useState(false);
  const [coach, setCoach] = useState(false);

  if (!data.ready) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!data.profile || !data.profile.onboarded) {
    return <Onboarding data={data} email={email} />;
  }

  return (
    <div className="app">
      <main className="content" key={tab}>
        {tab === 'inicio' && <Home data={data} go={setTab} openCoach={() => setCoach(true)} />}
        {tab === 'gastos' && <Expenses data={data} />}
        {tab === 'hormiga' && <Ants data={data} />}
        {tab === 'plan' && <Plan data={data} />}
        {tab === 'mas' && <More data={data} email={email} signOut={signOut} />}
      </main>

      <button className="fab" onClick={() => setAdding(true)} aria-label="Registrar gasto">
        +
      </button>

      <nav className="tabbar glass">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <CoachButton onClick={() => setCoach(true)} />

      <AddExpense data={data} open={adding} onClose={() => setAdding(false)} />
      <CoachSheet data={data} open={coach} onClose={() => setCoach(false)} />
    </div>
  );
}

/* ---------- Registro en 2 toques ---------- */

type Draft = { amount: string; category: string; merchant: string; note: string; necessity: string; mood: string; date: string };
const emptyDraft = (): Draft => ({ amount: '', category: 'cafe', merchant: '', note: '', necessity: 'deseo', mood: '', date: today() });

export function AddExpense({ data, open, onClose }: { data: UserData; open: boolean; onClose: () => void }) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const amount = parseFloat(d.amount) || 0;

  // Favoritos: combinaciones más repetidas del historial del usuario
  const favorites = useMemo(() => {
    const m = new Map<string, { category: string; merchant: string; amount: number; n: number }>();
    for (const e of data.expenses) {
      const k = `${e.category}|${(e.merchant ?? '').toLowerCase()}|${e.amount}`;
      const f = m.get(k) ?? { category: e.category, merchant: e.merchant ?? '', amount: e.amount, n: 0 };
      f.n++;
      m.set(k, f);
    }
    const list = [...m.values()].filter((f) => f.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
    return list.length
      ? list
      : [
          { category: 'cafe', merchant: 'Café', amount: 55, n: 0 },
          { category: 'tienda', merchant: 'OXXO', amount: 40, n: 0 },
          { category: 'delivery', merchant: 'Delivery', amount: 180, n: 0 },
          { category: 'transporte', merchant: 'Uber', amount: 95, n: 0 },
        ];
  }, [data.expenses]);

  const pickCategory = (category: string) =>
    setD((x) => ({ ...x, category, necessity: ANT_PRONE.has(category) ? 'deseo' : 'necesario' }));

  async function save(override?: Partial<Draft>) {
    const v = { ...d, ...override };
    const amt = parseFloat(v.amount);
    if (!amt || amt <= 0) {
      setErr('Escribe un monto');
      return;
    }
    setSaving(true);
    setErr('');
    const { errors } = await client.models.Expense.create({
      amount: amt,
      category: v.category,
      merchant: v.merchant.trim() || null,
      note: v.note.trim() || null,
      necessity: v.necessity,
      mood: v.mood || null,
      date: v.date,
    });
    setSaving(false);
    if (errors?.length) {
      setErr(errors[0].message);
      return;
    }
    setD(emptyDraft());
    onClose();
  }

  const p = data.profile;
  return (
    <Sheet open={open} onClose={onClose} title="Nuevo gasto">
      <div className="chips scroll-x">
        {favorites.map((f, i) => (
          <button
            key={i}
            className="chip fav"
            disabled={saving}
            onClick={() =>
              save({
                amount: String(f.amount),
                category: f.category,
                merchant: f.merchant,
                necessity: ANT_PRONE.has(f.category) ? 'deseo' : 'necesario',
              })
            }
          >
            {catOf(f.category).emoji} {f.merchant || catOf(f.category).label} · {fmt(f.amount, p?.currency ?? 'MXN')}
          </button>
        ))}
      </div>
      <p className="hint">Toca un favorito para registrarlo al instante, o captura uno nuevo:</p>

      <div className="amount-input">
        <span>$</span>
        <input
          autoFocus
          inputMode="decimal"
          placeholder="0"
          value={d.amount}
          onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^\d.]/g, '') })}
        />
      </div>
      {amount > 0 && hoursText(amount, p) && <p className="hours-tag">⏳ = {hoursText(amount, p)}</p>}

      <div className="chips wrap">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${d.category === c.id ? 'on' : ''}`} onClick={() => pickCategory(c.id)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="grid2">
        <label className="field">
          <span>Dónde</span>
          <input value={d.merchant} placeholder="Ej. Starbucks" onChange={(e) => setD({ ...d, merchant: e.target.value })} />
        </label>
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={d.date} max={today()} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </label>
      </div>

      <label className="field">
        <span>¿Qué tan necesario fue?</span>
        <Segmented
          value={d.necessity}
          onChange={(necessity) => setD({ ...d, necessity })}
          options={[
            { id: 'necesario', label: 'Necesario' },
            { id: 'deseo', label: 'Gusto' },
            { id: 'hormiga', label: '🐜 Hormiga' },
          ]}
        />
      </label>

      <label className="field">
        <span>¿Cómo te sentías? (opcional — detecta tus detonantes)</span>
        <div className="chips wrap">
          {MOODS.map((m) => (
            <button key={m} className={`chip sm ${d.mood === m ? 'on' : ''}`} onClick={() => setD({ ...d, mood: d.mood === m ? '' : m })}>
              {m}
            </button>
          ))}
        </div>
      </label>

      <label className="field">
        <span>Nota</span>
        <input value={d.note} placeholder="Opcional" onChange={(e) => setD({ ...d, note: e.target.value })} />
      </label>

      {err && <p className="error">{err}</p>}
      <button className="btn primary block" disabled={saving} onClick={() => save()}>
        {saving ? 'Guardando…' : 'Guardar gasto'}
      </button>
    </Sheet>
  );
}

/* ---------- Onboarding: la "memoria" inicial del usuario ---------- */

function Onboarding({ data, email }: { data: UserData; email: string }) {
  const p = data.profile;
  const [name, setName] = useState(p?.displayName ?? email.split('@')[0]);
  const [income, setIncome] = useState(p?.monthlyIncome ? String(p.monthlyIncome) : '');
  const [incomeType, setIncomeType] = useState(p?.incomeType ?? 'fijo');
  const [period, setPeriod] = useState<Period>((p?.payPeriod as Period) ?? 'quincenal');
  const [hours, setHours] = useState(String(p?.hoursPerMonth ?? 160));
  const [savings, setSavings] = useState(String(p?.savingsRatePct ?? 10));
  const [antLimit, setAntLimit] = useState(String(p?.antLimit ?? 100));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function finish() {
    setSaving(true);
    setErr('');
    const values = {
      displayName: name.trim() || 'Tú',
      monthlyIncome: parseFloat(income) || 0,
      incomeType,
      payPeriod: period,
      hoursPerMonth: parseFloat(hours) || 160,
      savingsRatePct: parseFloat(savings) || 0,
      antLimit: parseFloat(antLimit) || 100,
      currency: 'MXN',
      onboarded: true,
    };
    const res = p ? await client.models.Profile.update({ id: p.id, ...values }) : await client.models.Profile.create(values);
    setSaving(false);
    if (res.errors?.length) setErr(res.errors[0].message);
  }

  return (
    <div className="onboarding">
      <div className="glass card onboarding-card">
        <div className="brand-mark">🐜</div>
        <h1>Hola, empecemos</h1>
        <p className="muted">
          Con estos datos Hormiga calcula cuánto te cuesta cada hábito en <b>horas de tu vida</b> y te ayuda a ahorrar sin
          conectar tu banco.
        </p>

        <label className="field">
          <span>¿Cómo te llamas?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Ingreso mensual aproximado (MXN)</span>
          <input inputMode="decimal" placeholder="Ej. 18000" value={income} onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="field">
          <span>Tu ingreso es…</span>
          <Segmented value={incomeType} onChange={setIncomeType} options={[{ id: 'fijo', label: 'Fijo' }, { id: 'variable', label: 'Variable / freelance' }]} />
        </label>
        <label className="field">
          <span>Te pagan / te organizas por</span>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { id: 'semanal', label: 'Semana' },
              { id: 'quincenal', label: 'Quincena' },
              { id: 'mensual', label: 'Mes' },
            ]}
          />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Horas trabajadas al mes</span>
            <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>% para ahorrar primero</span>
            <input inputMode="numeric" value={savings} onChange={(e) => setSavings(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <label className="field">
          <span>Un gasto “hormiga” es menor a… (MXN)</span>
          <input inputMode="numeric" value={antLimit} onChange={(e) => setAntLimit(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={saving} onClick={finish}>
          {saving ? 'Guardando…' : 'Comenzar'}
        </button>
      </div>
    </div>
  );
}
