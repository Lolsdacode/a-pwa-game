const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state variables
let gridCount = 20;
let tileSize;
let snake, direction, nextDirection, food, enemies, projectiles;
let score, level, xp, xpNeeded, hp;
let gameInterval, isPaused;

// Upgrade mechanics
let attackSpeed = 0; // chance to auto-fire fireballs
let shieldCount = 0;
let hasSpikes = false;

const upgradesPool = [
    { id: 'hp', title: '+1 Heart', desc: 'Heals 1 lost health point' },
    { id: 'fireball', title: 'Fireball Staff', desc: 'Periodically shoots fireballs at enemies' },
    { id: 'shield', title: 'Energy Shield', desc: 'Absorbs 1 instance of wall or enemy collision damage' },
    { id: 'spikes', title: 'Plasma Spikes', desc: 'Destroying food also kills adjacent enemies' }
];

function initGame() {
    resizeCanvas();
    snake = [{x: 10, y: 10}];
    direction = {x: 0, y: -1};
    nextDirection = {x: 0, y: -1};
    food = getRandomGridPosition();
    enemies = [];
    projectiles = [];
    score = 0; level = 1; xp = 0; xpNeeded = 3; hp = 3;
    attackSpeed = 0; shieldCount = 0; hasSpikes = false;
    isPaused = false;
    
    updateHUD();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    
    if(gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 150);
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    tileSize = Math.floor(canvas.width / gridCount);
}

function gameLoop() {
    if (isPaused) return;
    
    // Update snake vector direction
    direction = nextDirection;
    
    // Calculate new head position
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    
    // Wall Collision with Roguelike Shield Check
    if (head.x < 0 || head.x >= gridCount || head.y < 0 || head.y >= gridCount) {
        if (shieldCount > 0) {
            shieldCount--;
            bounceBack();
            updateHUD();
            return;
        } else {
            gameOver();
            return;
        }
    }

    // Self Collision
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
            gameOver();
            return;
        }
    }

    // Move Snake forward
    snake.unshift(head);

    // Eating food mechanics
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        xp++;
        if (hasSpikes) triggerSpikes(food);
        food = getRandomGridPosition();
        spawnEnemy();
        if (xp >= xpNeeded) {
            triggerLevelUp();
        }
    } else {
        snake.pop();
    }

    // Move & Check Projectiles
    projectiles.forEach((proj, pIdx) => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        if (proj.x < 0 || proj.x >= gridCount || proj.y < 0 || proj.y >= gridCount) {
            projectiles.splice(pIdx, 1);
        }
    });

    // Enemy handling & combat loops
    enemies.forEach((enemy, eIdx) => {
        // Projectile hitting enemy
        projectiles.forEach((proj, pIdx) => {
            if (Math.floor(proj.x) === enemy.x && Math.floor(proj.y) === enemy.y) {
                enemies.splice(eIdx, 1);
                projectiles.splice(pIdx, 1);
                score += 5;
            }
        });

        // Snake hitting enemy
        if (head.x === enemy.x && head.y === enemy.y) {
            enemies.splice(eIdx, 1);
            if (shieldCount > 0) {
                shieldCount--;
            } else {
                hp--;
                if (hp <= 0) gameOver();
            }
        }
    });

    // Random Roguelike Passive Trigger: Auto-Shoot Fireballs
    if (attackSpeed > 0 && Math.random() < attackSpeed && enemies.length > 0) {
        fireProjectiles();
    }

    updateHUD();
    draw();
}

function bounceBack() {
    nextDirection = { x: -direction.x, y: -direction.y };
}

function fireProjectiles() {
    const target = enemies[0];
    const head = snake[0];
    const angle = Math.atan2(target.y - head.y, target.x - head.x);
    projectiles.push({
        x: head.x, y: head.y,
        vx: Math.cos(angle) * 0.5, vy: Math.sin(angle) * 0.5
    });
}

function triggerSpikes(pos) {
    enemies = enemies.filter(enemy => {
        const dist = Math.abs(enemy.x - pos.x) + Math.abs(enemy.y - pos.y);
        return dist > 2; // Kills any enemy near the eaten food
    });
}

function spawnEnemy() {
    if (Math.random() > 0.4) {
        let pos = getRandomGridPosition();
        // Prevent spawning directly on the snake head
        if (pos.x !== snake[0].x && pos.y !== snake[0].y) {
            enemies.push(pos);
        }
    }
}

