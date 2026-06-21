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

const upgradesPool = [
    { id: 'hp', title: '❤️ Bio-Repair', desc: 'Heals 1 lost heart (Max 5)' },
    { id: 'fireball', title: '🔥 Plasma Blaster', desc: 'Auto-fires projectiles rapidly at close targets' },
    { id: 'shield', title: '🛡️ Kinetic Shield', desc: 'Absorbs one collision with walls or targets' },
    { id: 'spikes', title: '⚡ Nova Spikes', desc: 'Eaten food triggers an explosion killing near enemies' },
    { id: 'more_food', title: '🍎 Scout Radar', desc: 'Permanently increases the active food count on the field' }
];

function initGame() {
    resizeCanvas();
    
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
    isPaused = false;
    progressTimer = 0;
    
    refillFood();
    updateHUD();
    
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    
    if(gameInterval) clearInterval(gameInterval);
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
    
    // Snappy, fast slide speed adjustment (Optimized up from 0.22)
    let moveStepSpeed = 0.35; 

    if (distanceToTarget > 0.01) {
        snake.forEach(part => {
            part.x += (part.targetX - part.x) * moveStepSpeed;
            part.y += (part.targetY - part.y) * moveStepSpeed;
        });
    } else {
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

    if (nextX < 0 || nextX >= gridCount || nextY < 0 || nextY >= gridCount) {
        if (shieldCount > 0) {
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

    for (let i = 1; i < snake.length; i++) {
        if (snake[i].targetX === nextX && snake[i].targetY === nextY) {
            gameOver();
            return;
        }
    }

    let newHeadTarget = { x: currentHead.targetX, y: currentHead.targetY, targetX: nextX, targetY: nextY };
    snake.unshift(newHeadTarget);

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

    if (attackSpeed > 0) {
        let now = Date.now();
        if (now - lastShotTime > (1000 / attackSpeed)) {
            fireProjectiles();
            lastShotTime = now;
        }
    }
}

function checkCombatCollisions(headGridX, headGridY) {
    enemies.forEach((enemy, eIdx) => {
        if (headGridX === enemy.x && headGridY === enemy.y) {
            enemies.splice(eIdx, 1);
            createExplosion(enemy.x, enemy.y, '#ff3333', 12);
            handleDamage();
        }
    });

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

// Fixed bug where spikes references undefined filter logic
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
    isPaused = true;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < gridCount; i++) {
        ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(canvas.width, i * tileSize); ctx.stroke();
    }
    
    foods.forEach(food => {
        let fx = food.x * tileSize + tileSize / 2;
        let fy = food.y * tileSize + tileSize / 2;
        let radius = (tileSize / 2.5) + Math.sin(Date.now() / 150) * 1.5;
        
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff007f';
        
        let grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#ff007f');
        grad.addColorStop(1, 'rgba(255, 0, 127, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fx, fy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    enemies.forEach(enemy => {
        let hoverY = Math.sin((Date.now() / 200) + (enemy.x * enemy.y)) * 4;
        let ex = enemy.x * tileSize + tileSize / 2;
        let ey = enemy.y * tileSize + tileSize / 2 + hoverY;
        let size = tileSize * 0.7;

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#a124db';

        ctx.fillStyle = '#a124db';
        ctx.beginPath();
        ctx.moveTo(ex, ey - size/2);
        ctx.lineTo(ex + size/2, ey);
        ctx.lineTo(ex, ey + size/2);
        ctx.lineTo(ex - size/2, ey);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(ex, ey, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    bosses.forEach(boss => {
        let bx = boss.x * tileSize + tileSize / 2;
        let by = boss.y * tileSize + tileSize / 2;
        let pulseSize = (tileSize * 1.6) + Math.sin(Date.now() / 100) * 3;

        ctx.save();
        if (boss.flashFrames > 0) {
            ctx.fillStyle = '#ffffff';
            boss.flashFrames--;
            ctx.shadowColor = '#ffffff';
        } else {
            ctx.fillStyle = '#ff0055';
            ctx.shadowColor = '#ff0055';
        }
        ctx.shadowBlur = 25;

        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111116';
        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 3, 0, Math.PI * 2);
        ctx.fill();

        let barW = tileSize * 2;
        let barH = 5;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx - barW/2, by - tileSize, barW, barH);
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(bx - barW/2, by - tileSize, barW * (boss.hp / boss.maxHp), barH);

        ctx.restore();
    });

    for (let i = snake.length - 1; i >= 0; i--) {
        let part = snake[i];
        let rx = part.x * tileSize + tileSize / 2;
        let ry = part.y * tileSize + tileSize / 2;

        ctx.save();
        
        if (i === 0) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffcc';
            ctx.fillStyle = '#00ffcc';
            
            ctx.beginPath();
            ctx.arc(rx, ry, tileSize * 0.48, 0, Math.PI * 2);
            ctx.fill();

            let eyeOffset = tileSize * 0.18;
            let lookAheadX = lastValidDirection.x * 6;
            let lookAheadY = lastValidDirection.y * 6;
            
            ctx.fillStyle = '#ffffff';
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
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(rx, ry, bodySize + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = (i % 2 === 0) ? '#00b399' : '#00806d';
            ctx.beginPath();
            ctx.arc(rx, ry, bodySize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    projectiles.forEach(proj => {
        let px = proj.x * tileSize + tileSize / 2;
        let py = proj.y * tileSize + tileSize / 2;
        
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00ffff';
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

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

// 1. Keyboard Controls Input Listener
window.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp':    case 'w': if (lastValidDirection.y !== 1)  nextDirection = { x: 0, y: -1 }; break;
        case 'ArrowDown':  case 's': if (lastValidDirection.y !== -1) nextDirection = { x: 0, y: 1 };  break;
        case 'ArrowLeft':  case 'a': if (lastValidDirection.x !== 1)  nextDirection = { x: -1, y: 0 }; break;
        case 'ArrowRight': case 'd': if (lastValidDirection.x !== -1) nextDirection = { x: 1, y: 0 };  break;
    }
});

// 2. High-Performance PWA Mobile Touch Swipe Input Controller
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', e => {
    if (!touchStartX || !touchStartY) return;

    let diffX = e.changedTouches[0].clientX - touchStartX;
    let diffY = e.changedTouches[0].clientY - touchStartY;
    let absDiffX = Math.abs(diffX);
    let absDiffY = Math.abs(diffY);

    // Filter minor tiny touches to prevent accidents
    if (Math.max(absDiffX, absDiffY) > 25) {
        if (absDiffX > absDiffY) {
            // Horizontal swipe
            if (diffX > 0 && lastValidDirection.x !== -1) nextDirection = { x: 1, y: 0 };
            else if (diffX < 0 && lastValidDirection.x !== 1) nextDirection = { x: -1, y: 0 };
        } else {
            // Vertical swipe
            if (diffY > 0 && lastValidDirection.y !== -1) nextDirection = { x: 0, y: 1 };
            else if (diffY < 0 && lastValidDirection.y !== 1) nextDirection = { x: 0, y: -1 };
        }
    }
    touchStartX = 0;
    touchStartY = 0;
}, { passive: true });

// Setup resize triggers and initialize layout
window.addEventListener('resize', resizeCanvas);

window.onload = () => {
    initGame();
};
