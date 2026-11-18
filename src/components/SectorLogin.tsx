import { Eye, EyeOff, MonitorCheck, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { readJsonResponse } from '../lib/jsonResponse.ts';
import { appFetch, isLocalMode } from '../lib/runtime.ts';

export function LoginScreen() {
  const { loginWithPassword, authError } = useAuth();
  const [sector, setSector] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    appFetch('/api/auth/setup', { cache: 'no-store' }).then((response) => readJsonResponse<{ required: boolean }>(response)).then((data) => {
      setSetup(data.required === true); if (data.required) setSector('TI');
    }).catch((error) => setError(error instanceof Error ? error.message : 'Não foi possível verificar o servidor.'));
  }, []);
  return <main className="min-h-dvh flex items-center justify-center p-4 sm:p-8 bg-slate-50">
    <div className="w-full max-w-4xl grid lg:grid-cols-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <section className="p-5 sm:p-8 lg:p-10">
        <div className="flex items-center gap-2 font-bold text-xl"><MonitorCheck className="text-blue-600" />PatriTI</div>
        <h1 className="text-2xl font-bold mt-7">{setup ? 'Configurar o acesso do TI' : 'Entrar com seu setor'}</h1>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{setup ? 'Defina a senha do setor TI para começar a cadastrar os demais setores e seus equipamentos.' : 'Informe o código do setor e a senha fornecidos pelo TI para acessar o inventário e os chamados.'}</p>
        <form className="space-y-4 mt-7" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError(null);
          const form = new FormData(event.currentTarget);
          try {
            if (setup) {
              if (form.get('confirmPassword') !== password) throw new Error('As senhas não conferem.');
              const response = await appFetch('/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupToken: form.get('setupToken'), password }) });
              await readJsonResponse(response);
              setSetup(false);
            }
            await loginWithPassword(setup ? 'TI' : sector, password);
          } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível entrar.'); }
          finally { setBusy(false); }
        }}>
          {(error || authError) && <p role="alert" className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error || authError}</p>}
          {setup && !isLocalMode && <label className="block text-sm font-medium">Código de configuração<input name="setupToken" required autoComplete="off" className="form-input mt-1.5" /><span className="block text-xs text-slate-500 mt-1">Consulte o arquivo data/.setup-token no servidor ou o aviso de primeiro acesso no aplicativo Windows.</span></label>}
          <label className="block text-sm font-medium" htmlFor="login-sector">Código do setor</label>
          <input id="login-sector" name="sector" value={sector} onChange={(event) => setSector(event.target.value.toUpperCase())} required maxLength={24} autoComplete="username" autoCapitalize="characters" readOnly={setup} placeholder="Ex.: TI, RH, FIN" className="form-input uppercase" />
          <label className="block text-sm font-medium" htmlFor="login-password">Senha do setor</label>
          <div className="relative"><input id="login-password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={setup ? 12 : 1} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} className="form-input pr-12" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} className="absolute top-1 right-1 p-2.5 text-slate-500">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {setup && <label className="block text-sm font-medium">Confirmar senha<input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="form-input mt-1.5" /></label>}
          <button disabled={busy} className="w-full min-h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg py-3">{busy ? 'Validando acesso...' : setup ? 'Criar acesso do TI' : 'Entrar no sistema'}</button>
          <p className="text-xs text-slate-500 leading-relaxed">O TI cadastra os setores, define as senhas e controla a liberação de acesso. Se precisar recuperar a senha, entre em contato com a equipe de TI.</p>
        </form>
      </section>
      <aside className="hidden lg:flex bg-slate-900 text-white p-10 flex-col justify-center gap-6">
        <ShieldCheck size={44} className="text-blue-400" /><h2 className="text-2xl font-bold">Inventário organizado por setor</h2><p className="text-sm text-slate-300 leading-relaxed">Consulte os equipamentos do seu setor, seus computadores e periféricos vinculados. Abra chamados e acompanhe o atendimento do TI.</p><p className="text-sm text-slate-300 leading-relaxed">A equipe de TI mantém a visão geral dos setores, do patrimônio e das movimentações.</p>
      </aside>
    </div>
  </main>;
}