function getRandomGridPosition() {
    return {
        x: Math.floor(Math.random() * gridCount),
        y: Math.floor(Math.random() * gridCount)
    };
}

function triggerLevelUp() {
    isPaused = true;
    level++;
    xp = 0;
    xpNeeded = Math.floor(xpNeeded * 1.5);
    
    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';
    
    // Choose 3 random unique cards to select from
    const shuffled = [...upgradesPool].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    shuffled.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-title">${upgrade.title}</div><div>${upgrade.desc}</div>`;
        card.onclick = () => applyUpgrade(upgrade.id);
        container.appendChild(card);
    });
    
    document.getElementById('upgrade-screen').classList.remove('hidden');
}

function applyUpgrade(id) {
    if (id === 'hp') hp = Math.min(hp + 1, 5);
    if (id === 'fireball') attackSpeed += 0.15;
    if (id === 'shield') shieldCount++;
    if (id === 'spikes') hasSpikes = true;
    
    document.getElementById('upgrade-screen').classList.add('hidden');
    isPaused = false;
}

function updateHUD() {
    document.getElementById('score-val').textContent = score;
    document.getElementById('level-val').textContent = level;
    document.getElementById('hp-val').textContent = "❤️".repeat(hp) + (shieldCount > 0 ? "🛡️" : "");
    const xpPercent = (xp / xpNeeded) * 100;
    document.getElementById('xp-bar').style.width = `${xpPercent}%`;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Food
    ctx.fillStyle = '#ff007f';
    ctx.shadowBlur = 10; ctx.shadowColor = '#ff007f';
    ctx.fillRect(food.x * tileSize + 2, food.y * tileSize + 2, tileSize - 4, tileSize - 4);
    
    // Draw Enemies
    ctx.fillStyle = '#a124db';
    ctx.shadowColor = '#a124db';
    enemies.forEach(enemy => {
        ctx.fillRect(enemy.x * tileSize + 4, enemy.y * tileSize + 4, tileSize - 8, tileSize - 8);
    });

    // Draw Fireball Projectiles
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    projectiles.forEach(proj => {
        ctx.beginPath();
        ctx.arc(proj.x * tileSize + tileSize/2, proj.y * tileSize + tileSize/2, tileSize/4, 0, Math.PI*2);
        ctx.fill();
    });
    
    // Draw Snake
    ctx.shadowBlur = 4;
    snake.forEach((part, index) => {
        ctx.fillStyle = index === 0 ? '#00ffcc' : '#00b3b3';
        ctx.shadowColor = '#00ffcc';
        ctx.fillRect(part.x * tileSize + 1, part.y * tileSize + 1, tileSize - 2, tileSize - 2);
    });
    ctx.shadowBlur = 0; // Reset canvas glow
}

function gameOver() {
    clearInterval(gameInterval);
    document.getElementById('final-lvl').textContent = level;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

// COMPUTER CONTROLS (Keyboard Input)
window.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) nextDirection = { x: 0, y: -1 }; break;
        case 'ArrowDown': if (direction.y === 0) nextDirection = { x: 0, y: 1 }; break;
        case 'ArrowLeft': if (direction.x === 0) nextDirection = { x: -1, y: 0 }; break;
        case 'ArrowRight': if (direction.x === 0) nextDirection = { x: 1, y: 0 }; break;
    }
});

// MOBILE CONTROLS (Touch Swipe Controls)
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: true});

window.addEventListener('touchend', e => {
    let diffX = e.changedTouches[0].screenX - touchStartX;
    let diffY = e.changedTouches[0].screenY - touchStartY;
    
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > 30) {
            if (diffX > 0 && direction.x === 0) nextDirection = { x: 1, y: 0 };
            else if (diffX < 0 && direction.x === 0) nextDirection = { x: -1, y: 0 };
        }
    } else {
        if (Math.abs(diffY) > 30) {
            if (diffY > 0 && direction.y === 0) nextDirection = { x: 0, y: 1 };
            else if (diffY < 0 && direction.y === 0) nextDirection = { x: 0, y: -1 };
        }
    }
}, {passive: true});

document.getElementById('restart-btn').addEventListener('click', initGame);
window.addEventListener('resize', () => { resizeCanvas(); draw(); });

initGame();
