import { useEffect, useState } from 'react';
import { getSocket } from '../services/socket.js';

/**
 * Live Socket.IO connection state, for the LIVE / OFFLINE chip.
 * Reflects the real transport, not `navigator.onLine` — a phone can be on Wi-Fi
 * and still be unable to reach the laptop, which is precisely the failure mode
 * this project is about.
 */
export function useConnection() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  const [lastChangeAt, setLastChangeAt] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => {
      setConnected(true);
      setLastChangeAt(new Date().toISOString());
    };
    const onDisconnect = () => {
      setConnected(false);
      setLastChangeAt(new Date().toISOString());
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect', onConnect);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onConnect);
    };
  }, []);

  return { connected, lastChangeAt };
}
