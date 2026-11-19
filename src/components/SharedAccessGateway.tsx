import { ArrowRight, Cloud, DatabaseBackup, Monitor } from 'lucide-react';
import { LOCAL_BACKUP_PARAMETER, SHARED_APP_URL } from '../shared/deployment.ts';

export function SharedAccessGateway() {
  return <main className="min-h-dvh bg-slate-50 p-4 sm:p-8 flex items-center justify-center">
    <section className="max-w-3xl w-full rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 space-y-6">
      <div className="flex items-center gap-2 text-xl font-bold"><Monitor className="text-blue-600" />PatriTI</div>
      <div><Cloud size={36} className="text-blue-600 mb-4" /><h1 className="text-2xl font-bold">Um inventário para todos os computadores</h1>
        <p className="text-slate-600 mt-3 leading-relaxed">Use o endereço compartilhado para consultar os mesmos setores, equipamentos e chamados nos computadores autorizados. Entre com o código e a senha do setor cadastrados pelo TI.</p></div>
      <a href={SHARED_APP_URL} className="min-h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 flex items-center justify-center gap-2">Abrir sistema compartilhado<ArrowRight size={18} /></a>
      <p className="text-sm text-slate-500 break-all">{SHARED_APP_URL}</p>
      <div className="border-t border-slate-200 pt-6 space-y-3"><h2 className="font-semibold flex items-center gap-2"><DatabaseBackup size={20} />Já existem cadastros neste navegador?</h2>
        <p className="text-sm text-slate-600 leading-relaxed">Eles continuam neste computador. Antes de limpar os dados do navegador, entre na edição antiga e use Exportar backup. Repita nos outros computadores com cadastros. Abrir o sistema compartilhado não transfere nem apaga esses registros.</p>
        <a href={`?${LOCAL_BACKUP_PARAMETER}=1`} className="inline-flex min-h-11 items-center text-sm font-semibold underline text-blue-700">Acessar inventário local e exportar backup</a>
      </div>
    </section>
  </main>;
}
