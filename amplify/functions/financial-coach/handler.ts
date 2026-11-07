import { Agent, BedrockModel, tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { financialSummary, projectScenarios, ScenarioInput, SnapshotSchema, type Snapshot } from './analysis';

const MODEL_ID = process.env.COACH_MODEL_ID ?? 'us.amazon.nova-lite-v1:0';

/** Respuesta estructurada que la interfaz sabe pintar. */
const CoachAnswer = z.object({
  estado: z.enum(['excelente', 'bien', 'atencion', 'riesgo']).describe('Diagnóstico general de sus finanzas'),
  titular: z.string().describe('Una frase de máximo 12 palabras con el diagnóstico, en segunda persona'),
  resumen: z.string().describe('2 o 3 oraciones con lo más importante, citando cifras reales de las herramientas'),
  logros: z.array(z.string()).max(3).describe('Conductas buenas concretas para reforzar, con su cifra. Vacío si no hay.'),
  alertas: z.array(z.string()).max(3).describe('Conductas a corregir, sin regaños, con su costo. Vacío si no hay.'),
  consejos: z
    .array(z.object({ accion: z.string().describe('Acción concreta y pequeña, empezando con verbo'), impacto: z.string().describe('Qué gana, en dinero o tiempo') }))
    .min(1)
    .max(3),
  proyeccion_buena: z.object({ texto: z.string().describe('Qué pasa si mejora (1 oración)'), monto: z.number().describe('Monto acumulado del escenario bueno') }),
  proyeccion_mala: z.object({ texto: z.string().describe('Qué pasa si empeora (1 oración)'), monto: z.number().describe('Monto acumulado del escenario malo') }),
  seguimiento: z.string().nullable().describe('Si hay consejos anteriores, cómo le fue con ellos (1 oración). null si no hay.'),
});

const SYSTEM_PROMPT = `Eres "Coach Hormiga", un coach de finanzas personales para usuarios de México y Latinoamérica.
Tu misión: ayudar a la persona a reforzar sus buenas conductas con el dinero y reducir las malas (sobre todo los gastos hormiga).

Reglas:
- SIEMPRE llama primero a obtener_resumen_financiero. Si vas a dar proyecciones, llama a proyectar_escenarios (usa 12 meses si no te piden otro horizonte).
- Nunca inventes cifras: usa sólo los números que regresan las herramientas. Redondea y formatea montos como "$1,250".
- Sé breve, cálido y directo. Habla de tú, en español neutro de México. Nada de sermones ni culpa.
- Empieza por lo positivo: reconoce logros reales (ahorrar, resistir antojos, cumplir presupuestos, cancelar suscripciones, registrar gastos).
- Las alertas deben ser concretas (qué hábito, cuánto cuesta al año, en horas de trabajo si está disponible).
- Los consejos deben ser pequeños y accionables esta semana (ej. "Prepara café en casa 3 de 5 días"), no genéricos.
- Las proyecciones muestran ambos lados: lo que gana si mejora y lo que pierde si empeora.
- Si hay consejos_anteriores, compáralos con los datos actuales y dile si mejoró o no.
- Si el historial no es suficiente (historial.suficiente = false), dilo con amabilidad y anímalo a registrar más días; da consejos generales basados en su perfil.
- No recomiendes productos financieros específicos de marcas. Puedes mencionar opciones genéricas como Cetes o cuentas protegidas por el IPAB.
- Responde únicamente sobre las finanzas personales del usuario. Si piden otra cosa, redirige amablemente.`;

function buildAgent(snapshot: Snapshot) {
  const resumen = tool({
    name: 'obtener_resumen_financiero',
    description:
      'Devuelve el estado financiero actual del usuario: periodo actual, promedios mensuales, tendencia de 3 meses, hábitos hormiga, presupuestos, metas, suscripciones sin uso, antojos resistidos, detonantes emocionales y consejos anteriores.',
    inputSchema: z.object({}),
    callback: () => financialSummary(snapshot),
  });

  const escenarios = tool({
    name: 'proyectar_escenarios',
    description:
      'Proyecta el ahorro acumulado a N meses en tres escenarios: tendencia actual, escenario bueno (recortando gasto hormiga) y escenario malo (si crecen los gustos y hormigas). Incluye rendimiento del ahorro e inflación.',
    inputSchema: ScenarioInput,
    callback: (input) => projectScenarios(snapshot, input),
  });

  return new Agent({
    model: new BedrockModel({
      region: process.env.AWS_REGION ?? 'us-east-2',
      modelId: MODEL_ID,
      maxTokens: 1500,
      // Temperatura baja: Nova sigue mejor las herramientas y el formato estructurado
      temperature: 0.2,
    }),
    systemPrompt: SYSTEM_PROMPT,
    tools: [resumen, escenarios],
    structuredOutputSchema: CoachAnswer,
    printer: false,
  });
}

export const handler: Schema['askCoach']['functionHandler'] = async (event) => {
  const rawSnapshot = typeof event.arguments.snapshot === 'string' ? JSON.parse(event.arguments.snapshot) : event.arguments.snapshot;
  const parsed = SnapshotSchema.safeParse(rawSnapshot);
  if (!parsed.success) {
    console.error('Snapshot inválido', parsed.error.issues.slice(0, 5));
    throw new Error('No pude leer tus datos financieros. Recarga la página e intenta de nuevo.');
  }
  const question = (event.arguments.question ?? '').toString().trim().slice(0, 500) || '¿Cómo van mis finanzas?';

  const started = Date.now();
  try {
    const agent = buildAgent(parsed.data);
    const result = await agent.invoke(question);
    console.log(JSON.stringify({ msg: 'coach_ok', model: MODEL_ID, ms: Date.now() - started }));
    return result.structuredOutput as z.infer<typeof CoachAnswer>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ msg: 'coach_error', model: MODEL_ID, ms: Date.now() - started, error: message }));
    if (/use case|not available for this account|AccessDenied|not authorized/i.test(message)) {
      throw new Error('El Coach todavía no tiene acceso al modelo de IA en Amazon Bedrock. Vuelve a intentarlo más tarde.');
    }
    if (/tokens per day/i.test(message)) {
      throw new Error('El Coach alcanzó su límite diario de uso en Amazon Bedrock. Vuelve a intentarlo mañana.');
    }
    if (/throttl|too many requests|too many tokens/i.test(message)) {
      throw new Error('El Coach está recibiendo muchas preguntas. Espera unos segundos e intenta de nuevo.');
    }
    throw new Error('El Coach no pudo responder en este momento. Intenta de nuevo.');
  }
};
