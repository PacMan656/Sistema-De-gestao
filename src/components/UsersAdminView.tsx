import { Building2, Shield, Plus, KeyRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { createUserSchema, type UserRole, type CreateUserInput } from '../shared/validation.ts';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AppUser } from '../types/domain.ts';

export function UsersAdminView() {
  const { idToken, departments, appUser, refreshProfile } = useAuth();
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'colaborador' },
  });
  const createUser = async (data: CreateUserInput) => {
    if (!idToken) return;
    setError(null); setNotice(null);
    try {
      await apiFetch('/api/users', idToken, { method: 'POST', body: JSON.stringify(data) });
      setCreating(false); reset(); await fetchUsers();
      setNotice('Usuário cadastrado. O acesso já está disponível com o e-mail e a senha definidos pelo TI.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível cadastrar.'); }
  };
  const toggleAccess = async (user: AppUser) => {
    if (!idToken) return;
    setSavingId(user.id); setError(null); setNotice(null);
    try {
      await apiFetch(`/api/users/${user.id}/access`, idToken, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) });
      await fetchUsers(); setNotice(user.active ? 'Acesso desativado e sessões revogadas.' : 'Acesso reativado.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Erro ao alterar acesso.'); }
    finally { setSavingId(null); }
  };

  const fetchUsers = useCallback(async () => {
    if (!idToken) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<AppUser[]>('/api/users', idToken);
      setUsersList(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar usuários.');
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUpdate = async (
    userId: number,
    role: UserRole,
    departmentId: number
  ) => {
    if (!idToken) return;
    setSavingId(userId);
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}/role`, idToken, {
        method: 'PATCH',
        body: JSON.stringify({ role, departmentId }),
      });
      await fetchUsers();
      if (userId === appUser?.id) {
        await refreshProfile();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao atualizar permissões.'
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-sm">{notice}</p>}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h2 className="text-xl font-bold">Usuários e acessos</h2><p className="text-sm text-slate-500 mt-1">Cadastre o colaborador e forneça suas credenciais de acesso.</p></div>
        <button type="button" onClick={() => { setError(null); setCreating(true); }} className="min-h-11 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus size={18} />Cadastrar usuário</button>
      </div>
      {creating && <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">Novo usuário</h3><button type="button" onClick={() => { setCreating(false); reset(); }} aria-label="Fechar cadastro" className="p-2"><X size={20} /></button></div>
        <form onSubmit={handleSubmit(createUser)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([['fullName', 'Nome completo', 'text'], ['email', 'E-mail de acesso', 'email'], ['matricula', 'Matrícula', 'text'], ['jobTitle', 'Cargo', 'text'], ['password', 'Senha inicial (mínimo 12 caracteres)', 'password']] as const).map(([field, label, type]) => <div key={field}>
            <label htmlFor={`create-${field}`} className="block text-sm font-medium mb-1.5">{label}</label>
            <input id={`create-${field}`} type={type} autoComplete={field === 'password' ? 'new-password' : 'off'} {...register(field)} className="form-input" />
            {errors[field] && <p className="mt-1 text-xs text-red-600">{errors[field]?.message}</p>}
          </div>)}
          <div><label htmlFor="create-department" className="block text-sm font-medium mb-1.5">Departamento</label><select id="create-department" {...register('departmentId', { valueAsNumber: true })} className="form-input"><option value="">Selecione o departamento</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{errors.departmentId && <p className="mt-1 text-xs text-red-600">Selecione um departamento.</p>}</div>
          <div><label htmlFor="create-role" className="block text-sm font-medium mb-1.5">Perfil de acesso</label><select id="create-role" {...register('role')} className="form-input"><option value="colaborador">Colaborador / Setor</option><option value="admin_ti">Administrador / TI</option></select></div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100"><p className="text-xs text-slate-500">Compartilhe a senha com o usuário por um canal seguro.</p><button disabled={isSubmitting} className="min-h-11 px-5 py-2 bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50">{isSubmitting ? 'Cadastrando...' : 'Cadastrar e liberar acesso'}</button></div>
        </form>
      </section>}
      {passwordUser && <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4"><h3 className="font-semibold break-words">Redefinir senha de {passwordUser.fullName}</h3><button type="button" onClick={() => { setPasswordUser(null); setNewPassword(''); }} aria-label="Fechar redefinição" className="p-2"><X size={20} /></button></div>
        <form className="flex flex-col sm:flex-row gap-3" onSubmit={async (event) => {
          event.preventDefault(); if (!idToken) return; setSavingId(passwordUser.id); setError(null);
          try {
            await apiFetch(`/api/users/${passwordUser.id}/password`, idToken, { method: 'POST', body: JSON.stringify({ password: newPassword }) });
            if (passwordUser.id === appUser?.id) await refreshProfile();
            setPasswordUser(null); setNewPassword(''); setNotice('Senha redefinida. As sessões anteriores foram revogadas.');
          } catch (error) { setError(error instanceof Error ? error.message : 'Erro ao redefinir senha.'); }
          finally { setSavingId(null); }
        }}><label className="flex-1 text-sm">Nova senha (mínimo 12 caracteres)<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label><button disabled={savingId !== null} className="min-h-11 self-end px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">Salvar nova senha</button></form>
      </section>}
      {/* Departments directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Setores e Departamentos Corporativos
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {departments.length} setores
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-5">Código</th>
                <th className="py-2.5 px-5">Departamento</th>
                <th className="py-2.5 px-5">Localização Física</th>
                <th className="py-2.5 px-5">Centro de Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-5 font-mono text-xs font-semibold text-slate-900">
                    {d.code}
                  </td>
                  <td className="py-2.5 px-5 text-slate-900">{d.name}</td>
                  <td className="py-2.5 px-5 text-slate-600">{d.location}</td>
                  <td className="py-2.5 px-5 font-mono text-xs text-slate-600">
                    {d.costCenter || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RBAC Users Management */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Controle de Acesso RBAC e Vínculo Departamental
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {usersList.length} usuários
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Carregando usuários...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-5">Colaborador</th>
                  <th className="py-2.5 px-5">Matrícula / Cargo</th>
                  <th className="py-2.5 px-5">Setor Vinculado</th>
                  <th className="py-2.5 px-5">Perfil RBAC</th><th className="py-2.5 px-5">Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5">
                      <p className="font-medium text-slate-900">{u.fullName}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-5 text-xs text-slate-600">
                      <span className="font-mono">{u.matricula || '—'}</span>
                      <span aria-hidden="true" className="mx-1.5 text-slate-300">
                        ·
                      </span>
                      <span>{u.jobTitle || 'Não informado'}</span>
                    </td>
                    <td className="py-3 px-5">
                      <select
                        disabled={savingId === u.id}
                        aria-label={`Departamento de ${u.fullName}`}
                        value={u.departmentId || departments[0]?.id || 1}
                        onChange={(e) =>
                          handleUpdate(u.id, u.role, Number(e.target.value))
                        }
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} · {d.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-5">
                      <select
                        disabled={savingId === u.id || u.id === appUser?.id}
                        aria-label={`Perfil de ${u.fullName}`}
                        value={u.role}
                        onChange={(e) =>
                          handleUpdate(
                            u.id,
                            e.target.value as UserRole,
                            u.departmentId || departments[0]?.id || 1
                          )
                        }
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
                      >
                        <option value="admin_ti">Admin / Técnico de TI</option>
                        <option value="colaborador">Colaborador / Setor</option>
                      </select>
                    </td>
                    <td className="py-3 px-5"><div className="flex flex-col items-start gap-2 min-w-36">
                      <span className={`text-xs font-semibold ${u.active ? 'text-emerald-700' : 'text-red-700'}`}>{u.active ? 'Ativo' : 'Desativado'}</span>
                      <button type="button" disabled={savingId !== null || u.id === appUser?.id} onClick={() => { setPasswordUser(u); setNewPassword(''); setError(null); }} className="inline-flex items-center gap-1.5 text-xs text-blue-700 min-h-9"><KeyRound size={14} />Redefinir senha</button>
                      {u.id !== appUser?.id && <button type="button" disabled={savingId !== null} onClick={() => toggleAccess(u)} className="text-xs font-medium text-slate-600 underline min-h-9">{u.active ? 'Desativar acesso' : 'Reativar acesso'}</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
