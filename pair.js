const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const { upload } = require('./mega');
const router = express.Router();

function removeFile(path) {
    if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    const number = (req.query.number || '').replace(/[^0-9]/g, '');

    if (!number) return res.send({ code: '❗ Invalid number' });

    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: Browsers.macOS('Safari'),
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            const filePath = `./temp/${id}/creds.json`;

            try {
                const megaURL = await upload(fs.createReadStream(filePath), `${sock.user.id}.json`);
                const sessionCode = megaURL.replace('https://mega.nz/file/', '');
                const fullCode = 'PASIYA-MD~' + sessionCode;

                await sock.sendMessage(sock.user.id, { text: fullCode });
                await delay(3000);

                // Close and clean up
                sock.ws.close();
                removeFile(`./temp/${id}`);
                process.exit(0);
            } catch (err) {
                console.error('Upload/Send failed:', err);
                await sock.sendMessage(sock.user.id, { text: 'Error sending session: ' + err.message });
            }
        } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log('Reconnecting...');
            removeFile(`./temp/${id}`);
        }
    });

    try {
        await delay(3000); // Ensure socket is fully initialized
        const code = await sock.requestPairingCode(number);
        if (!res.headersSent) res.send({ code });
    } catch (err) {
        console.error('Pairing error:', err);
        removeFile(`./temp/${id}`);
        if (!res.headersSent) res.send({ code: '❗ Could not link device' });
    }
});

module.exports = router;
