import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { financialCoach } from '../functions/financial-coach/resource';

/**
 * Hormiga — modelo de datos por usuario.
 * Todas las entidades usan allow.owner(): cada usuario sólo ve y edita lo suyo.
 */
const schema = a.schema({
  // Perfil y preferencias (la "memoria" del usuario)
  Profile: a
    .model({
      displayName: a.string(),
      currency: a.string().default('MXN'),
      monthlyIncome: a.float().default(0),
      incomeType: a.string().default('fijo'), // fijo | variable
      payPeriod: a.string().default('quincenal'), // semanal | quincenal | mensual
      hoursPerMonth: a.float().default(160),
      payday: a.integer(),
      savingsRatePct: a.float().default(10), // págate primero
      antLimit: a.float().default(100), // monto máximo para considerar gasto hormiga
      inflationPct: a.float().default(4),
      yieldPct: a.float().default(10), // rendimiento anual de su ahorro
      onboarded: a.boolean().default(false),
      prefs: a.json(),
    })
    .authorization((allow) => [allow.owner()]),

  Expense: a
    .model({
      amount: a.float().required(),
      category: a.string().required(),
      note: a.string(),
      merchant: a.string(),
      date: a.date().required(),
      necessity: a.string(), // necesario | deseo | hormiga
      mood: a.string(), // emoción al gastar (detonantes)
    })
    .authorization((allow) => [allow.owner()]),

  Income: a
    .model({
      amount: a.float().required(),
      source: a.string(),
      date: a.date().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Budget: a
    .model({
      category: a.string().required(),
      monthlyLimit: a.float().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Goal: a
    .model({
      name: a.string().required(),
      emoji: a.string(),
      target: a.float().required(),
      saved: a.float().default(0),
      deadline: a.date(),
      kind: a.string(), // meta | emergencia | deuda
    })
    .authorization((allow) => [allow.owner()]),

  Recurring: a
    .model({
      name: a.string().required(),
      amount: a.float().required(),
      cycle: a.string().default('mensual'), // mensual | anual | semanal
      nextCharge: a.date(),
      lastUsed: a.date(),
      active: a.boolean().default(true),
    })
    .authorization((allow) => [allow.owner()]),

  // Regla de las 48 h para compras impulsivas
  Wish: a
    .model({
      name: a.string().required(),
      price: a.float().required(),
      status: a.string().default('esperando'), // esperando | comprado | descartado
    })
    .authorization((allow) => [allow.owner()]),

  // Coach Hormiga: agente de Strands Agents + Amazon Bedrock.
  // El cliente envía la foto de SUS propios datos; la Lambda no lee otras cuentas.
  askCoach: a
    .query()
    .arguments({
      question: a.string(),
      snapshot: a.json().required(),
    })
    .returns(a.json())
    .handler(a.handler.function(financialCoach))
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
