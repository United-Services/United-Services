import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// AppointmentsGateway (backend/src/appointments/appointments.gateway.ts) is
// the one part of this API's public surface that isn't plain HTTP — a
// Socket.IO namespace that broadcasts `slots:changed` to every connected
// client whenever the open-slots picker needs a refetch. It has no k6
// coverage at all today, unlike every REST endpoint. This script doesn't
// (and can't, without pulling in the full Engine.IO client stack) drive a
// real socket.io-client — instead it speaks the Engine.IO v4 WebSocket
// wire protocol directly, which is simple enough to hand-roll for a smoke
// test:
//   1. connect to /socket.io/?EIO=4&transport=websocket
//   2. server sends an Engine.IO "open" packet: '0{"sid":...,...}'
//   3. client sends a Socket.IO "connect to namespace" packet: '40/appointments,'
//   4. server acks with '40/appointments,{"sid":...}' once connected
//   5. client sends Engine.IO ping ('2'); server replies pong ('3')
//
// Goal: confirm the gateway accepts and holds many concurrent WebSocket
// connections under load (this is exactly the "second client sees the
// slot disappear instantly" fan-out path the gateway comment describes),
// not to exercise booking logic — that's already covered at the
// transaction level by appointments.controller.spec.ts, and REST booking
// itself needs a real Clerk session this script can't mint (see
// public-endpoints.js's header comment).
//
// Socket.IO is mounted at the bare /socket.io/ path (not under the
// /api/v1 HTTP prefix — see nginx.conf's dedicated location block), so
// this script takes its own WS_URL rather than reusing BASE_URL.
//
//   k6 run loadtest/appointments-websocket.js
//   k6 run -e WS_URL=ws://localhost:3002 loadtest/appointments-websocket.js
//   k6 run -e WS_URL=ws://localhost loadtest/appointments-websocket.js   # via nginx

const WS_URL = __ENV.WS_URL ?? 'ws://localhost:3002';
const SOCKET_IO_URL = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

const connected = new Counter('gateway_connections_established');
const acked = new Counter('gateway_namespace_acks');

export const options = {
  scenarios: {
    // A modest number of concurrent viewers on the open-slots picker —
    // this is a fan-out broadcast channel, not a request/response
    // endpoint, so the interesting load property is "how many idle
        // sockets can the gateway hold open," not raw throughput.
    concurrent_viewers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '20s', target: 20 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    gateway_connections_established: ['count>0'],
    gateway_namespace_acks: ['count>0'],
  },
};

export default function () {
  const res = ws.connect(SOCKET_IO_URL, {}, (socket) => {
    let gotEngineOpen = false;
    let gotNamespaceAck = false;

    socket.on('open', () => {
      connected.add(1);
    });

    socket.on('message', (data) => {
      if (!gotEngineOpen && data.startsWith('0')) {
        gotEngineOpen = true;
        // Join the /appointments namespace once the Engine.IO transport
        // itself is open — see AppointmentsGateway's @WebSocketGateway
        // namespace option.
        socket.send('40/appointments,');
        return;
      }
      if (!gotNamespaceAck && data.startsWith('40/appointments')) {
        gotNamespaceAck = true;
        acked.add(1);
        return;
      }
      // Engine.IO ping ('2') -> pong ('3') keepalive, same as any
      // socket.io client would answer.
      if (data === '2') {
        socket.send('3');
      }
    });

    // Hold the connection open briefly to simulate a viewer sitting on
    // the appointments tab, then disconnect cleanly.
    socket.setTimeout(() => {
      check(null, {
        'namespace connect acked': () => gotNamespaceAck,
      });
      socket.close();
    }, 3000);
  });

  check(res, { 'websocket handshake succeeded (HTTP 101)': (r) => r && r.status === 101 });
  sleep(1);
}
