import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, MailCheck } from 'lucide-react';
import { getT } from '../i18n/i18n.js';
import { exchangeCodeForSupabaseSession, getSupabaseSession, updateSupabasePassword } from '../supabase/auth.js';
import { cleanupAuthCallbackUrl, readAuthCallbackContext } from '../supabase/authRedirect.js';
import { getSupabaseAuthErrorMessage } from '../supabase/authBridge.js';
import { getInitialLang, normalizeLang, persistLang } from '../shared/lang.js';

const PHASES = {
  LOADING: 'loading',
  IDLE: 'idle',
  SIGNUP_SUCCESS: 'signup-success',
  SIGNUP_FALLBACK: 'signup-fallback',
  RECOVERY_FORM: 'recovery-form',
  RECOVERY_SUCCESS: 'recovery-success',
  ERROR: 'error',
};

const HOME_URL = '/';

const ICON_BY_PHASE = {
  [PHASES.LOADING]: LoaderCircle,
  [PHASES.IDLE]: MailCheck,
  [PHASES.SIGNUP_SUCCESS]: CheckCircle2,
  [PHASES.SIGNUP_FALLBACK]: MailCheck,
  [PHASES.RECOVERY_FORM]: KeyRound,
  [PHASES.RECOVERY_SUCCESS]: CheckCircle2,
  [PHASES.ERROR]: CircleAlert,
};

const cardToneByPhase = {
  [PHASES.ERROR]: 'border-red-200 bg-red-50 text-red-600',
  [PHASES.SIGNUP_SUCCESS]: 'border-green-200 bg-green-50 text-green-600',
  [PHASES.RECOVERY_SUCCESS]: 'border-green-200 bg-green-50 text-green-600',
};

const getPhaseContent = (phase, t) => {
  if (phase === PHASES.LOADING) return { title: t.authActionLoadingTitle, description: t.authActionLoadingDesc };
  if (phase === PHASES.IDLE) return { title: t.authActionIdleTitle, description: t.authActionIdleDesc };
  if (phase === PHASES.SIGNUP_SUCCESS) return { title: t.authActionSignupSuccessTitle, description: t.authActionSignupSuccessDesc };
  if (phase === PHASES.SIGNUP_FALLBACK) return { title: t.authActionSignupFallbackTitle, description: t.authActionSignupFallbackDesc };
  if (phase === PHASES.RECOVERY_FORM) return { title: t.authActionRecoveryTitle, description: t.authActionRecoveryDesc };
  if (phase === PHASES.RECOVERY_SUCCESS) return { title: t.authActionRecoverySuccessTitle, description: t.authActionRecoverySuccessDesc };
  return { title: t.authActionInvalidLinkTitle, description: t.authActionInvalidLinkDesc };
};

