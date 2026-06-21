const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state variables
let gridCount = 20;
let tileSize;
let snake, direction, nextDirection, food, enemies, projectiles, particles;
let score, level, xp, xpNeeded, hp;
let gameInterval, isPaused;

// Upgrade mechanics
let attackSpeed = 0; 
let shieldCount = 0;
let hasSpikes = false;
let lastShotTime = 0;

const upgradesPool = [
    { id: 'hp', title: '❤️ Bio-Repair', desc: 'Heals 1 lost heart (Max 5)' },
    { id: 'fireball', title: '🔥 Plasma Blaster', desc: 'Auto-fires faster energetic projectiles at nearby threats' },
    { id: 'shield', title: '🛡️ Kinetic Shield', desc: 'Prevents death from wall crashes or enemy impacts' },
    { id: 'spikes', title: '⚡ Nova Spikes', desc: 'Eating food triggers a localized shockwave killing nearby enemies' }
];

function initGame() {
    resizeCanvas();
    snake = [{x: 10, y: 10}];
    direction = {x: 0, y: -1};
    nextDirection = {x: 0, y: -1};
    enemies = [];
    projectiles = [];
    particles = [];
    
    // Safety check spawn for food
    food = getSafeGridPosition();
    
    score = 0; level = 1; xp = 0; xpNeeded = 3; hp = 3;
    attackSpeed = 0; shieldCount = 0; hasSpikes = false;
    isPaused = false;
    
    updateHUD();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    
    if(gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 130); // Slightly smoother speed
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    tileSize = Math.floor(canvas.width / gridCount);
}

// Visual Effects: Juice Particle Engine
function createExplosion(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x * tileSize + tileSize / 2,
            y: y * tileSize + tileSize / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            radius: Math.random() * 3 + 1,
            alpha: 1,
            color: color
        });
    }
}

// BUG FIX: Ensure nothing spawns on top of each other
function getSafeGridPosition() {
    let attempts = 0;
    while (attempts < 100) {
        let pos = {
            x: Math.floor(Math.random() * gridCount),
            y: Math.floor(Math.random() * gridCount)
        };
        
        // Check snake body
        let onSnake = snake.some(part => part.x === pos.x && part.y === pos.y);
        // Check food position
        let onFood = (food && food.x === pos.x && food.y === pos.y);
        // Check enemy positions
        let onEnemy = enemies.some(enemy => enemy.x === pos.x && enemy.y === pos.y);
        
        if (!onSnake && !onFood && !onEnemy) {
            return pos;
        }
        attempts++;
    }
    return { x: 0, y: 0 }; // Fallback
}

function gameLoop() {
    if (isPaused) return;
    
    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    
    // Wall Collision with distinct shield logic
    if (head.x < 0 || head.x >= gridCount || head.y < 0 || head.y >= gridCount) {
        if (shieldCount > 0) {
            shieldCount--;
            createExplosion(snake[0].x, snake[0].y, '#00ffcc', 12);
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

    snake.unshift(head);

    // Eating food
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        xp++;
        createExplosion(food.x, food.y, '#ff007f', 15);
        if (hasSpikes) triggerSpikes(food);
        
        food = getSafeGridPosition();
        spawnEnemy();
        
        if (xp >= xpNeeded) {
            triggerLevelUp();
        }
    } else {
        snake.pop();
    }

    // Projectile Engine
    projectiles.forEach((proj, pIdx) => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        if (proj.x < 0 || proj.x >= gridCount || proj.y < 0 || proj.y >= gridCount) {
            projectiles.splice(pIdx, 1);
        }
    });

    // Enemy combat handlers
    enemies.forEach((enemy, eIdx) => {
        projectiles.forEach((proj, pIdx) => {
            if (Math.floor(proj.x) === enemy.x && Math.floor(proj.y) === enemy.y) {
                createExplosion(enemy.x, enemy.y, '#a124db', 10);
                enemies.splice(eIdx, 1);
                projectiles.splice(pIdx, 1);
                score += 5;
            }
        });

        if (head.x === enemy.x && head.y === enemy.y) {
            enemies.splice(eIdx, 1);
            createExplosion(enemy.x, enemy.y, '#ff3333', 12);
            if (shieldCount > 0) {
                shieldCount--; // Shield safely absorbs it without lowering max HP
            } else {
                hp--;
                if (hp <= 0) gameOver();
            }
        }
    });

    // Automatic Fire weapon upgrade system
    if (attackSpeed > 0 && enemies.length > 0) {
        let now = Date.now();
        if (now - lastShotTime > (1000 / attackSpeed)) {
            fireProjectiles();
            lastShotTime = now;
        }
    }

    // Update cosmetic particles
    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
        if (p.alpha <= 0) particles.splice(index, 1);
    });

    updateHUD();
    draw();
}

function bounceBack() {
    nextDirection = { x: -direction.x, y: -direction.y };
}

function fireProjectiles() {
    if (enemies.length === 0) return;
    const target = enemies[0];
    const head = snake[0];
    const angle = Math.atan2(target.y - head.y, target.x - head.x);
    projectiles.push({
        x: head.x, y: head.y,
        vx: Math.cos(angle) * 0.6, vy: Math.sin(angle) * 0.6
    });
}

