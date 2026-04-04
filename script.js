const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const params = new URLSearchParams(window.location.search);
const user = tg.initDataUnsafe?.user;

// Баланс берем ТОЛЬКО из параметров ссылки
let currentBalance = parseInt(params.get('bal')) || 0;

// А start_param используем для спец. команд (например, забрать выигрыш)
let startParam = tg.initDataUnsafe?.start_param; 

let activeRooms = {};
// ... остальные переменные (isMyTurn, canClick и т.д.) без изменений
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
    const nameEl = document.getElementById('username');
    const balEl = document.getElementById('balance_val');

    // Ставим баланс
    if (balEl) balEl.innerText = currentBalance;

    // Ставим имя (если есть данные от TG)
    const user = tg.initDataUnsafe?.user;
    if (user && nameEl) {
        nameEl.innerText = user.first_name || user.username || "Игрок";
    }
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

    if (tabId === 'tab-rating') {
        loadTopUsers();
    }
    
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
// --- 6. СИНХРОНИЗАЦИЯ И ОТРИСОВКА ---

let syncInterval; 

function startSync() {
    // Чистая функция: только опрос сервера во время игры
    syncInterval = setInterval(async () => {
        const data = await apiCall('api', { 
            action: 'get_state', 
            room_id: params.get('room_id'),
            t: Date.now() 
        });

        if (!data || !data.scores) return;
        serverFlipped = data.flipped || [];
        
        if (data.status === 'finished') {
            clearInterval(syncInterval); 
            canClick = false;
            isMyTurn = false;

            const winnerId = data.winner;
            const isWinner = (winnerId == user?.id);
            let statusText = winnerId === 'draw' ? "НИЧЬЯ! 😎" : (isWinner ? "ТЫ ПОБЕДИЛ! 🏆" : "ТЫ ПРОИГРАЛ... 💀");
            
            const turnTxt = document.getElementById('turn-text');
            if (turnTxt) {
                turnTxt.style.color = "gold";
                turnTxt.innerHTML = `
                    <div style="font-size: 20px; margin-bottom: 5px;">${statusText}</div>
                    ${isWinner ? 
                        `<button id="claim-btn" style="margin-top:10px; padding:10px 20px; background:linear-gradient(to bottom, #ffeb3b, #fbc02d); border:none; border-radius:8px; color:black; font-weight:bold; cursor:pointer; box-shadow: 0 4px #f57f17;">ПОЛУЧИТЬ ВЫИГРЫШ</button>` : 
                        `<button id="exit-btn" style="margin-top:10px; padding:8px 25px; background:#555; border:none; border-radius:8px; color:white; cursor:pointer;">В ЛОББИ</button>`
                    }
                `;

                const claimBtn = document.getElementById('claim-btn');
                if (claimBtn) {
                    claimBtn.onclick = async () => {
                        claimBtn.innerText = "ОБРАБОТКА...";
                        claimBtn.disabled = true;
                        const res = await apiCall('api', { action: 'claim_win', room_id: params.get('room_id'), user_id: user?.id });
                        if (res && res.ok) {
                            tg.showAlert("Победа! Баланс обновлен.");
                            tg.close();
                        } else {
                            tg.showAlert("Ошибка: " + (res?.error || "Попробуйте позже"));
                            claimBtn.disabled = false;
                            claimBtn.innerText = "ПОЛУЧИТЬ ВЫИГРЫШ";
                        }
                    };
                }
                const exitBtn = document.getElementById('exit-btn');
                if (exitBtn) exitBtn.onclick = () => exitToBot();
            }
            renderFinalCards(data);
            return; 
        }

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

// --- 7. ТОЧКА ВХОДА (RUN) ---

// 1. Проверяем startParam сразу при загрузке
// --- 7. ТОЧКА ВХОДА (RUN) ---
window.onload = () => {
    // 1. Проверяем, пришел ли пользователь по ссылке "Забрать выигрыш"
    if (startParam && startParam.startsWith('room_')) {
        tg.showConfirm("Забрать ваш выигрыш?", async (ok) => {
            if (ok) {
                const res = await apiCall('api', { 
                    action: 'claim_win', 
                    room_id: startParam, 
                    user_id: user?.id 
                });
                if (res && res.ok) {
                    tg.showAlert("Звёзды зачислены!");
                    // Обновляем баланс на экране, если элемент существует
                    const balEl = document.getElementById('balance_val');
                    if (res.new_balance && balEl) balEl.innerText = res.new_balance;
                } else {
                    tg.showAlert("Ошибка: " + (res?.error || "Не удалось забрать"));
                }
            }
        });
    }

    // 2. Решаем, что показать пользователю
    if (params.get('mode') === 'battle') {
        // Если в ссылке есть mode=battle, запускаем саму игру
        startMemoryGame();
    } else {
        // Иначе просто обновляем список доступных комнат в лобби
        updateRoomsData();
    }
};
