import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import InlineFeedbackCard from '../components/ui/InlineFeedbackCard.jsx';
import { fillTemplate, getT } from '../i18n/i18n.js';
import { getAuthActionPageUrl } from '../supabase/authRedirect.js';
import { buildSupabaseMetadata, getSupabaseAuthErrorMessage, hydrateUserFromSupabaseAuth } from '../supabase/authBridge.js';
import { sendPasswordResetEmail, signInWithSupabase, signUpWithSupabase } from '../supabase/auth.js';
import { getReferrerProfile, isEmailAvailable, isUsernameAvailable } from '../supabase/publicLookup.js';

export default function AuthFlow({ onLogin, lang, setLang, initialMode, layout = 'full', refUsername = '' }) {
  const sponsor = String(refUsername || '').trim();
  const isModal = layout === 'modal';
  const [isLogin, setIsLogin] = useState(() => {
    if (initialMode === 'login') return true;
    if (initialMode === 'register') return false;
    return !sponsor;
  });
  const [showPwd, setShowPwd] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    country: 'Brasil',
    email: '',
    whatsapp: '',
    password: '',
    confirmPassword: '',
  });

  const t = getT(lang);

  useEffect(() => {
    if (!initialMode) return;
    setFeedback(null);
    setIsLogin(initialMode === 'login');
  }, [initialMode]);

  const handleInputChange = (e) => {
    if (feedback) setFeedback(null);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const showErrorFeedback = (message) => {
    setFeedback({
      variant: 'danger',
      title: t.authFeedbackErrorTitle,
      message,
    });
  };

  const showSuccessFeedback = (title, message) => {
    setFeedback({
      variant: 'success',
      title,
      message,
    });
  };

  const handleForgotPassword = async () => {
    const email = String(formData.email || '').trim().toLowerCase();
    if (!email) {
      showErrorFeedback(t.authResetLinkMissingEmail);
      return;
    }

    try {
      setResetBusy(true);
      const result = await sendPasswordResetEmail({
        email,
        redirectTo: getAuthActionPageUrl({ lang, flow: 'recovery' }),
      });
      if (!result.ok) {
        showErrorFeedback(getSupabaseAuthErrorMessage(result.error));
        return;
      }
      showSuccessFeedback(t.authResetLinkSent, t.settingsPasswordSentHint);
    } finally {
      setResetBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLogin) {
      const email = String(formData.email || '').toLowerCase();
      const authResult = await signInWithSupabase({
        email,
        password: formData.password,
      });

      if (authResult.ok && authResult?.data?.user) {
        onLogin?.(
          hydrateUserFromSupabaseAuth({
            authUser: authResult.data.user,
            candidateUser: formData,
            password: formData.password,
          })
        );
        return;
      }

      showErrorFeedback(getSupabaseAuthErrorMessage(authResult.error || 'Credenciais inválidas. Para teste, registre-se primeiro.'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showErrorFeedback(t.authPasswordMismatchDesc);
      return;
    }
    const desiredUsername = String(formData.username || '').trim().toLowerCase();
    const desiredEmail = String(formData.email || '').trim().toLowerCase();

    const refCheck = sponsor ? await getReferrerProfile(sponsor) : { ok: true, profile: null };
    const safeRef = refCheck.ok ? refCheck.profile?.username || null : null;

    const emailCheck = await isEmailAvailable(desiredEmail);
    if (emailCheck.ok && !emailCheck.available) {
      showErrorFeedback(t.authEmailInUseDesc);
      setIsLogin(true);
      return;
    }
    if (!emailCheck.ok) {
      showErrorFeedback(fillTemplate(t.authEmailValidationErrorTemplate, { error: emailCheck.error }));
      return;
    }

    const userCheck = await isUsernameAvailable(desiredUsername);
    if (userCheck.ok && !userCheck.available) {
      showErrorFeedback(t.authUsernameInUseDesc);
      return;
    }
    if (!userCheck.ok) {
      showErrorFeedback(fillTemplate(t.authUsernameValidationErrorTemplate, { error: userCheck.error }));
      return;
    }

    const authResult = await signUpWithSupabase({
      email: formData.email,
      password: formData.password,
      metadata: buildSupabaseMetadata(formData, safeRef),
      emailRedirectTo: getAuthActionPageUrl({ lang, flow: 'signup' }),
    });

    if (!authResult.ok) {
      const errorMessage = getSupabaseAuthErrorMessage(authResult.error);
      showErrorFeedback(errorMessage);
      if (errorMessage.includes('já está cadastrado')) setIsLogin(true);
      return;
    }

    if (authResult?.data?.user && !authResult?.data?.session) {
      showSuccessFeedback(t.authSignupPendingTitle, t.authSignupPendingDesc);
      setIsLogin(true);
      return;
    }

    if (authResult?.data?.user) {
      onLogin?.(
        hydrateUserFromSupabaseAuth({
          authUser: authResult.data.user,
          candidateUser: { ...formData, referrerUsername: sponsor || null },
          password: formData.password,
        })
      );
      return;
    }

    showSuccessFeedback(t.authSignupFallbackTitle, t.authSignupFallbackDesc);
    setIsLogin(true);
  };

  return (
    <div className={isModal ? 'flex w-full flex-col items-center gap-4' : 'min-h-screen bg-white flex flex-col items-center justify-center p-4'}>
      <div className={isModal ? 'flex w-full justify-end gap-2' : 'absolute top-4 right-4 flex gap-2'}>
        {['pt', 'en', 'es'].map((l) => (
          <button key={l} onClick={() => setLang(l)} type="button" className={`px-2 py-1 rounded text-xs font-bold uppercase ${lang === l ? 'bg-[#00FF00] text-black' : 'bg-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md bg-[#1A1A1A] rounded-2xl shadow-2xl p-8 border border-[#8A2BE2]">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_35px_rgba(0,255,0,0.15)]">
            <img src="/LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-white">RENDA MAIS</h1>
          <p className="mt-2 text-gray-400">{isLogin ? t.login : t.register}</p>
          {!isLogin && sponsor && (
            <p className="mt-2 text-xs text-gray-300">
              Patrocinador: <span className="font-black text-white">@{sponsor}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {feedback ? (
            <InlineFeedbackCard
              variant={feedback.variant}
              title={feedback.title}
              message={feedback.message}
            />
          ) : null}

          {!isLogin && (
            <>
              <input type="text" name="name" placeholder={t.name} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <input type="text" name="username" placeholder={t.username} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <select name="country" onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" defaultValue={formData.country || 'Brasil'}>
                <option value="Brasil">Brasil</option>
                <option value="Portugal">Portugal</option>
                <option value="USA">USA</option>
                <option value="Spain">Spain</option>
              </select>
              <input type="tel" name="whatsapp" placeholder={t.whatsapp} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            </>
          )}

          <input type="email" name="email" placeholder={t.email} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />

          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} name="password" placeholder={t.password} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-gray-400 hover:text-white">
              {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {!isLogin && (
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} name="confirmPassword" placeholder={t.confirmPassword} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            </div>
          )}

          {isLogin && (
            <div className="text-right">
              <button
                type="button"
                disabled={resetBusy}
                onClick={handleForgotPassword}
                className={`text-sm hover:underline ${resetBusy ? 'cursor-not-allowed text-gray-500' : 'text-[#00FF00]'}`}
              >
                {resetBusy ? t.processing : t.forgotPassword}
              </button>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-lg transition-colors">
            {isLogin ? t.login : t.register}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          {isLogin ? t.noAccount : t.hasAccount}
          <button
            onClick={() => {
              setFeedback(null);
              setIsLogin(!isLogin);
            }}
            className="ml-2 text-[#00FF00] font-bold hover:underline"
            type="button"
          >
            {isLogin ? t.register : t.login}
          </button>
        </div>
      </div>
    </div>
  );
}

