import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { I18n } from 'aws-amplify/utils';
import { translations } from '@aws-amplify/ui-react';
import outputs from '../amplify_outputs.json';
import App from './App.tsx';
import '@aws-amplify/ui-react/styles.css';
import './index.css';

Amplify.configure(outputs);

I18n.putVocabularies(translations);
I18n.setLanguage('es');
I18n.putVocabularies({
  es: {
    'Sign In': 'Entrar',
    'Sign in': 'Entrar',
    'Create Account': 'Crear cuenta',
    'Enter your Email': 'Tu correo',
    'Enter your Password': 'Tu contraseña',
    'Please confirm your Password': 'Confirma tu contraseña',
    'Forgot your password?': '¿Olvidaste tu contraseña?',
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
