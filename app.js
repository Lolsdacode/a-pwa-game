const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game grid & smooth translation state
let gridCount = 20;
let tileSize;
let snake = []; 
let direction = { x: 0, y: -1 };
let nextDirection = { x: 0, y: -1 };
let lastValidDirection = { x: 0, y: -1 };

// Entity Pools
let foods = []; 
let enemies = [];
let projectiles = [];
let particles = [];
let bosses = [];

// Game Systems
let score, level, xp, xpNeeded, hp;
let gameInterval, isPaused;
let progressTimer = 0; 

// Upgrades
let attackSpeed = 0; 
let shieldCount = 0;
let hasSpikes = false;
let maxFoodCount = 1; 
let lastShotTime = 0;
let speedBonus = 0; // added on top of base move speed by the Speed Boost perk

// Base glide speed (how fast the snake interpolates between grid cells).
// This is multiplied up slightly per level so the game naturally
// quickens as you progress, on top of anything the player picks.
const BASE_MOVE_SPEED = 0.27;
const PER_LEVEL_SPEED_GAIN = 0.012;
const MAX_MOVE_SPEED = 0.6; // hard cap so it never becomes uncontrollable

// Dev console state (only reachable via the hidden unlock in Options)
let devSpeedMultiplier = 1;
let godMode = false;

const upgradesPool = [
    { id: 'hp', title: '❤️ Bio-Repair', desc: 'Heals 1 lost heart (Max 5)' },
    { id: 'fireball', title: '🔥 Plasma Blaster', desc: 'Auto-fires projectiles rapidly at close targets' },
    { id: 'shield', title: '🛡️ Kinetic Shield', desc: 'Absorbs one collision with walls or targets' },
    { id: 'spikes', title: '⚡ Nova Spikes', desc: 'Eaten food triggers an explosion killing near enemies' },
    { id: 'more_food', title: '🍎 Scout Radar', desc: 'Permanently increases the active food count on the field' },
    { id: 'speed', title: '💨 Adrenal Surge', desc: 'Permanently increases movement speed' }
];

function getCurrentMoveSpeed() {
    let speed = BASE_MOVE_SPEED + (level - 1) * PER_LEVEL_SPEED_GAIN + speedBonus;
    speed = Math.min(speed, MAX_MOVE_SPEED);
    return speed * devSpeedMultiplier;
}

// Canvas color palettes. Dark mode leans on neon glow (shadowBlur); light
// mode uses flatter, more saturated colors with outlines instead of glow,
// since glow effects need a dark background to actually read well.
const PALETTE = {
    dark: {
        gridLine: 'rgba(255, 255, 255, 0.03)',
        food: '#ff007f',
        foodGlow: '#ff007f',
        foodCore: '#ffffff',
        enemy: '#a124db',
        enemyEye: '#00ffff',
        enemyGlow: '#a124db',
        boss: '#ff0055',
        bossFlash: '#ffffff',
        bossCore: '#111116',
        bossBarBg: 'rgba(0,0,0,0.5)',
        snakeHead: '#00ffcc',
        snakeEye: '#ffffff',
        snakeBodyA: '#00b399',
        snakeBodyB: '#00806d',
        shieldRing: 'rgba(0, 255, 255, 0.4)',
        projectile: '#00ffff',
        useGlow: true
    },
    light: {
        gridLine: 'rgba(26, 26, 46, 0.07)',
        food: '#e6005c',
        foodGlow: 'transparent',
        foodCore: '#ffffff',
        enemy: '#7a1fa6',
        enemyEye: '#00838f',
        enemyGlow: 'transparent',
        boss: '#c2003f',
        bossFlash: '#fff3f6',
        bossCore: '#2a0a14',
        bossBarBg: 'rgba(0,0,0,0.15)',
        snakeHead: '#00897b',
        snakeEye: '#ffffff',
        snakeBodyA: '#00897b',
        snakeBodyB: '#00695c',
        shieldRing: 'rgba(0, 137, 123, 0.5)',
        projectile: '#0097a7',
        useGlow: false
    }
};

function getPalette() {
    return document.body.classList.contains('light-mode') ? PALETTE.light : PALETTE.dark;
}

