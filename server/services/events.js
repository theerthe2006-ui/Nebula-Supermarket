// In-Memory Server-Sent Events (SSE) Bus
const clients = new Set();

export function registerSSEClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write('data: {"type":"CONNECTED","message":"SSE stream established"}\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 20000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function broadcastEvent(eventType, payload) {
  const data = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    client.write(`data: ${data}\n\n`);
  }
}
