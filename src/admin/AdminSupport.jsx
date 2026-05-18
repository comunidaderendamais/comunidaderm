import { useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Search, Send as SendIcon } from 'lucide-react';
import {
  addMessage,
  getUnreadCountForAdmin,
  listThreads,
  loadSupportState,
  markReadForAdmin,
  setThreadStatus,
  saveSupportState,
} from '../support/supportStorage';

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const channelLabel = (id) => (id === 'finance' ? 'Suporte 1 (Financeiro)' : 'Suporte 2 (Técnico)');

const escapeCsv = (v) => {
  const s = String(v ?? '');
  const needsQuotes = /[",\n\r;]/.test(s);
  const normalized = s.replace(/"/g, '""');
  return needsQuotes ? `"${normalized}"` : normalized;
};

const toCsv = (rows) => rows.map((r) => r.map(escapeCsv).join(';')).join('\n');

const downloadCsv = (filename, rows) => {
  const content = toCsv(rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function AdminSupport({ draft, setDraft, onSave }) {
  const [supportState, setSupportState] = useState(() => loadSupportState());
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSupportState(loadSupportState());
  }, []);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = listThreads(supportState);
    const statusFiltered =
      statusFilter === 'all' ? all : all.filter((t) => (statusFilter === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved'));
    if (!q) return statusFiltered;
    return statusFiltered.filter((t) => {
      const name = (t.userName || '').toLowerCase();
      const email = (t.userEmail || '').toLowerCase();
      const id = (t.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [supportState, statusFilter, query]);
  const selected = selectedThreadId ? supportState?.threads?.[selectedThreadId] : null;
  const unreadAdmin = useMemo(() => getUnreadCountForAdmin(supportState), [supportState]);

  const supportCfg = draft?.support || {};

  const updateSupportCfg = (id, patch) => {
    setDraft((s) => ({
      ...s,
      support: {
        ...(s.support || {}),
        [id]: { ...(s.support?.[id] || {}), ...patch },
      },
    }));
  };

  const openThread = (id) => {
    setSelectedThreadId(id);
    const updated = markReadForAdmin(supportState, { threadId: id });
    const saved = saveSupportState(updated);
    setSupportState(saved);
  };

  const resolveThread = () => {
    if (!selectedThreadId) return;
    const next = setThreadStatus(supportState, { threadId: selectedThreadId, status: 'resolved' });
    const saved = saveSupportState(next);
    setSupportState(saved);
  };

  const reopenThread = () => {
    if (!selectedThreadId) return;
    const next = setThreadStatus(supportState, { threadId: selectedThreadId, status: 'open' });
    const saved = saveSupportState(next);
    setSupportState(saved);
  };

  const sendReply = () => {
    const text = reply.trim();
    if (!text || !selectedThreadId) return;
    const next = addMessage(supportState, { threadId: selectedThreadId, from: 'admin', text });
    const saved = saveSupportState(next);
    setSupportState(saved);
    setReply('');
  };

  const exportCsv = () => {
    const rows = [
      ['threadId', 'channel', 'userEmail', 'userName', 'status', 'messageAt', 'from', 'text'],
    ];

    threads.forEach((t) => {
      (t.messages || []).forEach((m) => {
        rows.push([t.id, t.channel, t.userEmail, t.userName, t.status, m.at, m.from, m.text]);
      });
      if ((t.messages || []).length === 0) {
        rows.push([t.id, t.channel, t.userEmail, t.userName, t.status, '', '', '']);
      }
    });

    downloadCsv(`renda-mais-tickets-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const exportSelectedCsv = () => {
    if (!selected) return;
    const rows = [['threadId', 'channel', 'userEmail', 'userName', 'status', 'messageAt', 'from', 'text']];
    (selected.messages || []).forEach((m) => {
      rows.push([selected.id, selected.channel, selected.userEmail, selected.userName, selected.status, m.at, m.from, m.text]);
    });
    if ((selected.messages || []).length === 0) {
      rows.push([selected.id, selected.channel, selected.userEmail, selected.userName, selected.status, '', '', '']);
    }
    downloadCsv(`renda-mais-ticket-${selected.id.replace(/[^a-z0-9:_-]/gi, '_')}.csv`, rows);
  };

  const exportSummaryCsv = () => {
    const rows = [['threadId', 'channel', 'userEmail', 'userName', 'status', 'updatedAt', 'messages', 'unreadAdmin']];
    threads.forEach((t) => {
      const unread = t.messages.filter((m) => m.from === 'user' && !m.readByAdmin).length;
      rows.push([t.id, t.channel, t.userEmail, t.userName, t.status, t.updatedAt, (t.messages || []).length, unread]);
    });
    downloadCsv(`renda-mais-tickets-resumo-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-800">Status do Suporte</h3>
            <p className="text-sm text-gray-500">Controle online e fila. As mensagens ficam no localStorage.</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#00FF00]/20 text-green-700">
            Pendências: {unreadAdmin}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {['finance', 'tech'].map((id) => {
            const c = supportCfg[id] || { online: false, queue: 0 };
            return (
              <div key={id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="font-black text-gray-800 truncate">{channelLabel(id)}</h4>
                    <p className="text-xs text-gray-500">ID: {id}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${c.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {c.online ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm text-gray-600 font-bold">Online</label>
                    <button
                      type="button"
                      onClick={() => updateSupportCfg(id, { online: !c.online })}
                      className={`px-4 py-2 rounded-xl font-black ${c.online ? 'bg-[#00FF00] text-black' : 'bg-gray-100 text-gray-700'}`}
                    >
                      {c.online ? 'Ligado' : 'Desligado'}
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1 font-bold">Fila</label>
                    <input
                      type="number"
                      min="0"
                      value={c.queue || 0}
                      onChange={(e) => updateSupportCfg(id, { queue: Number(e.target.value || 0) })}
                      className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={() => onSave(draft)}
            className="px-6 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400"
          >
            Salvar suporte
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-800">Conversas / Tickets</h3>
            <p className="text-sm text-gray-500">Usuários offline viram ticket automaticamente.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por usuário/e-mail..."
                className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-[#00FF00]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 outline-none focus:ring-[#00FF00]"
            >
              <option value="open">Abertos</option>
              <option value="resolved">Resolvidos</option>
              <option value="all">Todos</option>
            </select>

            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-2 rounded-xl text-sm font-black border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
              title="Exportar tickets em CSV (filtrado)"
            >
              <Download size={16} />
              Exportar CSV
            </button>

            <button
              type="button"
              onClick={exportSummaryCsv}
              className="px-4 py-2 rounded-xl text-sm font-black border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
              title="Exportar resumo (1 linha por ticket)"
            >
              <Download size={16} />
              Exportar Resumo
            </button>

            <button
              type="button"
              onClick={exportSelectedCsv}
              disabled={!selected}
              className={`px-4 py-2 rounded-xl text-sm font-black border inline-flex items-center gap-2 ${selected ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'}`}
              title="Exportar conversa selecionada"
            >
              <Download size={16} />
              Exportar Selecionada
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3">
          <div className="border-r border-gray-100">
            <div className="max-h-[520px] overflow-y-auto">
              {threads.length === 0 && (
                <div className="p-6 text-sm text-gray-500">Nenhuma conversa ainda.</div>
              )}
              {threads.map((t) => {
                const unread = t.messages.filter((m) => m.from === 'user' && !m.readByAdmin).length;
                const last = t.messages[t.messages.length - 1];
                const resolved = t.status === 'resolved';
                return (
                  <button
                    key={t.id}
                    onClick={() => openThread(t.id)}
                    className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 ${selectedThreadId === t.id ? 'bg-gray-50' : 'bg-white'} ${resolved ? 'opacity-70' : ''}`}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 truncate">{t.userName || t.userEmail || 'Usuário'}</p>
                        <p className="text-xs text-gray-500 truncate">{channelLabel(t.channel)}</p>
                        {resolved && <p className="text-[11px] font-bold text-gray-400 mt-1">Resolvido</p>}
                      </div>
                      {unread > 0 && (
                        <span className="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded-full">
                          {unread}
                        </span>
                      )}
                    </div>
                    {last && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                        {last.from === 'admin' ? 'Admin: ' : 'Usuário: '}
                        {last.text}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">{last ? formatTime(last.at) : ''}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2">
            {!selected && (
              <div className="p-10 text-center text-gray-500">
                <MessageCircle className="mx-auto mb-3 text-gray-300" size={34} />
                <p className="font-black text-gray-800">Selecione uma conversa</p>
                <p className="text-sm mt-2">Escolha um ticket ao lado para responder.</p>
              </div>
            )}

            {selected && (
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">{channelLabel(selected.channel)}</p>
                      <p className="font-black text-gray-800">{selected.userName || selected.userEmail}</p>
                      <p className="text-xs text-gray-400 mt-1">Thread: {selected.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.status === 'resolved' ? (
                        <button
                          type="button"
                          onClick={reopenThread}
                          className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-black hover:bg-gray-50"
                        >
                          Reabrir
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={resolveThread}
                          className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white font-black hover:bg-gray-900"
                        >
                          Marcar resolvido
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 max-h-[380px] overflow-y-auto p-4 bg-gray-50">
                  <div className="space-y-3">
                    {selected.messages.map((m) => (
                      <div key={m.id} className={`flex ${m.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${m.from === 'admin' ? 'bg-[#00FF00]/20 border-[#00FF00]/30 text-gray-900' : 'bg-white border-gray-200 text-gray-800'}`}>
                          <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                          <p className="text-[11px] mt-2 text-gray-500">{formatTime(m.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-white">
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-[#00FF00]"
                      placeholder="Responder como admin..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendReply();
                      }}
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      className="px-5 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400 inline-flex items-center gap-2"
                    >
                      <SendIcon size={18} />
                      Enviar
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">A resposta incrementa o sino de notificações do usuário.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
