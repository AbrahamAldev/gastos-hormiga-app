/**
 * Cálculos deterministas que el agente usa como herramientas.
 * El modelo interpreta y aconseja; los números salen siempre de aquí.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SnapshotSchema = z.object({
  today: isoDate,
  profile: z.object({
    displayName: z.string().max(80).nullish(),
    currency: z.string().max(5).nullish(),
    monthlyIncome: z.number().min(0).nullish(),
    incomeType: z.string().max(20).nullish(),
    payPeriod: z.string().max(20).nullish(),
    hoursPerMonth: z.number().min(0).nullish(),
    savingsRatePct: z.number().min(0).max(100).nullish(),
    antLimit: z.number().min(0).nullish(),
    inflationPct: z.number().nullish(),
    yieldPct: z.number().nullish(),
  }),
  expenses: z
    .array(
      z.object({
        date: isoDate,
        amount: z.number().min(0),
        category: z.string().max(40),
        merchant: z.string().max(80).nullish(),
        necessity: z.string().max(20).nullish(),
        mood: z.string().max(40).nullish(),
      }),
    )
    .max(1500),
  incomes: z.array(z.object({ date: isoDate, amount: z.number().min(0), source: z.string().max(80).nullish() })).max(300),
  budgets: z.array(z.object({ category: z.string().max(40), monthlyLimit: z.number().min(0) })).max(50),
  goals: z
    .array(
      z.object({
        name: z.string().max(80),
        target: z.number().min(0),
        saved: z.number().nullish(),
        deadline: isoDate.nullish(),
        kind: z.string().max(20).nullish(),
      }),
    )
    .max(30),
  subscriptions: z
    .array(
      z.object({
        name: z.string().max(80),
        amount: z.number().min(0),
        cycle: z.string().max(20).nullish(),
        lastUsed: isoDate.nullish(),
        active: z.boolean().nullish(),
      }),
    )
    .max(60),
  wishes: z.object({ waiting: z.number().min(0), resisted: z.number().min(0), bought: z.number().min(0) }),
  previousAdvice: z
    .array(z.object({ date: isoDate, headline: z.string().max(200), tips: z.array(z.string().max(300)).max(5) }))
    .max(3),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

const CAT_LABEL: Record<string, string> = {
  cafe: 'Café', antojos: 'Antojos', delivery: 'Delivery', tienda: 'Tiendita/OXXO', comida: 'Comida', super: 'Súper',
  transporte: 'Transporte', hogar: 'Hogar y servicios', salud: 'Salud', ocio: 'Ocio', ropa: 'Ropa',
  apps: 'Apps y juegos', deuda: 'Pago de deuda', otros: 'Otros',
};
const ANT_PRONE = new Set(['cafe', 'antojos', 'delivery', 'tienda', 'apps', 'ocio']);

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const monthKey = (s: string) => s.slice(0, 7);

function isAnt(e: Snapshot['expenses'][number], antLimit: number) {
  if (e.necessity === 'hormiga') return true;
  if (e.necessity === 'necesario') return false;
  return e.amount <= antLimit;
}

function periodBounds(period: string, today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  if (period === 'semanal') {
    const dow = (today.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(y, m, d - dow));
    return { start, end: new Date(Date.UTC(y, m, d - dow + 6)), label: 'semana', perMonth: 52 / 12 };
  }
  if (period === 'mensual') {
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)), label: 'mes', perMonth: 1 };
  }
  const first = d <= 15;
  return {
    start: new Date(Date.UTC(y, m, first ? 1 : 16)),
    end: first ? new Date(Date.UTC(y, m, 15)) : new Date(Date.UTC(y, m + 1, 0)),
    label: 'quincena',
    perMonth: 2,
  };
}

/** Promedios mensuales usados como base de las proyecciones. */
export function baseline(s: Snapshot) {
  const today = parse(s.today);
  const p = s.profile;
  const antLimit = p.antLimit ?? 100;
  const from = new Date(today.getTime() - 89 * 86400000);
  const recent = s.expenses.filter((e) => parse(e.date) >= from && parse(e.date) <= today);
  const firstDate = recent.length ? recent.map((e) => parse(e.date)).reduce((a, b) => (a < b ? a : b)) : today;
  // Meses observados: mínimo 1 para no inflar cifras con pocos días de historial
  const observedDays = Math.max(30, days(firstDate, today) + 1);
  const monthsObserved = observedDays / 30.4;
  const spend = sum(recent.map((e) => e.amount)) / monthsObserved;
  const ants = sum(recent.filter((e) => isAnt(e, antLimit)).map((e) => e.amount)) / monthsObserved;
  const wants = sum(recent.filter((e) => e.necessity === 'deseo').map((e) => e.amount)) / monthsObserved;
  const regIncome = sum(s.incomes.filter((i) => parse(i.date) >= from).map((i) => i.amount)) / monthsObserved;
  const income = p.incomeType === 'variable' && regIncome > 0 ? regIncome : Math.max(p.monthlyIncome ?? 0, regIncome);
  const subs = sum(
    s.subscriptions
      .filter((x) => x.active !== false)
      .map((x) => (x.cycle === 'anual' ? x.amount / 12 : x.cycle === 'semanal' ? (x.amount * 52) / 12 : x.amount)),
  );
  return {
    income,
    spend,
    ants,
    wants,
    subs,
    net: income - spend,
    daysOfHistory: recent.length ? days(firstDate, today) + 1 : 0,
    expensesCount: recent.length,
  };
}

