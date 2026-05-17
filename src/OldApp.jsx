import React, { useState, useEffect } from 'react';
import {
  User, Bell, Send, Globe, Copy, Menu, X, Home,
  PieChart, Users, Wallet, FileText, Gift, Settings,
  Eye, EyeOff, LogOut, MessageCircle, ChevronDown, Check
} from 'lucide-react';
import AdminView from './admin/AdminView.jsx';
import { BANK_STATUS, getBankByQuotaKey, loadAdminConfig, saveAdminConfig } from './admin/adminStorage.js';
import BankHistoryModal from './history/BankHistoryModal.jsx';
import SupportModal from './support/SupportModal.jsx';
import FaqModal from './support/FaqModal.jsx';
import { getUnreadCountForUser, loadSupportState } from './support/supportStorage';

// --- THEME CONSTANTS ---
const THEME = {
  primary: '#00FF00', // Verde Radioativo
  secondary: '#8A2BE2', // Roxo (Bordas e detalhes)
  dark: '#1A1A1A', // Topo
  light: '#FFFFFF', // Fundo Principal
  gray: '#F3F4F6',
  textDark: '#333333',
  textLight: '#FFFFFF'
};

// --- MULTI-LANGUAGE DICTIONARY ---
const TRANSLATIONS = {
  pt: {
    login: 'Entrar',
    register: 'Registrar',
    email: 'E-mail',
    password: 'Senha',
    confirmPassword: 'Confirmar Senha',
    name: 'Nome Completo',
    username: 'Nome de Usuário',
    country: 'País',
    whatsapp: 'WhatsApp',
    forgotPassword: 'Esqueci minha senha',
    noAccount: 'Não tem uma conta?',
    hasAccount: 'Já tem uma conta?',
    home: 'Início',
    quotas: 'Cotas',
    team: 'Equipes',
    wallet: 'Carteira',
    reports: 'Relatórios',
    bonus: 'Bônus',
    settings: 'Configurações',
    registerWalletBtn: 'Cadastre sua carteira',
    refLink: 'Link de Indicação',
    copied: 'Copiado!',
    totalLimit: 'Limite Total de Cotas (100k)',
    available: 'Disponível',
    buyQuota: 'Comprar Cotas de Participação',
    invested: 'Valor Investido',
    teamEarnings: 'Ganhos de Equipe',
    totalBalance: 'Saldo Total',
    rank: 'Nível Atual',
    support: 'Suporte',
    logout: 'Sair'
  },
  en: {
    login: 'Login',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    name: 'Full Name',
    username: 'Username',
    country: 'Country',
    whatsapp: 'WhatsApp',
    forgotPassword: 'Forgot Password',
    noAccount: 'No account?',
    hasAccount: 'Have an account?',
    home: 'Home',
    quotas: 'Quotas',
    team: 'Team',
    wallet: 'Wallet',
    reports: 'Reports',
    bonus: 'Bonus',
    settings: 'Settings',
    registerWalletBtn: 'Register your wallet',
    refLink: 'Referral Link',
    copied: 'Copied!',
    totalLimit: 'Total Quotas Limit (100k)',
    available: 'Available',
    buyQuota: 'Buy Participation Quotas',
    invested: 'Invested Value',
    teamEarnings: 'Team Earnings',
    totalBalance: 'Total Balance',
    rank: 'Current Rank',
    support: 'Support',
    logout: 'Logout'
  },
  es: {
    login: 'Acceder',
    register: 'Registro',
    email: 'Correo',
    password: 'Clave',
    confirmPassword: 'Confirmar Clave',
    name: 'Nombre Completo',
    username: 'Usuario',
    country: 'País',
    whatsapp: 'WhatsApp',
    forgotPassword: 'Olvidé mi clave',
    noAccount: '¿No tienes cuenta?',
    hasAccount: '¿Ya tienes cuenta?',
    home: 'Inicio',
    quotas: 'Cuotas',
    team: 'Equipos',
    wallet: 'Billetera',
    reports: 'Reportes',
    bonus: 'Bono',
    settings: 'Ajustes',
    registerWalletBtn: 'Registra tu billetera',
    refLink: 'Enlace de Referencia',
    copied: '¡Copiado!',
    totalLimit: 'Límite Total de Cuotas (100k)',
    available: 'Disponible',
    buyQuota: 'Comprar Cuotas de Participación',
    invested: 'Valor Invertido',
    teamEarnings: 'Ganancias de Equipo',
    totalBalance: 'Saldo Total',
    rank: 'Rango Actual',
    support: 'Soporte',
    logout: 'Salir'
  }
};