function initGame() {
    document.getElementById('main-menu-screen').classList.add('hidden');
    document.getElementById('options-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    pausedForMenu = false;
    document.getElementById('hud').classList.remove('hidden');
    canvas.classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');

    resizeCanvas();
    
    // Smooth positions track float values for sub-grid rendering
    snake = [
        { x: 10, y: 10, targetX: 10, targetY: 10 },
        { x: 10, y: 11, targetX: 10, targetY: 11 },
        { x: 10, y: 12, targetX: 10, targetY: 12 }
    ];
    
    direction = { x: 0, y: -1 };
    nextDirection = { x: 0, y: -1 };
    lastValidDirection = { x: 0, y: -1 };
    
    enemies = [];
    projectiles = [];
    particles = [];
    bosses = [];
    foods = [];
    
    score = 0; level = 1; xp = 0; xpNeeded = 3; hp = 3;
    attackSpeed = 0; shieldCount = 0; hasSpikes = false; maxFoodCount = 1;
    speedBonus = 0;
    isPaused = false;
    progressTimer = 0;
    
    refillFood();
    updateHUD();
    
    if(gameInterval) clearInterval(gameInterval);
    // 60fps loop for high-precision movement animation
    gameInterval = setInterval(updateTick, 1000 / 60); 
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    tileSize = Math.floor(canvas.width / gridCount);
}

function createExplosion(gridX, gridY, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: gridX * tileSize + tileSize / 2,
            y: gridY * tileSize + tileSize / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            radius: Math.random() * 2.5 + 1,
            alpha: 1,
            color: color
        });
    }
}

function getSafeGridPosition() {
    let attempts = 0;
    while (attempts < 150) {
        let pos = {
            x: Math.floor(Math.random() * gridCount),
            y: Math.floor(Math.random() * gridCount)
        };
        let onSnake = snake.some(p => Math.round(p.targetX) === pos.x && Math.round(p.targetY) === pos.y);
        let onFood = foods.some(f => f.x === pos.x && f.y === pos.y);
        let onEnemy = enemies.some(e => e.x === pos.x && e.y === pos.y);
        let onBoss = bosses.some(b => b.x === pos.x && b.y === pos.y);
        
        if (!onSnake && !onFood && !onEnemy && !onBoss) return pos;
        attempts++;
    }
    return { x: Math.floor(Math.random() * gridCount), y: Math.floor(Math.random() * gridCount) };
}

function refillFood() {
    while (foods.length < maxFoodCount) {
        foods.push(getSafeGridPosition());
    }
}

function spawnEnemy() {
    if (bosses.length === 0 && Math.random() > 0.3) {
        enemies.push(getSafeGridPosition());
    }
}

function spawnBoss() {
    bosses.push({
        x: Math.floor(gridCount / 2),
        y: Math.floor(gridCount / 2),
        hp: 5,
        maxHp: 5,
        flashFrames: 0
    });
    createExplosion(gridCount/2, gridCount/2, '#ff0055', 30);
}

function updateTick() {
    if (isPaused) return;

    let head = snake[0];
    let distanceToTarget = Math.hypot(head.targetX - head.x, head.targetY - head.y);
    let moveStepSpeed = getCurrentMoveSpeed();

    if (distanceToTarget > 0.01) {
        // Linearly slide each body segment smoothly toward its grid target location
        snake.forEach(part => {
            part.x += (part.targetX - part.x) * moveStepSpeed;
            part.y += (part.targetY - part.y) * moveStepSpeed;
        });
    } else {
        // Snaps perfectly to the grid cells when targets are reached
        snake.forEach(part => {
            part.x = part.targetX;
            part.y = part.targetY;
        });
        advanceGridStep();
    }

    projectiles.forEach((proj, pIdx) => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        if (proj.x < 0 || proj.x >= gridCount || proj.y < 0 || proj.y >= gridCount) {
            projectiles.splice(pIdx, 1);
        }
    });

    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) particles.splice(index, 1);
    });

    draw();
}

