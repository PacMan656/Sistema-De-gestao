import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isLocalMode } from '../lib/runtime.ts';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function PwaStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [help, setHelp] = useState(false);
  const updating = useRef(false);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const didInstall = () => { setInstalled(true); setInstall(null); };
    window.addEventListener('online', online); window.addEventListener('offline', online);
    window.addEventListener('beforeinstallprompt', beforeInstall); window.addEventListener('appinstalled', didInstall);
    let disposed = false;
    let reloading = false;
    const controllerChanged = () => { if (updating.current && !reloading) { reloading = true; location.reload(); } };
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).then((registration) => {
        if (disposed) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
          });
        });
      }).catch((error) => console.error('PWA registration failed:', error));
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    }
    return () => {
      disposed = true;
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
      window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', didInstall);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);
  if (installed && !offline && !waiting) return null;
  return <div className="pwa-status border-b border-slate-200 bg-white px-4 py-2 text-xs">
    <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
      {offline ? <p role="status" className="inline-flex items-center gap-2 text-amber-800"><WifiOff size={16} />{isLocalMode ? 'Sem internet. Seus dados locais continuam disponíveis.' : 'Sem conexão. Login e alterações precisam de acesso ao servidor.'}</p> : <span className="text-slate-500">PatriTI no seu computador, tablet ou celular</span>}
      <div className="flex flex-wrap gap-3">
        {waiting && <button type="button" onClick={() => { updating.current = true; waiting.postMessage({ type: 'SKIP_WAITING' }); }} className="inline-flex items-center gap-1.5 min-h-9 text-blue-700 font-semibold"><RefreshCw size={14} />Atualização disponível — recarregar</button>}
        {!installed && <button type="button" onClick={async () => {
          if (!install) { setHelp(!help); return; }
          await install.prompt(); await install.userChoice; setInstall(null);
        }} className="inline-flex items-center gap-1.5 min-h-9 text-blue-700 font-semibold"><Download size={14} />Instalar aplicativo</button>}
      </div>
    </div>
    {help && <div className="max-w-[1440px] mx-auto mt-2 flex items-start justify-between gap-3 text-slate-600 leading-relaxed"><p>No Android ou computador, use “Instalar aplicativo” no menu do navegador. No iPhone/iPad, abra no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”. A instalação fica disponível na versão de produção, em HTTPS ou localhost.</p><button type="button" onClick={() => setHelp(false)} aria-label="Fechar instruções" className="p-2"><X size={16} /></button></div>}
  </div>;
}
