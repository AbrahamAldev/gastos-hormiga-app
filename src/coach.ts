import { client, type UserData } from './store';
import { isoDate, parseDate, sum, today } from './lib';

export type CoachAnswer = {
  estado: 'excelente' | 'bien' | 'atencion' | 'riesgo';
  titular: string;
  resumen: string;
  logros: string[];
  alertas: string[];
  consejos: { accion: string; impacto: string }[];
  proyeccion_buena: { texto: string; monto: number };
  proyeccion_mala: { texto: string; monto: number };
  seguimiento: string | null;
};

type PastAdvice = { date: string; headline: string; tips: string[] };
type Prefs = { coach?: PastAdvice[] } & Record<string, unknown>;

const asObject = (v: unknown): Record<string, unknown> => {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return typeof p === 'string' ? asObject(p) : (p ?? {});
    } catch {
      return {};
    }
  }
  return v as Record<string, unknown>;
};

export const readPrefs = (data: UserData): Prefs => asObject(data.profile?.prefs) as Prefs;

/** Foto compacta de los datos del usuario (últimos 120 días) para el agente. */
export function buildSnapshot(data: UserData) {
  const p = data.profile!;
  const now = parseDate(today());
  const from = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 120));
  const wishes = data.wishes;
  return {
    today: today(),
    profile: {
      displayName: p.displayName,
      currency: p.currency,
      monthlyIncome: p.monthlyIncome,
      incomeType: p.incomeType,
      payPeriod: p.payPeriod,
      hoursPerMonth: p.hoursPerMonth,
      savingsRatePct: p.savingsRatePct,
      antLimit: p.antLimit,
      inflationPct: p.inflationPct,
      yieldPct: p.yieldPct,
    },
    expenses: data.expenses
      .filter((e) => e.date >= from)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 1500)
      .map((e) => ({ date: e.date, amount: e.amount, category: e.category, merchant: e.merchant, necessity: e.necessity, mood: e.mood })),
    incomes: data.incomes.filter((i) => i.date >= from).slice(0, 300).map((i) => ({ date: i.date, amount: i.amount, source: i.source })),
    budgets: data.budgets.map((b) => ({ category: b.category, monthlyLimit: b.monthlyLimit })),
    goals: data.goals.map((g) => ({ name: g.name, target: g.target, saved: g.saved, deadline: g.deadline, kind: g.kind })),
    subscriptions: data.subs.map((s) => ({
      name: s.name,
      amount: s.amount,
      cycle: s.cycle,
      lastUsed: s.lastUsed ?? s.createdAt?.slice(0, 10) ?? null,
      active: s.active,
    })),
    wishes: {
      waiting: wishes.filter((w) => !w.status || w.status === 'esperando').length,
      resisted: sum(wishes.filter((w) => w.status === 'descartado').map((w) => w.price)),
      bought: sum(wishes.filter((w) => w.status === 'comprado').map((w) => w.price)),
    },
    previousAdvice: (readPrefs(data).coach ?? []).slice(0, 3),
  };
}

export async function askCoach(data: UserData, question: string): Promise<CoachAnswer> {
  const { data: res, errors } = await client.queries.askCoach({
    question,
    snapshot: JSON.stringify(buildSnapshot(data)),
  });
  if (errors?.length) throw new Error(errors[0].message);
  const answer = asObject(res) as unknown as CoachAnswer;
  if (!answer?.titular) throw new Error('El coach no pudo responder. Intenta de nuevo.');

  // Memoria: guardamos los últimos 3 consejos para darles seguimiento la próxima vez
  const p = data.profile;
  if (p) {
    const prefs = readPrefs(data);
    const entry: PastAdvice = { date: today(), headline: answer.titular, tips: answer.consejos.map((c) => c.accion) };
    const coach = [entry, ...(prefs.coach ?? []).filter((c) => c.date !== entry.date)].slice(0, 3);
    await client.models.Profile.update({ id: p.id, prefs: JSON.stringify({ ...prefs, coach }) });
  }
  return answer;
}
