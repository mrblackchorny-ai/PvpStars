const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const params = new URLSearchParams(window.location.search);
const user = tg.initDataUnsafe?.user;

// Пробуем достать баланс отовсюду
let rawBal = params.get('bal') || tg.initDataUnsafe?.start_param;
let currentBalance = parseInt(rawBal) || 0;

let activeRooms = {};
let isMyTurn = false;
let canClick = false;
let flippedCards = [];
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];

// --- 2. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ---
function initUI() {
    console.log("UI Initializing...");
    if (user) {
        const nameEl = document.getElementById('username');
        const idEl = document.getElementById('user_id');
        if (nameEl) nameEl.innerText = user.first_name;
        if (idEl) idEl.innerText = user.id;
    }
    const balEl = document.getElementById('balance_val');
    if (balEl) balEl.innerText = currentBalance;
}

// Ждем загрузку DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}

// --- 3. НАВИГАЦИЯ И ОКНА (ТО ЧТО НЕ ОТКРЫВАЛОСЬ) ---
let selectedGame = "";

function openGameLobby(gameName) {
    console.log("Opening lobby for:", gameName);
    selectedGame = gameName;
    
    const lobbyTitle = document.getElementById('lobby-title');
    const lobbyScreen = document.getElementById('lobby-screen');
    const bottomNav = document.querySelector('.bottom-nav');

    if (lobbyTitle) lobbyTitle.innerText = gameName;
    if (lobbyScreen) lobbyScreen.style.display = 'block';
    if (bottomNav) bottomNav.style.display = 'none';
    
    updateRoomsData(); // Сразу обновляем список комнат
}

function closeGameLobby() {
    const lobbyScreen = document.getElementById('lobby-screen');
    const bottomNav = document.querySelector('.bottom-nav');
    
    if (lobbyScreen) lobbyScreen.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'flex';
}

function openCreateModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'flex';
}

function closeCreateModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');
    
    tg.HapticFeedback.impactOccurred('light');
}

// --- 4. РАБОТА С СЕРВЕРОМ (API) ---
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

async function updateRoomsData() {
    try {
        const response = await fetch(`${API_URL}/rooms?t=${Date.now()}`);
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
        container.innerHTML = `<div style="text-align:center; color:gray; margin-top:20px;">Пока нет игр. Создай свою!</div>`;
    }
}

// --- 5. ЛОГИКА ИГРЫ ---
function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    tg.sendData(JSON.stringify({ action: "create_room", bet: parseInt(bet) }));
    tg.close(); 
}

function joinRoom(roomId) {
    tg.sendData(JSON.stringify({ action: "join_room", room_id: roomId }));
    tg.close();
}

function startMemoryGame() {
    const gameScreen = document.getElementById('game-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    if (gameScreen) gameScreen.style.display = 'flex';
    if (lobbyScreen) lobbyScreen.style.display = 'none';

    const grid = document.getElementById('memory-grid');
    const status = document.getElementById('game-status');
    const insLayer = document.getElementById('instruction-layer');
    
    if (!grid) return;
    grid.innerHTML = '';
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
            
            apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user?.id,
                index: Array.from(grid.children).indexOf(card)
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

    if (insLayer) insLayer.style.display = 'block';
    status.innerText = "ЗАПОМИНАЙ!";

    setTimeout(() => {
        if (insLayer) insLayer.style.display = 'none';
        document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
        canClick = true;
        status.innerText = "ТВОЙ ХОД?";
    }, 5000);
}

// --- 6. ЗАПУСК ---
if (params.get('mode') === 'battle') {
    startMemoryGame();
    setInterval(async () => {
        const data = await apiCall('api', { action: 'get_state', room_id: params.get('room_id') });
        if (data) isMyTurn = (data.current_turn == user?.id);
    }, 2000);
} else {
    setInterval(updateRoomsData, 5000);
    updateRoomsData();
}