function advanceGridStep() {
    direction = nextDirection;
    lastValidDirection = direction; 

    let currentHead = snake[0];
    let nextX = currentHead.targetX + direction.x;
    let nextY = currentHead.targetY + direction.y;

    // Boundary Wall Crashes
    if (nextX < 0 || nextX >= gridCount || nextY < 0 || nextY >= gridCount) {
        if (godMode) {
            // Wrap around instead of dying when invincible
            nextX = (nextX + gridCount) % gridCount;
            nextY = (nextY + gridCount) % gridCount;
        } else if (shieldCount > 0) {
            shieldCount--;
            createExplosion(currentHead.targetX, currentHead.targetY, '#00ffcc', 12);
            nextDirection = { x: -direction.x, y: -direction.y };
            updateHUD();
            return;
        } else {
            gameOver();
            return;
        }
    }

    // Body Self Collisions
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].targetX === nextX && snake[i].targetY === nextY) {
            if (godMode) break;
            gameOver();
            return;
        }
    }

    let newHeadTarget = { x: currentHead.targetX, y: currentHead.targetY, targetX: nextX, targetY: nextY };
    snake.unshift(newHeadTarget);

    // Collision Check: Eating Food 
    let eatenFoodIdx = foods.findIndex(f => f.x === nextX && f.y === nextY);
    if (eatenFoodIdx !== -1) {
        foods.splice(eatenFoodIdx, 1);
        score += 10;
        xp++;
        createExplosion(nextX, nextY, '#ff007f', 15);
        
        if (hasSpikes) triggerSpikes(nextX, nextY);
        refillFood();
        spawnEnemy();
        
        if (xp >= xpNeeded) {
            triggerLevelUp();
        }
    } else {
        snake.pop();
    }

    checkCombatCollisions(nextX, nextY);

    // Auto weapon fire logic
    if (attackSpeed > 0) {
        let now = Date.now();
        if (now - lastShotTime > (1000 / attackSpeed)) {
            fireProjectiles();
            lastShotTime = now;
        }
    }
}

function checkCombatCollisions(headGridX, headGridY) {
    // 1. Regular Enemies vs Snake Head
    enemies.forEach((enemy, eIdx) => {
        if (headGridX === enemy.x && headGridY === enemy.y) {
            enemies.splice(eIdx, 1);
            createExplosion(enemy.x, enemy.y, '#ff3333', 12);
            handleDamage();
        }
    });

    // 2. Boss Arena Combat Interactions
    bosses.forEach((boss, bIdx) => {
        if (headGridX === boss.x && headGridY === boss.y) {
            handleDamage();
        }

        projectiles.forEach((proj, pIdx) => {
            let pX = Math.floor(proj.x);
            let pY = Math.floor(proj.y);
            if (pX === boss.x && pY === boss.y) {
                projectiles.splice(pIdx, 1);
                boss.hp--;
                boss.flashFrames = 4; 
                score += 15;
                createExplosion(boss.x, boss.y, '#ff0055', 8);

                if (boss.hp <= 0) {
                    createExplosion(boss.x, boss.y, '#ffea00', 35);
                    bosses.splice(bIdx, 1);
                    score += 200;
                    xp += 3; 
                    if (xp >= xpNeeded) triggerLevelUp();
                }
            }
        });
    });

    // Projectiles clearing small enemies
    projectiles.forEach((proj, pIdx) => {
        let pX = Math.floor(proj.x);
        let pY = Math.floor(proj.y);
        enemies.forEach((enemy, eIdx) => {
            if (pX === enemy.x && pY === enemy.y) {
                createExplosion(enemy.x, enemy.y, '#a124db', 10);
                enemies.splice(eIdx, 1);
                projectiles.splice(pIdx, 1);
                score += 5;
            }
        });
    });
}

function handleDamage() {
    if (godMode) return;
    if (shieldCount > 0) {
        shieldCount--;
    } else {
        hp--;
        if (hp <= 0) gameOver();
    }
    updateHUD();
}

function fireProjectiles() {
    let activeTarget = null;
    if (bosses.length > 0) activeTarget = bosses[0];
    else if (enemies.length > 0) activeTarget = enemies[0];

    if (!activeTarget) return;
    
    let head = snake[0];
    let angle = Math.atan2(activeTarget.y - head.targetY, activeTarget.x - head.targetX);
    projectiles.push({
        x: head.x, y: head.y,
        vx: Math.cos(angle) * 0.4, vy: Math.sin(angle) * 0.4
    });
}

function triggerSpikes(gx, gy) {
    createExplosion(gx, gy, '#00ffcc', 20);
    enemies = enemies.filter(enemy => {
        let dist = Math.abs(enemy.x - gx) + Math.abs(enemy.y - gy);
        if (dist <= 2) {
            score += 5;
            createExplosion(enemy.x, enemy.y, '#a124db', 8);
            return false;
        }
        return true;
    });
}

