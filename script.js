const API_URL = "https://DoggyJoggy.pythonanywhere.com/rooms";
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

// --- СИСТЕМА ОБНОВЛЕНИЯ КОМНАТ (API) ---
async function updateRoomsData() {
    try {
        const response = await fetch(`${API_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Ошибка сервера');
        
        activeRooms = await response.json();
        console.log("Комнаты загружены:", activeRooms);

        // Убираем условие IF, чтобы комнаты отрисовывались сразу
        renderRooms(); 
        
    } catch (e) {
        console.error("Ошибка обновления комнат:", e);
    }
}

// Запускаем цикл обновления (каждые 5 секунд)
setInterval(updateRoomsData, 5000);
updateRoomsData(); // Первый запуск сразу

// --- НАВИГАЦИЯ И ИНТЕРФЕЙС ---
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

// --- ЛОГИКА ВЗАИМОДЕЙСТВИЯ С БОТОМ ---
function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    
    tg.showConfirm(`Создать комнату на ${bet} ⭐?`, (ok) => {
        if (ok) {
            // Вместо sendData используем закрытие с передачей параметров в бота через URL или просто уведомление
            // Для Mini App открытых через Inline кнопки, лучший способ - отправить запрос на твой сервер
            fetch(`https://DoggyJoggy.pythonanywhere.com/create?user_id=${user.id}&bet=${bet}&game=${selectedGame}`)
                .then(() => {
                    tg.close();
                });
        }
    });
}

function joinRoom(roomId) {
    const room = activeRooms[roomId];
    if (!room) return tg.showAlert("Комната уже занята!");
    if (currentBalance < room.bet) return tg.showAlert("Мало звёзд!");

    tg.showConfirm(`Играем против ${room.creator_name} на ${room.bet} ⭐?`, (ok) => {
        if (ok) {
            tg.sendData(JSON.stringify({
                action: "join_room", 
                room_id: roomId
            }));
            tg.close();
        }
    });
}

// --- ОТРИСОВКА СПИСКА КОМНАТ ---
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
        container.innerHTML = `
            <div style="text-align:center; color:rgba(255,255,255,0.5); margin-top:50px;">
                <p>Пока нет активных игр.</p>
                <p style="font-size: 0.8em;">Будь первым — создай свою!</p>
            </div>`;
    }
}

// --- ЛОГИКА ИГРЫ MEMORY DUEL ---
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];
let flippedCards = [];
let canClick = false;

// Эта функция вызывается, когда оба игрока подтвердили участие (через URL параметр mode=battle)
if (params.get('mode') === 'battle') {
    startMemoryGame();
}

function startMemoryGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.querySelector('.bottom-nav').style.display = 'none';
    
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = '';
    
    // Перемешиваем карточки
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    
    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped'; // Сначала показываем рубашкой вниз
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
                    // Проверка на победу
                    if (document.querySelectorAll('.card.flipped').length === 16) {
                        setTimeout(() => endGame(true), 500);
                    }
                } else {
                    // Если не совпали — закрываем через 0.6 сек
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

    // Таймер на запоминание (10 секунд)
    let timeLeft = 10;
    const bar = document.getElementById('timer-bar');
    const timer = setInterval(() => {
        timeLeft -= 0.1;
        bar.style.width = (timeLeft / 10) * 100 + "%";
        if (timeLeft <= 0) {
            clearInterval(timer);
            // Переворачиваем все карты рубашкой вверх через 10 сек
            document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
            document.getElementById('game-status').innerText = "Ваш ход! Найдите пары";
            canClick = true;
        }
    }, 100);
}

function endGame(win) {
    const bet = params.get('bet') || 0;
    tg.showPopup({
        title: win ? "ПОБЕДА! 🏆" : "ПОРАЖЕНИЕ",
        message: win ? `Вы нашли все пары! Результат отправлен боту.` : "Время вышло или ошибка.",
        buttons: [{type: "ok"}]
    }, () => {
        tg.sendData(JSON.stringify({
            action: "game_result", 
            status: win ? "win" : "lose",
            bet: bet
        }));
        tg.close();
    });
}