export function financialSummary(s: Snapshot) {
  const today = parse(s.today);
  const p = s.profile;
  const cur = p.currency ?? 'MXN';
  const antLimit = p.antLimit ?? 100;
  const hourly = p.monthlyIncome && p.hoursPerMonth ? p.monthlyIncome / p.hoursPerMonth : 0;
  const b = baseline(s);

  // Periodo actual (semana / quincena / mes)
  const per = periodBounds(p.payPeriod ?? 'quincenal', today);
  const inPeriod = s.expenses.filter((e) => parse(e.date) >= per.start && parse(e.date) <= per.end);
  const periodSpent = sum(inPeriod.map((e) => e.amount));
  const periodIncome = (p.monthlyIncome ?? 0) / per.perMonth;
  const saveTarget = periodIncome * ((p.savingsRatePct ?? 0) / 100);
  const elapsed = days(per.start, today) + 1;
  const totalDays = days(per.start, per.end) + 1;

  // Tendencia: últimos 3 meses calendario (el actual proyectado a fin de mes)
  const months = new Map<string, { spent: number; ants: number; wants: number; needs: number }>();
  for (const e of s.expenses) {
    const k = monthKey(e.date);
    const m = months.get(k) ?? { spent: 0, ants: 0, wants: 0, needs: 0 };
    m.spent += e.amount;
    if (isAnt(e, antLimit)) m.ants += e.amount;
    if (e.necessity === 'deseo') m.wants += e.amount;
    if (e.necessity === 'necesario') m.needs += e.amount;
    months.set(k, m);
  }
  const thisKey = s.today.slice(0, 7);
  const dim = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const pace = dim / today.getUTCDate();
  const trend = [...months.entries()]
    .sort((a, b2) => a[0].localeCompare(b2[0]))
    .slice(-3)
    .map(([k, m]) => ({
      mes: k,
      gastado: r0(m.spent),
      hormiga: r0(m.ants),
      gustos: r0(m.wants),
      necesarios: r0(m.needs),
      ...(k === thisKey ? { proyeccion_fin_de_mes: r0(m.spent * pace), hormiga_proyectada: r0(m.ants * pace), en_curso: true } : {}),
    }));

  // Categorías del mes
  const byCat = new Map<string, number>();
  s.expenses.filter((e) => monthKey(e.date) === thisKey).forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
  const topCategories = [...byCat.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 6).map(([c, v]) => ({ categoria: CAT_LABEL[c] ?? c, monto: r0(v) }));

  // Hábitos hormiga (últimos 30 días)
  const from30 = new Date(today.getTime() - 29 * 86400000);
  const groups = new Map<string, { label: string; cat: string; n: number; total: number }>();
  for (const e of s.expenses) {
    const d = parse(e.date);
    if (d < from30 || d > today || !isAnt(e, antLimit)) continue;
    const key = e.merchant?.trim().toLowerCase() || `c:${e.category}`;
    const g = groups.get(key) ?? { label: e.merchant?.trim() || CAT_LABEL[e.category] || e.category, cat: e.category, n: 0, total: 0 };
    g.n++;
    g.total += e.amount;
    groups.set(key, g);
  }
  const antHabits = [...groups.values()]
    .filter((g) => g.n >= 3 || (ANT_PRONE.has(g.cat) && g.n >= 2))
    .sort((a, b2) => b2.total - a.total)
    .slice(0, 5)
    .map((g) => ({
      habito: g.label,
      veces_30_dias: g.n,
      total_30_dias: r0(g.total),
      costo_anual: r0((g.total * 365) / 30),
      horas_de_trabajo_al_anio: hourly ? r2((g.total * 365) / 30 / hourly) : null,
    }));

  // Presupuestos del mes
  const budgets = s.budgets.map((bd) => {
    const used = byCat.get(bd.category) ?? 0;
    return { categoria: CAT_LABEL[bd.category] ?? bd.category, limite: bd.monthlyLimit, usado: r0(used), pct: bd.monthlyLimit ? r0((used / bd.monthlyLimit) * 100) : 0 };
  });

  const goals = s.goals.map((g) => {
    const saved = g.saved ?? 0;
    const left = Math.max(0, g.target - saved);
    const monthsLeft = g.deadline ? Math.max(0, days(today, parse(g.deadline)) / 30.4) : null;
    return {
      meta: g.name,
      tipo: g.kind ?? 'meta',
      ahorrado: r0(saved),
      objetivo: r0(g.target),
      pct: g.target ? r0((saved / g.target) * 100) : 0,
      falta: r0(left),
      ahorro_mensual_necesario: monthsLeft && monthsLeft > 0 ? r0(left / monthsLeft) : null,
      meses_al_ritmo_actual: b.net > 0 ? r2(left / b.net) : null,
    };
  });

  const idleSubs = s.subscriptions
    .filter((x) => x.active !== false && x.lastUsed && days(parse(x.lastUsed), today) > 30)
    .map((x) => ({ nombre: x.name, dias_sin_uso: days(parse(x.lastUsed!), today), monto: x.amount, ciclo: x.cycle ?? 'mensual' }));

  // Detonantes emocionales en gastos no necesarios
  const moods = new Map<string, number>();
  s.expenses.filter((e) => e.mood && e.necessity !== 'necesario').forEach((e) => moods.set(e.mood!, (moods.get(e.mood!) ?? 0) + e.amount));
  const triggers = [...moods.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([m, v]) => ({ emocion: m, monto: r0(v) }));

  const realYield = ((1 + (p.yieldPct ?? 10) / 100) / (1 + (p.inflationPct ?? 4) / 100) - 1) * 100;

  return {
    moneda: cur,
    nombre: p.displayName ?? 'Usuario',
    hoy: s.today,
    historial: { dias: b.daysOfHistory, gastos_registrados: b.expensesCount, suficiente: b.expensesCount >= 10 && b.daysOfHistory >= 7 },
    perfil: {
      ingreso_mensual: r0(p.monthlyIncome ?? 0),
      tipo_ingreso: p.incomeType ?? 'fijo',
      periodo: p.payPeriod ?? 'quincenal',
      valor_hora_trabajo: hourly ? r2(hourly) : null,
      meta_ahorro_pct: p.savingsRatePct ?? 0,
      umbral_hormiga: antLimit,
    },
    periodo_actual: {
      tipo: per.label,
      dia: `${elapsed} de ${totalDays}`,
      gastado: r0(periodSpent),
      ingreso_esperado: r0(periodIncome),
      ahorro_objetivo: r0(saveTarget),
      disponible: r0(periodIncome - saveTarget - periodSpent),
      ritmo_vs_esperado_pct: periodIncome - saveTarget > 0 ? r0((periodSpent / ((periodIncome - saveTarget) * (elapsed / totalDays))) * 100) : null,
    },
    promedio_mensual: {
      ingreso: r0(b.income),
      gasto: r0(b.spend),
      hormiga: r0(b.ants),
      gustos: r0(b.wants),
      suscripciones: r0(b.subs),
      ahorro_neto: r0(b.net),
      tasa_ahorro_real_pct: b.income > 0 ? r0((b.net / b.income) * 100) : null,
      hormiga_pct_del_ingreso: b.income > 0 ? r2((b.ants / b.income) * 100) : null,
    },
    tendencia_3_meses: trend,
    top_categorias_mes: topCategories,
    habitos_hormiga: antHabits,
    presupuestos: budgets,
    metas: goals,
    suscripciones_sin_uso: idleSubs,
    antojos_regla_48h: { en_espera: s.wishes.waiting, dinero_resistido: r0(s.wishes.resisted), comprados: r0(s.wishes.bought) },
    detonantes_emocionales: triggers,
    rendimiento_real_ahorro_pct: r2(realYield),
    consejos_anteriores: s.previousAdvice,
  };
}