function triggerLevelUp() {
    isPaused = true;
    level++;
    xp = 0;
    xpNeeded = Math.floor(xpNeeded * 1.35);
    
    if (level % 5 === 0) {
        spawnBoss();
    }

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
    if (id === 'fireball') attackSpeed += 1.5; 
    if (id === 'shield') shieldCount++;
    if (id === 'spikes') hasSpikes = true;
    if (id === 'more_food') { maxFoodCount++; refillFood(); }
    if (id === 'speed') speedBonus += 0.05;
    
    document.getElementById('upgrade-screen').classList.add('hidden');
    isPaused = false;
}

function updateHUD() {
    document.getElementById('score-val').textContent = score;
    document.getElementById('level-val').textContent = level;
    document.getElementById('hp-val').innerHTML = 
        `<span style="color: #ff3366">${"❤️".repeat(hp)}</span>` + 
        (shieldCount > 0 ? ` <span style="color: #00ffcc">${"🛡️".repeat(shieldCount)}</span>` : "");
        
    const xpPercent = (xp / xpNeeded) * 100;
    document.getElementById('xp-bar').style.width = `${xpPercent}%`;
}

function gameOver() {
    if(gameInterval) clearInterval(gameInterval);
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('final-lvl').textContent = level;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function returnToMainMenu() {
    if (gameInterval) clearInterval(gameInterval);
    isPaused = false;
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    canvas.classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('main-menu-screen').classList.remove('hidden');
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    const pal = getPalette();
    
    // 1. Technical Background Grid
    ctx.strokeStyle = pal.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i < gridCount; i++) {
        ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(canvas.width, i * tileSize); ctx.stroke();
    }
    
    // 2. Draw Active Foods (Glowing Biotech Orbs)
    foods.forEach(food => {
        let fx = food.x * tileSize + tileSize / 2;
        let fy = food.y * tileSize + tileSize / 2;
        let radius = (tileSize / 2.5) + Math.sin(Date.now() / 150) * 1.5; 
        
        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = pal.foodGlow;
        }
        
        let grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, radius);
        grad.addColorStop(0, pal.foodCore);
        grad.addColorStop(0.4, pal.food);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fx, fy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (!pal.useGlow) {
            ctx.strokeStyle = pal.food;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    });

    // 3. Draw Regular Enemies (Floating Cyber-Drones)
    enemies.forEach(enemy => {
        let hoverY = Math.sin((Date.now() / 200) + (enemy.x * enemy.y)) * 4;
        let ex = enemy.x * tileSize + tileSize / 2;
        let ey = enemy.y * tileSize + tileSize / 2 + hoverY;
        let size = tileSize * 0.7;

        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = pal.enemyGlow;
        }

        ctx.fillStyle = pal.enemy;
        ctx.beginPath();
        ctx.moveTo(ex, ey - size/2);
        ctx.lineTo(ex + size/2, ey);
        ctx.lineTo(ex, ey + size/2);
        ctx.lineTo(ex - size/2, ey);
        ctx.closePath();
        ctx.fill();
        if (!pal.useGlow) {
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.fillStyle = pal.enemyEye;
        ctx.beginPath();
        ctx.arc(ex, ey, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 4. Draw Boss Entity (Massive Core Leviathan)
    bosses.forEach(boss => {
        let bx = boss.x * tileSize + tileSize / 2;
        let by = boss.y * tileSize + tileSize / 2;
        let pulseSize = (tileSize * 1.6) + Math.sin(Date.now() / 100) * 3;

        ctx.save();
        if (boss.flashFrames > 0) {
            ctx.fillStyle = pal.bossFlash;
            boss.flashFrames--;
            if (pal.useGlow) ctx.shadowColor = pal.bossFlash;
        } else {
            ctx.fillStyle = pal.boss;
            if (pal.useGlow) ctx.shadowColor = pal.boss;
        }
        if (pal.useGlow) ctx.shadowBlur = 25;

        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 2, 0, Math.PI * 2);
        ctx.fill();
        if (!pal.useGlow) {
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.fillStyle = pal.bossCore;
        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 3, 0, Math.PI * 2);
        ctx.fill();

        let barW = tileSize * 2;
        let barH = 5;
        ctx.fillStyle = pal.bossBarBg;
        ctx.fillRect(bx - barW/2, by - tileSize, barW, barH);
        ctx.fillStyle = pal.boss;
        ctx.fillRect(bx - barW/2, by - tileSize, barW * (boss.hp / boss.maxHp), barH);

        ctx.restore();
    });

    // 5. Draw Smooth-Flowing Snake Body
    for (let i = snake.length - 1; i >= 0; i--) {
        let part = snake[i];
        let rx = part.x * tileSize + tileSize / 2;
        let ry = part.y * tileSize + tileSize / 2;

        ctx.save();
        
        if (i === 0) {
            if (pal.useGlow) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = pal.snakeHead;
            }
            ctx.fillStyle = pal.snakeHead;
            
            ctx.beginPath();
            ctx.arc(rx, ry, tileSize * 0.48, 0, Math.PI * 2);
            ctx.fill();
            if (!pal.useGlow) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            let eyeOffset = tileSize * 0.18;
            let lookAheadX = lastValidDirection.x * 6;
            let lookAheadY = lastValidDirection.y * 6;
            
            ctx.fillStyle = pal.snakeEye;
            let perpX = -lastValidDirection.y * eyeOffset;
            let perpY = lastValidDirection.x * eyeOffset;

            ctx.beginPath();
            ctx.arc(rx + perpX + lookAheadX, ry + perpY + lookAheadY, 3, 0, Math.PI * 2);
            ctx.arc(rx - perpX + lookAheadX, ry - perpY + lookAheadY, 3, 0, Math.PI * 2);
            ctx.fill();
            
        } else {
            let progress = i / snake.length; 
            let bodySize = (tileSize * 0.42) * (1 - progress * 0.5); 
            
            if (shieldCount > 0) {
                ctx.strokeStyle = pal.shieldRing;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(rx, ry, bodySize + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = (i % 2 === 0) ? pal.snakeBodyA : pal.snakeBodyB;
            ctx.beginPath();
            ctx.arc(rx, ry, bodySize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 6. Draw Plasma Projectiles
    projectiles.forEach(proj => {
        let px = proj.x * tileSize + tileSize / 2;
        let py = proj.y * tileSize + tileSize / 2;
        
        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = pal.projectile;
        }
        ctx.fillStyle = pal.projectile;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 7. Draw Particles
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

window.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp':    case 'w': if (lastValidDirection.y !== 1)  nextDirection = { x: 0, y: -1 }; break;
        case 'ArrowDown':  case 's': if (lastValidDirection.y !== -1) nextDirection = { x: 0, y: 1 };  break;
        case 'ArrowLeft':  case 'a': if (lastValidDirection.x !== 1)  nextDirection = { x: -1, y: 0 }; break;
        case 'ArrowRight': case 'd': if (lastValidDirection.x !== -1) nextDirection = { x: 1, y: 0 };  break;
    }
});

// Shared helper so swipe and D-pad buttons both respect the
// "can't reverse directly into yourself" rule that keydown uses.
function requestDirection(dx, dy) {
    if (dx !== 0 && lastValidDirection.x !== -dx) {
        nextDirection = { x: dx, y: 0 };
    } else if (dy !== 0 && lastValidDirection.y !== -dy) {
        nextDirection = { x: 0, y: dy };
    }
}

// --- Touch swipe controls (on the canvas itself) ---
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 24; // px - minimum distance to count as an intentional swipe

canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        requestDirection(dx > 0 ? 1 : -1, 0);
    } else {
        requestDirection(0, dy > 0 ? 1 : -1);
    }
}, { passive: true });

// --- Touch D-pad buttons (fallback / easier for some players) ---
function bindDpadButton(id, dx, dy) {
    const btn = document.getElementById(id);
    if (!btn) return;
    // touchstart fires faster than click and lets us preventDefault
    // so it doesn't also fire a ghost click/zoom on some browsers.
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
        requestDirection(dx, dy);
    }, { passive: false });
    btn.addEventListener('click', () => requestDirection(dx, dy));
}

