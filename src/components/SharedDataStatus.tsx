import { Cloud, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { isFirebaseMode } from '../lib/runtime.ts';

export function SharedDataStatus() {
  const { appUser, sharedConnected, sharedError } = useAuth();
  if (!isFirebaseMode) return null;
  return <section className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950">
    <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-start gap-2"><Cloud size={17} className="shrink-0" /><span><strong>Modo compartilhado.</strong> Os computadores autorizados utilizam o mesmo inventário. Limpar os dados deste navegador não apaga os registros salvos no Firebase.</span></p>
      {appUser && <p role="status" className="inline-flex items-center gap-1 font-semibold">{!sharedConnected && <WifiOff size={14} />}{sharedConnected ? 'Dados sincronizados' : sharedError || 'Aguardando conexão com o banco compartilhado'}</p>}
    </div>
  </section>;
}
