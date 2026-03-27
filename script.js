const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (ОБЪЯВЛЯЕМ В САМОМ НАЧАЛЕ) ---
const params = new URLSearchParams(window.location.search);
const user = tg.initDataUnsafe?.user;

// Баланс: приоритет на параметр от бота (start_param), потом на ссылку
let rawBal = tg.initDataUnsafe?.start_param || params.get('bal');
let currentBalance = parseInt(rawBal) || 0;

let activeRooms = {};
let isMyTurn = false;
let myPoints = 0;
let enemyPoints = 0;
let flippedCards = [];
let canClick = false;
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];

// --- 2. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ---
function initUI() {
    if (user) {
        const nameEl = document.getElementById('username');
        const idEl = document.getElementById('user_id');
        if (nameEl) nameEl.innerText = user.first_name;
        if (idEl) idEl.innerText = user.id;
    }
    const balEl = document.getElementById('balance_val');
    if (balEl) balEl.innerText = currentBalance;
}

// Запускаем отрисовку данных пользователя сразу
document.addEventListener('DOMContentLoaded', initUI);

// --- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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

function runUniversalTimer(seconds, callback) {
    let timeLeft = seconds;
    const bar = document.getElementById('timer-bar');
    if (bar) bar.style.width = "100%";
    const interval = setInterval(() => {
        timeLeft -= 0.1;
        if (bar) bar.style.width = (timeLeft / seconds) * 100 + "%";
        if (timeLeft <= 0) {
            clearInterval(interval);
            callback();
        }
    }, 100);
}

// --- 4. СИСТЕМА КОМНАТ ---
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

function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    tg.sendData(JSON.stringify({ action: "create_room", bet: parseInt(bet) }));
    tg.close(); 
}

function joinRoom(roomId) {
    tg.sendData(JSON.stringify({ action: "join_room", room_id: roomId }));
    tg.close();
}

// --- 5. ЛОГИКА ИГРЫ MEMORY ---
function startMemoryGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.querySelector('.bottom-nav').style.display = 'none';
    
    const grid = document.getElementById('memory-grid');
    const status = document.getElementById('game-status');
    const insLayer = document.getElementById('instruction-layer');
    
    grid.innerHTML = '';
    grid.style.opacity = '1';
    canClick = false;

    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);

    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped';
        card.innerHTML = `<div class="card-front">${emoji}</div><div class="card-back"></div>`;
        
        card.onclick = () => {
            if (!canClick || !isMyTurn || card.classList.contains('matched') || card.classList.contains('flipped')) return;
            card.classList.add('flipped');
            flippedCards.push(card);
            const cardIndex = Array.from(grid.children).indexOf(card);
            
            apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user?.id,
                index: cardIndex
            }).then(response => {
                if (response?.result === 'mismatch') {
                    isMyTurn = false;
                    setTimeout(() => {
                        flippedCards.forEach(c => c.classList.remove('flipped'));
                        flippedCards = [];
                    }, 1000);
                } else if (response?.result === 'match') {
                    flippedCards.forEach(c => c.classList.add('matched'));
                    flippedCards = [];
                }
            });
        };
        grid.appendChild(card);
    });

    status.innerText = "ПРАВИЛА ИГРЫ 🧠";
    if (insLayer) insLayer.style.display = 'block';

    runUniversalTimer(5, () => {
        if (insLayer) insLayer.style.display = 'none';
        status.innerText = "ЗАПОМИНАЙ КАРТЫ! 👀";
        runUniversalTimer(7, () => {
            status.innerText = "БОЙ НАЧАЛСЯ!";
            document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
            canClick = true; 
        });
    });
}

async function syncGameState() {
    if (params.get('mode') !== 'battle') return;
    const data = await apiCall('api', { action: 'get_state', room_id: params.get('room_id') });
    if (!data) return;

    isMyTurn = (data.current_turn == user?.id);
    updateTurnUI(data);

    if (data.opened_cards) {
        const cards = document.querySelectorAll('.card');
        data.opened_cards.forEach(idx => {
            if (cards[idx] && !cards[idx].classList.contains('flipped')) {
                cards[idx].classList.add('flipped');
            }
        });
    }

    const myScoreEl = document.getElementById('my-score');
    const enemyScoreEl = document.getElementById('enemy-score');
    if (myScoreEl) myScoreEl.innerText = data.scores[user?.id] || 0;
    const enemyId = Object.keys(data.scores).find(id => id != user?.id);
    if (enemyScoreEl && enemyId) enemyScoreEl.innerText = data.scores[enemyId] || 0;
}

function updateTurnUI(data) {
    const turnText = document.getElementById('turn-text');
    let activeName = (data.current_turn == user?.id) ? user.first_name + " (ВЫ)" : (data.current_turn_name || "Противник");
    if (turnText) {
        turnText.innerText = `ХОДИТ: ${activeName}`;
        turnText.style.color = (data.current_turn == user?.id) ? "#3498db" : "#e74c3c";
    }
}

// --- 6. ЗАПУСК ПРОЦЕССОВ ---
if (params.get('mode') === 'battle') {
    startMemoryGame();
    setInterval(syncGameState, 1500);
} else {
    updateRoomsData();
    setInterval(updateRoomsData, 5000);
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
    tg.HapticFeedback.impactOccurred('light');
}
// --- ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА (ДОБАВЬ В КОНЕЦ) ---

let selectedGame = "";

function openGameLobby(gameName) {
    selectedGame = gameName;
    const titleEl = document.getElementById('lobby-title');
    const lobbyEl = document.getElementById('lobby-screen');
    const navEl = document.querySelector('.bottom-nav');
    
    if (titleEl) titleEl.innerText = gameName;
    if (lobbyEl) lobbyEl.style.display = 'block';
    if (navEl) navEl.style.display = 'none';
    
    renderRooms();
}

function closeGameLobby() {
    const lobbyEl = document.getElementById('lobby-screen');
    const navEl = document.querySelector('.bottom-nav');
    
    if (lobbyEl) lobbyEl.style.display = 'none';
    if (navEl) navEl.style.display = 'flex';
}

// Функции для модального окна создания комнаты
function openCreateModal() { 
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'flex'; 
}

function closeCreateModal() { 
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none'; 
}
