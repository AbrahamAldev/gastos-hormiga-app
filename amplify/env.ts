import { existsSync, readFileSync } from 'node:fs';
import * as util from 'node:util';

let dotEnv: Record<string, string> | undefined;

/**
 * Lee el archivo .env de la raíz del proyecto (si existe) al desplegar con la CLI de Amplify
 * (npx ampx sandbox). En Amplify Hosting no hay .env: las mismas variables se configuran en la
 * consola (Hosting → Environment variables).
 *
 * El archivo se interpreta directamente en lugar de cargarlo en process.env porque, al sintetizar,
 * el CDK reemplaza temporalmente process.env y las variables cargadas no serían visibles.
 */
function readDotEnv(): Record<string, string> {
  if (dotEnv) return dotEnv;
  dotEnv = {};
  if (existsSync('.env') && typeof util.parseEnv === 'function') {
    dotEnv = util.parseEnv(readFileSync('.env', 'utf8')) as Record<string, string>;
  }
  return dotEnv;
}

/**
 * Devuelve sólo las variables pedidas que tengan valor, listas para el `environment` de una Lambda.
 * Las variables del entorno (p. ej. las de la consola de Amplify) tienen prioridad sobre el .env.
 */
export function pickEnv(names: readonly string[]): Record<string, string> {
  const fromFile = readDotEnv();
  const environment: Record<string, string> = {};
  for (const name of names) {
    const value = (process.env[name] ?? fromFile[name])?.trim();
    if (value) environment[name] = value;
  }
  return environment;
}
