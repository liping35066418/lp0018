class ParkourGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    
    this.backendUrl = 'http://localhost:9618/api';
    
    this.gameState = 'menu';
    this.gameId = null;
    this.config = null;
    this.startTime = 0;
    this.lastUpdateTime = 0;
    this.elapsedTime = 0;
    this.lastFrameTime = 0;
    
    this.score = 0;
    this.lives = 3;
    this.maxLives = 3;
    this.combo = 0;
    this.timeLeft = 120;
    this.difficultyLevel = 1;
    
    this.player = {
      x: 120,
      y: 0,
      width: 50,
      height: 80,
      velocityY: 0,
      isJumping: false,
      isCrouching: false,
      invincible: false,
      shield: false,
      lane: 0,
      animFrame: 0,
      animTimer: 0
    };
    
    this.obstacles = [];
    this.items = [];
    this.effects = [];
    this.particles = [];
    
    this.backgroundLayers = [
      { speed: 0.2, offset: 0, color: '#0f3460', elements: [] },
      { speed: 0.4, offset: 0, color: '#16213e', elements: [] },
      { speed: 0.7, offset: 0, color: '#1a1a2e', elements: [] }
    ];
    
    this.groundOffset = 0;
    this.clouds = [];
    this.mountains = [];
    this.buildings = [];
    
    this.keys = {};
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isTouchDevice = this.detectTouchDevice();
    
    this.pendingActions = {
      jump: false,
      crouch: false,
      laneChange: 0
    };
    
    this.initBackground();
    this.bindEvents();
    this.loadHighScores();
    this.resizeCanvas();
    this.showTouchControls();
    this.gameLoop();
  }
  
  detectTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  
  showTouchControls() {
    const touchControls = document.getElementById('touch-controls');
    if (this.isTouchDevice) {
      touchControls.classList.remove('hidden');
    }
  }
  
  resizeCanvas() {
    const container = document.getElementById('game-container');
    const ratio = this.W / this.H;
    let width = window.innerWidth;
    let height = window.innerHeight;
    
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
  
  initBackground() {
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: Math.random() * this.W * 2,
        y: 30 + Math.random() * 120,
        width: 60 + Math.random() * 100,
        speed: 0.3 + Math.random() * 0.5
      });
    }
    
    for (let i = 0; i < 15; i++) {
      this.mountains.push({
        x: i * 200,
        height: 80 + Math.random() * 120,
        width: 200 + Math.random() * 100
      });
    }
    
    for (let i = 0; i < 20; i++) {
      this.buildings.push({
        x: i * 120,
        height: 60 + Math.random() * 150,
        width: 80 + Math.random() * 50,
        windows: Math.floor(Math.random() * 6) + 2
      });
    }
  }
  
  bindEvents() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());
    document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
    document.getElementById('menu-btn').addEventListener('click', () => this.showMenu());
    
    const touchJump = document.getElementById('touch-jump');
    const touchCrouch = document.getElementById('touch-crouch');
    const touchLeft = document.getElementById('touch-left');
    const touchRight = document.getElementById('touch-right');
    
    if (touchJump) {
      touchJump.addEventListener('touchstart', (e) => { e.preventDefault(); this.pendingActions.jump = true; });
      touchJump.addEventListener('mousedown', (e) => { e.preventDefault(); this.pendingActions.jump = true; });
    }
    if (touchCrouch) {
      touchCrouch.addEventListener('touchstart', (e) => { e.preventDefault(); this.pendingActions.crouch = true; });
      touchCrouch.addEventListener('touchend', (e) => { e.preventDefault(); this.pendingActions.crouch = false; });
      touchCrouch.addEventListener('mousedown', (e) => { e.preventDefault(); this.pendingActions.crouch = true; });
      touchCrouch.addEventListener('mouseup', (e) => { e.preventDefault(); this.pendingActions.crouch = false; });
    }
    if (touchLeft) {
      touchLeft.addEventListener('touchstart', (e) => { e.preventDefault(); this.pendingActions.laneChange = -1; });
      touchLeft.addEventListener('mousedown', (e) => { e.preventDefault(); this.pendingActions.laneChange = -1; });
    }
    if (touchRight) {
      touchRight.addEventListener('touchstart', (e) => { e.preventDefault(); this.pendingActions.laneChange = 1; });
      touchRight.addEventListener('mousedown', (e) => { e.preventDefault(); this.pendingActions.laneChange = 1; });
    }
  }
  
  handleKeyDown(e) {
    if (this.gameState !== 'playing') return;
    
    switch(e.code) {
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault();
        this.pendingActions.jump = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.pendingActions.crouch = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.pendingActions.laneChange = -1;
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.pendingActions.laneChange = 1;
        break;
    }
  }
  
  handleKeyUp(e) {
    switch(e.code) {
      case 'ArrowDown':
      case 'KeyS':
        this.pendingActions.crouch = false;
        break;
    }
  }
  
  handleTouchStart(e) {
    e.preventDefault();
    if (this.gameState !== 'playing') return;
    
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.touchStartX = touch.clientX - rect.left;
    this.touchStartY = touch.clientY - rect.top;
  }
  
  handleTouchEnd(e) {
    e.preventDefault();
    if (this.gameState !== 'playing') return;
    
    const touch = e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    const endX = touch.clientX - rect.left;
    const endY = touch.clientY - rect.top;
    
    const diffX = endX - this.touchStartX;
    const diffY = endY - this.touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    const minSwipe = 30;
    
    if (absDiffX < minSwipe && absDiffY < minSwipe) {
      const clickY = (this.touchStartY / rect.height) * this.H;
      if (clickY < this.H / 2) {
        this.pendingActions.jump = true;
      } else {
        this.pendingActions.crouch = true;
        setTimeout(() => { this.pendingActions.crouch = false; }, 300);
      }
    } else if (absDiffX > absDiffY) {
      if (diffX > 0) {
        this.pendingActions.laneChange = 1;
      } else {
        this.pendingActions.laneChange = -1;
      }
    }
  }
  
  handleTouchMove(e) {
    e.preventDefault();
  }
  
  async startGame() {
    const playerName = document.getElementById('player-name').value || '匿名玩家';
    this.playerName = playerName;
    
    try {
      const res = await fetch(`${this.backendUrl}/game/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      this.gameId = data.data.gameId;
      this.config = data.data.config;
      const state = data.data.initialState;
      
      this.maxLives = this.config.maxLives;
      this.lives = state.lives;
      this.score = state.score;
      this.combo = 0;
      this.timeLeft = state.timeLeft;
      this.difficultyLevel = 1;
      
      this.player = { ...this.player, ...state.player };
      this.obstacles = [...state.obstacles];
      this.items = [...state.items];
      this.effects = [];
      this.particles = [];
      
      this.startTime = Date.now();
      this.lastUpdateTime = Date.now();
      this.elapsedTime = 0;
      this.gameState = 'playing';
      
      this.hideOverlay('start-screen');
      this.hideOverlay('gameover-screen');
      this.updateHUD();
      
    } catch (err) {
      console.error('启动游戏失败:', err);
      alert('无法连接到后端服务，请确保后端已在 9618 端口启动');
    }
  }
  
  async endGame() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'gameover';
    
    try {
      const res = await fetch(`${this.backendUrl}/game/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerName: this.playerName
        })
      });
      
      const data = await res.json();
      if (data.success) {
        this.showGameOver(data.data);
      }
    } catch (err) {
      console.error('结束游戏失败:', err);
      this.showGameOver({
        finalScore: this.score,
        rank: '--',
        highScores: [],
        maxLives: this.maxLives
      });
    }
  }
  
  showMenu() {
    this.gameState = 'menu';
    this.hideOverlay('gameover-screen');
    this.showOverlay('start-screen');
    this.loadHighScores();
  }
  
  async loadHighScores() {
    try {
      const res = await fetch(`${this.backendUrl}/highscores`);
      const data = await res.json();
      if (data.success) {
        this.renderHighScores(data.data, 'highscores-list');
      }
    } catch (err) {
      console.error('加载排行榜失败:', err);
    }
  }
  
  renderHighScores(scores, elementId) {
    const container = document.getElementById(elementId);
    if (!scores || scores.length === 0) {
      container.innerHTML = '<p class="empty">暂无记录，快来创造第一名！</p>';
      return;
    }
    
    container.innerHTML = scores.map((s, i) => `
      <div class="highscore-item">
        <div class="highscore-rank">
          <span class="rank-num ${i < 3 ? `rank-${i+1}` : 'rank-other'}">${i + 1}</span>
          <span class="player-nickname">${s.name}</span>
        </div>
        <span class="hs-score">${s.score.toLocaleString()}</span>
      </div>
    `).join('');
  }
  
  showGameOver(result) {
    document.getElementById('final-score').textContent = result.finalScore.toLocaleString();
    document.getElementById('final-rank').textContent = result.rank ? `#${result.rank}` : '#--';
    document.getElementById('final-difficulty').textContent = `Lv.${this.difficultyLevel}`;
    document.getElementById('final-time').textContent = `${Math.floor(this.elapsedTime / 1000)}s`;
    
    this.renderHighScores(result.highScores, 'gameover-highscores-list');
    
    const list = document.getElementById('gameover-highscores-list');
    const items = list.querySelectorAll('.highscore-item');
    if (result.rank && result.rank <= items.length) {
      items[result.rank - 1].classList.add('current');
    }
    
    this.showOverlay('gameover-screen');
  }
  
  showOverlay(id) {
    document.getElementById(id).classList.remove('hidden');
  }
  
  hideOverlay(id) {
    document.getElementById(id).classList.add('hidden');
  }
  
  updateHUD() {
    document.getElementById('score-value').textContent = this.score.toLocaleString();
    
    const mins = Math.floor(this.timeLeft / 60);
    const secs = this.timeLeft % 60;
    document.getElementById('time-value').textContent = 
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    document.getElementById('difficulty-value').textContent = `Lv.${this.difficultyLevel}`;
    
    const livesPanel = document.getElementById('lives-panel');
    const hearts = livesPanel.querySelectorAll('.heart');
    hearts.forEach((h, i) => {
      h.classList.toggle('lost', i >= this.lives);
    });
    
    const comboPanel = document.getElementById('combo-panel');
    const comboValue = document.getElementById('combo-value');
    if (this.combo > 1) {
      comboPanel.classList.add('active');
      comboValue.textContent = `${this.combo} COMBO!`;
    } else {
      comboPanel.classList.remove('active');
    }
    
    const statusPanel = document.getElementById('status-panel');
    let badges = '';
    if (this.player.invincible) {
      badges += '<span class="status-badge" style="background: linear-gradient(135deg, #ffd700, #ff9800);">⭐ 无敌</span>';
    }
    if (this.player.shield) {
      badges += '<span class="status-badge" style="background: linear-gradient(135deg, #2196f3, #3f51b5);">🛡️ 护盾</span>';
    }
    statusPanel.innerHTML = badges;
  }
  
  async updateBackend(deltaTime) {
    if (!this.gameId) return;
    
    try {
      const res = await fetch(`${this.backendUrl}/game/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          elapsedTime: this.elapsedTime,
          playerAction: { ...this.pendingActions },
          deltaTime: deltaTime
        })
      });
      
      const data = await res.json();
      if (data.success && data.data) {
        const state = data.data;
        
        if (state.status === 'gameover' && this.gameState === 'playing') {
          this.score = state.score;
          this.lives = state.lives;
          this.updateHUD();
          this.endGame();
          return;
        }
        
        this.score = state.score;
        this.lives = state.lives;
        this.combo = state.combo;
        this.timeLeft = state.timeLeft;
        this.difficultyLevel = state.difficultyLevel || 1;
        
        this.player = { ...this.player, ...state.player };
        this.obstacles = state.obstacles || this.obstacles;
        this.items = state.items || this.items;
        
        if (state.effects) {
          state.effects.forEach(e => this.addEffect(e));
        }
        
        if (state.collisionResults) {
          if (state.collisionResults.obstaclesHit && state.collisionResults.obstaclesHit.length > 0) {
            state.collisionResults.obstaclesHit.forEach(h => {
              if (h.result.hit) {
                this.screenShake();
                this.createDamageParticles();
              }
            });
          }
          if (state.collisionResults.itemsCollected && state.collisionResults.itemsCollected.length > 0) {
            state.collisionResults.itemsCollected.forEach(c => {
              this.createCollectParticles(c.item.x + c.item.width/2, c.item.y + c.item.height/2, c.item.color);
            });
          }
        }
        
        this.updateHUD();
      }
    } catch (err) {
      // 静默失败，继续本地游戏
    }
    
    this.pendingActions.jump = false;
    this.pendingActions.laneChange = 0;
  }
  
  addEffect(effect) {
    this.effects.push({
      ...effect,
      startTime: Date.now()
    });
  }
  
  screenShake() {
    this.shakeIntensity = 15;
    this.shakeDecay = 0.85;
  }
  
  createDamageParticles() {
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x: this.player.x + this.player.width / 2,
        y: this.player.y + this.player.height / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        decay: 0.02,
        size: 3 + Math.random() * 5,
        color: `hsl(${Math.random() * 30}, 100%, 60%)`
      });
    }
  }
  
  createCollectParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 * i) / 15;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        life: 1,
        decay: 0.025,
        size: 4 + Math.random() * 4,
        color: color || '#ffd700'
      });
    }
  }
  
  createJumpParticles() {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.player.x + this.player.width / 2,
        y: this.player.y + this.player.height,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 3,
        life: 1,
        decay: 0.04,
        size: 2 + Math.random() * 3,
        color: '#a0a0a0'
      });
    }
  }
  
  updateParticles() {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= p.decay;
      return p.life > 0;
    });
  }
  
  drawParticles() {
    this.particles.forEach(p => {
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }
  
  drawBackground(speed) {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.H);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.3, '#1a1a3e');
    gradient.addColorStop(0.7, '#2d1b4e');
    gradient.addColorStop(1, '#1a0a2e');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.W, this.H);
    
    this.clouds.forEach(cloud => {
      cloud.x -= cloud.speed * (speed / 6);
      if (cloud.x + cloud.width < 0) {
        cloud.x = this.W + Math.random() * 200;
      }
      this.drawCloud(cloud.x, cloud.y, cloud.width);
    });
    
    this.ctx.fillStyle = 'rgba(30, 20, 60, 0.8)';
    this.mountains.forEach(m => {
      m.x -= speed * 0.15;
      if (m.x + m.width < 0) {
        m.x = this.W + 100;
      }
      this.drawMountain(m.x, m.height, m.width);
    });
    
    this.buildings.forEach((b, i) => {
      b.x -= speed * 0.4;
      if (b.x + b.width < 0) {
        const maxX = Math.max(...this.buildings.map(b2 => b2.x));
        b.x = maxX + 100 + Math.random() * 50;
        b.height = 60 + Math.random() * 150;
        b.windows = Math.floor(Math.random() * 6) + 2;
      }
      this.drawBuilding(b.x, b.height, b.width, b.windows);
    });
  }
  
  drawCloud(x, y, w) {
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    this.ctx.beginPath();
    this.ctx.arc(x, y, w * 0.3, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.3, y - 10, w * 0.35, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.6, y, w * 0.3, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.3, y + 10, w * 0.25, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawMountain(x, h, w) {
    const groundY = this.H - 100;
    this.ctx.beginPath();
    this.ctx.moveTo(x, groundY);
    this.ctx.lineTo(x + w * 0.3, groundY - h);
    this.ctx.lineTo(x + w * 0.5, groundY - h * 0.7);
    this.ctx.lineTo(x + w * 0.7, groundY - h * 0.9);
    this.ctx.lineTo(x + w, groundY);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawBuilding(x, h, w, windows) {
    const groundY = this.H - 100;
    const y = groundY - h;
    
    this.ctx.fillStyle = 'rgba(20, 15, 40, 0.9)';
    this.ctx.fillRect(x, y, w, h);
    
    this.ctx.strokeStyle = 'rgba(100, 80, 150, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, w, h);
    
    const winRows = windows;
    const winCols = Math.floor(w / 20);
    const winW = (w - 10) / winCols - 5;
    const winH = (h - 20) / winRows - 8;
    
    for (let r = 0; r < winRows; r++) {
      for (let c = 0; c < winCols; c++) {
        const isLit = Math.random() > 0.4;
        this.ctx.fillStyle = isLit 
          ? `rgba(255, ${200 + Math.random() * 55}, ${100 + Math.random() * 100}, 0.8)`
          : 'rgba(30, 20, 50, 0.8)';
        this.ctx.fillRect(
          x + 8 + c * (winW + 5),
          y + 12 + r * (winH + 8),
          winW,
          winH
        );
      }
    }
  }
  
  drawGround(speed) {
    const groundY = this.H - 100;
    
    this.groundOffset = (this.groundOffset + speed) % 40;
    
    const groundGrad = this.ctx.createLinearGradient(0, groundY, 0, this.H);
    groundGrad.addColorStop(0, '#3d2a1f');
    groundGrad.addColorStop(0.3, '#2a1a0f');
    groundGrad.addColorStop(1, '#1a0d05');
    this.ctx.fillStyle = groundGrad;
    this.ctx.fillRect(0, groundY, this.W, 100);
    
    this.ctx.fillStyle = '#4a7c59';
    this.ctx.fillRect(0, groundY, this.W, 8);
    
    this.ctx.fillStyle = '#5a9c69';
    for (let x = -this.groundOffset; x < this.W; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, groundY + 8);
      this.ctx.lineTo(x + 10, groundY);
      this.ctx.lineTo(x + 20, groundY + 8);
      this.ctx.fill();
    }
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (let x = -this.groundOffset * 2; x < this.W; x += 20) {
      this.ctx.fillRect(x, groundY + 30 + (x % 3), 8, 3);
    }
    
    this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.1)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 10]);
    this.ctx.beginPath();
    this.ctx.moveTo(90, groundY);
    this.ctx.lineTo(90, this.H);
    this.ctx.moveTo(150, groundY);
    this.ctx.lineTo(150, this.H);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  
  drawPlayer() {
    const p = this.player;
    const crouchFactor = p.isCrouching ? 0.6 : 1;
    const actualHeight = p.height * crouchFactor;
    const yOffset = p.height - actualHeight;
    
    const drawX = p.x;
    const drawY = p.y + yOffset;
    
    this.ctx.save();
    
    if (p.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
      this.ctx.globalAlpha = 0.5;
    }
    
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetY = 5;
    
    this.ctx.fillStyle = '#4fc3f7';
    this.roundRect(drawX + 5, drawY + 15, p.width - 10, actualHeight - 30, 8);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#81d4fa';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2, drawY + 18, 18, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 3, drawY + 16, 4, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 4, drawY + 15, 1.5, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#1a1a2e';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 2, drawY + 22, 4, 0, Math.PI);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#ff7043';
    const legOffset = Math.sin(this.player.animFrame * 0.5) * 5;
    if (!p.isCrouching) {
      this.ctx.fillRect(drawX + 8, drawY + actualHeight - 18, 10, 18 + legOffset);
      this.ctx.fillRect(drawX + p.width - 18, drawY + actualHeight - 18, 10, 18 - legOffset);
    } else {
      this.ctx.fillRect(drawX + 8, drawY + actualHeight - 10, 14, 10);
      this.ctx.fillRect(drawX + p.width - 22, drawY + actualHeight - 10, 14, 10);
    }
    
    this.ctx.fillStyle = '#29b6f6';
    const armOffset = Math.sin(this.player.animFrame * 0.5 + Math.PI) * 4;
    this.ctx.fillRect(drawX, drawY + 25 + armOffset, 10, 22);
    this.ctx.fillRect(drawX + p.width - 10, drawY + 25 - armOffset, 10, 22);
    
    if (p.shield) {
      this.ctx.strokeStyle = `rgba(33, 150, 243, ${0.5 + Math.sin(Date.now() / 200) * 0.3})`;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(drawX + p.width / 2, drawY + actualHeight / 2, p.width * 0.8, 0, Math.PI * 2);
      this.ctx.stroke();
      
      this.ctx.fillStyle = `rgba(33, 150, 243, 0.1)`;
      this.ctx.beginPath();
      this.ctx.arc(drawX + p.width / 2, drawY + actualHeight / 2, p.width * 0.8, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    if (p.invincible) {
      this.ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + Math.sin(Date.now() / 150) * 0.4})`;
      this.ctx.lineWidth = 3;
      const starR = p.width * 0.9;
      this.ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Date.now() / 500 + i * Math.PI / 4);
        const sx = drawX + p.width / 2 + Math.cos(angle) * starR;
        const sy = drawY + actualHeight / 2 + Math.sin(angle) * starR;
        if (i === 0) this.ctx.moveTo(sx, sy);
        else this.ctx.lineTo(sx, sy);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  drawObstacles() {
    this.obstacles.forEach(obs => {
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      this.ctx.shadowBlur = 8;
      this.ctx.shadowOffsetY = 4;
      
      switch(obs.type) {
        case 'spike':
          this.drawSpike(obs);
          break;
        case 'box':
          this.drawBox(obs);
          break;
        case 'high_bar':
          this.drawHighBar(obs);
          break;
        case 'low_bar':
          this.drawLowBar(obs);
          break;
        case 'double_spike':
          this.drawDoubleSpike(obs);
          break;
        default:
          this.ctx.fillStyle = obs.color;
          this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      }
      
      this.ctx.restore();
    });
  }
  
  drawSpike(obs) {
    this.ctx.fillStyle = '#c0392b';
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = '#e74c3c';
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x + 5, obs.y + obs.height);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + 8);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawBox(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#a0522d');
    grad.addColorStop(0.5, '#8b4513');
    grad.addColorStop(1, '#654321');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    
    this.ctx.strokeStyle = '#3d2817';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height / 2);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
    this.ctx.moveTo(obs.x + obs.width / 2, obs.y);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height);
    this.ctx.stroke();
  }
  
  drawHighBar(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#34495e');
    grad.addColorStop(1, '#2c3e50');
    this.ctx.fillStyle = grad;
    this.roundRect(obs.x, obs.y, obs.width, obs.height, 4);
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(241, 196, 15, 0.8)';
    for (let i = 0; i < 3; i++) {
      this.ctx.fillRect(obs.x + 15 + i * 35, obs.y + obs.height / 2 - 3, 20, 6);
    }
    
    const poleX = obs.x + 10;
    const poleY = obs.y + obs.height;
    this.ctx.fillStyle = '#7f8c8d';
    this.ctx.fillRect(poleX, poleY, 8, obs.elevatedHeight - 40);
    this.ctx.fillRect(obs.x + obs.width - 18, poleY, 8, obs.elevatedHeight - 40);
  }
  
  drawLowBar(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#455a64');
    grad.addColorStop(1, '#37474f');
    this.ctx.fillStyle = grad;
    this.roundRect(obs.x, obs.y, obs.width, obs.height, 6);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#ff5252';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 8]);
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height / 2);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  
  drawDoubleSpike(obs) {
    this.ctx.fillStyle = '#922b21';
    for (let i = 0; i < 2; i++) {
      const sx = obs.x + i * (obs.width / 2);
      this.ctx.beginPath();
      this.ctx.moveTo(sx, obs.y + obs.height);
      this.ctx.lineTo(sx + obs.width / 4, obs.y);
      this.ctx.lineTo(sx + obs.width / 2, obs.y + obs.height);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    this.ctx.fillStyle = '#c0392b';
    for (let i = 0; i < 2; i++) {
      const sx = obs.x + i * (obs.width / 2) + 3;
      this.ctx.beginPath();
      this.ctx.moveTo(sx, obs.y + obs.height);
      this.ctx.lineTo(sx + obs.width / 4 - 3, obs.y + 10);
      this.ctx.lineTo(sx + obs.width / 4 - 3, obs.y + obs.height);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }
  
  drawItems() {
    const time = Date.now() / 200;
    
    this.items.forEach(item => {
      this.ctx.save();
      this.ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      
      const floatOffset = Math.sin(time + item.x) * 5;
      this.ctx.translate(0, floatOffset);
      
      this.ctx.shadowColor = item.color;
      this.ctx.shadowBlur = 15;
      
      switch(item.type) {
        case 'coin':
          this.drawCoin(item, time);
          break;
        case 'gem':
          this.drawGem(item);
          break;
        case 'heart':
          this.drawHeart(item);
          break;
        case 'star':
          this.drawStar(item, time);
          break;
        case 'clock':
          this.drawClock(item, time);
          break;
        case 'shield':
          this.drawShieldItem(item, time);
          break;
        default:
          this.ctx.fillStyle = item.color;
          this.ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      }
      
      this.ctx.restore();
    });
  }
  
  drawCoin(item, time) {
    const scaleX = Math.abs(Math.cos(time));
    this.ctx.scale(scaleX + 0.3, 1);
    
    const grad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, item.width / 2);
    grad.addColorStop(0, '#fff9c4');
    grad.addColorStop(0.5, '#ffd700');
    grad.addColorStop(1, '#ff8f00');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, item.width / 2 - 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#ff6f00';
    this.ctx.font = 'bold 16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('$', 0, 0);
  }
  
  drawGem(item) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#9b59b6';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s);
    this.ctx.lineTo(s, -s * 0.3);
    this.ctx.lineTo(s * 0.7, s);
    this.ctx.lineTo(-s * 0.7, s);
    this.ctx.lineTo(-s, -s * 0.3);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s + 3);
    this.ctx.lineTo(s * 0.5, -s * 0.2);
    this.ctx.lineTo(0, 0);
    this.ctx.lineTo(-s * 0.5, -s * 0.2);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawHeart(item) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#e91e63';
    this.ctx.beginPath();
    this.ctx.moveTo(0, s * 0.8);
    this.ctx.bezierCurveTo(-s * 1.2, s * 0.3, -s * 0.8, -s * 0.8, 0, -s * 0.3);
    this.ctx.bezierCurveTo(s * 0.8, -s * 0.8, s * 1.2, s * 0.3, 0, s * 0.8);
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(-s * 0.3, -s * 0.2, s * 0.2, s * 0.15, -0.5, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawStar(item, time) {
    const s = item.width / 2;
    this.ctx.rotate(time * 0.5);
    
    this.ctx.fillStyle = '#ffeb3b';
    this.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? s : s * 0.5;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.beginPath();
    this.ctx.arc(-s * 0.2, -s * 0.2, s * 0.2, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawClock(item, time) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#00bcd4';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s - 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#e0f7fa';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s - 6, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#006064';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(0, -s * 0.6);
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(s * 0.5, s * 0.2);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#006064';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawShieldItem(item, time) {
    const s = item.width / 2;
    
    const pulse = 1 + Math.sin(time) * 0.1;
    this.ctx.scale(pulse, pulse);
    
    this.ctx.fillStyle = '#2196f3';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s);
    this.ctx.lineTo(s * 0.9, -s * 0.5);
    this.ctx.lineTo(s * 0.9, s * 0.2);
    this.ctx.quadraticCurveTo(s * 0.5, s, 0, s * 0.9);
    this.ctx.quadraticCurveTo(-s * 0.5, s, -s * 0.9, s * 0.2);
    this.ctx.lineTo(-s * 0.9, -s * 0.5);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.moveTo(-s * 0.3, -s * 0.5);
    this.ctx.lineTo(s * 0.2, -s * 0.7);
    this.ctx.lineTo(-s * 0.1, 0);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s * 0.4);
    this.ctx.lineTo(0, s * 0.4);
    this.ctx.moveTo(-s * 0.35, 0);
    this.ctx.lineTo(s * 0.35, 0);
    this.ctx.stroke();
  }
  
  drawEffects() {
    const now = Date.now();
    
    this.effects = this.effects.filter(e => {
      const elapsed = now - e.startTime;
      if (elapsed >= e.duration) return false;
      
      const progress = elapsed / e.duration;
      
      if (e.type === 'collect' && e.text) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.fillStyle = e.color || '#ffd700';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 5;
        this.ctx.fillText(e.text, e.x, e.y - progress * 60);
        this.ctx.restore();
      }
      
      if (e.type === 'damage') {
        this.ctx.save();
        this.ctx.globalAlpha = (1 - progress) * 0.5;
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, 30 + progress * 40, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
      
      return true;
    });
  }
  
  drawSpeedLines(speed) {
    if (speed < 8) return;
    
    const intensity = Math.min((speed - 8) / 10, 1);
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.3})`;
    this.ctx.lineWidth = 2;
    
    for (let i = 0; i < 8; i++) {
      const y = (Date.now() / (10 - i) + i * 80) % this.H;
      const x = (i * 137 + Date.now() / 5) % this.W;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x - 40 - speed * 2, y);
      this.ctx.stroke();
    }
  }
  
  roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }
  
  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    this.update(deltaTime);
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update(deltaTime) {
    if (this.gameState === 'playing') {
      this.elapsedTime = Date.now() - this.startTime;
      
      this.player.animTimer += deltaTime;
      if (this.player.animTimer > 50) {
        this.player.animFrame++;
        this.player.animTimer = 0;
      }
      
      if (this.pendingActions.jump && !this.player.isJumping) {
        this.createJumpParticles();
      }
      
      this.updateParticles();
      
      if (this.shakeIntensity > 0.1) {
        this.shakeIntensity *= this.shakeDecay;
      } else {
        this.shakeIntensity = 0;
      }
      
      const timeSinceUpdate = Date.now() - this.lastUpdateTime;
      if (timeSinceUpdate >= 100) {
        this.lastUpdateTime = Date.now();
        this.updateBackend(timeSinceUpdate);
      }
    }
  }
  
  render() {
    this.ctx.save();
    
    if (this.shakeIntensity > 0) {
      this.ctx.translate(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity
      );
    }
    
    const speed = this.gameState === 'playing' 
      ? (this.config ? this.config.baseSpeed + (this.difficultyLevel - 1) * 0.5 : 6) 
      : 3;
    
    this.drawBackground(speed);
    this.drawGround(speed);
    this.drawSpeedLines(speed * 2);
    this.drawObstacles();
    this.drawItems();
    this.drawPlayer();
    this.drawEffects();
    this.drawParticles();
    
    this.ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ParkourGame();
});
