const express = require('express');
const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const loki = require('lokijs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- БАЗА ДАННЫХ ---
const db = new loki('zeus_db.json', {
    autoload: true,
    autosave: true, 
    autosaveInterval: 4000,
    autoloadCallback: () => {
        users = db.getCollection("users") || db.addCollection("users");
        orders = db.getCollection("orders") || db.addCollection("orders");
        console.log("✅ DATABASE READY");
    }
});
let users, orders;

// --- ПОЧТА И БОТ ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const myChatId = process.env.MY_CHAT_ID;

// --- ЛОГИКА ВХОДА ---
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    let user = users.findOne({ email });
    if (!user) { users.insert({ email, code }); } else { user.code = code; users.update(user); }
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: 'ZEUS Code', text: `Ваш код входа: ${code}` });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Mail error' }); }
});

app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    let user = users.findOne({ email, code });
    if (user) { res.json({ success: true }); } else { res.status(400).json({ error: 'Wrong code' }); }
});

// --- ЛОГИКА ЗАЯВОК (САЙТ -> БОТ) ---
app.post('/api/order', (req, res) => {
    const { game, offer, email } = req.body;
    const order = orders.insert({ email, game, offer, status: 'pending' });
    const orderId = order.$loki;

    // ИСПРАВЛЕНО: Кнопки теперь добавляются правильно
    var btnList = [];
    btnList.push();
    btnList.push();

    const keyboard = { reply_markup: { inline_keyboard: btnList } };

    bot.sendMessage(myChatId, `⚡️ **НОВАЯ ЗАЯВКА #${orderId}**\n\n📧 **От:** ${email}\n🎮 **Игра:** ${game}\n💰 **Лот:** ${offer}`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    res.json({ success: true });
});

// --- ЛОГИКА КНОПОК (БОТ -> ПОЧТА) ---
bot.on('callback_query', async (query) => {
    const action = query.data.split('_')[0]; 
    const orderId = query.data.split('_')[1]; 
    const order = orders.get(parseInt(orderId));

    if (!order) return bot.answerCallbackQuery(query.id, { text: "Заявка не найдена!" });

    if (action === 'accept') {
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(myChatId, `🔑 **ТЕРМИНАЛ ZEUS**\n\nВведите ваше предложение для \`${order.email}\`.\nТекст будет отправлен ему на почту.`);
        
        // Ждем сообщение от админа
        const messageHandler = async (msg) => {
            if (msg.chat.id.toString() === myChatId.toString() && msg.text) {
                try {
                    await transporter.sendMail({
                        from: `"ZEUS EXCHANGE" <${process.env.EMAIL_USER}>`,
                        to: order.email,
                        subject: `⚡️ Ответ по заявке #${orderId} (${order.game})`,
                        text: `Администратор ZEUS прислал ответ: ${msg.text}`
                    });
                    bot.sendMessage(myChatId, `🚀 **УСПЕШНО!** Ответ доставлен на ${order.email}`);
                    order.status = 'accepted';
                    orders.update(order);
                } catch (e) {
                    bot.sendMessage(myChatId, `❌ Ошибка отправки: ${e.message}`);
                }
                // Удаляем слушателя после одного сообщения
                bot.removeListener('message', messageHandler);
            }
        };
        bot.on('message', messageHandler);
    }

    if (action === 'reject') {
        bot.answerCallbackQuery(query.id, { text: "Сделка отклонена" });
        bot.sendMessage(myChatId, `❌ Вы отклонили заявку #${orderId}`);
        order.status = 'rejected';
        orders.update(order);
    }
});

app.listen(3000, () => console.log("✅ SERVER ONLINE: http://localhost:3000"));

