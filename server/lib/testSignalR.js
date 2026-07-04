/**
 * Quick manual test: run this WHILE an F1 session is live (practice, quali, race).
 * Outside of a live session there's nothing streaming and you'll just see
 * the connection open with no messages.
 *
 * Usage: npm run test:signalr
 */
import { F1LiveTimingClient } from './signalRClient.js';

const client = new F1LiveTimingClient({
  onMessage: (topic, data, timestamp) => {
    // Log just the topic name + a snippet so the console isn't flooded by
    // CarData/Position which update multiple times per second per driver.
    if (topic === 'CarData' || topic === 'Position') {
      console.log(`[${timestamp || ''}] ${topic}: (compressed payload decoded ok)`);
    } else {
      console.log(`[${timestamp || ''}] ${topic}:`, JSON.stringify(data).slice(0, 200));
    }
  },
  onError: (err) => console.error('ERROR:', err.message),
  onClose: () => console.log('Connection closed'),
});

console.log('Connecting to F1 live timing feed...');
client.connect().catch((err) => {
  console.error('Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  client.close();
  process.exit(0);
});
