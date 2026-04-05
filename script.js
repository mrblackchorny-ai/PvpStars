const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const params = new URLSearchParams(window.location.search);
const user = tg.initDataUnsafe?.user;
console.log("User data from TG:", user);
let rawBal = params.get('bal') || tg.initDataUnsafe?.start_param;
let currentBalance = parseInt(rawBal) || 0;

let activeRooms = {};
let isMyTurn = false;
let canClick = false;
let flippedCards = [];
let serverFlipped = [];
let gameFinishedShown = false; // Флаг чтобы экран финала показался только раз
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];

async function exitToBot() {
    console.log("Выход в бота...");
    try {
        await apiCall('api', { 
            action: 'game_finished', 
            room_id: params.get('room_id'),
            user_id: user?.id 
        });
    } catch(e) { console.log(e); }

    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.close();
    }
}

// --- 2. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ---
function initUI() {
    const nameEl = document.getElementById('username');
    const balEl = document.getElementById('balance_val');

    if (balEl) balEl.innerText = currentBalance;

    const user = tg.initDataUnsafe?.user;
    if (user && nameEl) {
        nameEl.innerText = user.first_name || user.username || "Игрок";
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}

// --- 3. НАВИГАЦИЯ ---
let selectedGame = "";

function openGameLobby(gameName) {
    selectedGame = gameName;
    const lobbyTitle = document.getElementById('lobby-title');
    const lobbyScreen = document.getElementById('lobby-screen');
    const bottomNav = document.querySelector('.bottom-nav');
    if (lobbyTitle) lobbyTitle.innerText = gameName;
    if (lobbyScreen) lobbyScreen.style.display = 'block';
    if (bottomNav) bottomNav.style.display = 'none';
    updateRoomsData();
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
    if (tabId === 'tab-rating') loadTopUsers();
    tg.HapticFeedback.impactOccurred('light');
}

// --- 4. API ---
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

async function startMemoryGame() {
    const grid = document.getElementById('memory-grid');
    const timerBar = document.getElementById('timer-bar');
    const status = document.getElementById('game-status');
    const instruction = document.getElementById('instruction-layer');
    const screen = document.getElementById('game-screen');

    screen.style.display = 'flex';
    grid.innerHTML = '';
    grid.style.opacity = '1';
    gameFinishedShown = false;

    const data = await apiCall('api', {
        action: 'get_state',
        room_id: params.get('room_id'),
        user_id: user?.id
    });

    data.board.forEach((emoji, idx) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-front">${emoji}</div><div class="card-back"></div>`;
        grid.appendChild(card);
    });

    // ЭТАП 1: Инструкция (10 сек)
    instruction.style.display = 'block';
    status.innerText = "ПРАВИЛА БОЯ";
    let progress = 100;
    const phase1 = setInterval(() => {
        progress -= 1;
        timerBar.style.width = progress + "%";
        if (progress <= 0) {
            clearInterval(phase1);
            startPhase2();
        }
    }, 100);

    // ЭТАП 2: Запоминание (10 сек)
    function startPhase2() {
        instruction.style.display = 'none';
        status.innerText = "ЗАПОМИНАЙ КАРТОЧКИ!";
        progress = 100;
        document.querySelectorAll('.card').forEach(c => c.classList.add('flipped'));
        const phase2 = setInterval(() => {
            progress -= 1;
            timerBar.style.width = progress + "%";
            if (progress <= 0) {
                clearInterval(phase2);
                startBattle();
            }
        }, 100);
    }

    // ЭТАП 3: Бой
    function startBattle() {
        status.innerText = "БОЙ НАЧАЛСЯ!";
        timerBar.parentElement.style.display = 'none';
        document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
        canClick = true;
        setupCardLogic();
        startSync();
    }
}

function setupCardLogic() {
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        card.onclick = async () => {
            if (!isMyTurn || card.classList.contains('flipped') || card.classList.contains('matched') || serverFlipped.length >= 2) {
                return;
            }
            card.classList.add('flipped');
            const response = await apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user?.id,
                index: index
            });
            if (!response || response.error) {
                card.classList.remove('flipped');
            }
        };
    });
}

// --- 6. ЗАПУСК ---
if (params.get('mode') === 'battle') {
    startMemoryGame();
} else {
    updateRoomsData();
}