bindDpadButton('btn-up', 0, -1);
bindDpadButton('btn-down', 0, 1);
bindDpadButton('btn-left', -1, 0);
bindDpadButton('btn-right', 1, 0);

// --- Restart / Menu buttons ---
document.getElementById('restart-btn').addEventListener('click', () => {
    initGame();
});

document.getElementById('menu-btn-gameover').addEventListener('click', () => {
    returnToMainMenu();
});

document.getElementById('start-btn').addEventListener('click', () => {
    initGame();
});

window.addEventListener('resize', resizeCanvas);

// =====================================================================
// Pause Menu
// =====================================================================

const pauseScreen = document.getElementById('pause-screen');
let pausedForMenu = false; // distinct from upgrade-screen's use of isPaused

function openPauseMenu() {
    if (!gameInterval) return; // nothing to pause
    if (!document.getElementById('upgrade-screen').classList.contains('hidden')) return; // don't stack on upgrade picks
    pausedForMenu = true;
    isPaused = true;
    pauseScreen.classList.remove('hidden');
}

function closePauseMenu() {
    pausedForMenu = false;
    isPaused = false;
    pauseScreen.classList.add('hidden');
}

document.getElementById('pause-btn').addEventListener('click', openPauseMenu);

document.getElementById('resume-btn').addEventListener('click', closePauseMenu);

