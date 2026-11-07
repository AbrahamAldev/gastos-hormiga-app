import type { Schema } from '../amplify/data/resource';

export type Expense = Schema['Expense']['type'];
export type Income = Schema['Income']['type'];
export type Budget = Schema['Budget']['type'];
export type Goal = Schema['Goal']['type'];
export type Subscription = Schema['Recurring']['type'];
export type Wish = Schema['Wish']['type'];
export type Profile = Schema['Profile']['type'];

export const CATEGORIES = [
  { id: 'cafe', label: 'Café', emoji: '☕' },
  { id: 'antojos', label: 'Antojos', emoji: '🍩' },
  { id: 'delivery', label: 'Delivery', emoji: '🛵' },
  { id: 'tienda', label: 'Tiendita / OXXO', emoji: '🏪' },
  { id: 'comida', label: 'Comida', emoji: '🍽️' },
  { id: 'super', label: 'Súper', emoji: '🛒' },
  { id: 'transporte', label: 'Transporte', emoji: '🚕' },
  { id: 'hogar', label: 'Hogar y servicios', emoji: '🏠' },
  { id: 'salud', label: 'Salud', emoji: '💊' },
  { id: 'ocio', label: 'Ocio', emoji: '🎬' },
  { id: 'ropa', label: 'Ropa', emoji: '👕' },
  { id: 'apps', label: 'Apps y juegos', emoji: '📱' },
  { id: 'deuda', label: 'Pago de deuda', emoji: '💳' },
  { id: 'otros', label: 'Otros', emoji: '✨' },
] as const;

export const catOf = (id: string | null | undefined) =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

/** Categorías propensas a gasto hormiga (pequeño, frecuente, evitable). */
export const ANT_PRONE = new Set(['cafe', 'antojos', 'delivery', 'tienda', 'apps', 'ocio']);

export const MOODS = ['😊 Feliz', '😩 Estrés', '🥱 Aburrimiento', '😔 Triste', '🎉 Social', '⏱️ Prisa'];

export const fmt = (n: number, currency = 'MXN') =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2,
  }).format(n || 0);

export const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export const prettyDate = (s: string) => {
  const d = parseDate(s);
  const diff = daysBetween(d, parseDate(today()));
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
};

export type Period = 'semanal' | 'quincenal' | 'mensual';

/** Rango del periodo actual (semana lun-dom, quincena 1-15 / 16-fin, mes). */
export function periodRange(period: Period, ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (period === 'semanal') {
    const day = (ref.getDay() + 6) % 7;
    const start = new Date(y, m, ref.getDate() - day);
    const end = new Date(y, m, start.getDate() + 6);
    return { start, end, label: 'esta semana', perMonth: 52 / 12 };
  }
  if (period === 'quincenal') {
    const first = ref.getDate() <= 15;
    const start = new Date(y, m, first ? 1 : 16);
    const end = first ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    return { start, end, label: 'esta quincena', perMonth: 2 };
  }
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0), label: 'este mes', perMonth: 1 };
}

export const inRange = (s: string, start: Date, end: Date) => {
  const d = parseDate(s);
  return d >= start && d <= end;
};

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Valor del tiempo: cuánto vale 1 hora de trabajo del usuario. */
export const hourlyRate = (p?: Profile | null) =>
  p && p.monthlyIncome && p.hoursPerMonth ? p.monthlyIncome / p.hoursPerMonth : 0;

export const hoursText = (amount: number, p?: Profile | null) => {
  const r = hourlyRate(p);
  if (!r) return '';
  const h = amount / r;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min de trabajo`;
  if (h < 8 * 5) return `${h.toFixed(1)} h de trabajo`;
  return `${(h / 8).toFixed(0)} días de trabajo`;
};

export type AntHabit = {
  key: string;
  label: string;
  emoji: string;
  count: number;
  total30: number;
  avg: number;
  annual: number;
};

/**
 * Detector de gastos hormiga: gastos pequeños (≤ umbral) que se repiten
 * ≥ 3 veces en los últimos 30 días por comercio/categoría, o marcados
 * explícitamente como "hormiga".
 */
export function detectAnts(expenses: Expense[], antLimit = 100): AntHabit[] {
  const now = parseDate(today());
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const groups = new Map<string, { label: string; emoji: string; items: Expense[]; marked: boolean }>();
  for (const e of expenses) {
    if (!inRange(e.date, from, now)) continue;
    const small = e.amount <= antLimit;
    const marked = e.necessity === 'hormiga';
    if (!small && !marked) continue;
    if (e.necessity === 'necesario') continue;
    const cat = catOf(e.category);
    const merchant = e.merchant?.trim();
    const key = merchant ? `m:${merchant.toLowerCase()}` : `c:${cat.id}`;
    const g = groups.get(key) ?? { label: merchant || cat.label, emoji: cat.emoji, items: [], marked: false };
    g.items.push(e);
    g.marked ||= marked;
    groups.set(key, g);
  }
  const out: AntHabit[] = [];
  for (const [key, g] of groups) {
    const prone = ANT_PRONE.has(g.items[0].category);
    if (!(g.marked || g.items.length >= 3 || (prone && g.items.length >= 2))) continue;
    const total30 = sum(g.items.map((e) => e.amount));
    out.push({
      key,
      label: g.label,
      emoji: g.emoji,
      count: g.items.length,
      total30,
      avg: total30 / g.items.length,
      annual: (total30 * 365) / 30,
    });
  }
  return out.sort((a, b) => b.annual - a.annual);
}

/** Valor futuro de un ahorro mensual constante. */
export const futureValue = (monthly: number, annualPct: number, years: number) => {
  const r = annualPct / 100 / 12;
  const n = years * 12;
  return r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r);
};

export const subMonthly = (s: Subscription) =>
  s.cycle === 'anual' ? s.amount / 12 : s.cycle === 'semanal' ? (s.amount * 52) / 12 : s.amount;

/** Simulación de pago de tarjeta (tasa anual ≈ CAT, IVA sobre intereses 16%). */
export function cardPayoff(balance: number, annualPct: number, payment: number | 'min') {
  const r = (annualPct / 100 / 12) * 1.16;
  let b = balance;
  let months = 0;
  let interest = 0;
  while (b > 0.5 && months < 600) {
    const i = b * r;
    const pay = payment === 'min' ? Math.max(i + b * 0.015, Math.min(200, b + i)) : payment;
    if (pay <= i) return { months: Infinity, interest: Infinity };
    interest += i;
    b = b + i - pay;
    months++;
  }
  return { months, interest };
}

/** Rendimiento real (Fisher) después de ISR aproximado sobre el nominal. */
export const realYield = (nominalPct: number, inflationPct: number, taxPct = 0) =>
  ((1 + (nominalPct * (1 - taxPct / 100)) / 100) / (1 + inflationPct / 100) - 1) * 100;

export function toCSV(expenses: Expense[]) {
  const head = ['fecha', 'monto', 'categoria', 'comercio', 'nota', 'tipo', 'emocion'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.amount, catOf(e.category).label, e.merchant, e.note, e.necessity, e.mood].map(esc).join(','));
  return '﻿' + [head.join(','), ...rows].join('\n');
}

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
