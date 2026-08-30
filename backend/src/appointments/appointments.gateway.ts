import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

// Live-update channel for the public open-slots picker (ClientDashboard's
// appointments tab) — purely a "something changed, go refetch" signal, not
// a duplicate of booking state/logic over the wire. The actual
// double-booking guard is the DB transaction in
// AppointmentsController.book() (isBooked=false conditional update); this
// gateway exists only so a second client sees a slot disappear the instant
// someone else books it, instead of waiting for their next page load.
// No auth/room-scoping: the same event a client would already get by
// calling GET /appointments/slots is public data, so broadcasting it to
// every connected socket carries no extra exposure.
@WebSocketGateway({
  namespace: 'appointments',
  cors: { origin: true },
})
export class AppointmentsGateway {
  // Definite-assignment assertion, not an unsafe cast: @WebSocketServer()
  // assigns this after construction, once Nest binds the gateway to its
  // Socket.IO server — never in the constructor, so there's no
  // constructor-time value to initialize it with.
  @WebSocketServer()
  server!: Server;

  slotsChanged() {
    this.server?.emit('slots:changed');
  }
}