function triggerSpikes(pos) {
    createExplosion(pos.x, pos.y, '#00ffcc', 25); // Shockwave effect
    enemies = enemies.filter(enemy => {
        const dist = Math.abs(enemy.x - pos.x) + Math.abs(enemy.y - pos.y);
        if (dist <= 2) {
            score += 5;
            createExplosion(enemy.x, enemy.y, '#a124db', 8);
            return false;
        }
        return true;
    });
}

function spawnEnemy() {
    if (Math.random() > 0.3) {
        let pos = getSafeGridPosition();
        enemies.push(pos);
    }
}

function triggerLevelUp() {
    isPaused = true;
    level++;
    xp = 0;
    xpNeeded = Math.floor(xpNeeded * 1.4);
    
    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';
    
    const shuffled = [...upgradesPool].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    shuffled.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-title">${upgrade.title}</div><div style="font-size:13px; margin-top:4px; opacity:0.9;">${upgrade.desc}</div>`;
        card.onclick = () => applyUpgrade(upgrade.id);
        container.appendChild(card);
    });
    
    document.getElementById('upgrade-screen').classList.remove('hidden');
}

function applyUpgrade(id) {
    if (id === 'hp') hp = Math.min(hp + 1, 5);
    if (id === 'fireball') attackSpeed += 1.2; // Fires faster step-by-step
    if (id === 'shield') shieldCount++;
    if (id === 'spikes') hasSpikes = true;
    
    document.getElementById('upgrade-screen').classList.add('hidden');
    isPaused = false;
}

function updateHUD() {
    document.getElementById('score-val').textContent = score;
    document.getElementById('level-val').textContent = level;
    
    // Visual Separation: Hearts represent physical status, Shields are temporary cyan layers
    document.getElementById('hp-val').innerHTML = 
        `<span style="color: #ff3366">${"❤️".repeat(hp)}</span>` + 
        (shieldCount > 0 ? ` <span style="color: #00ffcc">${"🛡️".repeat(shieldCount)}</span>` : "");
        
    const xpPercent = (xp / xpNeeded) * 100;
    document.getElementById('xp-bar').style.width = `${xpPercent}%`;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // NEW: Background Tech Grid Layout Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < gridCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tileSize, 0);
        ctx.lineTo(i * tileSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tileSize);
        ctx.lineTo(canvas.width, i * tileSize);
        ctx.stroke();
    }
    
    // Draw Ornate Neon Food Target
    ctx.fillStyle = '#ff007f';
    ctx.shadowBlur = 15; ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    ctx.arc(food.x * tileSize + tileSize/2, food.y * tileSize + tileSize/2, tileSize/2.5, 0, Math.PI*2);
    ctx.fill();
    
    // Draw Rogue Enemies (Cross Hack Styles)
    ctx.fillStyle = '#a124db';
    ctx.shadowColor = '#a124db';
    ctx.shadowBlur = 10;
    enemies.forEach(enemy => {
        ctx.fillRect(enemy.x * tileSize + 4, enemy.y * tileSize + 4, tileSize - 8, tileSize - 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(enemy.x * tileSize + 6, enemy.y * tileSize + 6, tileSize - 12, tileSize - 12);
    });

    // Draw Plasma Projectiles
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    projectiles.forEach(proj => {
        ctx.beginPath();
        ctx.arc(proj.x * tileSize + tileSize/2, proj.y * tileSize + tileSize/2, tileSize/5, 0, Math.PI*2);
        ctx.fill();
    });
    
    // Draw Cyber Snake
    snake.forEach((part, index) => {
        if (index === 0) {
            // Head styling
            ctx.fillStyle = '#00ffcc';
            ctx.shadowColor = '#00ffcc';
            ctx.shadowBlur = 14;
            ctx.fillRect(part.x * tileSize + 1, part.y * tileSize + 1, tileSize - 2, tileSize - 2);
            
            // Draw tiny mechanical eyes on head
            ctx.fillStyle = '#111';
            ctx.shadowBlur = 0;
            ctx.fillRect(part.x * tileSize + 4, part.y * tileSize + 4, 3, 3);
            ctx.fillRect(part.x * tileSize + tileSize - 7, part.y * tileSize + 4, 3, 3);
        } else {
            // Tail gradient fade
            ctx.fillStyle = `rgba(0, 179, 179, ${1 - (index / snake.length) * 0.6})`;
            ctx.shadowBlur = 4;
            ctx.fillRect(part.x * tileSize + 2, part.y * tileSize + 2, tileSize - 4, tileSize - 4);
        }
    });

    // Render Particle Systems
    ctx.shadowBlur = 0;
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function gameOver() {
    clearInterval(gameInterval);
    document.getElementById('final-lvl').textContent = level;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

// Controls configuration
window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    switch (key) {
        case 'arrowup':
        case 'w': if (direction.y === 0) nextDirection = { x: 0, y: -1 }; break;
        case 'arrowdown':
        case 's': if (direction.y === 0) nextDirection = { x: 0, y: 1 }; break;
        case 'arrowleft':
        case 'a': if (direction.x === 0) nextDirection = { x: -1, y: 0 }; break;
        case 'arrowright':
        case 'd': if (direction.x === 0) nextDirection = { x: 1, y: 0 }; break;
    }
});

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
