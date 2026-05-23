import { useState } from 'react';
import { Settings, Wallet } from 'lucide-react';
import InlineFeedbackCard from '../components/ui/InlineFeedbackCard.jsx';
import { getT } from '../i18n/i18n.js';
import { sendPasswordResetEmail } from '../supabase/auth.js';
import { getAuthActionPageUrl } from '../supabase/authRedirect.js';
import { getSupabaseAuthErrorMessage } from '../supabase/authBridge.js';
import { saveMyWallets } from '../supabase/profileRepo.js';

export default function SettingsView({ user, setUser, lang }) {
  const t = getT(lang);
  const [wallets, setWallets] = useState(user.wallets || { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' });
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [passwordResetFeedback, setPasswordResetFeedback] = useState(null);

  const handleSaveWallets = async (e) => {
    e.preventDefault();
    const res = await saveMyWallets(wallets);
    if (!res.ok) {
      alert(`Falha ao salvar no Supabase: ${res.error}`);
      return;
    }
    const updatedUser = { ...user, wallets };
    setUser(updatedUser);
    alert(t.settingsWalletsUpdatedAlert);
  };

  const handleSendPasswordLink = async () => {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) {
      setPasswordResetFeedback({
        variant: 'danger',
        title: t.authFeedbackErrorTitle,
        message: t.authResetLinkMissingEmail,
      });
      return;
    }

    try {
      setPasswordResetBusy(true);
      const result = await sendPasswordResetEmail({
        email,
        redirectTo: getAuthActionPageUrl({ lang, flow: 'recovery' }),
      });
      if (!result.ok) {
        setPasswordResetFeedback({
          variant: 'danger',
          title: t.authFeedbackErrorTitle,
          message: getSupabaseAuthErrorMessage(result.error),
        });
        return;
      }
      setPasswordResetFeedback({
        variant: 'success',
        title: t.authResetLinkSent,
        message: t.settingsPasswordSentHint,
      });
    } finally {
      setPasswordResetBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t.settingsAccountTitle}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Wallet className="text-[#8A2BE2]" size={20} /> {t.settingsReceivingWalletsTitle}
          </h3>
          <form onSubmit={handleSaveWallets} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (BEP-20)</label>
              <input type="text" value={wallets.usdtBep20} onChange={(e) => setWallets({ ...wallets, usdtBep20: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (TRC-20)</label>
              <input type="text" value={wallets.usdtTrc20} onChange={(e) => setWallets({ ...wallets, usdtTrc20: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDC (Arbitrum)</label>
              <input type="text" value={wallets.usdcArbitrum} onChange={(e) => setWallets({ ...wallets, usdcArbitrum: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <button type="submit" className="w-full py-3 bg-[#1A1A1A] hover:bg-gray-800 text-white font-bold rounded-lg transition-colors">
              {t.settingsSaveWalletsBtn}
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings className="text-gray-500" size={20} /> {t.settingsChangePasswordTitle}
          </h3>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm leading-6 text-gray-600">{t.settingsPasswordHelp}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settingsPasswordEmailLabel}</label>
              <input
                type="email"
                value={String(user?.email || '')}
                readOnly
                className="w-full p-3 bg-gray-50 border rounded-lg outline-none text-gray-600"
              />
            </div>
            <button
              type="button"
              disabled={passwordResetBusy}
              onClick={handleSendPasswordLink}
              className={`w-full py-3 font-bold rounded-lg transition-colors ${passwordResetBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#8A2BE2] hover:bg-purple-600 text-white'}`}
            >
              {passwordResetBusy ? t.processing : t.settingsPasswordSendLinkBtn}
            </button>
            {passwordResetFeedback ? (
              <InlineFeedbackCard
                variant={passwordResetFeedback.variant}
                title={passwordResetFeedback.title}
                message={passwordResetFeedback.message}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

