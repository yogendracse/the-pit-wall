/**
 * F1 Live Timing SignalR client.
 *
 * This connects to F1's own live timing feed (livetiming.formula1.com) —
 * the same underlying data source that MultiViewer, FastF1's SignalRClient,
 * and other community tools use. It is UNOFFICIAL and UNDOCUMENTED by F1.
 *
 * IMPORTANT — keep this personal-use-only:
 *   - Do not distribute this app or run it as a public service.
 *   - Do not redistribute the raw data.
 *   - This talks to a reverse-engineered endpoint; F1 can change it at any
 *     time without notice, which will break this file.
 *
 * Protocol: legacy ASP.NET SignalR (not SignalR Core). Flow:
 *   1. GET  /signalr/negotiate  -> connection token + session cookie
 *   2. WS   /signalr/connect    -> open socket using that token + cookie
 *   3. send {"H":"Streaming","M":"Subscribe","A":[[topics...]],"I":1}
 *   4. receive JSON messages; some payloads (CarData.z, Position.z) are
 *      raw-deflate + base64 and must be inflated before parsing.
 */

import axios from 'axios';
import WebSocket from 'ws';
import zlib from 'zlib';

const BASE = 'https://livetiming.formula1.com';
const WS_BASE = 'wss://livetiming.formula1.com';

// Topics available on the feed. '.z' suffixed topics are compressed.
// This list is based on community reverse-engineering (FastF1, MultiViewer);
// F1 may add/remove/rename topics without notice.
const DEFAULT_TOPICS = [
  'Heartbeat',
  'CarData.z',
  'Position.z',
  'ExtrapolatedClock',
  'TopThree',
  'TimingStats',
  'TimingAppData',
  'WeatherData',
  'TrackStatus',
  'DriverList',
  'RaceControlMessages',
  'SessionInfo',
  'SessionData',
  'LapCount',
  'TimingData',
  'TeamRadio',
];

const COMPRESSED_TOPICS = new Set(['CarData.z', 'Position.z']);

// Once inflated, these decompress to the same shape as the uncompressed
// topic minus the '.z' suffix (e.g. 'CarData.z' -> 'CarData').
function decompressedTopicName(topic) {
  return topic.endsWith('.z') ? topic.slice(0, -2) : topic;
}

function decodeCompressedPayload(base64Str) {
  try {
    const buf = Buffer.from(base64Str, 'base64');
    const inflated = zlib.inflateRawSync(buf);
    return JSON.parse(inflated.toString('utf8'));
  } catch (err) {
    // Some payloads use standard zlib (not raw deflate) depending on topic —
    // fall back if raw inflate fails.
    try {
      const buf = Buffer.from(base64Str, 'base64');
      const inflated = zlib.inflateSync(buf);
      return JSON.parse(inflated.toString('utf8'));
    } catch (err2) {
      throw new Error(`Failed to decompress payload: ${err.message} / ${err2.message}`);
    }
  }
}

class F1LiveTimingClient {
  /**
   * @param {object} opts
   * @param {string[]} [opts.topics] - which topics to subscribe to
   * @param {(topic: string, data: any, timestamp: string) => void} opts.onMessage
   * @param {(err: Error) => void} [opts.onError]
   * @param {() => void} [opts.onClose]
   */
  constructor({ topics = DEFAULT_TOPICS, onMessage, onError, onClose } = {}) {
    this.topics = topics;
    this.onMessage = onMessage || (() => {});
    this.onError = onError || ((err) => console.error('[F1LiveTiming]', err));
    this.onClose = onClose || (() => {});
    this.ws = null;
    this._reconnectAttempts = 0;
    this._manualClose = false;
  }

  async _negotiate() {
    const hub = encodeURIComponent(JSON.stringify([{ name: 'Streaming' }]));
    const url = `${BASE}/signalr/negotiate?connectionData=${hub}&clientProtocol=1.5`;
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'BestHTTP',
        'Accept-Encoding': 'gzip,identity',
      },
    });
    const setCookie = resp.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie.map((c) => c.split(';')[0]).join('; ') : '';
    return { connectionToken: resp.data.ConnectionToken, cookie };
  }

  async connect() {
    this._manualClose = false;
    const { connectionToken, cookie } = await this._negotiate();

    const hub = encodeURIComponent(JSON.stringify([{ name: 'Streaming' }]));
    const wsUrl =
      `${WS_BASE}/signalr/connect?transport=webSockets` +
      `&connectionToken=${encodeURIComponent(connectionToken)}` +
      `&connectionData=${hub}&clientProtocol=1.5`;

    this.ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'BestHTTP',
        Cookie: cookie,
      },
    });

    this.ws.on('open', () => {
      this._reconnectAttempts = 0;
      this._subscribe();
    });

    this.ws.on('message', (raw) => this._handleRawMessage(raw));

    this.ws.on('error', (err) => this.onError(err));

    this.ws.on('close', () => {
      this.onClose();
      if (!this._manualClose) this._scheduleReconnect();
    });
  }

  _subscribe() {
    const msg = {
      H: 'Streaming',
      M: 'Subscribe',
      A: [this.topics],
      I: 1,
    };
    this.ws.send(JSON.stringify(msg));
  }

  _handleRawMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return; // ignore keep-alive/non-JSON frames
    }

    // Initial subscribe response: { R: { Topic: payload, ... }, I: 1 }
    if (parsed.R && typeof parsed.R === 'object') {
      for (const [topic, payload] of Object.entries(parsed.R)) {
        this._emit(topic, payload);
      }
    }

    // Streaming updates: { M: [ { H, M: methodName, A: [topic, data, timestamp] }, ... ] }
    if (Array.isArray(parsed.M)) {
      for (const item of parsed.M) {
        if (item.M === 'feed' && Array.isArray(item.A)) {
          const [topic, data, timestamp] = item.A;
          this._emit(topic, data, timestamp);
        }
      }
    }
  }

  _emit(topic, payload, timestamp) {
    try {
      if (COMPRESSED_TOPICS.has(topic) && typeof payload === 'string') {
        const decoded = decodeCompressedPayload(payload);
        this.onMessage(decompressedTopicName(topic), decoded, timestamp);
      } else {
        this.onMessage(topic, payload, timestamp);
      }
    } catch (err) {
      this.onError(new Error(`[${topic}] decode failed: ${err.message}`));
    }
  }

  _scheduleReconnect() {
    this._reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * 2 ** this._reconnectAttempts);
    setTimeout(() => {
      this.connect().catch((err) => this.onError(err));
    }, delay);
  }

  close() {
    this._manualClose = true;
    if (this.ws) this.ws.close();
  }
}

export { F1LiveTimingClient, DEFAULT_TOPICS };
