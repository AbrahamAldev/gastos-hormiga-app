import { useEffect, useState } from 'react';
import type { UserData } from '../store';
import { askCoach, readPrefs, type CoachAnswer } from '../coach';
import { fmt, prettyDate } from '../lib';
import { Sheet } from '../ui';

const QUICK = [
  { icon: '📊', q: '¿Cómo van mis finanzas?' },
  { icon: '🔮', q: '¿Qué pasa con mi dinero si sigo así 12 meses?' },
  { icon: '✂️', q: '¿Dónde puedo recortar sin sufrir?' },
  { icon: '🎯', q: '¿Cuándo llego a mi meta de ahorro?' },
];

const STEPS = ['Revisando tus gastos…', 'Buscando hormigas…', 'Proyectando escenarios…', 'Preparando consejos…'];

const ESTADO: Record<CoachAnswer['estado'], { label: string; cls: string; emoji: string }> = {
  excelente: { label: 'Excelente', cls: 'good', emoji: '🌟' },
  bien: { label: 'Vas bien', cls: 'good', emoji: '👍' },
  atencion: { label: 'Atención', cls: 'warn', emoji: '⚠️' },
  riesgo: { label: 'En riesgo', cls: 'bad', emoji: '🚨' },
};

export function CoachButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="coach-btn glass" onClick={onClick} aria-label="Pregúntale a tu Coach">
      <span className="coach-spark">✨</span>
      <span>Coach</span>
    </button>
  );
}

export function CoachSheet({ data, open, onClose }: { data: UserData; open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<CoachAnswer | null>(null);
  const [error, setError] = useState('');
  const cur = data.profile?.currency ?? 'MXN';
  const last = readPrefs(data).coach?.[0];

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [loading]);

  async function ask(q: string) {
    const text = q.trim() || QUICK[0].q;
    setAsked(text);
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      setAnswer(await askCoach(data, text));
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const reset = () => {
    setAnswer(null);
    setError('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="✨ Coach Hormiga">
      {!answer && !loading && (
        <>
          <p className="muted">
            Analizo tus gastos, hábitos y metas para decirte cómo vas, qué estás haciendo bien y qué te está costando dinero.
          </p>
          {last && (
            <p className="hint coach-last">
              Último consejo ({prettyDate(last.date).toLowerCase()}): <b>{last.headline}</b>
            </p>
          )}
          <div className="coach-quick">
            {QUICK.map((x) => (
              <button key={x.q} className="glass card coach-q" onClick={() => ask(x.q)}>
                <span>{x.icon}</span>
                {x.q}
              </button>
            ))}
          </div>
          <form
            className="coach-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input value={question} maxLength={500} placeholder="O pregúntame lo que quieras de tu dinero…" onChange={(e) => setQuestion(e.target.value)} />
            <button className="btn primary" type="submit">
              ↑
            </button>
          </form>
          {error && <p className="error mt">{error}</p>}
        </>
      )}

      {loading && (
        <div className="coach-loading">
          <div className="coach-orb" />
          <p className="muted">“{asked}”</p>
          <b>{STEPS[step]}</b>
        </div>
      )}

      {answer && (
        <div className="coach-answer stack">
          <p className="hint">“{asked}”</p>
          <div className={`coach-head ${ESTADO[answer.estado]?.cls ?? ''}`}>
            <span className="pill">
              {ESTADO[answer.estado]?.emoji} {ESTADO[answer.estado]?.label ?? answer.estado}
            </span>
            <h2>{answer.titular}</h2>
            <p>{answer.resumen}</p>
          </div>

          {answer.seguimiento && <div className="coach-block follow">🔁 {answer.seguimiento}</div>}

          {answer.logros.length > 0 && (
            <div className="coach-block good">
              <h4>💪 Sigue así</h4>
              <ul>{answer.logros.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}

          {answer.alertas.length > 0 && (
            <div className="coach-block warn">
              <h4>🐜 Ojo con esto</h4>
              <ul>{answer.alertas.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}

          <div className="coach-block">
            <h4>🎯 Esta semana</h4>
            <ol className="coach-tips">
              {answer.consejos.map((c, i) => (
                <li key={i}>
                  <b>{c.accion}</b>
                  <small>{c.impacto}</small>
                </li>
              ))}
            </ol>
          </div>

          <div className="compare">
            <div className="good-box">
              <small>📈 Si mejoras</small>
              <b>{fmt(answer.proyeccion_buena.monto, cur)}</b>
              <span>{answer.proyeccion_buena.texto}</span>
            </div>
            <div className="bad-box">
              <small>📉 Si empeora</small>
              <b>{fmt(answer.proyeccion_mala.monto, cur)}</b>
              <span>{answer.proyeccion_mala.texto}</span>
            </div>
          </div>

          <p className="hint">Generado con IA (Amazon Nova en Bedrock) a partir de tus registros. Es orientación, no asesoría financiera profesional.</p>
          <button className="btn ghost block" onClick={reset}>
            Hacer otra pregunta
          </button>
        </div>
      )}
    </Sheet>
  );
}