function startSync() {
    const syncInterval = setInterval(async () => {
        const data = await apiCall('api', {
            action: 'get_state',
            room_id: params.get('room_id'),
            user_id: user?.id,
            t: Date.now()
        });

        if (!data || !data.scores) return;
        serverFlipped = data.flipped || [];

        // 1. ПРОВЕРКА КОНЦА ИГРЫ
        if (data.status === 'finished') {
            if (gameFinishedShown) return; // Уже показали — не трогаем
            gameFinishedShown = true;
            canClick = false;
            isMyTurn = false;
            clearInterval(syncInterval); // Останавливаем поллинг

            // Сначала рисуем финальные карты
            renderFinalCards(data);

            // Ждём анимацию переворота
            setTimeout(() => {
                const winnerId = data.winner;
                const myId = String(user?.id);
                const isWinner = (String(winnerId) === myId);
                const isDraw = (winnerId === 'draw');

                // *** КЛЮЧЕВАЯ ПРАВКА: каждый видит СВОЙ выигрыш ***
                let winMsg, winAmount;
                if (isDraw) {
                    winMsg = "НИЧЬЯ! 😎";
                    winAmount = data.win_amount; // ставка возвращается каждому
                } else if (isWinner) {
                    winMsg = "ТЫ ПОБЕДИЛ! 🏆";
                    winAmount = data.win_amount; // банк минус комиссия
                } else {
                    winMsg = "ТЫ ПРОИГРАЛ... 💀";
                    winAmount = 0; // проигравший не получает ничего
                }

                const turnTxt = document.getElementById('turn-text');
                if (turnTxt) {
                    turnTxt.style.color = isDraw ? "gold" : (isWinner ? "#00ff00" : "#ff4444");
                    turnTxt.innerHTML = `
                        <div style="font-size: 22px; margin-bottom: 5px;">${winMsg}</div>
                        <div style="font-size: 16px; color: white;">Выигрыш: <b>${winAmount} ⭐</b></div>
                        <button id="exit-btn" style="margin-top:10px; padding:8px 25px; background:#00ff00; border:none; border-radius:8px; color:black; font-weight:bold; cursor:pointer;">В ЛОББИ</button>
                    `;
                    const btn = document.getElementById('exit-btn');
                    if (btn) btn.onclick = () => exitToBot();
                }
            }, 900);

            return;
        }

        // 2. Обновляем счёт и ход
        isMyTurn = (String(data.current_turn) === String(user?.id));

        const myScoreEl = document.getElementById('my-score');
        const enemyScoreEl = document.getElementById('enemy-score');
        if (myScoreEl) myScoreEl.innerText = data.scores[user?.id] || 0;

        const enemyId = Object.keys(data.scores).find(id => String(id) !== String(user?.id));
        if (enemyId && enemyScoreEl) enemyScoreEl.innerText = data.scores[enemyId] || 0;

        const turnTxt = document.getElementById('turn-text');
        if (turnTxt) {
            turnTxt.innerText = isMyTurn ? "ТВОЙ ХОД!" : "ОЖИДАНИЕ ВРАГА...";
            turnTxt.style.color = isMyTurn ? "#00ff00" : "#ff0000";
        }

        // 3. Синхронизация карт
        renderFinalCards(data);

    }, 400);
}

function renderFinalCards(data) {
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, idx) => {
        const isMatched = data.matched && data.matched.includes(idx);
        const isFlippedNow = data.flipped && data.flipped.includes(idx);
        if (isMatched) {
            card.classList.add('flipped', 'matched');
        } else if (isFlippedNow) {
            card.classList.add('flipped');
        } else {
            card.classList.remove('flipped');
        }
    });
}

async function loadTopUsers() {
    const container = document.getElementById('top-users-list');
    if (!container) return;
    try {
        const data = await apiCall('api/top', { t: Date.now() });
        container.innerHTML = "";
        if (!data || data.length === 0) {
            container.innerHTML = `<div style="color:gray; text-align:center;">Тут пока пусто...</div>`;
            return;
        }
        data.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'top-user-item';
            let rank = index + 1;
            let icon = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "•";
            item.innerHTML = `
                <div class="top-user-name">
                    <span class="top-rank-icon">${icon}</span> 
                    @${player.username}
                </div>
                <div class="top-user-balance">${player.balance} ⭐</div>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        container.innerHTML = `<div style="color:red; text-align:center;">Топ временно недоступен</div>`;
    }
}
