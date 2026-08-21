// server.js – خادم WebSocket Proxy لتجاوز CORS
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

// إنشاء خادم HTTP
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ خادم WebSocket Proxy يعمل!');
});

// إنشاء خادم WebSocket
const wss = new WebSocket.Server({ server });

// تخزين الاتصالات النشطة
const connections = new Map();

wss.on('connection', (ws, req) => {
    const clientId = Date.now() + Math.random().toString(36).substring(7);
    console.log(`[${new Date().toISOString()}] 🔗 عميل جديد متصل: ${clientId}`);

    // الاتصال بـ Blockstream WebSocket الحقيقي
    const targetWs = new WebSocket('wss://ws.blockstream.info/api/ws');

    targetWs.on('open', () => {
        console.log(`[${new Date().toISOString()}] ✅ متصل بـ Blockstream API`);
        ws.send(JSON.stringify({ type: 'connection', status: 'connected', clientId }));
    });

    targetWs.on('message', (data) => {
        // تمرير الرسائل من Blockstream إلى العميل
        try {
            const parsed = JSON.parse(data);
            ws.send(JSON.stringify({ type: 'blockstream', data: parsed }));
        } catch (e) {
            ws.send(JSON.stringify({ type: 'blockstream', raw: data.toString() }));
        }
    });

    targetWs.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] ❌ خطأ في Blockstream:`, err.message);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
    });

    targetWs.on('close', () => {
        console.log(`[${new Date().toISOString()}] 🔌 انقطع الاتصال بـ Blockstream`);
        ws.close();
    });

    // الاستماع لرسائل العميل وتمريرها إلى Blockstream
    ws.on('message', (data) => {
        if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(data);
        }
    });

    ws.on('close', () => {
        console.log(`[${new Date().toISOString()}] 🔌 عميل ${clientId} انقطع`);
        if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.close();
        }
        connections.delete(clientId);
    });

    connections.set(clientId, { ws, targetWs });
});

server.listen(PORT, () => {
    console.log(`✅ خادم WebSocket Proxy يعمل على المنفذ ${PORT}`);
    console.log(`📡 wss://${process.env.VERCEL_URL || 'localhost'}/ws`);
});

// إغلاق الاتصالات عند إنهاء الخادم
process.on('SIGINT', () => {
    console.log('🛑 إيقاف الخادم...');
    connections.forEach(({ ws, targetWs }) => {
        ws.close();
        targetWs.close();
    });
    process.exit();
});
