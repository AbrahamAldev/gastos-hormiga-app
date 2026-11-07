import { defineFunction } from '@aws-amplify/backend';
import { pickEnv } from '../../env';

/** Valida la clave de referido antes de que Cognito cree la cuenta. */
export const preSignUp = defineFunction({
  name: 'pre-sign-up',
  entry: './handler.ts',
  runtime: 22,
  // Los triggers de Cognito van en el grupo de recursos de auth para evitar dependencias circulares
  resourceGroupName: 'auth',
  environment: pickEnv(['SIGNUP_REFERRAL_CODE']),
});
