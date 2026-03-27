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
let isMyTurn = false;
let myPoints = 0;
let enemyPoints = 0;
let lastUpdateHash = ""; // Чтобы не перерисовывать, если ничего не изменилось


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

// --- ОБНОВЛЕННАЯ ЛОГИКА ИГРЫ (2 ЭТАПА ПО 10 СЕКУНД) ---
// Вставь эту функцию вместо старой startMemoryGame и удали дубликаты таймеров под ней
function startMemoryGame() {
    // --- 1. ПОДГОТОВКА ЭКРАНА ---
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.querySelector('.bottom-nav').style.display = 'none';
    
    const grid = document.getElementById('memory-grid');
    const status = document.getElementById('game-status');
    const bar = document.getElementById('timer-bar');
    const insLayer = document.getElementById('instruction-layer');
    
    grid.innerHTML = '';
    grid.style.opacity = '1'; // Сразу делаем видимой, чтобы видеть карты при запоминании
    canClick = false;

    // Перемешиваем эмодзи
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);

    // --- 2. СОЗДАНИЕ КАРТОЧЕК ---
    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped'; // Начинаем с открытых для фазы запоминания
        card.innerHTML = `
            <div class="card-front">${emoji}</div>
            <div class="card-back"></div>
        `;
        card.dataset.emoji = emoji;
        
        card.onclick = () => {
            // Если сейчас НЕ наш ход, или фаза запоминания еще идет, или карта уже открыта — выходим
            if (!canClick || !isMyTurn || card.classList.contains('matched') || card.classList.contains('flipped')) {
                return;
            }

            // Визуально открываем
            card.classList.add('flipped');
            flippedCards.push(card);

            const cardIndex = Array.from(grid.children).indexOf(card);
            
            // Отправляем ход на сервер
            apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user.id,
                index: cardIndex
            }).then(response => {
                if (response && response.result === 'mismatch') {
                    // Если не совпало, блокируем ход
                    isMyTurn = false;
                    setTimeout(() => {
                        flippedCards.forEach(c => c.classList.remove('flipped'));
                        flippedCards = [];
                    }, 1000);
                } else if (response && response.result === 'match') {
                    // Если совпало, помечаем как найденные
                    flippedCards.forEach(c => c.classList.add('matched'));
                    flippedCards = [];
                }
            });
        };
        grid.appendChild(card);
    });

    // --- 3. ЦИКЛ ФАЗ (ТАЙМЕРЫ) ---
    
    // ФАЗА 1: ИНСТРУКЦИЯ (5 секунд)
    status.innerText = "ПРАВИЛА ИГРЫ 🧠";
    if (insLayer) {
        insLayer.style.display = 'block';
        insLayer.style.pointerEvents = 'auto';
    }

    runUniversalTimer(5, () => {
        // ФАЗА 2: ЗАПОМИНАНИЕ (7 секунд)
        if (insLayer) {
            insLayer.style.display = 'none';
            insLayer.style.pointerEvents = 'none'; // Убираем невидимый блок
        }
        status.innerText = "ЗАПОМИНАЙ КАРТЫ! 👀";

        runUniversalTimer(7, () => {
            // ФАЗА 3: НАЧАЛО БОЯ
            status.innerText = "БОЙ НАЧАЛСЯ!";
            
            // Переворачиваем все карточки рубашкой вверх
            document.querySelectorAll('.card').forEach(c => {
                c.classList.remove('flipped');
            });

            // Разрешаем клики и запускаем проверку ходов
            canClick = true; 
        });
    });
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
async function syncGameState() {
    if (params.get('mode') !== 'battle') return;

    const data = await apiCall('api', {
        action: 'get_state',
        room_id: params.get('room_id')
    });

    if (!data) return;

    // Сравниваем ID. Важно: используем == чтобы не зависеть от типа (строка/число)
    isMyTurn = (data.current_turn == user.id);
    
    // Если сейчас наш ход, разрешаем кликать (на случай если таймер завис)
    if (isMyTurn) {
        canClick = true; 
    }

    updateTurnUI(data);

    // Отображаем карты, открытые врагом
    if (data.opened_cards) {
        data.opened_cards.forEach(idx => {
            const cards = document.querySelectorAll('.card');
            if (cards[idx] && !cards[idx].classList.contains('flipped')) {
                cards[idx].classList.add('flipped');
            }
        });
    }

    // Обновляем счет
    const myScoreEl = document.getElementById('my-score');
    const enemyScoreEl = document.getElementById('enemy-score');
    if (myScoreEl) myScoreEl.innerText = data.scores[user.id] || 0;
    
    const enemyId = Object.keys(data.scores).find(id => id != user.id);
    if (enemyScoreEl && enemyId) enemyScoreEl.innerText = data.scores[enemyId] || 0;
}

// Запускаем опрос только в бою
if (params.get('mode') === 'battle') {
    setInterval(syncGameState, 1500); 
}

function updateTurnUI(data) {
    const turnText = document.getElementById('turn-text');
    const p1Box = document.getElementById('player1-box');
    const p2Box = document.getElementById('player2-box');

    // Определяем имя того, кто сейчас ходит
    let activeName = "Ожидание...";
    if (data.current_turn == user.id) {
        activeName = user.first_name + " (ВЫ)";
    } else {
        // Если сервер не прислал имя врага, пишем просто "Враг"
        activeName = data.current_turn_name || "Противник";
    }

    if (turnText) {
        turnText.innerText = `ХОДИТ: ${activeName}`;
        turnText.style.color = (data.current_turn == user.id) ? "#3498db" : "#e74c3c";
    }

    if (isMyTurn) {
        p1Box.style.opacity = "1";
        p1Box.style.borderBottom = "3px solid #3498db";
        p2Box.style.opacity = "0.5";
        p2Box.style.borderBottom = "none";
    } else {
        p1Box.style.opacity = "0.5";
        p1Box.style.borderBottom = "none";
        p2Box.style.opacity = "1";
        p2Box.style.borderBottom = "3px solid #e74c3c";
    }
}
// Функция для работы таймера и полоски
function runUniversalTimer(seconds, callback) {
    let timeLeft = seconds;
    const bar = document.getElementById('timer-bar');
    
    // Сбрасываем полоску на 100% в начале
    if (bar) bar.style.width = "100%";

    const interval = setInterval(() => {
        timeLeft -= 0.1;
        if (bar) {
            bar.style.width = (timeLeft / seconds) * 100 + "%";
        }

        if (timeLeft <= 0) {
            clearInterval(interval);
            callback(); // Выполняем действие по окончании времени
        }
    }, 100);
}
