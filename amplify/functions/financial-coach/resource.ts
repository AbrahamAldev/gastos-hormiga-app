import { defineFunction } from '@aws-amplify/backend';
import { pickEnv } from '../../env';

export const financialCoach = defineFunction({
  name: 'financial-coach',
  entry: './handler.ts',
  runtime: 22,
  // AppSync corta las respuestas a los 30 s
  timeoutSeconds: 30,
  memoryMB: 1024,
  // Proveedor y modelo de IA, claves y límite diario: ver .env.example
  environment: pickEnv([
    'COACH_PROVIDER',
    'COACH_MODEL',
    'COACH_DAILY_LIMIT',
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
    'OLLAMA_BASE_URL',
    'OLLAMA_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
  ]),
});
