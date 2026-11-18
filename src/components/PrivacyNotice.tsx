import { useState } from 'react';
import { isFirebaseMode, isLocalMode } from '../lib/runtime.ts';
export function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  return <section className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
    <button type="button" className="underline min-h-9" onClick={() => setOpen(!open)} aria-expanded={open}>Privacidade e dados pessoais</button>
    {open && <div className="max-w-3xl space-y-3 py-3 leading-relaxed">
      <p>O PatriTI registra setores, equipamentos, movimentações e chamados para organizar o patrimônio e o atendimento de TI. Termos de responsabilidade podem conter nome, matrícula funcional e cargo do responsável. Prefira a matrícula funcional ao CPF quando suficiente para essa finalidade.</p>
      <p>{isFirebaseMode ? 'Os registros são armazenados no Firebase do projeto administrado pela organização. O acesso depende de autenticação e regras por setor. Documentos de responsáveis e movimentações são restritos ao TI.' : isLocalMode ? 'Nesta edição os registros ficam no navegador deste dispositivo. A exportação de backup inclui dados pessoais e deve ser guardada em local protegido.' : 'Nesta edição os registros ficam no banco administrado pelo TI. O acesso ao computador, ao banco e aos backups deve ser restrito às pessoas autorizadas.'}</p>
      <p>Evite inserir senhas, dados de saúde ou outros dados sensíveis em descrições de chamados e mensagens. Saia do sistema ao usar um dispositivo compartilhado.</p>
      <p>A organização que utiliza o sistema deve informar o controlador, o canal de contato, a base legal e os prazos de conservação aplicáveis. Solicite ao TI esse contato para exercer os direitos de acesso, correção e eliminação quando cabíveis. Este aviso técnico não substitui a política de privacidade da organização.</p>
    </div>}
  </section>;
}
