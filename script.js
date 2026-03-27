const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- ИНИЦИАЛИЗАЦИЯ ДАННЫХ ---
const user = tg.initDataUnsafe?.user;
const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;

if (user) {
    document.getElementById('username').innerText = user.first_name;
    document.getElementById('user_id').innerText = user.id;
    // Сразу запрашиваем актуальный баланс у бота при входе
    refreshBalance();
}

document.getElementById('balance_val').innerText = currentBalance;

async function refreshBalance() {
    if (!user) return;
    try {
        // Убедись, что у тебя в боте есть такой эндпоинт, либо используй текущий метод получения
        const response = await fetch(`${API_URL}/api?action=get_balance&user_id=${user.id}`);
        const data = await response.json();
        if (data && data.balance !== undefined) {
            currentBalance = data.balance;
            document.getElementById('balance_val').innerText = currentBalance;
        }
    } catch (e) { console.error("Ошибка баланса:", e); }
}

let activeRooms = {};

async function apiCall(endpoint, paramsObj) {
    const query = new URLSearchParams(paramsObj).toString();
    try {
        const response = await fetch(`${API_URL}/${endpoint}?${query}`);
        return await response.json();
    } catch (e) {
        console.error("API Error:", e);
        return null;
    }
}

// --- СИСТЕМА ОБНОВЛЕНИЯ КОМНАТ ---
async function updateRoomsData() {
    try {
        const response = await fetch(`${API_URL}/rooms?t=${Date.now()}`);
        activeRooms = await response.json();
        renderRooms(); 
    } catch (e) { console.error("Ошибка обновления комнат:", e); }
}

if (params.get('mode') !== 'battle') {
    setInterval(updateRoomsData, 5000);
    updateRoomsData();
}

// --- ЛОГИКА ИГРЫ ---
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];
let flippedCards = [];
let canClick = false;

if (params.get('mode') === 'battle') {
    startMemoryGame();
}

function startMemoryGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.querySelector('.bottom-nav').style.display = 'none';
    
    const grid = document.getElementById('memory-grid');
    const status = document.getElementById('game-status');
    const bar = document.getElementById('timer-bar');
    
    grid.innerHTML = '';
    grid.style.opacity = '0';
    canClick = false;

    // Перемешиваем и создаем карты
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped'; // Изначально открыты лицом
        card.innerHTML = `
            <div class="card-back"></div>
            <div class="card-front">${emoji}</div>
        `;
        card.dataset.emoji = emoji;
        
        card.onclick = () => {
            if (!canClick || card.classList.contains('matched') || card.classList.contains('flipped') || flippedCards.length >= 2) return;

            card.classList.add('flipped');
            flippedCards.push(card);

            if (flippedCards.length === 2) {
                canClick = false;
                if (flippedCards[0].dataset.emoji === flippedCards[1].dataset.emoji) {
                    flippedCards.forEach(c => c.classList.add('matched'));
                    flippedCards = []; 
                    canClick = true;
                    if (document.querySelectorAll('.matched').length === 16) {
                        setTimeout(() => endGame(true), 500);
                    }
                } else {
                    setTimeout(() => {
                        flippedCards.forEach(c => c.classList.remove('flipped'));
                        flippedCards = [];
                        canClick = true;
                    }, 600);
                }
            }
        };
        grid.appendChild(card);
    });

    // ФАЗА 1: ИНСТРУКЦИЯ
    status.innerText = "ПРАВИЛА ИГРЫ 🧠";
    bar.style.backgroundColor = "#ffcc00";
    const insLayer = document.getElementById('instruction-layer');
    if(insLayer) insLayer.style.display = 'block';

    runUniversalTimer(10, () => {
        // ФАЗА 2: ЗАПОМИНАНИЕ
        if(insLayer) insLayer.style.display = 'none';
        grid.style.opacity = '1';
        status.innerText = "ЗАПОМИНАЙ КАРТОЧКИ!";
        bar.style.backgroundColor = "#2ecc71";

        runUniversalTimer(10, () => {
            // ФАЗА 3: НАЧАЛО ИГРЫ
            document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
            status.innerText = "ТВОЙ ХОД! ИЩИ ПАРЫ";
            status.style.color = "white";
            bar.style.backgroundColor = "#3498db";
            canClick = true;
        });
    });
}

function runUniversalTimer(seconds, callback) {
    let timeLeft = seconds;
    const bar = document.getElementById('timer-bar');
    const step = 0.1;
    const interval = setInterval(() => {
        timeLeft -= step;
        bar.style.width = (timeLeft / seconds) * 100 + "%";
        if (timeLeft <= 0) {
            clearInterval(interval);
            callback();
        }
    }, 100);
}

async function endGame(win) {
    const bet = params.get('bet') || 0;
    tg.showPopup({
        title: win ? "ПОБЕДА! 🏆" : "ПОРАЖЕНИЕ",
        message: win ? `Вы нашли все пары!` : "Время вышло.",
        buttons: [{type: "ok"}]
    }, async () => {
        await apiCall('api', {
            action: 'result',
            user_id: user.id,
            status: win ? 'win' : 'lose',
            bet: bet
        });
        tg.close();
    });
}

// Функции навигации и создания (оставь свои без изменений ниже)
function joinRoom(roomId) {
    tg.sendData(JSON.stringify({ action: "join_room", room_id: roomId }));
    tg.close();
}
function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    tg.sendData(JSON.stringify({ action: "create_room", bet: parseInt(bet) }));
    tg.close();
}
function renderRooms() {
    const container = document.getElementById('rooms-container');
    if (!container) return;
    container.innerHTML = "";
    let hasRooms = false;
    Object.keys(active_rooms).forEach(id => {
        const room = active_rooms[id];
        if (room.status === "waiting") {
            hasRooms = true;
            const card = document.createElement('div');
            card.className = 'game-card-main';
            card.innerHTML = `
                <div class="room-info">
                    <b>Ставка: ${room.bet} ⭐</b><br>
                    <small>Создатель: ${room.creator_name}</small>
                </div>
                <button class="btn-play" onclick="joinRoom('${id}')">ВХОД</button>
            `;
            container.appendChild(card);
        }
    });
    if (!hasRooms) container.innerHTML = `<p style="text-align:center; opacity:0.5;">Нет активных игр.</p>`;
}
