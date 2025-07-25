// api/server.js
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { WebSocketServer } from 'ws';

import { readFileSync, existsSync } from 'fs';
import path from 'path';


dotenv.config();

const app = express();
app.use(express.json());

// Health‑check endpoint
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

// Test‑route
import helloRouter from './root/hello.js';
app.use('/api/hello', helloRouter);

// Запуск HTTP‑сервера для Express
const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
  console.log(`✅ API server listening at http://localhost:${PORT}`);
});






const PROMPT_PATH = path.join(process.cwd(), 'assistant.txt');
const TOOLS_PATH  = path.join(process.cwd(), 'tools.json');
const DEFAULT_TOOLS = [{
  type:'function',
  name:'show_qr_code',
  description:'Показать QR‑код',
  parameters:{type:'object',properties:{qrUrl:{type:'string'}},required:['qrUrl']},
  meta:{method:'GET',endpoint:'/qr.png'}
}];

// GET /get-assistant
app.get('/get-assistant', (_req, res) => {
  try {
    const txt = existsSync(PROMPT_PATH)
      ? readFileSync(PROMPT_PATH, 'utf8')
      : '';
    res.json({ instructions: txt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ instructions: '' });
  }
});

// GET /get-tools
app.get('/get-tools', (_req, res) => {
  try {
    let tools = DEFAULT_TOOLS;
    if (existsSync(TOOLS_PATH)) {
      tools = JSON.parse(readFileSync(TOOLS_PATH, 'utf8'));
    }
    res.json({ tools });
  } catch (e) {
    console.error(e);
    res.status(500).json({ tools: DEFAULT_TOOLS });
  }
});







// Привязываем WebSocket к открытому HTTP‑серверу (на том же порту)
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  console.log('🔌 WS client connected');

  ws.on('message', async (message) => {
    try {
      // Пытаемся распарсить сообщение как JSON
      const msg = JSON.parse(message);

      // Если это оффер — проксируем его в OpenAI и шлём ответ
      if (msg.type === 'offer' && msg.sdp) {
        const response = await axios.post(
          'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
          msg.sdp,
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/sdp',
              'OpenAI-Beta': 'realtime=v1'
            },
            responseType: 'text'
          }
        );
        ws.send(JSON.stringify({ type: 'answer', sdp: response.data }));
        return;
      }

      // Иначе — просто эхо
      ws.send(`echo: ${message}`);
    } catch (e) {
      console.error('WS message error', e);
    }
  });

  ws.on('close', () => console.log('❌ WS client disconnected'));
});

console.log(`🔗 WS server attached at ws://localhost:${PORT}/ws`);
