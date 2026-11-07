import { defineFunction } from '@aws-amplify/backend';

export const financialCoach = defineFunction({
  name: 'financial-coach',
  entry: './handler.ts',
  runtime: 22,
  // AppSync corta las respuestas a los 30 s
  timeoutSeconds: 30,
  memoryMB: 1024,
  environment: {
    COACH_MODEL_ID: 'us.amazon.nova-lite-v1:0',
  },
});