const normalizeUser = (u) => {
  const wallets = u?.wallets ?? { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' };
  const balances = u?.balances ?? { available: 474.5, invested: 350, teamEarnings: 124.5 };
  const holdings = u?.holdings ?? { cota10: 0, cota50: 0, cota100: 0 };
  const transactions = Array.isArray(u?.transactions) ? u.transactions : [];
  return { ...u, wallets, balances, holdings, transactions };
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    try {
      localStorage.setItem('rm_last_error', JSON.stringify({ at: new Date().toISOString(), message: String(error?.message || error) }));
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-black/30 border border-red-500/50 rounded-2xl p-6">
          <h2 className="text-xl font-black mb-2">Ocorreu um erro na tela</h2>
          <p className="text-sm text-gray-300 break-words">{String(this.state.error?.message || this.state.error || 'Erro desconhecido')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

const AuthFlow = ({ onLogin, lang, setLang }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [formData, setFormData] = useState({
    name: '', username: '', country: 'Brasil', email: '', whatsapp: '', password: '', confirmPassword: ''
  });

  const t = TRANSLATIONS[lang];

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      // Simulação de login
      const storedUser = JSON.parse(localStorage.getItem('rm_user'));
      if (storedUser && storedUser.email === formData.email && storedUser.password === formData.password) {
        onLogin(storedUser);
      } else {
        alert('Credenciais inválidas. Para teste, registre-se primeiro.');
      }
    } else {
      // Simulação de registro
      if (formData.password !== formData.confirmPassword) {
        alert('As senhas não coincidem');
        return;
      }
      onLogin(formData);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      {/* Language Selector na Auth */}
      <div className="absolute top-4 right-4 flex gap-2">
        {['pt', 'en', 'es'].map(l => (
          <button key={l} onClick={() => setLang(l)} className={`px-2 py-1 rounded text-xs font-bold uppercase ${lang === l ? 'bg-[#00FF00] text-black' : 'bg-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md bg-[#1A1A1A] rounded-2xl shadow-2xl p-8 border border-[#8A2BE2]">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_35px_rgba(0,255,0,0.15)]">
            <img src="LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-white">RENDA MAIS</h1>
          <p className="mt-2 text-gray-400">{isLogin ? t.login : t.register}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <input type="text" name="name" placeholder={t.name} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <input type="text" name="username" placeholder={t.username} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <select name="country" onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]">
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
            <input type={showPwd ? "text" : "password"} name="password" placeholder={t.password} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-gray-400 hover:text-white">
              {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {!isLogin && (
            <div className="relative">
              <input type={showPwd ? "text" : "password"} name="confirmPassword" placeholder={t.confirmPassword} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            </div>
          )}

          {isLogin && (
            <div className="text-right">
              <a href="#" className="text-sm text-[#00FF00] hover:underline">{t.forgotPassword}</a>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-lg transition-colors">
            {isLogin ? t.login : t.register}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          {isLogin ? t.noAccount : t.hasAccount}
          <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-[#00FF00] font-bold hover:underline">
            {isLogin ? t.register : t.login}
          </button>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ isOpen, setIsOpen, currentView, setCurrentView, lang, onLogout, isAdmin }) => {
  const t = TRANSLATIONS[lang];
  const navItems = [
    { id: 'home', icon: Home, label: t.home },
    { id: 'quotas', icon: PieChart, label: t.quotas },
    { id: 'team', icon: Users, label: t.team },
    { id: 'wallet', icon: Wallet, label: t.wallet },
    { id: 'reports', icon: FileText, label: t.reports },
    { id: 'bonus', icon: Gift, label: t.bonus },
    { id: 'settings', icon: Settings, label: t.settings },
  ];
  const finalNavItems = isAdmin ? [...navItems, { id: 'admin', icon: User, label: 'Admin' }] : navItems;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
      
      <aside className={`fixed top-0 left-0 h-full w-64 bg-[#1A1A1A] border-r border-[#8A2BE2] transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 flex justify-between items-center border-b border-gray-800 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_20px_rgba(0,255,0,0.12)]">
              <img src="LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-10 w-auto object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-[0.25em] text-white">RENDA MAIS</p>
              <p className="text-xs text-gray-400">Painel do investidor</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-white"><X size={24}/></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {finalNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-6 py-3 mb-2 text-left transition-colors ${currentView === item.id ? 'border-r-4 border-[#00FF00] bg-[#00FF00]/15 text-white shadow-[inset_0_0_0_1px_rgba(0,255,0,0.18)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <item.icon size={20} className={`shrink-0 ${currentView === item.id ? 'text-[#00FF00]' : ''}`} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={onLogout} className="w-full flex items-center text-red-500 hover:text-red-400 px-2 py-2">
            <LogOut size={20} className="mr-3" />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

const Header = ({ user, toggleSidebar, lang, setLang, setCurrentView, notificationsCount }) => {
  const t = TRANSLATIONS[lang];
  const refLink = `https://comunidaderm.com/ref/${user?.username || 'user'}`;
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="bg-[#1A1A1A] sticky top-0 z-30 shadow-md">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#8A2BE2]">
        <div className="flex items-center">
          <button onClick={toggleSidebar} className="text-white lg:hidden mr-4">
            <Menu size={24} />
          </button>
        </div>

        <div className="flex items-center space-x-4 sm:space-x-6">
          {/* Language Selector */}
          <div className="hidden sm:flex gap-1 bg-gray-800 p-1 rounded-lg">
             {['pt', 'en', 'es'].map(l => (
              <button key={l} onClick={() => setLang(l)} className={`px-2 py-1 text-xs font-bold rounded ${lang === l ? 'bg-[#00FF00] text-black' : 'text-gray-400 hover:text-white'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <a href="https://t.me/seu_grupo_oficial" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors" title="Telegram">
            <Send size={20} />
          </a>

          <button className="text-gray-400 hover:text-[#00FF00] relative">
            <Bell size={20} />
            {Number(notificationsCount || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full">
                {notificationsCount > 99 ? '99+' : notificationsCount}
              </span>
            )}
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center space-x-2 text-white">
              <div className="w-8 h-8 rounded-full bg-[#00FF00] flex items-center justify-center text-black font-bold">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <ChevronDown size={16} className="text-gray-400" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-[#1A1A1A] border border-[#8A2BE2] rounded-xl shadow-xl p-4">
                <div className="mb-4">
                  <p className="font-bold text-white">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-400">@{user?.username || 'username'}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <button 
                  onClick={() => { setCurrentView('settings'); setShowDropdown(false); }}
                  className="w-full py-2 mb-2 text-xs font-bold bg-[#8A2BE2] bg-opacity-20 text-[#8A2BE2] border border-[#8A2BE2] rounded hover:bg-opacity-40 transition"
                >
                  {t.registerWalletBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub Header - Referral Link */}
      <div className="bg-gray-900 px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-gray-800">
        <span className="text-sm text-gray-400">{t.refLink}:</span>
        <div className="flex w-full sm:w-auto items-center bg-gray-800 rounded px-3 py-1 border border-gray-700">
          <span className="text-xs text-gray-300 truncate w-48 sm:w-64 mr-2">{refLink}</span>
          <button onClick={copyLink} className="text-[#00FF00] hover:text-white transition-colors p-1">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
};

const HomeView = ({ lang, adminConfig, user, onOpenBankHistory }) => {
  const t = TRANSLATIONS[lang];
  
  const totalLimit = 100000;
  const currentSold = adminConfig?.globalSold || 45230;
  const percentage = Math.min((currentSold / totalLimit) * 100, 100);

  const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const currentUser = normalizeUser(user);

  const cards = [
    { title: t.invested, value: formatMoney(currentUser.balances.invested), desc: 'Cotas compradas', color: 'border-blue-500' },
    { title: t.teamEarnings, value: formatMoney(currentUser.balances.teamEarnings), desc: 'Até 5º Nível', color: 'border-[#00FF00]' },
    { title: t.totalBalance, value: formatMoney(currentUser.balances.available), desc: 'Disponível para saque', color: 'border-[#8A2BE2]' },
    { title: t.rank, value: 'BRONZE', desc: 'Vol: $2,100 / $5,000 (Silver)', color: 'border-yellow-500' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Progress Bar Limit */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.totalLimit}</h3>
            <p className="text-sm text-gray-500">FASE BETA</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-[#8A2BE2]">{currentSold.toLocaleString()}</span>
            <span className="text-gray-500 text-sm"> / {totalLimit.toLocaleString()}</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div className="bg-gradient-to-r from-[#8A2BE2] to-[#00FF00] h-4 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
        </div>
        <p className="text-right text-xs text-gray-400 mt-1">{percentage.toFixed(1)}% preenchido</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${card.color}`}>
            <h4 className="text-gray-500 text-sm font-medium mb-1">{card.title}</h4>
            <p className="text-2xl font-bold text-gray-800 mb-1">{card.value}</p>
            <p className="text-xs text-gray-400">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Forex Operations Showcase (Simulation) */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6 text-white border border-[#8A2BE2]">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PieChart className="text-[#00FF00]" />
          Operações Reais (Forex XAU/USD)
        </h3>
        <p className="text-gray-400 text-sm mb-6">Acompanhe a evolução das bancas ativas em tempo real.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.values(adminConfig?.banks || {}).map((bank) => {
            const badge =
              bank.status === BANK_STATUS.active
                ? { text: 'Operando', className: 'bg-blue-500/20 text-blue-300 animate-pulse' }
                : bank.status === BANK_STATUS.closed
                  ? { text: 'Fechada', className: 'bg-green-500/20 text-green-300' }
                  : { text: 'Em Breve', className: 'bg-yellow-500/20 text-yellow-300' };

            const profitAcc = bank.profitAccumulatedPct ? `+${String(bank.profitAccumulatedPct).replace('.', ',')}%` : '—';
            const profitMonth = bank.status === BANK_STATUS.active && bank.profitMonthPct ? `+${String(bank.profitMonthPct).replace('.', ',')}%` : '—';
            const filled = Math.max(0, Math.min(100, Number(bank.filledPct || 0)));
            const disabled = bank.status !== BANK_STATUS.active;

            return (
              <div
                key={bank.id}
                onClick={() => {
                  if (!disabled) onOpenBankHistory?.(bank);
                }}
                className={`bg-gray-800 rounded-xl p-4 border transition-colors ${disabled ? 'border-gray-700 opacity-60 cursor-not-allowed' : 'border-[#00FF00] shadow-[0_0_15px_rgba(0,255,0,0.1)] cursor-pointer hover:border-[#00FF00]'}`}
                title={disabled ? 'Banca indisponível no momento' : 'Banca ativa'}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">{bank.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${badge.className}`}>{badge.text}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">Limite: ${Number(bank.limit || 0).toLocaleString()} ({bank.quotaKey === 'cota10' ? 'Cota $10' : bank.quotaKey === 'cota50' ? 'Cota $50' : 'Cota $100'})</p>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                  <div className={`h-2 rounded-full ${disabled ? 'bg-gray-500' : 'bg-[#00FF00]'}`} style={{ width: `${filled}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Acumulado:</span>
                    <span className="text-[#00FF00] font-bold">{profitAcc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Mês atual:</span>
                    <span className="text-[#00FF00] font-bold">{profitMonth}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

       {/* Daily Reports Summary */}
       <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Últimos Rendimentos Diários (1%)</h3>
        <div className="space-y-3">
          {[
            { date: '12 Maio, 18:00', amount: '+$3.50', desc: 'Rendimento Cotas' },
            { date: '11 Maio, 18:00', amount: '+$3.50', desc: 'Rendimento Cotas' },
            { date: '10 Maio, 18:00', amount: '+$3.50', desc: 'Rendimento Cotas' },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{item.desc}</p>
                <p className="text-xs text-gray-400">{item.date}</p>
              </div>
              <span className="font-bold text-[#00FF00]">{item.amount}</span>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 py-2 text-sm text-[#8A2BE2] font-medium hover:underline">Ver Relatório Completo</button>
      </div>
    </div>
  );
};

const QuotasView = ({ user, setUser, adminConfig, onBuy }) => {
  const plans = [
    { key: 'cota10', title: 'COTA 10', price: 10, quotas: 1, dailyPct: 1.0, monthlyPct: 30, systemText: '1 Cota no sistema', variant: 'light' },
    { key: 'cota50', title: 'COTA 50', price: 50, quotas: 5, dailyPct: 1.1, monthlyPct: 33, systemText: '5 Cotas no sistema', variant: 'dark' },
    { key: 'cota100', title: 'COTA 100', price: 100, quotas: 10, dailyPct: 1.2, monthlyPct: 36, systemText: '10 Cotas no sistema', variant: 'light' },
  ];

  const [qty, setQty] = useState({ cota10: 1, cota50: 1, cota100: 1 });
  const [coin, setCoin] = useState({ cota10: 'USDT', cota50: 'USDT', cota100: 'USDT' });
  const [network, setNetwork] = useState({ cota10: 'BEP20', cota50: 'BEP20', cota100: 'BEP20' });

  const formatMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

  const persistUser = (u) => {
    localStorage.setItem('rm_user', JSON.stringify(u));
    setUser(u);
  };

  const handleBuy = (plan) => {
    try {
      const bank = getBankByQuotaKey(adminConfig, plan.key);
      if (!bank || bank.status !== BANK_STATUS.active) {
        alert('Esta banca está indisponível no momento.');
        return;
      }
      const count = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
      const paymentCoin = coin[plan.key];
      const paymentNetwork = paymentCoin === 'USDT' ? network[plan.key] : paymentCoin === 'USDC' ? 'ARBITRUM' : null;

      if (!paymentCoin) {
        alert('Selecione a forma de pagamento.');
        return;
      }

      if (paymentCoin === 'USDT' && !paymentNetwork) {
        alert('Selecione a rede do USDT.');
        return;
      }

      const total = plan.price * count;
      const currentUser = normalizeUser(user);
      const currentAvailable = Number(currentUser?.balances?.available || 0);

      if (paymentCoin === 'SALDO' && currentAvailable < total) {
        alert('Saldo disponível insuficiente para essa compra.');
        return;
      }

      const nextBalances = { ...currentUser.balances };
      if (paymentCoin === 'SALDO') {
        nextBalances.available = Number((currentAvailable - total).toFixed(2));
      }
      nextBalances.invested = Number((Number(nextBalances.invested || 0) + total).toFixed(2));

      const nextHoldings = { ...currentUser.holdings };
      nextHoldings[plan.key] = Number(nextHoldings[plan.key] || 0) + count;

      const now = new Date();
      const tx = {
        id: `${now.getTime()}-${plan.key}`,
        at: now.toISOString(),
        type: `Compra ${plan.title}`,
        amount: -total,
        payment: paymentCoin === 'SALDO' ? 'SALDO' : `${paymentCoin} ${paymentNetwork || ''}`.trim(),
        status: paymentCoin === 'SALDO' ? 'Concluído' : 'Pendente',
      };

      const updatedUser = {
        ...currentUser,
        balances: nextBalances,
        holdings: nextHoldings,
        transactions: [tx, ...currentUser.transactions],
      };

      persistUser(updatedUser);

      try {
        if (onBuy) onBuy(plan.quotas * count);
      } catch (err) {
        alert(`Compra registrada, mas ocorreu um erro ao atualizar o painel: ${String(err?.message || err)}`);
      }

      if (paymentCoin === 'SALDO') {
        alert('Compra realizada com saldo disponível.');
      } else {
        alert(`Compra criada em modo simulação: ${paymentCoin} (${paymentNetwork}).`);
      }
    } catch (err) {
      alert(`Erro ao processar compra: ${String(err?.message || err)}`);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Comprar Cotas de Participação</h2>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded">
        <p className="text-sm text-blue-700"><strong>Regra:</strong> Taxa de 10% na entrada. COTA 10: 1% ao dia (~30% mês) | COTA 50: 1,1% ao dia (~33% mês) | COTA 100: 1,2% ao dia (~36% mês). Ciclo de 6 meses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isDark = plan.variant === 'dark';
          const isPopular = plan.key === 'cota50';
          const selectedCoin = coin[plan.key];
          const isSaldo = selectedCoin === 'SALDO';
          const bank = getBankByQuotaKey(adminConfig, plan.key);
          const bankStatus = bank?.status || BANK_STATUS.upcoming;
          const canBuy = bankStatus === BANK_STATUS.active;

          const wrapperClass = isDark
            ? 'bg-[#1A1A1A] rounded-2xl p-6 shadow-xl border-2 border-[#00FF00] relative transform md:-translate-y-4'
            : 'bg-white rounded-2xl p-6 shadow-md border border-gray-200 hover:border-[#00FF00] transition-all';

          const titleClass = isDark ? 'text-xl font-bold text-white' : 'text-xl font-bold text-gray-800';
          const priceClass = isDark ? 'text-4xl font-black text-[#00FF00] my-2' : 'text-4xl font-black text-[#8A2BE2] my-2';
          const systemClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-500';
          const listClass = isDark ? 'text-sm text-gray-300 mb-6 space-y-2' : 'text-sm text-gray-600 mb-6 space-y-2';
          const qtyLabelClass = isDark ? 'text-sm text-gray-400 w-full' : 'text-sm text-gray-600 w-full';
          const qtyInputClass = isDark ? 'w-24 p-2 bg-gray-800 text-white border border-gray-700 rounded focus:ring-[#00FF00] outline-none' : 'w-24 p-2 border rounded focus:ring-[#00FF00] outline-none';
          const coinLabelClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-600';
          const selectClass = isDark ? 'w-full p-2 bg-gray-800 text-white border border-gray-700 rounded focus:ring-[#00FF00] outline-none' : 'w-full p-2 border rounded focus:ring-[#00FF00] outline-none';
          const subtleTextClass = isDark ? 'text-xs text-gray-400' : 'text-xs text-gray-500';

          return (
            <div key={plan.key} className={wrapperClass}>
              {isPopular && (
                <div className="absolute top-0 right-0 bg-[#00FF00] text-black text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                  POPULAR
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className={titleClass}>{plan.title}</h3>
                <p className={priceClass}>{formatMoney(plan.price).replace('.00', '')}</p>
                <p className={systemClass}>{plan.systemText}</p>
              </div>

              <ul className={listClass}>
                <li className="flex justify-between"><span>Retorno diário:</span> <span className="font-bold text-[#00FF00]">{String(plan.dailyPct).replace('.', ',')}%/dia</span></li>
                <li className="flex justify-between"><span>Média mês:</span> <span className="font-bold text-[#00FF00]">~{plan.monthlyPct}%/mês</span></li>
                <li className="flex justify-between"><span>Taxa Entrada:</span> <span>10% ({formatMoney(plan.price * 0.1)})</span></li>
                <li className="flex justify-between"><span>Validade:</span> <span>6 meses</span></li>
              </ul>

              <div className="flex items-center gap-2 mb-4">
                <label className={qtyLabelClass}>Quantidade:</label>
                <input
                  type="number"
                  min="1"
                  value={qty[plan.key]}
                  onChange={(e) => setQty((s) => ({ ...s, [plan.key]: e.target.value }))}
                  className={qtyInputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 mb-5">
                <div>
                  <label className={`${coinLabelClass} block mb-1`}>Pagamento</label>
                  <select value={selectedCoin} onChange={(e) => setCoin((s) => ({ ...s, [plan.key]: e.target.value }))} className={selectClass}>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="SALDO">SALDO (Disponível)</option>
                  </select>
                  {isSaldo && (
                    <p className={`${subtleTextClass} mt-1`}>Saldo disponível: <span className="font-bold">{formatMoney(user?.balances?.available)}</span></p>
                  )}
                </div>

                {!isSaldo && (
                  <div>
                    <label className={`${coinLabelClass} block mb-1`}>Rede</label>
                    {selectedCoin === 'USDT' ? (
                      <select value={network[plan.key]} onChange={(e) => setNetwork((s) => ({ ...s, [plan.key]: e.target.value }))} className={selectClass}>
                        <option value="BEP20">BEP-20</option>
                        <option value="TRC20">TRC-20</option>
                      </select>
                    ) : (
                      <select value="ARBITRUM" disabled className={`${selectClass} opacity-70 cursor-not-allowed`}>
                        <option value="ARBITRUM">Arbitrum</option>
                      </select>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleBuy(plan)}
                disabled={!canBuy}
                className={`w-full py-3 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-xl transition-colors ${isDark ? 'shadow-[0_0_15px_rgba(0,255,0,0.4)]' : ''}`}
              >
                {!canBuy ? 'Indisponível' : isSaldo ? 'Comprar com Saldo' : 'Comprar com Cripto'}
              </button>
              {!canBuy && (
                <p className={`mt-3 text-center text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {bankStatus === BANK_STATUS.upcoming ? 'Em breve: compras bloqueadas.' : 'Banca fechada: compras bloqueadas.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 text-center text-sm text-gray-500">
        Ativação na banca e primeiro recebimento no dia seguinte útil.
      </div>
    </div>
  );
};

const SettingsView = ({ user, setUser }) => {
  const [wallets, setWallets] = useState(user.wallets || { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' });

  const handleSaveWallets = (e) => {
    e.preventDefault();
    const updatedUser = { ...user, wallets };
    localStorage.setItem('rm_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    alert('Carteiras atualizadas com sucesso!');
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Configurações da Conta</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Wallet className="text-[#8A2BE2]" size={20} /> Carteiras de Recebimento
          </h3>
          <form onSubmit={handleSaveWallets} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (BEP-20)</label>
              <input type="text" value={wallets.usdtBep20} onChange={(e) => setWallets({...wallets, usdtBep20: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder="Endereço da carteira" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (TRC-20)</label>
              <input type="text" value={wallets.usdtTrc20} onChange={(e) => setWallets({...wallets, usdtTrc20: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder="Endereço da carteira" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDC (Arbitrum)</label>
              <input type="text" value={wallets.usdcArbitrum} onChange={(e) => setWallets({...wallets, usdcArbitrum: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder="Endereço da carteira" />
            </div>
            <button type="submit" className="w-full py-3 bg-[#1A1A1A] hover:bg-gray-800 text-white font-bold rounded-lg transition-colors">
              Salvar Carteiras
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings className="text-gray-500" size={20} /> Alterar Senha
          </h3>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Token enviado para o email!'); }}>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Senha Atual</label>
              <input type="password" placeholder="***" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nova Senha</label>
              <input type="password" placeholder="***" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Token de Confirmação (E-mail)</label>
              <div className="flex gap-2">
                <input type="text" placeholder="000000" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
                <button type="button" className="px-4 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold">Enviar</button>
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-[#8A2BE2] hover:bg-purple-600 text-white font-bold rounded-lg transition-colors">
              Atualizar Senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const WalletView = ({ setCurrentView, user }) => {
  const currentUser = normalizeUser(user);
  const hasWallet = currentUser?.wallets?.usdtBep20 || currentUser?.wallets?.usdtTrc20 || currentUser?.wallets?.usdcArbitrum;
  
  const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', { dateStyle: 'short' });
    } catch {
      return isoString;
    }
  };

  const reports = currentUser.transactions.map((tx, i) => ({
    id: tx.id || i,
    date: formatDate(tx.at),
    type: tx.type,
    value: `$${Math.abs(tx.amount).toFixed(2)}`,
    status: tx.status,
    color: tx.amount > 0 ? 'text-green-600' : 'text-red-500'
  }));

  if (reports.length === 0) {
    reports.push(
      { id: 1, date: '10/05/2026', type: 'Compra de Cota 50', value: '$50.00', status: 'Concluído', color: 'text-gray-500' }
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Minha Carteira</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1A1A1A] p-8 rounded-2xl border border-[#00FF00] text-center flex flex-col justify-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00FF00] opacity-10 rounded-full blur-3xl"></div>
          <h3 className="text-2xl font-bold text-white mb-2">Aumentar Rendimentos</h3>
          <p className="text-gray-400 mb-6">Adquira novas cotas e aumente seus ganhos diários no sistema.</p>
          <button onClick={() => setCurrentView('quotas')} className="py-4 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-xl text-lg transition-transform transform hover:scale-105">
            Comprar Cotas de Participação
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Saque Disponível</h3>
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-sm text-gray-500">Valor Liberado</p>
              <p className="text-4xl font-black text-[#8A2BE2]">{formatMoney(currentUser.balances.available)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Aplicado</p>
              <p className="text-xl font-bold text-gray-700">{formatMoney(currentUser.balances.invested)}</p>
            </div>
          </div>

          {!hasWallet ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-sm text-yellow-800">
              <p>Nenhuma carteira configurada para recebimento.</p>
              <button onClick={() => setCurrentView('settings')} className="font-bold underline mt-1">Configurar agora</button>
            </div>
          ) : (
            <div className="space-y-4">
               <div>
                  <label className="text-sm text-gray-600 block mb-1">Valor a sacar (Min $10):</label>
                  <input type="number" min="10" placeholder="0.00" className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none" />
                  <p className="text-xs text-red-500 mt-1">*Taxa de saque: 5%</p>
               </div>
               <button className="w-full py-3 bg-[#8A2BE2] hover:bg-purple-600 text-white font-bold rounded-xl transition-colors">
                 Solicitar Saque
               </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Histórico de Movimentação</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">Data</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.map(rep => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{rep.status}</span></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>-{rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TeamView = () => {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#1A1A1A] p-6 rounded-2xl shadow-lg border border-[#8A2BE2] mb-6">
         <div>
           <h2 className="text-2xl font-bold text-white mb-1">Sua Equipe</h2>
           <p className="text-gray-400 text-sm">Acompanhe seus indicados e ganhos de rede.</p>
         </div>
         <div className="mt-4 md:mt-0 flex gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-500">Volume Direto</p>
              <p className="text-xl font-bold text-[#00FF00]">$450</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Volume Total (5 Níveis)</p>
              <p className="text-xl font-bold text-[#8A2BE2]">$2,100</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="text-blue-500"/> Indicados Diretos (1º Nível)</h3>
           <p className="text-sm text-gray-500 mb-4">Ganho de 40% sobre a taxa de entrada (10%).</p>
           <ul className="space-y-3">
              {['joao_silva', 'maria.crypto', 'pedro_trader'].map((user, i) => (
                <li key={i} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                   <div>
                     <p className="font-bold text-sm text-gray-700">@{user}</p>
                     <p className="text-xs text-gray-500">Volume: ${(i+1)*100}</p>
                   </div>
                   <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">Ativo</span>
                </li>
              ))}
           </ul>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="text-gray-500"/> Indicados Indiretos</h3>
           <p className="text-sm text-gray-500 mb-4">Ganhos: 2º Nível (20%), 3º Nível (10%).</p>
           <ul className="space-y-3">
              <li className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                 <div>
                   <p className="font-bold text-sm text-gray-700">Nível 2</p>
                   <p className="text-xs text-gray-500">5 usuários</p>
                 </div>
                 <span className="text-sm font-bold text-gray-700">Vol: $500</span>
              </li>
              <li className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                 <div>
                   <p className="font-bold text-sm text-gray-700">Nível 3</p>
                   <p className="text-xs text-gray-500">12 usuários</p>
                 </div>
                 <span className="text-sm font-bold text-gray-700">Vol: $1,150</span>
              </li>
           </ul>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-[#00FF00]">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart className="text-[#00FF00]"/> Relatório de Ganhos</h3>
           <div className="space-y-4">
              <div>
                 <p className="text-sm text-gray-500">Indicação Direta (Nível 1)</p>
                 <p className="text-2xl font-bold text-gray-800">$18.00</p>
              </div>
              <div>
                 <p className="text-sm text-gray-500">Indicação Indireta (Nível 2 e 3)</p>
                 <p className="text-xl font-bold text-gray-700">$21.50</p>
              </div>
              <div className="pt-4 border-t border-gray-100">
                 <p className="text-sm font-bold text-gray-800">Total Indicação: <span className="text-[#00FF00]">$39.50</span></p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const BonusView = () => {
  const ranks = [
    { name: 'Ferro', target: 200, current: 200, bonus: '$0', residual: '6%', unlocked: true },
    { name: 'Bronze', target: 2000, current: 1500, bonus: '$100', residual: '8%', unlocked: false },
    { name: 'Silver', target: 5000, current: 1500, bonus: '$300', residual: '10%', unlocked: false },
    { name: 'Ouro', target: 15000, current: 1500, bonus: '$1,200', residual: '15%', unlocked: false },
    { name: 'Diamond', target: 50000, current: 1500, bonus: '$3,000', residual: '20%', unlocked: false },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="bg-[#1A1A1A] rounded-2xl p-6 shadow-xl border border-[#00FF00] text-center">
         <h2 className="text-sm font-bold text-[#00FF00] tracking-widest uppercase mb-1">Rank Atual</h2>
         <p className="text-4xl font-black text-white">BRONZE</p>
         <p className="text-sm text-gray-400 mt-2">Máximo por Perna: Soma-se 50% do volume do 1º ao 5º nível de sua equipe.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Trilha de Recompensas</h3>
        
        <div className="space-y-6">
          {ranks.map((rank, i) => {
            const progress = Math.min((rank.current / rank.target) * 100, 100);
            return (
              <div key={i} className={`p-4 rounded-xl border ${rank.unlocked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                 <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${rank.unlocked ? 'text-green-700' : 'text-gray-700'}`}>{rank.name}</span>
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">Residual: {rank.residual}</span>
                    </div>
                    <span className={`font-black ${rank.unlocked ? 'text-[#00FF00]' : 'text-gray-400'}`}>Prêmio: {rank.bonus}</span>
                 </div>
                 
                 <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                   <div className={`h-3 rounded-full ${rank.unlocked ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                 </div>
                 
                 <div className="flex justify-between text-xs text-gray-500">
                    <span>${rank.current} / ${rank.target}</span>
                    <span>{progress.toFixed(1)}%</span>
                 </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};

const ReportsView = ({ user }) => {
  const currentUser = normalizeUser(user);
  
  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return isoString;
    }
  };

  const reports = currentUser.transactions.map((tx, i) => ({
    id: tx.id || i,
    date: formatDate(tx.at),
    type: tx.type,
    value: `$${Math.abs(tx.amount).toFixed(2)}`,
    status: tx.status,
    color: tx.amount > 0 ? 'text-green-600' : 'text-red-500'
  }));

  if (reports.length === 0) {
    reports.push(
      { id: 1, date: '13/05/2026 18:00', type: 'Rendimento Cotas Diário (1%)', value: '$1.50', status: 'Creditado', color: 'text-green-600' },
      { id: 2, date: '12/05/2026 18:00', type: 'Rendimento Cotas Diário (1%)', value: '$1.50', status: 'Creditado', color: 'text-green-600' },
      { id: 3, date: '11/05/2026 10:20', type: 'Ganho de Rede (Nível 1)', value: '$4.00', status: 'Creditado', color: 'text-blue-600' }
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Relatórios e Extrato</h2>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">Data e Hora</th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.map(rep => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{rep.status}</span></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>{rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-center bg-gray-50 border-t border-gray-100 text-sm text-gray-500 cursor-pointer hover:text-gray-800">
          Carregar mais resultados...
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('pt');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [adminConfig, setAdminConfig] = useState(loadAdminConfig());
  const [historyModal, setHistoryModal] = useState({ open: false, bankId: null, bankName: null });
  const [supportModal, setSupportModal] = useState({ open: false, channel: null, name: null });
  const [faqOpen, setFaqOpen] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    // Verifica se há usuário no localStorage ao carregar
    const storedUser = localStorage.getItem('rm_user');
    if (storedUser) {
      const normalized = normalizeUser(JSON.parse(storedUser));
      localStorage.setItem('rm_user', JSON.stringify(normalized));
      setUser(normalized);
    }
  }, []);

  useEffect(() => {
    const cfg = loadAdminConfig();
    setAdminConfig(cfg);
  }, []);

  useEffect(() => {
    const email = (user?.email || '').toLowerCase();
    if (!email) return;

    const compute = () => {
      const st = loadSupportState();
      setSupportUnread(getUnreadCountForUser(st, email));
    };

    compute();

    const intervalId = window.setInterval(compute, 2000);

    const onStorage = (e) => {
      if (e?.key === 'rm_support') compute();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.email]);

  const handleLogin = (u) => {
    const normalized = normalizeUser(u);
    localStorage.setItem('rm_user', JSON.stringify(normalized));
    setUser(normalized);
  };

  const handleLogout = () => {
    // Mantemos o user no localstorage para facilitar o re-login no protótipo, apenas deslogamos o estado
    setUser(null);
  };

  if (!user) {
    return <AuthFlow onLogin={handleLogin} lang={lang} setLang={setLang} />;
  }

  const isAdmin = (user?.email || '').toLowerCase() === 'rmadmin@gmail.com';

  // Renderiza a view correspondente
  const renderView = () => {
    switch(currentView) {
      case 'home':
        return (
          <HomeView
            lang={lang}
            adminConfig={adminConfig}
            user={user}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
          />
        );
      case 'quotas': 
        return (
          <QuotasView 
            user={user} 
            setUser={setUser} 
            adminConfig={adminConfig} 
            onBuy={(quotasBought) => {
              const base = Number.isFinite(Number(adminConfig?.globalSold)) ? Number(adminConfig.globalSold) : 45230;
              const inc = Number.isFinite(Number(quotasBought)) ? Number(quotasBought) : 0;
              const newGlobalSold = base + inc;
              const saved = saveAdminConfig({ ...adminConfig, globalSold: newGlobalSold });
              setAdminConfig(saved);
              const currentUnread = Number(supportUnread || 0);
              setSupportUnread(currentUnread + 1);
            }} 
          />
        );
      case 'team': return <TeamView />;
      case 'wallet': return <WalletView setCurrentView={setCurrentView} user={user} />;
      case 'reports': return <ReportsView user={user} />;
      case 'bonus': return <BonusView />;
      case 'settings': return <SettingsView user={user} setUser={setUser} />;
      case 'admin':
        return (
          <AdminView
            config={adminConfig}
            onSave={(draft) => {
              const saved = saveAdminConfig(draft);
              setAdminConfig(saved);
              alert('Configuração das bancas atualizada.');
            }}
          />
        );
      default:
        return (
          <HomeView
            lang={lang}
            adminConfig={adminConfig}
            user={user}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-[#F3F4F6] font-sans overflow-hidden">
        <Sidebar 
          isOpen={sidebarOpen} 
          setIsOpen={setSidebarOpen} 
          currentView={currentView}
          setCurrentView={setCurrentView}
          lang={lang}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />
        
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-64 relative overflow-hidden">
          <Header 
            user={user} 
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
            lang={lang}
            setLang={setLang}
            setCurrentView={setCurrentView}
            notificationsCount={supportUnread}
          />
          
          <main className="flex-1 overflow-y-auto bg-gray-50 relative pb-20">
            {renderView()}
          </main>

        <BankHistoryModal
          isOpen={historyModal.open}
          bankId={historyModal.bankId}
          bankName={historyModal.bankName}
          onClose={() => {
            setHistoryModal({ open: false, bankId: null, bankName: null });
            setCurrentView('home');
          }}
        />

        <SupportModal
          isOpen={supportModal.open}
          channel={supportModal.channel}
          channelName={supportModal.name}
          isOnline={Boolean(adminConfig?.support?.[supportModal.channel]?.online)}
          queue={Number(adminConfig?.support?.[supportModal.channel]?.queue || 0)}
          user={user}
          onClose={() => {
            setSupportModal({ open: false, channel: null, name: null });
            setSupportMenuOpen(false);
            const st = loadSupportState();
            setSupportUnread(getUnreadCountForUser(st, (user?.email || '').toLowerCase()));
          }}
        />

        <FaqModal
          isOpen={faqOpen}
          onClose={() => {
            setFaqOpen(false);
            setSupportMenuOpen(false);
          }}
        />

        {/* Floating Support Button */}
        <div className="fixed bottom-6 right-6 z-40 group flex flex-col items-end gap-3">
          <div className={`${supportMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'} transition-all flex flex-col items-end gap-2 duration-300`}>
            <button
              type="button"
              onClick={() => {
                setSupportModal({ open: true, channel: 'finance', name: 'Suporte 1 (Financeiro)' });
              }}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              Suporte 1 (Financeiro)
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${adminConfig?.support?.finance?.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {adminConfig?.support?.finance?.online ? 'Online' : 'Offline'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSupportModal({ open: true, channel: 'tech', name: 'Suporte 2 (Técnico)' });
              }}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              Suporte 2 (Técnico)
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${adminConfig?.support?.tech?.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {adminConfig?.support?.tech?.online ? 'Online' : `Fila: ${Number(adminConfig?.support?.tech?.queue || 0)}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              FAQ / Dúvidas Frequentes
            </button>
          </div>
          
          <button
            type="button"
            onClick={() => setSupportMenuOpen((s) => !s)}
            className="p-0 rounded-full shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:scale-105 transition-transform flex items-center justify-center border-2 border-[#00FF00] relative bg-[#1A1A1A]"
          >
            <img src="PERSONAGEM RENDA MAIS com LOGO.png" alt="Suporte" className="w-14 h-14 rounded-full object-cover" />
            {Number(supportUnread || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-xs px-2 py-1 rounded-full font-bold text-white shadow">
                {supportUnread > 99 ? '99+' : supportUnread}
              </span>
            )}
          </button>
        </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
