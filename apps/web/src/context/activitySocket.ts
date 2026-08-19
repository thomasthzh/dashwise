const CONNECTING = 0;

export function closeActivitySocket(socket: WebSocket) {
  socket.onclose = null;
  socket.onmessage = null;

  if (socket.readyState === CONNECTING) {
    socket.onopen = () => socket.close();
    return;
  }

  socket.onopen = null;
  socket.close();
}
