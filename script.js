const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Данные пользователя
const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('username').innerText = user.first_name;
    document.getElementById('user_id').innerText = user.id;
}

// Баланс и комнаты
const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;
document.getElementById('balance_val').innerText = currentBalance;

let activeRooms = {};
try {
    const roomsParam = params.get('rooms');
    if (roomsParam) activeRooms = JSON.parse(decodeURIComponent(roomsParam));
} catch (e) {}

// Навигация
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

function createRoom(bet) {
    tg.showConfirm(`Создать комнату на ${bet} ⭐?`, (ok) => {
        if (ok) {
            tg.sendData(JSON.stringify({action: "create_room", game: selectedGame, bet: bet}));
            tg.close();
        }
    });
}

function renderRooms() {
    const container = document.getElementById('rooms-container');
    container.innerHTML = "";
    let hasRooms = false;
    Object.keys(activeRooms).forEach(id => {
        const room = activeRooms[id];
        if (room.status === "waiting") {
            hasRooms = true;
            const card = document.createElement('div');
            card.className = 'game-card-main';
            card.innerHTML = `<div><b>Ставка: ${room.bet} ⭐</b><br><small>Игрок: ${room.creator_name}</small></div>
                              <button class="btn-play" onclick="joinRoom('${id}')">ВХОД</button>`;
            container.appendChild(card);
        }
    });
    if (!hasRooms) container.innerHTML = '<div style="text-align:center;color:yellow;margin-top:30px;">Комнат нет</div>';
}

function joinRoom(roomId) {
    const room = activeRooms[roomId];
    if (currentBalance < room.bet) return tg.showAlert("Мало звёзд!");
    tg.showConfirm(`Играем на ${room.bet} ⭐?`, (ok) => {
        if (ok) {
            tg.sendData(JSON.stringify({action: "join_room", room_id: roomId}));
            tg.close();
        }
    });
}

// --- ЛОГИКА ИГРЫ MEMORY DUEL ---
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];
let flippedCards = [];
let canClick = false;

// Эту функцию бот должен будет вызвать через WebView (пока запускаем для теста)
function startMemoryGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = '';
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    
    gameCards.forEach((emoji, index) => {
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
                    flippedCards = []; canClick = true;
                    if (document.querySelectorAll('.card.flipped').length === 16) endGame(true);
                } else {
                    setTimeout(() => endGame(false), 600);
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
            document.getElementById('game-status').innerText = "Ваш ход!";
            canClick = true;
        }
    }, 100);
}

function endGame(win) {
    tg.showAlert(win ? "Победа! Все пары найдены." : "Ошибка! Вы проиграли.");
    tg.sendData(JSON.stringify({action: "game_result", result: win ? "win" : "lose"}));
    tg.close();
}