export const ScenarioInput = z.object({
  meses: z.number().int().min(1).max(120).describe('Horizonte de la proyección en meses (ej. 6, 12, 24)'),
  recorte_hormiga_pct: z.number().min(0).max(100).describe('Escenario bueno: % de gasto hormiga que el usuario recorta (ej. 50)'),
  aumento_gasto_pct: z.number().min(0).max(100).describe('Escenario malo: % en que crece el gasto no necesario si no cambia nada (ej. 20)'),
});

/** Proyección de ahorro acumulado: tendencia actual, escenario bueno y malo. */
export function projectScenarios(s: Snapshot, input: z.infer<typeof ScenarioInput>) {
  const b = baseline(s);
  const y = (s.profile.yieldPct ?? 10) / 100 / 12;
  const infl = (s.profile.inflationPct ?? 4) / 100;
  const fv = (monthly: number, n: number) => {
    // Ahorro positivo genera rendimiento; un déficit se acumula como deuda sin rendimiento
    if (monthly <= 0) return monthly * n;
    return y === 0 ? monthly * n : monthly * ((Math.pow(1 + y, n) - 1) / y);
  };
  const n = input.meses;
  const goodMonthly = b.net + b.ants * (input.recorte_hormiga_pct / 100);
  const badMonthly = b.net - (b.wants + b.ants) * (input.aumento_gasto_pct / 100);
  const realFactor = Math.pow(1 + infl, n / 12);
  const goal = s.goals.find((g) => (g.saved ?? 0) < g.target);
  const monthsTo = (m: number) => (goal && m > 0 ? r2((goal.target - (goal.saved ?? 0)) / m) : null);
  return {
    moneda: s.profile.currency ?? 'MXN',
    meses: n,
    base_mensual: { ingreso: r0(b.income), gasto: r0(b.spend), hormiga: r0(b.ants), gustos: r0(b.wants) },
    tendencia_actual: {
      ahorro_mensual: r0(b.net),
      acumulado: r0(fv(b.net, n)),
      acumulado_en_pesos_de_hoy: r0(fv(b.net, n) / realFactor),
      meses_para_meta: monthsTo(b.net),
    },
    escenario_bueno: {
      supuesto: `Recorta ${input.recorte_hormiga_pct}% del gasto hormiga e invierte la diferencia`,
      ahorro_mensual: r0(goodMonthly),
      acumulado: r0(fv(goodMonthly, n)),
      diferencia_vs_actual: r0(fv(goodMonthly, n) - fv(b.net, n)),
      meses_para_meta: monthsTo(goodMonthly),
    },
    escenario_malo: {
      supuesto: `Los gustos y hormigas crecen ${input.aumento_gasto_pct}%`,
      ahorro_mensual: r0(badMonthly),
      acumulado: r0(fv(badMonthly, n)),
      diferencia_vs_actual: r0(fv(badMonthly, n) - fv(b.net, n)),
      meses_para_meta: monthsTo(badMonthly),
    },
    meta_de_referencia: goal ? goal.name : null,
    rendimiento_anual_supuesto_pct: s.profile.yieldPct ?? 10,
    inflacion_supuesta_pct: s.profile.inflationPct ?? 4,
  };
}