const AuthCard = ({ phase, title, description, children }) => {
  const Icon = ICON_BY_PHASE[phase] || CircleAlert;
  const tone = cardToneByPhase[phase] || 'border-[#8A2BE2]/20 bg-white text-[#8A2BE2]';
  const spinning = phase === PHASES.LOADING ? 'animate-spin' : '';

  return (
    <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8">
      <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border ${tone}`}>
        <Icon size={26} className={spinning} />
      </div>
      <div className="mt-5">
        <h1 className="text-2xl font-black text-gray-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
};

export default function AuthActionPage() {
  const initialContext = useMemo(() => readAuthCallbackContext(window.location.href), []);
  const [lang, setLang] = useState(() => getInitialLang(window.location.href));
  const [phase, setPhase] = useState(PHASES.LOADING);
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);

  const t = getT(lang);
  const content = getPhaseContent(phase, t);

  useEffect(() => {
    persistLang(lang);
  }, [lang]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const nextLang = initialContext.lang ? normalizeLang(initialContext.lang) : lang;
      if (nextLang !== lang) setLang(nextLang);

      try {
        if (!initialContext.hasTokens && !initialContext.flow) {
          if (!cancelled) setPhase(PHASES.IDLE);
          return;
        }

        if (initialContext.code) {
          const exchangeResult = await exchangeCodeForSupabaseSession({ code: initialContext.code });
          if (!exchangeResult.ok) {
            throw new Error(getSupabaseAuthErrorMessage(exchangeResult.error));
          }
        }

        const sessionResult = await getSupabaseSession();
        if (!sessionResult.ok) {
          throw new Error(getSupabaseAuthErrorMessage(sessionResult.error));
        }

        if (initialContext.hasTokens) cleanupAuthCallbackUrl(window.location.href);
        if (cancelled) return;

        const hasSession = Boolean(sessionResult.session?.user);
        if (initialContext.flow === 'recovery') {
          if (!hasSession) {
            setErrorMessage(t.authActionInvalidLinkDesc);
            setPhase(PHASES.ERROR);
            return;
          }
          setPhase(PHASES.RECOVERY_FORM);
          return;
        }

        if (initialContext.flow === 'signup') {
          setPhase(hasSession ? PHASES.SIGNUP_SUCCESS : PHASES.SIGNUP_FALLBACK);
          return;
        }

        setPhase(hasSession ? PHASES.SIGNUP_SUCCESS : PHASES.IDLE);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(String(error?.message || t.authActionInvalidLinkDesc));
        setPhase(PHASES.ERROR);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [initialContext, lang, t.authActionInvalidLinkDesc]);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (submitBusy) return;

    if (password !== confirmPassword) {
      setErrorMessage(t.authActionPasswordMismatch);
      return;
    }
    if (String(password || '').length < 6) {
      setErrorMessage(t.authActionPasswordMin);
      return;
    }

    try {
      setSubmitBusy(true);
      setErrorMessage('');
      const result = await updateSupabasePassword({ password });
      if (!result.ok) throw new Error(getSupabaseAuthErrorMessage(result.error));
      setPhase(PHASES.RECOVERY_SUCCESS);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(String(error?.message || t.authActionInvalidLinkDesc));
    } finally {
      setSubmitBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FB] px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="flex gap-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          {['pt', 'en', 'es'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLang(item)}
              className={`rounded-xl px-3 py-2 text-xs font-black uppercase transition-colors ${lang === item ? 'bg-[#8A2BE2] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 flex min-h-[calc(100vh-9rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="rounded-[32px] bg-[#1A1A1A] p-8 text-white shadow-2xl sm:p-10">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[#8A2BE2] bg-white/5">
                <img src="/LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-12 w-auto object-contain" />
              </div>
              <p className="mt-6 text-sm font-black uppercase tracking-[0.24em] text-[#00FF00]">Renda Mais</p>
              <h2 className="mt-4 text-3xl font-black leading-tight">Confirmacao de acesso e recuperacao de senha</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-gray-300 sm:text-base">
                Esta pagina recebe os links seguros enviados pelo Supabase para confirmar o cadastro e para redefinir a senha com uma experiencia mais clara para o usuario.
              </p>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <AuthCard phase={phase} title={content.title} description={errorMessage || content.description}>
              {phase === PHASES.RECOVERY_FORM ? (
                <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-700">{t.password}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-[#8A2BE2] focus:ring-2 focus:ring-[#8A2BE2]/20"
                      placeholder="******"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-700">{t.confirmPassword}</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-[#8A2BE2] focus:ring-2 focus:ring-[#8A2BE2]/20"
                      placeholder="******"
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitBusy}
                    className={`w-full rounded-2xl px-4 py-3 font-black transition-colors ${submitBusy ? 'cursor-not-allowed bg-gray-200 text-gray-400' : 'bg-[#8A2BE2] text-white hover:bg-purple-600'}`}
                  >
                    {submitBusy ? t.processing : t.authActionRecoverySubmitBtn}
                  </button>
                </form>
              ) : null}

              {phase !== PHASES.LOADING && phase !== PHASES.RECOVERY_FORM ? (
                <div className="space-y-3">
                  <a
                    href={HOME_URL}
                    className="block w-full rounded-2xl bg-[#8A2BE2] px-4 py-3 text-center font-black text-white transition-colors hover:bg-purple-600"
                  >
                    {phase === PHASES.SIGNUP_SUCCESS || phase === PHASES.RECOVERY_SUCCESS ? t.authActionContinueBtn : t.authActionGoToLoginBtn}
                  </a>
                </div>
              ) : null}
            </AuthCard>
          </div>
        </div>
      </div>
    </div>
  );
}
