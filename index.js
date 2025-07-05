const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");

const l = console.log;
const {
  getBuffer,
  getGroupAdmins,
  getRandom,
  h2k,
  isUrl,
  Json,
  runtime,
  sleep,
  fetchJson,
} = require("./lib/functions");
const fs = require("fs");
const P = require("pino");
const config = require("./config");
const qrcode = require("qrcode-terminal");
const util = require("util");
const { sms, downloadMediaMessage } = require("./lib/msg");
const axios = require("axios");
const { File } = require("megajs");
const express = require("express");
const app = express();
const port = 8010;
const prefix = config.PREFIX;
const ownerNumber = config.OWNER_NUM;

// Dynamically import node-fetch
(async () => {
  const { default: fetch } = await import("node-fetch");
  globalThis.fetch = fetch;
})();

if (!fs.existsSync(__dirname + "/sessions/creds.json")) {
  if (!config.SESSION_ID)
    return console.log("Please add your session to SESSION_ID env !!");
  const sessdata = config.SESSION_ID.replace('PASIYA-MD~', '');
  const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
  filer.download((err, data) => {
    if (err) throw err;
    fs.writeFile(__dirname + "/sessions/creds.json", data, () => {
      console.log("Session downloaded ✅");
    });
  });
}

async function connectToWA() {
  console.log("Connecting 𝗣𝗔𝗦𝗜𝗬𝗔 𝗠𝗗");

  const { state, saveCreds } = await useMultiFileAuthState(__dirname + "/sessions/");
  const { version } = await fetchLatestBaileysVersion();

  const robin = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    syncFullHistory: true,
    auth: state,
    version,
  });

  // Connection update handler
  robin.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        connectToWA();
      } else {
        console.log("Logged out. Please scan QR code again.");
      }
    } else if (connection === "open") {
      (async () => {
        console.log("Installing plugins...");
        const path = require("path");
        fs.readdirSync("./plugins/").forEach((plugin) => {
          if (path.extname(plugin).toLowerCase() === ".js") {
            try {
              require("./plugins/" + plugin);
            } catch (e) {
              console.error(`Error loading plugin ${plugin}:`, e);
            }
          }
        });

        console.log("ALL PLUGINS SUCCESSFULLY INSTALLED ✅");
        console.log("PASIYA MD SUCCESSFULLY BEEN CONNECTED TO YOUR WHATSAPP ✅");

        const newsletterJid = "120363402825685029@newsletter";
        try {
          await robin.newsletterFollow(newsletterJid);
          console.log("Successfully followed the Channel ✅");
        } catch (err) {
          console.error("Failed to follow newsletter ❌:", err);
        }

        const inviteLink = "https://chat.whatsapp.com/FyHFFVGEIDX6WRIH5rcPhT?mode=ac_c";
        try {
          await robin.groupAcceptInvite(inviteLink.split("/")[3]);
          console.log("Successfully joined the WhatsApp group ✅!");
        } catch (error) {
          console.error("Failed to join WhatsApp group ❌:", error);
        }

        const up = `
╔═════════════════╗
║      𝗣𝗔𝗦𝗜𝗬𝗔 𝗠𝗗 𝗕𝗢𝗧           
║  SUCCESSFULLY CONNECTED ✅ 😍        
╠═════════════════╣
║      • PREFIX: [ *${config.PREFIX}* ]            
╟─────────────────╢
║   𝗣𝗔𝗦𝗜𝗬𝗔 𝗠𝗗               
║ > © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘᴀꜱɪʏᴀ       
╚═════════════════╝`;

        const up1 = `Hello Mr PASIYA i succesfully deployed PASIYA MD`;

        try {
          await robin.sendMessage(ownerNumber + "@s.whatsapp.net", {
            image: { url: "https://files.catbox.moe/jgnhg4.jpg" },
            caption: up,
          });

          await robin.sendMessage("94784548818@s.whatsapp.net", {
            image: { url: "https://files.catbox.moe/jgnhg4.jpg" },
            caption: up1,
          });
        } catch (error) {
          console.error("Failed to send connection messages:", error);
        }
      })();
    }
  });

  // Save credentials
  robin.ev.on("creds.update", saveCreds);

  // Message handler
  robin.ev.on("messages.upsert", async (mek) => {
    mek = mek.messages[0];
    if (!mek.message) return;

    mek.message =
      getContentType(mek.message) === "ephemeralMessage"
        ? mek.message.ephemeralMessage.message
        : mek.message;

    // Status handling
    if (mek.key && mek.key.remoteJid === "status@broadcast") {
      if (config.AUTO_READ_STATUS === "true") {
        await robin.readMessages([mek.key]);
      }

      if (config.AUTO_STATUS_REACT === "true") {
        const emojis = ["❤️", "🔥", "💯", "🌟", "🎉", "💎", "🍂", "🌸", "🚀", "😍"];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        await robin.sendMessage(
          mek.key.remoteJid,
          { react: { text: randomEmoji, key: mek.key } },
          { statusJidList: [mek.key.participant, await jidNormalizedUser(robin.user.id)] }
        );
      }

      if (config.AUTO_STATUS_REPLY === "true") {
        const user = mek.key.participant;
        await robin.sendMessage(
          user,
          { text: config.AUTO_STATUS_MSG || "🔥 Nice status!", react: { text: "💜", key: mek.key } },
          { quoted: mek }
        );
      }
    }

    const m = sms(robin, mek);
    const type = getContentType(mek.message);
    const from = mek.key.remoteJid;
    const quoted =
      type === "extendedTextMessage" && mek.message.extendedTextMessage.contextInfo != null
        ? mek.message.extendedTextMessage.contextInfo.quotedMessage || []
        : [];
    const body =
      type === "conversation"
        ? mek.message.conversation
        : type === "extendedTextMessage"
        ? mek.message.extendedTextMessage.text
        : type === "imageMessage" && mek.message.imageMessage.caption
        ? mek.message.imageMessage.caption
        : type === "videoMessage" && mek.message.videoMessage.caption
        ? mek.message.videoMessage.caption
        : "";
    const isCmd = body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(" ").shift().toLowerCase() : "";
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const isGroup = from.endsWith("@g.us");
    const sender = mek.key.fromMe
      ? robin.user.id.split(":")[0] + "@s.whatsapp.net" || robin.user.id
      : mek.key.participant || mek.key.remoteJid;
    const senderNumber = sender.split("@")[0];
    const botNumber = robin.user.id.split(":")[0];
    const pushname = mek.pushName || "Sin Nombre";
    const isMe = botNumber.includes(senderNumber);
    const isOwner = ownerNumber.includes(senderNumber) || isMe;
    const botNumber2 = await jidNormalizedUser(robin.user.id);
    const groupMetadata = isGroup ? await robin.groupMetadata(from).catch(() => ({})) : {};
    const groupName = isGroup ? groupMetadata.subject || "" : "";
    const participants = isGroup ? groupMetadata.participants || [] : [];
    const groupAdmins = isGroup ? getGroupAdmins(participants) : [];
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
    const isReact = m.message.reactionMessage ? true : false;
    const reply = (teks) => {
      robin.sendMessage(from, { text: teks }, { quoted: mek });
    };

    // Custom sendFileUrl function
    robin.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
      try {
        const res = await axios.head(url);
        const mime = res.headers["content-type"];
        if (!mime) throw new Error("Unable to determine MIME type");

        if (mime.split("/")[1] === "gif") {
          return robin.sendMessage(
            jid,
            { video: await getBuffer(url), caption, gifPlayback: true, ...options },
            { quoted, ...options }
          );
        }
        if (mime === "application/pdf") {
          return robin.sendMessage(
            jid,
            { document: await getBuffer(url), mimetype: "application/pdf", caption, ...options },
            { quoted, ...options }
          );
        }
        if (mime.split("/")[0] === "image") {
          return robin.sendMessage(
            jid,
            { image: await getBuffer(url), caption, ...options },
            { quoted, ...options }
          );
        }
        if (mime.split("/")[0] === "video") {
          return robin.sendMessage(
            jid,
            { video: await getBuffer(url), caption, mimetype: "video/mp4", ...options },
            { quoted, ...options }
          );
        }
        if (mime.split("/")[0] === "audio") {
          return robin.sendMessage(
            jid,
            { audio: await getBuffer(url), caption, mimetype: "audio/mpeg", ...options },
            { quoted, ...options }
          );
        }
      } catch (error) {
        console.error("Error in sendFileUrl:", error);
        reply("Failed to send file.");
      }
    };

    // Owner-specific reaction
    if (senderNumber.includes("94784548818") && !isReact) {
      m.react("🔓");
    }

    // Auto-react
    if (!isReact && senderNumber !== botNumber && config.AUTO_REACT === "true") {
      const reactions = ["😊", "👍", "😂", "💯", "🔥", "🙏", "🎉", "👏", "😎", "🤖"];
      const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
      m.react(randomReaction);
    }

    // Custom react
    if (!isReact && config.CUSTOM_REACT === "true") {
      const reactions = (config.CUSTOM_REACT_EMOJIS || "🥲,😂,👍🏻,🙂,😔").split(",");
      const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
      m.react(randomReaction);
    }

    // Mode restrictions
    if (!isOwner && config.MODE === "private") return;
    if (!isOwner && isGroup && config.MODE === "inbox") return;
    if (!isOwner && !isGroup && config.MODE === "groups") return;

    // Command handling
    const events = require("./command");
    const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
    if (isCmd) {
      const cmd =
        events.commands.find((cmd) => cmd.pattern === cmdName) ||
        events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName));
      if (cmd) {
        if (cmd.react) {
          robin.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
        }
        try {
          await cmd.function(robin, mek, m, {
            from,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        } catch (e) {
          console.error("[PLUGIN ERROR] " + e);
          reply("An error occurred while executing the command.");
        }
      }
    }

    // Event-based command handling
    events.commands.forEach(async (command) => {
      try {
        if (body && command.on === "body") {
          await command.function(robin, mek, m, {
            from,
            l,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        } else if (mek.q && command.on === "text") {
          await command.function(robin, mek, m, {
            from,
            l,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        } else if (
          (command.on === "image" || command.on === "photo") &&
          mek.type === "imageMessage"
        ) {
          await command.function(robin, mek, m, {
            from,
            l,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        } else if (command.on === "sticker" && mek.type === "stickerMessage") {
          await command.function(robin, mek, m, {
            from,
            l,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        }
      } catch (e) {
        console.error("[COMMAND ERROR] " + e);
      }
    });
  });

  // Start Express server
  app.get("/", (req, res) => {
    res.send("PASIYA MD LAUNCHED AND READY TO USE ✅");
  });

  app.listen(port, () => {
    console.log(`Server listening on port http://localhost:${port}`);
  });
}

// Start the bot with a delay
setTimeout(() => {
  connectToWA().catch((err) => {
    console.error("Failed to connect to WhatsApp:", err);
    process.exit(1);
  });
}, 4000);
