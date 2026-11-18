import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  createChatMessage,
  createIncident,
  updateIncidentStatus,
} from '../db/queries.ts';
import { createIncidentSchema } from '../shared/validation.ts';
import { authenticateToken } from './middleware/auth.ts';
import type { AppUserContext } from './middleware/auth.ts';

interface SocketChatPayload {
  departmentId?: number;
  incidentId?: number | null;
  content: string;
}

interface SocketStatusUpdatePayload {
  incidentId: number;
  status: 'Aberto' | 'Em Atendimento' | 'Resolvido';
}

let activeServer: SocketIOServer | undefined;
export function disconnectUserSockets(userId: number) {
  for (const socket of activeServer?.sockets.sockets.values() ?? []) {
    if (socket.data.user?.id === userId) {
      socket.emit('session:revoked');
      socket.disconnect(true);
    }
  }
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });
  activeServer = io;

  // Track online presence per room
  const onlineUsers = new Map<
    string,
    { id: number; fullName: string; role: string; departmentCode: string | null }
  >();

  const broadcastPresence = () => {
    io.emit('presence:update', Array.from(onlineUsers.values()));
  };

  io.use(async (socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : null;

    if (!token) {
      return next(new Error('Autenticação JWT necessária no handshake WebSocket.'));
    }

    try {
      const user = await authenticateToken(token);
      socket.data.user = user;
      return next();
    } catch (err) {
      console.error('WebSocket handshake auth failed:', err);
      return next(new Error('Token inválido ou expirado no handshake WebSocket.'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AppUserContext;

    if (user.departmentId) {
      socket.join(`dept:${user.departmentId}`);
    }
    if (user.role === 'admin_ti') {
      socket.join('ti:triage');
    }

    onlineUsers.set(socket.id, {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      departmentCode: user.departmentCode,
    });
    broadcastPresence();

    socket.on('room:join', (payload: { departmentId: number }) => {
      const targetDeptId = Number(payload?.departmentId);
      if (!targetDeptId) return;

      // Colaborador only accesses their own department; Admin/TI can join any department channel
      if (user.role !== 'admin_ti' && user.departmentId !== targetDeptId) {
        socket.emit('socket:error', {
          message: 'Acesso restrito ao canal do seu departamento.',
        });
        return;
      }
      socket.join(`dept:${targetDeptId}`);
    });

    socket.on('chat:message', async (payload: SocketChatPayload, ack) => {
      try {
        const content = (payload?.content || '').trim();
        if (!content) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Mensagem vazia.' });
          return;
        }

        const targetDeptId =
          user.role === 'admin_ti' && payload?.departmentId
            ? Number(payload.departmentId)
            : user.departmentId;

        if (!targetDeptId) {
          if (typeof ack === 'function')
            ack({ ok: false, error: 'Departamento não vinculado ao usuário.' });
          return;
        }

        const message = await createChatMessage({
          departmentId: targetDeptId,
          senderId: user.id,
          content,
          incidentId: payload?.incidentId ?? null,
          messageType: 'CHAT',
        });

        io.to(`dept:${targetDeptId}`).to('ti:triage').emit('chat:message', message);
        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        console.error('Socket chat:message error:', err);
        if (typeof ack === 'function')
          ack({ ok: false, error: 'Erro ao enviar mensagem.' });
      }
    });

    socket.on('incident:create', async (payload: unknown, ack) => {
      try {
        const parsed = createIncidentSchema.safeParse(payload);
        if (!parsed.success) {
          const msg = parsed.error.issues[0]?.message || 'Dados do incidente inválidos.';
          if (typeof ack === 'function') ack({ ok: false, error: msg });
          return;
        }

        const targetDeptId =
          user.role === 'admin_ti' && parsed.data.departmentId
            ? parsed.data.departmentId
            : user.departmentId;

        if (!targetDeptId) {
          if (typeof ack === 'function')
            ack({ ok: false, error: 'Selecione ou vincule um departamento.' });
          return;
        }

        const incident = await createIncident(parsed.data, user.id, targetDeptId);
        if (!incident) {
          if (typeof ack === 'function')
            ack({ ok: false, error: 'Falha ao registrar incidente.' });
          return;
        }

        const alertMessage = await createChatMessage({
          departmentId: targetDeptId,
          senderId: user.id,
          incidentId: incident.id,
          messageType: 'INCIDENT_ALERT',
          content: `[${incident.ticketCode}] ${incident.title} — Prioridade: ${incident.priority}${incident.equipmentAssetTag ? ` · Patrimônio: ${incident.equipmentAssetTag}` : ''}. ${incident.description}`,
        });

        io.to(`dept:${targetDeptId}`).to('ti:triage').emit('incident:notify_ti', incident);
        io.to(`dept:${targetDeptId}`).to('ti:triage').emit('chat:message', alertMessage);

        if (typeof ack === 'function') ack({ ok: true, incident });
      } catch (err) {
        console.error('Socket incident:create error:', err);
        if (typeof ack === 'function')
          ack({ ok: false, error: 'Erro interno ao abrir chamado.' });
      }
    });

    socket.on(
      'incident:status_update',
      async (payload: SocketStatusUpdatePayload, ack) => {
        try {
          if (user.role !== 'admin_ti') {
            if (typeof ack === 'function')
              ack({
                ok: false,
                error: 'Apenas Técnicos de TI podem atualizar o status do chamado.',
              });
            return;
          }

          const incidentId = Number(payload?.incidentId);
          const status = payload?.status;
          if (
            !incidentId ||
            !['Aberto', 'Em Atendimento', 'Resolvido'].includes(status)
          ) {
            if (typeof ack === 'function')
              ack({ ok: false, error: 'Parâmetros inválidos.' });
            return;
          }

          const updated = await updateIncidentStatus(incidentId, status, user.id);
          if (!updated) {
            if (typeof ack === 'function')
              ack({ ok: false, error: 'Chamado não encontrado.' });
            return;
          }

          const statusMessage = await createChatMessage({
            departmentId: updated.departmentId,
            senderId: user.id,
            incidentId: updated.id,
            messageType: 'STATUS_CHANGE',
            content: `[${updated.ticketCode}] Status alterado para "${updated.status}" por ${user.fullName}.`,
          });

          io.to(`dept:${updated.departmentId}`)
            .to('ti:triage')
            .emit('incident:status_update', updated);
          io.to(`dept:${updated.departmentId}`)
            .to('ti:triage')
            .emit('chat:message', statusMessage);

          if (typeof ack === 'function') ack({ ok: true, incident: updated });
        } catch (err) {
          console.error('Socket incident:status_update error:', err);
          if (typeof ack === 'function')
            ack({ ok: false, error: 'Erro ao atualizar status.' });
        }
      }
    );

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      broadcastPresence();
    });
  });

  return io;
}
