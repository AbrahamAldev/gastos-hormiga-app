import { createHash, timingSafeEqual } from 'node:crypto';
import type { PreSignUpTriggerHandler } from 'aws-lambda';

/** Normaliza (sin espacios, sin distinguir mayúsculas) y obtiene un hash de longitud fija para comparar. */
const digest = (value: string) => createHash('sha256').update(value.trim().toUpperCase()).digest();

/**
 * Sólo permite crear cuentas a quien escriba la clave de referido configurada en SIGNUP_REFERRAL_CODE.
 * - Sin SIGNUP_REFERRAL_CODE, el registro queda abierto.
 * - Las cuentas que crea un administrador (consola o CLI de Cognito) no necesitan clave.
 * La clave llega como validationData: Cognito no la guarda en el perfil del usuario.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  const expected = process.env.SIGNUP_REFERRAL_CODE?.trim();
  if (!expected || event.triggerSource === 'PreSignUp_AdminCreateUser') return event;

  const given = event.request.validationData?.referralCode ?? '';
  // Comparación en tiempo constante para no filtrar información de la clave por tiempos de respuesta
  if (!given.trim() || !timingSafeEqual(digest(given), digest(expected))) {
    console.warn(JSON.stringify({ msg: 'signup_rejected', reason: 'invalid_referral_code' }));
    // Sin punto final: Cognito agrega uno al mensaje
    throw new Error('La clave de referido no es válida');
  }
  return event;
};
