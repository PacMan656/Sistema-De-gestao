import { KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

export function ChangePassword() {
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  return <>
    <button type="button" onClick={() => { setOpen(true); setError(null); setSuccess(false); }} aria-label="Alterar senha do setor TI" title="Alterar senha do setor TI" className="p-2.5 text-slate-600 rounded-lg hover:bg-slate-100"><KeyRound size={18} /></button>
    {open && <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="password-title" className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 w-full max-w-md overflow-y-auto">
        <div className="flex justify-between items-center gap-3 mb-5"><h2 id="password-title" className="font-bold text-lg">Alterar senha do setor TI</h2><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Fechar" className="p-2"><X size={20} /></button></div>
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        {success ? <p role="status" className="text-sm text-emerald-700">Senha alterada com sucesso. As outras sessões foram encerradas.</p> : <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setError(null);
          const form = new FormData(event.currentTarget);
          const password = String(form.get('password'));
          if (password !== form.get('confirm')) { setError('As senhas não conferem.'); return; }
          setBusy(true);
          try { await changePassword(String(form.get('currentPassword')), password); setSuccess(true); }
          catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível alterar a senha.'); }
          finally { setBusy(false); }
        }}>
          <label className="block text-sm font-medium">Senha atual<input name="currentPassword" type="password" required autoComplete="current-password" maxLength={128} className="form-input mt-1.5" autoFocus /></label>
          <label className="block text-sm font-medium">Nova senha (mínimo 12 caracteres)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label>
          <label className="block text-sm font-medium">Confirmar nova senha<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label>
          <button disabled={busy} className="min-h-11 w-full bg-blue-600 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>}
      </section>
    </div>}
  </>;
}
