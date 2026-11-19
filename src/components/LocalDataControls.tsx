import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { appFetch, isLocalMode } from '../lib/runtime.ts';
import { readJsonResponse } from '../lib/jsonResponse.ts';
import { SHARED_APP_URL } from '../shared/deployment.ts';

export function LocalDataControls() {
  const { appUser, idToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<File | null>(null);
  if (!isLocalMode) return null;
  const headers = { Authorization: `Bearer ${idToken}` };
  return <section className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
    <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3"><p><strong>Acervo local deste navegador.</strong> Use esta edição para exportar os cadastros antigos. Para trabalhar em vários computadores, abra o <a href={SHARED_APP_URL} className="font-bold underline">sistema compartilhado</a>. Limpar os dados deste navegador apaga apenas este acervo local.</p>
      {appUser?.role === 'admin_ti' && <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className="min-h-9 font-bold underline" onClick={async () => {
          setBusy(true); setError(null);
          try {
            const response = await appFetch('/api/local/backup', { headers });
            const data = await readJsonResponse(response);
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob); const link = document.createElement('a');
            link.href = url; link.download = `patriti-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { setError(error instanceof Error ? error.message : 'Erro ao exportar backup.'); }
          finally { setBusy(false); }
        }}>Exportar backup</button>
        <label className="min-h-9 inline-flex items-center underline cursor-pointer font-bold">Restaurar backup<input type="file" accept=".json,application/json" disabled={busy} className="sr-only" onChange={(event) => { setRestore(event.target.files?.[0] || null); event.target.value = ''; }} /></label>
      </div>}
    </div>
    {restore && <div className="max-w-[1440px] mx-auto mt-3 border border-amber-300 rounded-lg p-3 space-y-3"><p>Restaurar <strong>{restore.name}</strong> substituirá todos os dados deste navegador. Exporte um backup antes de continuar. Será necessário entrar com a senha presente no arquivo restaurado.</p><div className="flex gap-4"><button type="button" disabled={busy} className="font-bold underline min-h-9" onClick={async () => {
      setBusy(true); setError(null);
      try {
        if (restore.size > 25 * 1024 * 1024) throw new Error('O backup deve ter no máximo 25 MB.');
        const body = JSON.parse(await restore.text());
        await readJsonResponse(await appFetch('/api/local/backup', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
        location.reload();
      } catch (error) { setError(error instanceof Error ? error.message : 'Backup inválido.'); }
      finally { setBusy(false); }
    }}>Confirmar substituição dos dados</button><button type="button" disabled={busy} onClick={() => setRestore(null)} className="underline min-h-9">Cancelar</button></div></div>}
    {error && <p role="alert" className="max-w-[1440px] mx-auto mt-2 text-red-700">{error}</p>}
  </section>;
}
