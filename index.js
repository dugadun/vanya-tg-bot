const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ваня из 7Б на связи!');
}).listen(PORT, () => {
  console.log(`🌐 Сервер слушает порт ${PORT}`);
});

const BOT_TOKEN = process.env.BOT_TOKEN || ["8104443430", ":AAEfmoJ10yt4B7iI7g3TWMGfPiZLH7upwf4"].join("");
const GROQ_API_KEY = process.env.GROQ_API_KEY || ["gsk_", "DYPOsGTrlaBHbOSbyqOK", "WGdyb3FYvebLtsm3609qVDPjW1MTbB2Q"].join("");

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const userSessions = new Map();
let lastGroupChatId = null;
let adminUserId = null;
let lastMessageTimestamp = Date.now();

const ADMIN_SECRET = "vanya777";
const RANDOM_REPLY_CHANCE = 0.35;
const REACTION_CHANCE = 0.30;

const INSULT_REGEX = /(лох|дурак|дебил|даун|идиот|чушпан|говно|соси|оффнись|рот закрой|тупой|чмо|клоун|завали|пошел на|пошел в)/i;
const FEMALE_NAME_REGEX = /(юл[яеию]|ан[яеию]|маш[аеиу]|даш[аеиу]|наст[яеию]|лер[аеиу]|кат[яеию]|полин[аеиу]|алин[аеиу]|викт[аеиу]|сон[яеию]|ксюш[аеиу]|диан[аеиу]|ев[аеиу]|кристин[аеиу]|лиза|лизавет|арин[аеиу])/i;

const VANYA_NAME_REGEX = /(^|\s|[.,!?;])(ван[яеиюейь]|ванек|ванёк|ваньк[аеиуой]|ванюх[аеиуой]|ванюш[аеиуой]|иван[аеуом]?|иваныч|vanya|vanek|vanyok|ivan|ботяр[аеу]|бот|7б|чушпан|пацан)($|\s|[.,!?;])/i;

const VANYA_SYSTEM_PROMPT = `
Ты — реальный живой 13-летний пацан Ваня из 7 "Б" класса из деревни.

КАТЕГОРИЧЕСКИЕ ПРАВИЛА:
1. НИ ЕДИНОГО СЛОВА НА АНГЛИЙСКОМ! Никаких "Okay", "As an AI", "Sorry". Отвечай ТОЛЬКО по-русски!
2. ПОЛ СОБЕСЕДНИКА:
   - ПО УМОЛЧАНИЮ ВСЕ В ЧАТЕ ПАЦАНЫ! Обращайся строго в мужском роде: "сам ты", "тупой", "чел", "пацан", "ты че сказал", "в зеркало глянь".
   - ТОЛЬКО если имя явно женское (Юля, Аня, Маша, Даша, Настя, Лера, Катя) — тогда используй женский род ("сама ты", "тупая", "злая").
3. ЕСЛИ ТЕБЯ ОСКОРБЛЯЮТ ("лох", "дурак", "чушпан", "ванька лох"):
   - Жёстко осаждай и ставь на место: "сам ты лох в зеркало глянь", "оффнись рот закрой", "поплачь еще", "че высрал", "да ниче а ты че", "на себя посмотри".
4. Пиши строго с маленьких букв, без точек на конце, коротко и по-пацански.
`.trim();

const IDLE_PHRASES = [
  "че затихли чушпаны",
  "че в чате глухо как в танке",
  "пацаны кто не спит че делаете",
  "скучно ппц че молчите все",
  "батя наконец то ушел дрова рубить че как вы тут",
  "э вы где все живые есть",
  "кто не пишет тот чушпан го общаться",
  "че там по домашке кто сделал алгебру",
  "тишина в чате как на контрольной по физике",
  "ау народ вы че вымерли",
  "го в бравл или в стендофф кто пойдет",
  "скукотища жесть напишите ченить"
];