document.getElementById('pause-options-btn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    openOptions('pause-screen');
});

document.getElementById('pause-quit-btn').addEventListener('click', () => {
    pausedForMenu = false;
    pauseScreen.classList.add('hidden');
    returnToMainMenu();
});

// Esc also opens/closes the pause menu on desktop, since there's no
// guaranteed keyboard on mobile but it's a nice-to-have shortcut.
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!devConsole.classList.contains('hidden')) {
        devConsole.classList.add('hidden');
        return;
    }
    if (!optionsScreen.classList.contains('hidden') && optionsReturnTo === 'pause-screen') {
        closeOptions();
        return;
    }
    if (pausedForMenu) {
        closePauseMenu();
    } else {
        openPauseMenu();
    }
});

// =====================================================================
// Main Menu / Options / Theme
// =====================================================================

const mainMenuScreen = document.getElementById('main-menu-screen');
const optionsScreen = document.getElementById('options-screen');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

let soundOn = loadSetting('soundOn', true);
let lightMode = loadSetting('lightMode', false);

function loadSetting(key, fallback) {
    try {
        const raw = localStorage.getItem('snakeRogue.' + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function saveSetting(key, value) {
    try {
        localStorage.setItem('snakeRogue.' + key, JSON.stringify(value));
    } catch (e) {
        // localStorage unavailable (e.g. private mode) - settings just won't persist
    }
}

function applyTheme() {
    document.body.classList.toggle('light-mode', lightMode);
    themeToggleBtn.classList.toggle('is-on', lightMode);
    themeToggleBtn.textContent = lightMode ? 'Light' : 'Dark';
    themeToggleLabel.textContent = lightMode ? 'Light Mode' : 'Dark Mode';
}

function applySoundUI() {
    soundToggleBtn.classList.toggle('is-on', soundOn);
    soundToggleBtn.textContent = soundOn ? 'On' : 'Off';
}

applyTheme();
applySoundUI();

document.getElementById('options-btn').addEventListener('click', () => {
    openOptions('main-menu-screen');
});

document.getElementById('options-back-btn').addEventListener('click', () => {
    closeOptions();
});

let optionsReturnTo = 'main-menu-screen';

function openOptions(returnTo) {
    optionsReturnTo = returnTo;
    document.getElementById(returnTo).classList.add('hidden');
    optionsScreen.classList.remove('hidden');
}

function closeOptions() {
    optionsScreen.classList.add('hidden');
    document.getElementById(optionsReturnTo).classList.remove('hidden');
}

themeToggleBtn.addEventListener('click', () => {
    lightMode = !lightMode;
    saveSetting('lightMode', lightMode);
    applyTheme();
});

soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    saveSetting('soundOn', soundOn);
    applySoundUI();
});

// =====================================================================
// Hidden Dev Console unlock: long-press the Dark/Light Mode toggle
// =====================================================================

const devConsole = document.getElementById('dev-console');
const devUnlockHint = document.getElementById('dev-unlock-hint');
const themeOptionRow = document.getElementById('theme-option-row');
const LONG_PRESS_MS = 1200;
let devUnlocked = loadSetting('devUnlocked', false);
let longPressTimer = null;

function unlockDevConsole() {
    if (devUnlocked) return;
    devUnlocked = true;
    saveSetting('devUnlocked', true);
    devUnlockHint.classList.remove('hidden');
    document.getElementById('dev-open-btn').classList.remove('hidden');
    themeOptionRow.classList.remove('long-pressing');
}

function startLongPress(e) {
    // Prevent iOS Safari's text-selection / "Look Up" callout from
    // hijacking the hold gesture before our timer can fire. Skip this
    // when the press starts on the toggle button itself so its normal
    // click still works immediately.
    if (e.target !== themeToggleBtn && e.cancelable) e.preventDefault();
    clearTimeout(longPressTimer);
    themeOptionRow.classList.add('long-pressing');
    longPressTimer = setTimeout(unlockDevConsole, LONG_PRESS_MS);
}

function cancelLongPress() {
    clearTimeout(longPressTimer);
    themeOptionRow.classList.remove('long-pressing');
}

// touchstart is the authoritative event on mobile; passive:false so
// preventDefault() actually works. We skip binding mousedown when touch
// is available to avoid iOS firing both and double-triggering the timer.
let usingTouch = false;
themeOptionRow.addEventListener('touchstart', (e) => {
    usingTouch = true;
    startLongPress(e);
}, { passive: false });

themeOptionRow.addEventListener('mousedown', (e) => {
    if (usingTouch) return;
    startLongPress(e);
});

['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
    themeOptionRow.addEventListener(evt, cancelLongPress);
});

