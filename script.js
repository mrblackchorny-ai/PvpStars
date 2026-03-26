const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- ИНИЦИАЛИЗАЦИЯ ДАННЫХ ---
const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('username').innerText = user.first_name;
    document.getElementById('user_id').innerText = user.id;
}

const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;
document.getElementById('balance_val').innerText = currentBalance;

let activeRooms = {};

// Вспомогательная функция для запросов к API
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
        if (!response.ok) throw new Error('Ошибка сервера');
        
        activeRooms = await response.json();
        renderRooms(); 
    } catch (e) {
        console.error("Ошибка обновления комнат:", e);
    }
}

setInterval(updateRoomsData, 5000);
updateRoomsData();

// --- НАВИГАЦИЯ ---
function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
    tg.HapticFeedback.impactOccurred('light');
}

let selectedGame = "";
function openGameLobby(gameName) {
    selectedGame = gameName;
    document.getElementById('lobby-title').innerText = gameName;
    document.getElementById('lobby-screen').style.display = 'block';
    document.querySelector('.bottom-nav').style.display = 'none';
    renderRooms();
}

function closeGameLobby() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.querySelector('.bottom-nav').style.display = 'flex';
}

function openCreateModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function closeCreateModal() { document.getElementById('modal-overlay').style.display = 'none'; }

// --- ЛОГИКА ВЗАИМОДЕЙСТВИЯ (ОТКАТ К РАБОЧЕМУ TG.SENDDATA) ---
function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    
    // Вместо fetch используем sendData, чтобы бот увидел кнопку
    tg.sendData(JSON.stringify({
        action: "create_room",
        bet: parseInt(bet)
    }));
    
    // Закрываем мини-апп, чтобы бот прислал ответное сообщение
    tg.close(); 
}

function joinRoom(roomId) {
    const room = activeRooms[roomId]; // Проверь, что имя совпадает с тем, что в renderRooms
    
    if (!room) return tg.showAlert("Комната не найдена");

    // ОТПРАВКА ДАННЫХ
    tg.sendData(JSON.stringify({
        action: "join_room",      // Бот ищет именно это слово
        room_id: roomId           // И этот ID
    }));
    
    tg.close();
}
// --- ОТРИСОВКА ---
function renderRooms() {
    const container = document.getElementById('rooms-container');
    if (!container) return;
    
    container.innerHTML = "";
    let hasRooms = false;

    Object.keys(activeRooms).forEach(id => {
        const room = activeRooms[id];
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

    if (!hasRooms) {
        container.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.5); margin-top:50px;"><p>Пока нет активных игр.</p></div>`;
    }
}

// --- ЛОГИКА ИГРЫ MEMORY DUEL ---
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
    grid.innerHTML = '';
    
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    
    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped';
        card.innerHTML = `<div class="card-front">${emoji}</div><div class="card-back"></div>`;
        card.dataset.emoji = emoji;
        
        card.onclick = () => {
            if (!canClick || card.classList.contains('flipped') || flippedCards.length >= 2) return;
            card.classList.add('flipped');
            flippedCards.push(card);
            if (flippedCards.length === 2) {
                canClick = false;
                if (flippedCards[0].dataset.emoji === flippedCards[1].dataset.emoji) {
                    flippedCards = []; 
                    canClick = true;
                    if (document.querySelectorAll('.card.flipped').length === 16) {
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

    let timeLeft = 10;
    const bar = document.getElementById('timer-bar');
    const timer = setInterval(() => {
        timeLeft -= 0.1;
        bar.style.width = (timeLeft / 10) * 100 + "%";
        if (timeLeft <= 0) {
            clearInterval(timer);
            document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
            document.getElementById('game-status').innerText = "Ваш ход! Найдите пары";
            canClick = true;
        }
    }, 100);
}

// --- ФИНАЛ ИГРЫ (ИСПРАВЛЕНО) ---
async function endGame(win) {
    const bet = params.get('bet') || 0;
    tg.showPopup({
        title: win ? "ПОБЕДА! 🏆" : "ПОРАЖЕНИЕ",
        message: win ? `Вы нашли все пары!` : "Время вышло.",
        buttons: [{type: "ok"}]
    }, async () => {
        // Отправляем результат на сервер
        await apiCall('api', {
            action: 'result',
            user_id: user.id,
            status: win ? 'win' : 'lose',
            bet: bet
        });
        tg.close();
    });
}
