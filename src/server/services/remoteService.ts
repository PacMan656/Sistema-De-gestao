import net from 'net';

export interface TcpProbeResult {
  port: number;
  service: string;
  reachable: boolean;
  latencyMs: number | null;
  errorCode: string | null;
  message: string;
}

export function probeTcpPort(
  host: string,
  port: number,
  service: string,
  timeoutMs = 1500
): Promise<TcpProbeResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (
      reachable: boolean,
      errorCode: string | null,
      message: string
    ) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        port,
        service,
        reachable,
        latencyMs: reachable ? Date.now() - start : null,
        errorCode,
        message,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      finish(true, null, `Porta ${port} (${service}) respondeu normalmente.`);
    });

    socket.on('timeout', () => {
      finish(
        false,
        'ETIMEDOUT',
        `Tempo limite atingido na porta ${port} (${service}).`
      );
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      finish(
        false,
        err.code || 'ECONNERR',
        `Sem resposta na porta ${port} (${err.code || err.message}).`
      );
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      finish(
        false,
        'EINVAL',
        err instanceof Error ? err.message : 'Endereço inválido.'
      );
    }
  });
}

export function sendRawTcpPrintJob(
  host: string,
  port: number,
  payload: string,
  timeoutMs = 2500
): Promise<{ sent: boolean; latencyMs: number | null; message: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (sent: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        sent,
        latencyMs: sent ? Date.now() - start : null,
        message,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.write(payload, 'utf8', () => {
        socket.end();
        finish(
          true,
          `Página de teste transmitida diretamente via cabo/rede para ${host}:${port} (RAW JetDirect).`
        );
      });
    });

    socket.on('timeout', () => {
      finish(
        false,
        `Impressora em ${host}:${port} não respondeu no tempo limite (${timeoutMs}ms). Use a impressão local via PDF/USB abaixo.`
      );
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      finish(
        false,
        `Destino ${host}:${port} inacessível pelo servidor (${err.code || err.message}). Use a impressão via navegador/USB local.`
      );
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      finish(
        false,
        err instanceof Error ? err.message : 'Endereço de rede inválido.'
      );
    }
  });
}

export function buildRawPrinterTestPayload(params: {
  assetTag: string;
  serialNumber: string;
  brand: string;
  model: string;
  departmentName: string;
  technicianName: string;
  networkAddress: string;
}): string {
  const nowStr = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());

  return [
    '\x1B%-12345X@PJL JOB NAME="PatriTI Test Page"',
    '============================================================',
    '        PATRITI - PAGINA DE TESTE DE IMPRESSAO (TI)         ',
    '============================================================',
    `Patrimonio   : ${params.assetTag}`,
    `No. de Serie : ${params.serialNumber}`,
    `Equipamento  : ${params.brand} ${params.model}`,
    `Setor        : ${params.departmentName}`,
    `Endereco/Cabo: ${params.networkAddress}`,
    `Tecnico TI   : ${params.technicianName}`,
    `Data/Hora    : ${nowStr}`,
    '------------------------------------------------------------',
    'Teste de caracteres: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
    'Acentuacao/Status  : OK - Comunicacao TCP/RAW verificada.',
    '============================================================',
    '\f\x1B%-12345X',
  ].join('\r\n');
}
