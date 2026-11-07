import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Tu código de Hormiga',
      verificationEmailBody: (createCode) =>
        `Hola 👋 Tu código de verificación de Hormiga es: ${createCode()}`,
    },
  },
});
