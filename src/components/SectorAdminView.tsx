import { Building2, KeyRound, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { Department } from '../types/domain.ts';

export function SectorAdminView() {
  const { idToken, appUser, refreshProfile } = useAuth();
  const [sectors, setSectors] = useState<Department[]>([]);
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [passwordSector, setPasswordSector] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!idToken) return;
    try { setSectors(await apiFetch<Department[]>('/api/departments', idToken)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Erro ao listar setores.'); }
  }, [idToken]);
  useEffect(() => { void load(); }, [load]);
  const save = async (url: string, method: string, body: unknown, message: string) => {
    if (!idToken) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await apiFetch(url, idToken, { method, body: JSON.stringify(body) });
      setEditing(null); setPasswordSector(null); await load(); await refreshProfile(); setNotice(message);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-bold">Setores e acessos</h2><p className="text-sm text-slate-500 mt-1">Cadastre cada setor, defina sua senha e acompanhe os equipamentos vinculados.</p></div><button type="button" onClick={() => { setEditing('new'); setPasswordSector(null); setError(null); }} className="min-h-11 inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold"><Plus size={18} />Cadastrar setor</button></div>
    {error && <p role="alert" className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-lg text-sm">{error}</p>}
    {notice && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm">{notice}</p>}
    {editing && <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6" key={editing === 'new' ? 'new' : editing.id}>
      <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">{editing === 'new' ? 'Novo setor' : 'Editar setor'}</h3><button type="button" onClick={() => setEditing(null)} disabled={busy} aria-label="Fechar cadastro" className="p-2"><X size={20} /></button></div>
      <form className="grid sm:grid-cols-2 gap-4" onSubmit={(event) => {
        event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
        void save(editing === 'new' ? '/api/departments' : `/api/departments/${editing.id}`, editing === 'new' ? 'POST' : 'PUT', data, editing === 'new' ? 'Setor cadastrado. O acesso já pode ser feito com seu código e senha.' : 'Setor atualizado.');
      }}>
        {([['name', 'Nome do setor'], ['code', 'Código de acesso (ex.: RH)'], ['location', 'Localização'], ['costCenter', 'Centro de custo']] as const).map(([field, label]) => <label key={field} className="text-sm font-medium">{label}<input name={field} required={field !== 'costCenter'} defaultValue={editing === 'new' ? '' : editing[field] || ''} maxLength={field === 'code' ? 24 : 160} pattern={field === 'code' ? '[A-Za-z0-9_-]+' : undefined} autoComplete="off" className={`form-input mt-1.5 ${field === 'code' ? 'uppercase' : ''}`} /></label>)}
        {editing === 'new' && <label className="text-sm font-medium">Senha do setor (mínimo 12 caracteres)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label>}
        <div className="sm:col-span-2 flex justify-end"><button disabled={busy} className="min-h-11 px-5 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar setor'}</button></div>
      </form>
    </section>}
    {passwordSector && <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4"><h3 className="font-semibold">Definir senha — {passwordSector.name}</h3><button type="button" onClick={() => setPasswordSector(null)} aria-label="Fechar senha" className="p-2"><X size={20} /></button></div>
      <form className="flex flex-col sm:flex-row gap-3 items-end" onSubmit={(event) => { event.preventDefault(); void save(`/api/departments/${passwordSector.id}/access`, 'PUT', Object.fromEntries(new FormData(event.currentTarget)), 'Senha definida. As sessões anteriores desse setor foram revogadas.'); }}><label className="text-sm font-medium flex-1 w-full">Nova senha (mínimo 12 caracteres)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label><button disabled={busy} className="min-h-11 px-4 py-2 rounded-lg bg-slate-900 text-white">Salvar senha</button></form>
    </section>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{sectors.map((sector) => <article key={sector.id} className="bg-white border border-slate-200 rounded-xl p-5 min-w-0">
      <div className="flex items-start justify-between gap-3"><Building2 size={22} className="text-blue-600 shrink-0" /><span className="font-mono text-sm font-bold bg-slate-100 rounded px-2 py-1 break-all">{sector.code}</span></div><h3 className="font-bold mt-4 break-words">{sector.name}</h3><p className="text-xs text-slate-500 mt-1">{sector.location}</p><p className="mt-4 text-sm"><strong>{sector.equipmentCount || 0}</strong> equipamentos vinculados</p><p className={`mt-2 text-xs font-semibold ${sector.accessConfigured && sector.accessActive ? 'text-emerald-700' : 'text-amber-700'}`}>{!sector.accessConfigured ? 'Defina uma senha para liberar o acesso' : sector.accessActive ? 'Acesso liberado' : 'Acesso bloqueado'}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 border-t border-slate-100 pt-3 text-xs"><button type="button" disabled={busy} onClick={() => { setEditing(sector); setPasswordSector(null); }} className="min-h-10 inline-flex items-center gap-1 text-blue-700"><Pencil size={14} />Editar</button>{sector.id !== appUser?.departmentId && <><button type="button" disabled={busy} onClick={() => { setPasswordSector(sector); setEditing(null); }} className="min-h-10 inline-flex items-center gap-1 text-blue-700"><KeyRound size={14} />{sector.accessConfigured ? 'Redefinir senha' : 'Definir senha'}</button>{sector.accessConfigured && <button type="button" disabled={busy} onClick={() => void save(`/api/departments/${sector.id}/access`, 'PATCH', { active: !sector.accessActive }, sector.accessActive ? 'Acesso do setor bloqueado.' : 'Acesso do setor liberado.')} className="min-h-10 text-slate-600 underline">{sector.accessActive ? 'Bloquear' : 'Liberar'}</button>}</>}</div>
    </article>)}</div>
  </div>;
}
