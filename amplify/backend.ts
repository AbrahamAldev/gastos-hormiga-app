import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { financialCoach } from './functions/financial-coach/resource';

const backend = defineBackend({
  auth,
  data,
  financialCoach,
});

// Sin acceso de invitados: todos los datos requieren iniciar sesión.
const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;

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