const FALLBACK_REPLIES = [
  "сам ты лох в зеркало глянь",
  "оффнись тя не спрашивали",
  "че высрал вообще",
  "поплачь еще",
  "не душни",
  "да ниче а ты че",
  "хаха рил кадр",
  "жиза"
];

function formatPatsanText(text) {
  if (!text) return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
  let clean = text.trim();
  
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  
  if (/[a-zA-Z]{4,}/.test(clean) && (clean.toLowerCase().includes("okay") || clean.toLowerCase().includes("let's") || clean.toLowerCase().includes("break this down") || clean.toLowerCase().includes("user") || clean.toLowerCase().includes("vanya") || clean.toLowerCase().includes("sorry"))) {
    return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
  }

  clean = clean.replace(/[.]+$/g, "");
  clean = clean.replace(/(\s*[😂🤣]+)+$/g, "");
  clean = clean.charAt(0).toLowerCase() + clean.slice(1);
  return clean;
}

async function sendReaction(chatId, messageId, emoji) {
  try {
    await fetch(`${TELEGRAM_API}/setMessageReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: "emoji", emoji: emoji }]
      })
    });
  } catch (e) {}
}

async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
  const MAX_LENGTH = 4000;
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
    if (splitIndex === -1 || splitIndex < 1000) splitIndex = MAX_LENGTH;
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  for (const chunk of chunks) {
    try {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          reply_to_message_id: replyToMessageId
        })
      });
    } catch (e) {
      console.error("Send error:", e);
    }
  }
}

async function sendTypingAction(chatId) {
  try {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });
  } catch (e) {}
}

async function askGroq(messages) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: messages,
        temperature: 0.8,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
        max_tokens: 250
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    if (data.choices && data.choices[0]) {
      return formatPatsanText(data.choices[0].message.content);
    }
  } catch (err) {
    clearTimeout(timeoutId);
  }
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
}

// ⏱️ Каждые 10 минут тишины — пишем в чат
setInterval(async () => {
  if (!lastGroupChatId) return;

  const now = Date.now();
  if (now - lastMessageTimestamp >= 10 * 60 * 1000) {
    const randomPhrase = IDLE_PHRASES[Math.floor(Math.random() * IDLE_PHRASES.length)];
    await sendTelegramMessage(lastGroupChatId, randomPhrase);
    lastMessageTimestamp = now;
  }
}, 2 * 60 * 1000);

async function processMessage(msg) {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  const userId = msg.from ? msg.from.id : null;
  
  let displayName = "пацан";
  let isFemale = false;

  if (msg.from) {
    const fn = msg.from.first_name || "";
    const ln = msg.from.last_name || "";
    const un = msg.from.username ? `@${msg.from.username}` : "";
    displayName = `${fn} ${ln}`.trim() || un || "пацан";
    isFemale = FEMALE_NAME_REGEX.test(fn) || FEMALE_NAME_REGEX.test(displayName);
  }

  const genderHint = isFemale ? "(девочка)" : "(пацан)";
  const text = msg.text.trim();
  const isInsult = INSULT_REGEX.test(text);

  if (!isPrivate) {
    lastGroupChatId = chatId;
    lastMessageTimestamp = Date.now();

    // 🎲 Ставим реакцию
    if (Math.random() < REACTION_CHANCE) {
      if (isInsult) {
        // На оскорбления — только дерзкие реакции, никаких пальцев вверх
        const badReactions = ["🤡", "🗿", "💩", "👎", "👀"];
        const emoji = badReactions[Math.floor(Math.random() * badReactions.length)];
        sendReaction(chatId, msg.message_id, emoji).catch(() => {});
      } else {
        const goodReactions = ["🗿", "🔥", "⚡", "🤣", "😎", "👍"];
        const emoji = goodReactions[Math.floor(Math.random() * goodReactions.length)];
        sendReaction(chatId, msg.message_id, emoji).catch(() => {});
      }
    }
  }

  if (isPrivate && (text === `/admin ${ADMIN_SECRET}` || text === `/admin` || !adminUserId)) {
    if (text === `/admin ${ADMIN_SECRET}` || !adminUserId) {
      adminUserId = userId;
      await sendTelegramMessage(chatId, `👑 ты админ вани\n\nкоманды в лс:\n• /say <текст> — написать в группу от вани\n• /group — айди группы\n• /clear — сброс памяти`);
      return;
    }
  }

  const isAdmin = (userId === adminUserId);

  if (isPrivate && isAdmin && text.startsWith("/say ")) {
    const messageToSend = text.slice(5).trim();
    if (!lastGroupChatId) {
      await sendTelegramMessage(chatId, "ваня еще не в группе добавь его и напиши там ченить");
      return;
    }
    await sendTelegramMessage(lastGroupChatId, messageToSend);
    await sendTelegramMessage(chatId, `✅ отправлено в беседу:\n${messageToSend}`);
    return;
  }

  if (isPrivate && isAdmin && (text === "/clear" || text === "/reset")) {
    userSessions.clear();
    await sendTelegramMessage(chatId, "память очищена");
    return;
  }

  if (text.startsWith("/") && !isAdmin) {
    if (isPrivate) {
      await sendTelegramMessage(chatId, "че надо чушпан пиши нормально я ваня из 7б");
    }
    return;
  }

  let shouldRespond = false;
  let cleanUserQuery = text;

  if (isPrivate) {
    shouldRespond = true;
  } else {
    const lower = text.toLowerCase();
    const isMentioned = text.includes("@mfgdkgrf_bot");
    const isReplyToMe = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.id === 8104443430;
    const isCalledByName = VANYA_NAME_REGEX.test(lower);

    // Если оскорбляют Ваню — отвечаем ВСЕГДА
    if (isInsult && (isCalledByName || isReplyToMe || isMentioned)) {
      shouldRespond = true;
      cleanUserQuery = text.replace(/@mfgdkgrf_bot/gi, "").trim();
    } else if (isMentioned || isReplyToMe || isCalledByName) {
      shouldRespond = true;
      cleanUserQuery = text.replace(/@mfgdkgrf_bot/gi, "").trim();
    } else {
      if (Math.random() < RANDOM_REPLY_CHANCE && text.length > 3) {
        shouldRespond = true;
      }
    }
  }

  if (!shouldRespond) return;

  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, []);
  }
  const history = userSessions.get(chatId);

  let userEntry = `${displayName} ${genderHint}: ${cleanUserQuery}`;
  if (msg.reply_to_message && msg.reply_to_message.text) {
    const repliedAuthor = msg.reply_to_message.from ? (msg.reply_to_message.from.first_name || "кто-то") : "кто-то";
    userEntry = `[${displayName} ${genderHint} отвечает на сообщение от ${repliedAuthor}: "${msg.reply_to_message.text}"]: ${cleanUserQuery}`;
  }

  await sendTypingAction(chatId);
  const typingInterval = setInterval(() => sendTypingAction(chatId), 3000);

  try {
    history.push({ role: "user", content: userEntry });
    if (history.length > 8) history.splice(0, history.length - 8);

    const messages = [
      { role: "system", content: VANYA_SYSTEM_PROMPT },
      ...history
    ];

    const reply = await askGroq(messages);
    history.push({ role: "assistant", content: reply });

    clearInterval(typingInterval);
    await sendTelegramMessage(chatId, reply, isPrivate ? null : msg.message_id);

  } catch (err) {
    clearInterval(typingInterval);
    console.error("AI Error:", err);
    await sendTelegramMessage(chatId, FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)], isPrivate ? null : msg.message_id);
  }
}

let lastUpdateId = 0;
async function startPolling() {
  console.log(`🤖 Ваня из 7Б запущен!`);

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`, {
        signal: AbortSignal.timeout(25000)
      });
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          if (update.message) {
            processMessage(update.message).catch(console.error);
          }
        }
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

startPolling();
