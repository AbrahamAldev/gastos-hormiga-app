# 🐜 Hormiga — Control de gastos hormiga

**Hormiga** es una app web para descubrir a dónde se va tu dinero, detectar los gastos pequeños y frecuentes que casi nunca notas (los "gastos hormiga") y recuperarlos. Incluye un **Coach con IA** que analiza tus propios números y te da consejos concretos.

> Tus datos son privados: cada persona sólo puede ver y editar sus propios registros.

---

## Índice

1. [Para cualquier persona (sin tecnicismos)](#1-para-cualquier-persona-sin-tecnicismos)
2. [Para usuarios técnicos: funciones en detalle](#2-para-usuarios-técnicos-funciones-en-detalle)
3. [Para desarrolladores: arquitectura y despliegue](#3-para-desarrolladores-arquitectura-y-despliegue)

---

## 1. Para cualquier persona (sin tecnicismos)

### ¿Qué es un gasto hormiga?
Son gastos chicos que se repiten: el café de cada mañana, un antojo en la tienda, un delivery "porque no hay nada en casa". Cada uno parece poca cosa, pero al año pueden sumar miles de pesos. Hormiga te muestra cuánto suman **en tu caso**.

### ¿Cómo empiezo?
1. **Crea tu cuenta** con tu correo. Te llegará un **código de 6 dígitos** para confirmar que el correo es tuyo. Ese código es la única forma de entrar, no hay contraseña que recordar.
2. **Completa el registro inicial**: tu nombre, tu ingreso mensual aproximado, cada cuánto te pagan (semanal, quincenal o mensual) y tu **umbral hormiga**, es decir, a partir de qué monto un gasto se considera "hormiga" (por defecto, $100).
3. **Registra tus gastos** con el botón **+** que aparece en la parte inferior. Con tus favoritos (los gastos que más repites), registrar uno toma sólo dos toques.

### Las 5 pantallas principales

| Pestaña | Para qué sirve |
|---|---|
| **◎ Inicio** | Un resumen de tu periodo actual: cuánto llevas gastado, cuánto te queda, y "Para ti", una lista de consejos según tus datos. |
| **≡ Gastos** | Todos tus movimientos (gastos e ingresos), con filtros por categoría y tipo. Aquí también puedes registrar ingresos. |
| **🐜 Hormiga** | El detector: los hábitos que más dinero se llevan en los últimos 30 días, cuánto cuestan al año y en horas de trabajo. |
| **◔ Plan** | Presupuestos mensuales por categoría, metas de ahorro (como un fondo de emergencia) y su avance. |
| **••• Más** | Suscripciones, lista de antojos en espera (regla de las 48 horas), calculadoras y tu perfil. |

Además, el botón **Coach** flota en la pantalla. Al tocarlo, el Coach Hormiga revisa tus números y te da un diagnóstico, logros, alertas, consejos pequeños para esta semana y proyecciones a 12 meses.

### Ideas que la app usa
- **Regla de las 48 horas:** cuando sientas ganas de comprar algo por impulso, anótalo en *Más → Antojos* y espera dos días. Muchas veces ya no lo quieres.
- **Págate primero:** la app calcula una meta de ahorro (un porcentaje de tu ingreso del periodo) para que la veas antes de gastar.
- **Detonantes emocionales:** al registrar un gasto puedes marcar cómo te sentías (estrés, aburrimiento, tristeza...). Así ves qué emociones te llevan a gastar.

### Aviso
La app y el Coach dan **orientación general, no asesoría financiera profesional**. Las calculadoras son estimaciones.

---

## 2. Para usuarios técnicos: funciones en detalle

### Registro y gastos
- **Gasto:** monto, categoría (14 categorías predefinidas, p. ej. Café, Delivery, Súper, Transporte), comercio, nota, fecha, **necesidad** (`necesario`, `deseo` o `hormiga`) y **emoción** (detonante).
- **Clasificación automática:** si no marcas la necesidad, un gasto cuenta como hormiga cuando su monto es menor o igual al **umbral hormiga** del perfil. Si lo marcas explícitamente, manda tu marca.
- **Favoritos:** se calculan a partir de tu historial (combinaciones categoría + comercio + monto más repetidas) para registrar en dos toques.
- **Ingresos:** monto, fuente y fecha. Con ingreso **variable**, el presupuesto se calcula con lo que realmente cobraste en el periodo.

### Presupuestos
Un tope mensual por categoría. La app avisa al llegar al **80%** y al **100%** del límite.

### Detector de gastos hormiga
Agrupa los gastos hormiga de los últimos **30 días** por comercio (o por categoría si no hay comercio) y muestra los 5 principales con:
- veces que lo hiciste y cuánto gastaste,
- costo estimado **al año** (`total_30_días × 365 / 30`),
- **horas de trabajo al año** que equivalen, usando tu ingreso mensual y tus horas de trabajo al mes.

Un hábito aparece si se repite **3 o más veces**, o **2 veces** si pertenece a una categoría propensa (café, antojos, delivery, tienda, apps, ocio).

### Metas de ahorro
Nombre, emoji, monto objetivo, fecha opcional y tipo (meta, emergencia o deuda). La app calcula cuánto necesitas ahorrar por mes para llegar a tiempo y cuántos meses tardarías al ritmo actual. Puedes abonar a cada meta.

### Suscripciones
Lista de cargos recurrentes (mensual, anual o semanal). La app las suma en tu gasto mensual equivalente y te señala las que no has usado en más de **30 días**, con la fecha de su próximo cobro.

### Antojos (regla de 48 h)
Lista de cosas que quieres comprar. Cada una queda en estado *esperando*; puedes marcarla como *comprada* o *descartada*. Lo que descartas cuenta como dinero que no gastaste.

### Calculadoras
- **Pago mínimo de tarjeta:** cuánto cuesta pagar sólo el mínimo frente a un pago fijo. Es una estimación: incluye IVA sobre intereses y toma como mínimo el interés del mes más 1.5% de la deuda.
- **¿Tu dinero crece o se encoge?:** compara el rendimiento de tu ahorro con la inflación.

### Coach Hormiga (IA)
1. La app arma una **foto** de tus datos del usuario: periodo actual, tendencia de 3 meses, hábitos, presupuestos, metas, suscripciones, antojos, detonantes y consejos anteriores.
2. Esa foto se envía a una función de servidor, que la valida con un esquema estricto (límites de tamaño y tipos de datos).
3. Un **agente** (Strands Agents) corre sobre **Amazon Nova Lite** en Amazon Bedrock. El modelo **no hace cuentas por su cuenta**: pide dos herramientas deterministas, `obtener_resumen_financiero` y `proyectar_escenarios`, y sólo interpreta sus resultados.
4. La respuesta sale como JSON estructurado (estado, titular, logros, alertas, consejos, dos proyecciones y seguimiento de consejos previos), que la interfaz pinta como tarjetas.
5. Los consejos anteriores se guardan en tu perfil, así que en la siguiente consulta el Coach puede decirte si mejoraste.

**Límites conocidos:** la función tiene un timeout de 30 segundos (AppSync corta las respuestas a esa altura) y el servidor recorta la pregunta libre a 500 caracteres.

### Privacidad y seguridad
- Todas las tablas usan autorización `owner`: cada usuario sólo accede a sus registros.
- No hay acceso de invitados: para leer o escribir datos hay que iniciar sesión.
- La Lambda del Coach sólo puede invocar modelos Nova y Claude en Bedrock; no lee datos de otros usuarios.

---

## 3. Para desarrolladores: arquitectura y despliegue

### Stack
| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript, componentes de `@aws-amplify/ui-react` |
| Backend | AWS Amplify Gen 2 (definido como código en TypeScript con CDK por debajo) |
| Autenticación | Amazon Cognito, login por correo con código (`verificationEmailStyle: 'CODE'`) |
| API y datos | AWS AppSync (GraphQL) + Amazon DynamoDB (modelos generados desde el esquema) |
| IA | Función Lambda de Node 22 + `@strands-agents/sdk` + Amazon Bedrock (Nova Lite por defecto) |
| Validación | Zod (esquemas del snapshot y de la respuesta del Coach) |
| Hosting | Amplify Hosting (frontend estático desde `dist/`) |

### Diagrama
```
 Navegador (React)
     │  Cognito (login con código por correo)
     ▼
 AppSync (GraphQL, autorización userPool)
     ├── Modelos Profile, Expense, Income, Budget, Goal,
     │   Recurring, Wish  ──►  DynamoDB (allow.owner)
     └── askCoach (query, allow.authenticated)
              │
              ▼
        Lambda financial-coach (Node 22, 1 GB, 30 s)
              │  Strands agent
              ├── tool: obtener_resumen_financiero   ─┐ cálculos deterministas
              └── tool: proyectar_escenarios          ─┘ (analysis.ts)
              │
              ▼
        Amazon Bedrock  (us.amazon.nova-lite-v1:0)
```

### Estructura del repositorio
```
amplify/
  backend.ts                 # Define auth, data y la Lambda; restringe permisos de Bedrock
  auth/resource.ts           # Login por correo con código
  data/resource.ts           # Esquema GraphQL y autorización por dueño
  functions/financial-coach/
    resource.ts              # Lambda: runtime, timeout, memoria, COACH_MODEL_ID
    handler.ts               # Agente, prompt del sistema, mapeo de errores
    analysis.ts              # Cálculos: promedios, periodos, hábitos, proyecciones
src/
  App.tsx                    # Shell, autenticación, onboarding, registro de gasto
  store.ts                   # Cliente de datos y suscripciones en tiempo real
  lib.ts                     # Categorías, formato de moneda y fechas
  coach.ts                   # Arma el snapshot y llama a askCoach
  views/                     # Home, Expenses, Ants, Plan, More, Coach
amplify.yml                  # Pipeline de despliegue de Amplify Hosting
```

### Requisitos
- Node.js **≥ 20.20** y npm **≥ 10.8** (ver `engines` en `package.json`).
- Cuenta de AWS con acceso a Amazon Bedrock en **us-east-2** y el modelo Nova Lite habilitado.
- Credenciales de AWS configuradas en tu terminal (`aws configure` o `aws sso login`).

### Ejecutar en local
```bash
npm install
npx ampx sandbox --once   # crea el backend en tu cuenta y genera amplify_outputs.json
npm run dev               # frontend en http://localhost:5173
```
Para desarrollo continuo, usa `npx ampx sandbox` (sin `--once`): vigila cambios en `amplify/` y redespliega solo.

### Desplegar a producción
Hay dos caminos:
1. **Conectar el repositorio a Amplify Hosting** (recomendado): en la consola de Amplify, *Crear app → GitHub*. El archivo `amplify.yml` despliega backend (`ampx pipeline-deploy`) y frontend (`npm run build`) en cada push.
2. **Manual:** `npx ampx pipeline-deploy` para el backend y subir `dist/` como zip en Amplify Hosting.

### Configuración importante
- **Modelo del Coach:** variable `COACH_MODEL_ID` en `amplify/functions/financial-coach/resource.ts` (por defecto `us.amazon.nova-lite-v1:0`). Cambiar de modelo no requiere tocar el código, pero el rol IAM sólo permite familias `amazon.nova-*` y `anthropic.claude-*` (`amplify/backend.ts`).
- **Región de Bedrock:** la Lambda usa `AWS_REGION` (us-east-2 por defecto) con perfiles de inferencia `us.*`.
- **Cuotas de Bedrock:** las cuentas nuevas pueden tener cuota **0** para invocar modelos. Si ves el error de límite diario en el Coach, revisa Service Quotas → Bedrock antes de depurar el código.
- **Archivos ignorados por git:** `amplify_outputs.json` (configuración de tu backend), `node_modules/`, `dist/` y `.amplify/`. No los subas.

### Pruebas y calidad
```bash
npm run lint    # ESLint con cero advertencias permitidas
npm run build   # tsc + vite build
```
El cálculo de la lógica financiera vive en `analysis.ts`, separado de la IA, para que sea determinista y fácil de probar.

### Ideas para evolucionar
- Pruebas unitarias para `analysis.ts` (promedios, periodos y hábitos).
- Exportar los datos del usuario a CSV.
- Notificaciones por correo cuando se alcance un presupuesto.

---

## Licencia
El código base proviene de la plantilla de AWS Amplify (MIT-0). Consulta el archivo `LICENSE`.
