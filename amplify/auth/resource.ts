import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

export const auth = defineAuth({
  // Exige la clave de referido (SIGNUP_REFERRAL_CODE) para crear cuentas nuevas
  triggers: { preSignUp },
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Tu código de Hormiga',
      verificationEmailBody: (createCode) =>
        `Hola 👋 Tu código de verificación de Hormiga es: ${createCode()}`,
    },
  },
});
