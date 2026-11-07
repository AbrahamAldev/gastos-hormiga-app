import { existsSync } from 'node:fs';
import { defineFunction } from '@aws-amplify/backend';

// Si existe un archivo .env en la raíz del proyecto, se carga al desplegar con la CLI
// de Amplify (npx ampx sandbox). En Amplify Hosting no hay .env: las mismas variables
// se configuran en la consola (Hosting → Environment variables).
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

/** Variables que la Lambda del Coach necesita para elegir proveedor y modelo de IA. */
const COACH_ENV_VARS = [
  'COACH_PROVIDER',
  'COACH_MODEL',
  'OPENROUTER_API_KEY',
  'GEMINI_API_KEY',
  'OLLAMA_BASE_URL',
  'OLLAMA_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const;

const environment: Record<string, string> = {};
for (const name of COACH_ENV_VARS) {
  const value = process.env[name]?.trim();
  if (value) environment[name] = value;
}

export const financialCoach = defineFunction({
  name: 'financial-coach',
  entry: './handler.ts',
  runtime: 22,
  // AppSync corta las respuestas a los 30 s
  timeoutSeconds: 30,
  memoryMB: 1024,
  environment,
});
