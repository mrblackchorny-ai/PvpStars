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
let serverFlipped = [];
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

async function startMemoryGame() {
    const grid = document.getElementById('memory-grid');
    const timerBar = document.getElementById('timer-bar');
    const status = document.getElementById('game-status');
    const instruction = document.getElementById('instruction-layer');
    const screen = document.getElementById('game-screen');

    // Показываем экран игры и сбрасываем сетку
    screen.style.display = 'flex';
    grid.innerHTML = '';
    grid.style.opacity = '1';
    const data = await apiCall('api', { action: 'get_state', room_id: params.get('room_id'), user_id: user?.id });
    data.board.forEach((emoji, idx) => {
        const card = document.createElement('div');
        card.className = 'card'; 
        card.innerHTML = `<div class="card-front">${emoji}</div><div class="card-back"></div>`;
        grid.appendChild(card);
    });

    // --- ЭТАП 1: ИНСТРУКЦИЯ (10 секунд) ---
    instruction.style.display = 'block';
    status.innerText = "ПРАВИЛА БОЯ";
    let progress = 100;

    const phase1 = setInterval(() => {
        progress -= 1; // Уменьшаем полоску
        timerBar.style.width = progress + "%";

        if (progress <= 0) {
            clearInterval(phase1);
            startPhase2(); // Переходим к запоминанию
        }
    }, 100); // 100 шагов по 0.1 сек = 10 сек

    // --- ЭТАП 2: ЗАПОМИНАНИЕ (10 секунд) ---
    function startPhase2() {
        instruction.style.display = 'none';
        status.innerText = "ЗАПОМИНАЙ КАРТОЧКИ!";
        progress = 100;
        
        // Переворачиваем все карты лицом вверх
        document.querySelectorAll('.card').forEach(c => c.classList.add('flipped'));

        const phase2 = setInterval(() => {
            progress -= 1;
            timerBar.style.width = progress + "%";

            if (progress <= 0) {
                clearInterval(phase2);
                startBattle(); // Начинаем саму игру
            }
        }, 100);
    }

    // --- ЭТАП 3: НАЧАЛО ИГРЫ ---
    function startBattle() {
        status.innerText = "БОЙ НАЧАЛСЯ!";
        timerBar.parentElement.style.display = 'none'; // Прячем полоску
        
        // Закрываем все карты назад
        document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
        
        // Разрешаем кликать
        canClick = true;
        isMyTurn = true; // Для теста ставим true, потом свяжем с сервером
        
        // Активируем клики по картам
        setupCardLogic();
        startSync();
    }
}

function setupCardLogic() {
    const cards = document.querySelectorAll('.card');
    
    cards.forEach((card, index) => {
        card.onclick = async () => {
            // 1. Проверяем, можно ли вообще кликать
            // Мы не даем кликнуть, если:
            // - Сейчас не твой ход (isMyTurn === false)
            // - Карта уже открыта (flipped)
            // - Карта уже отгадана (matched)
            // - Уже открыты две карты (ждем их закрытия сервером)
            if (!isMyTurn || card.classList.contains('flipped') || card.classList.contains('matched') || serverFlipped.length >= 2) {
                console.log("Клик заблокирован: ход врага или карта открыта");
                return;
            }

            // 2. Визуально переворачиваем сразу для скорости (предугадываем успех)
            card.classList.add('flipped');
            
            // 3. Отправляем запрос на сервер
            const response = await apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user?.id,
                index: index
            });

            // 4. Если сервер сказал, что ход невозможен — возвращаем карту назад
            if (!response || response.error) {
                card.classList.remove('flipped');
                console.log("Сервер отклонил ход:", response?.error);
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
    // Ускоряем до 400мс, чтобы игра была "живой"
    setInterval(async () => {
        const data = await apiCall('api', { 
            action: 'get_state', 
            room_id: params.get('room_id'),
            t: Date.now() // Защита от кэширования
        });

        if (!data || !data.scores) return;
        
        // 1. ПРОВЕРКА КОНЦА ИГРЫ
        if (data.status === 'finished') {
            canClick = false;
            isMyTurn = false;
            const winnerId = data.winner;
            const isWinner = (winnerId == user?.id);
            const winMsg = winnerId === 'draw' ? "НИЧЬЯ! 😎" : (isWinner ? "ТЫ ПОБЕДИЛ! 🏆" : "ТЫ ПРОИГРАЛ... 💀");
            
            const turnTxt = document.getElementById('turn-text');
            if (turnTxt) {
                turnTxt.style.color = "gold";
                // ВАЖНО: Весь этот блок заменяет содержимое элемента turn-text
                turnTxt.innerHTML = `
                    <div style="font-size: 22px; margin-bottom: 5px;">${winMsg}</div>
                    <div style="font-size: 16px; color: white;">Выигрыш: <b>${data.win_amount} ⭐</b></div>
                    <button id="exit-btn" style="margin-top:10px; padding:8px 25px; background:#00ff00; border:none; border-radius:8px; color:black; font-weight:bold; cursor:pointer;">В ЛОББИ</button>
                `;

                // Принудительно вешаем событие на кнопку после её создания
                const btn = document.getElementById('exit-btn');
                if (btn) {
                    btn.onclick = () => exitToBot();
                }
            }
            renderFinalCards(data);
            return; 
        }

        // 2. Обновляем статус хода и счет (если игра еще идет)
        isMyTurn = (data.current_turn == user?.id);

        const myScoreEl = document.getElementById('my-score');
        const enemyScoreEl = document.getElementById('enemy-score');
        if (myScoreEl) myScoreEl.innerText = data.scores[user?.id] || 0;
        
        const enemyId = Object.keys(data.scores).find(id => id != user?.id);
        if (enemyId && enemyScoreEl) enemyScoreEl.innerText = data.scores[enemyId] || 0;

        const turnTxt = document.getElementById('turn-text');
        if (turnTxt) {
            turnTxt.innerText = isMyTurn ? "ТВОЙ ХОД!" : "ОЖИДАНИЕ ВРАГА...";
            turnTxt.style.color = isMyTurn ? "#00ff00" : "#ff0000";
        }

        // 3. СИНХРОНИЗАЦИЯ КАРТ
        renderFinalCards(data);

    }, 400);
}

// Вынес отрисовку в отдельную мини-функцию, чтобы не дублировать код
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
