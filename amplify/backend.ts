import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { financialCoach } from './functions/financial-coach/resource';
import { pickEnv } from './env';

const backend = defineBackend({
  auth,
  data,
  financialCoach,
});

// Sin acceso de invitados: todos los datos requieren iniciar sesión.
const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;

// La interfaz muestra el campo "Clave de referido" sólo si el backend la exige.
backend.addOutput({
  custom: { signupReferralRequired: Boolean(pickEnv(['SIGNUP_REFERRAL_CODE']).SIGNUP_REFERRAL_CODE) },
});

// Con COACH_PROVIDER=bedrock (por defecto), el agente sólo puede invocar modelos Amazon Nova
// y Claude de Anthropic en Bedrock (perfiles de inferencia "us." de la cuenta donde se despliega
// + los modelos base a los que enrutan). El proveedor y el modelo se eligen con variables de
// entorno: ver .env.example y functions/financial-coach/resource.ts.
const coachLambda = backend.financialCoach.resources.lambda;
const { region, account } = Stack.of(coachLambda);
const modelFamilies = ['amazon.nova-*', 'anthropic.claude-*'];
coachLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
    resources: modelFamilies.flatMap((m) => [
      `arn:aws:bedrock:${region}:${account}:inference-profile/us.${m}`,
      `arn:aws:bedrock:us-east-1::foundation-model/${m}`,
      `arn:aws:bedrock:us-east-2::foundation-model/${m}`,
      `arn:aws:bedrock:us-west-2::foundation-model/${m}`,
    ]),
  }),
);

// Contador de preguntas al Coach por usuario y por día (límite: COACH_DAILY_LIMIT, 25 por defecto).
// Vive en el mismo stack que la Lambda y sólo ella puede escribir. Los registros expiran solos (TTL).
const coachUsage = new Table(Stack.of(coachLambda), 'CoachUsage', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.DESTROY,
});
coachUsage.grantWriteData(coachLambda);
backend.financialCoach.addEnvironment('COACH_USAGE_TABLE', coachUsage.tableName);