if (devUnlocked) {
    devUnlockHint.classList.remove('hidden');
    document.getElementById('dev-open-btn').classList.remove('hidden');
}

document.getElementById('dev-open-btn').addEventListener('click', () => {
    openDevConsole();
});

// =====================================================================
// Dev Console: full sandbox controls
// =====================================================================

function openDevConsole() {
    syncDevConsoleFields();
    devConsole.classList.remove('hidden');
}

function syncDevConsoleFields() {
    document.getElementById('dev-speed').value = devSpeedMultiplier;
    document.getElementById('dev-speed-val').textContent = devSpeedMultiplier.toFixed(2) + 'x';
    document.getElementById('dev-score').value = score || 0;
    document.getElementById('dev-level').value = level || 1;
    document.getElementById('dev-hp').value = hp || 0;
    const godBtn = document.getElementById('dev-godmode-btn');
    godBtn.classList.toggle('is-on', godMode);
    godBtn.textContent = godMode ? 'ON' : 'OFF';

    const noActiveRun = !gameInterval;
    document.querySelectorAll('.dev-apply-btn, #dev-spawn-enemy, #dev-spawn-boss, #dev-give-all')
        .forEach(btn => { btn.disabled = noActiveRun; btn.style.opacity = noActiveRun ? 0.4 : 1; });
}

document.getElementById('dev-close-btn').addEventListener('click', () => {
    devConsole.classList.add('hidden');
});

document.getElementById('dev-speed').addEventListener('input', (e) => {
    devSpeedMultiplier = parseFloat(e.target.value);
    document.getElementById('dev-speed-val').textContent = devSpeedMultiplier.toFixed(2) + 'x';
});

document.getElementById('dev-godmode-btn').addEventListener('click', (e) => {
    godMode = !godMode;
    e.target.classList.toggle('is-on', godMode);
    e.target.textContent = godMode ? 'ON' : 'OFF';
});

document.querySelectorAll('.dev-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!gameInterval) return; // no active run to edit
        const target = btn.dataset.target;
        if (target === 'score') {
            score = parseInt(document.getElementById('dev-score').value, 10) || 0;
        } else if (target === 'level') {
            const targetLevel = Math.max(1, parseInt(document.getElementById('dev-level').value, 10) || 1);
            level = targetLevel;
            xp = 0;
            xpNeeded = Math.floor(3 * Math.pow(1.35, targetLevel - 1));
        } else if (target === 'hp') {
            hp = Math.max(0, parseInt(document.getElementById('dev-hp').value, 10) || 0);
            if (hp <= 0) gameOver();
        }
        updateHUD();
    });
});

document.getElementById('dev-spawn-enemy').addEventListener('click', () => {
    if (!gameInterval) return;
    enemies.push(getSafeGridPosition());
});

document.getElementById('dev-spawn-boss').addEventListener('click', () => {
    if (!gameInterval) return;
    spawnBoss();
});

document.getElementById('dev-give-all').addEventListener('click', () => {
    if (!gameInterval) return;
    hp = 5;
    shieldCount = Math.max(shieldCount, 3);
    hasSpikes = true;
    attackSpeed = Math.max(attackSpeed, 4.5);
    maxFoodCount = Math.max(maxFoodCount, 4);
    speedBonus = Math.max(speedBonus, 0.15);
    refillFood();
    updateHUD();
});

window.onload = () => {
    resizeCanvas();
    // Game does not auto-start anymore; the main menu is shown first
    // and initGame() runs only when the player presses Start.
};
