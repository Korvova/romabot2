// api/server.js
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { WebSocketServer } from 'ws';

import { readFileSync, existsSync } from 'fs';
import path from 'path';


import { PrismaClient } from './generated/prisma/index.js';



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



const prisma = new PrismaClient();


const PROMPT_PATH = path.join(process.cwd(), 'assistant.txt');
const TOOLS_PATH  = path.join(process.cwd(), 'tools.json');
const DEFAULT_TOOLS = [{
  type:'function',
  name:'show_qr_code',
  description:'Показать QR‑код',
  parameters:{type:'object',properties:{qrUrl:{type:'string'}},required:['qrUrl']},
  meta:{method:'GET',endpoint:'/qr.png'}
}];


// GET /get-assistant (теперь из БД)
app.get('/get-assistant', async (_req, res) => {
  try {
    const promptSetting = await prisma.setting.findUnique({
      where: { key: 'prompt' }
    });
    const instructions = promptSetting?.value || '';
    res.json({ instructions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ instructions: '' });
  }
});





// GET /get-tools
app.get('/get-tools', async (_req, res) => {
  try {
    const toolsSetting = await prisma.setting.findUnique({
      where: { key: 'tools' }
    });
    const tools = toolsSetting
      ? JSON.parse(toolsSetting.value)
      : DEFAULT_TOOLS;
    res.json({ tools });
  } catch (e) {
    console.error(e);
    res.status(500).json({ tools: DEFAULT_TOOLS });
  }
});


app.get('/admin/settings', async (_req, res) => {
  try {
    const promptSetting = await prisma.setting.findUnique({
      where: { key: 'prompt' }
    });
    const toolsSetting = await prisma.setting.findUnique({
      where: { key: 'tools' }
    });

    res.json({
      instructions: promptSetting?.value || '',
      tools: toolsSetting ? JSON.parse(toolsSetting.value) : []
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to load settings' });
  }
});

// Маршрут сохранения настроек
// POST /admin/settings
app.post('/admin/settings', async (req, res) => {
  const { instructions, tools } = req.body;
  try {
    // Сохраняем или обновляем prompt
    await prisma.setting.upsert({
      where: { key: 'prompt' },
      update: { value: instructions },
      create: { key: 'prompt', value: instructions }
    });
    // Сохраняем или обновляем tools (строкой JSON)
    await prisma.setting.upsert({
      where: { key: 'tools' },
      update: { value: JSON.stringify(tools) },
      create: { key: 'tools', value: JSON.stringify(tools) }
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save settings' });
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
