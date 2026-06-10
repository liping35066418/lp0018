const express = require('express');
const cors = require('cors');
const GameEngine = require('./gameEngine');

const app = express();
const PORT = 9618;

app.use(cors());
app.use(express.json());

const gameEngine = new GameEngine();

const activeGames = new Map();

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: gameEngine.getGameConfig()
  });
});

app.post('/api/game/start', (req, res) => {
  const gameId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const initialScene = gameEngine.generateInitialScene();
  const gameState = {
    id: gameId,
    startTime: Date.now(),
    elapsedTime: 0,
    score: 0,
    lives: gameEngine.config.maxLives,
    combo: 0,
    speed: gameEngine.config.baseSpeed,
    timeLeft: gameEngine.config.gameTime,
    player: {
      x: 120,
      y: 0,
      width: 50,
      height: 80,
      velocityY: 0,
      isJumping: false,
      isCrouching: false,
      invincible: false,
      shield: false,
      lane: 0
    },
    obstacles: initialScene.obstacles,
    items: initialScene.items,
    lastObstacleX: Math.max(...initialScene.obstacles.map(o => o.x)),
    lastItemX: Math.max(...initialScene.items.map(i => i.x)),
    effects: [],
    status: 'playing'
  };
  
  gameState.player.y = gameEngine.config.canvasHeight - gameEngine.config.groundHeight - gameState.player.height;
  activeGames.set(gameId, gameState);
  
  res.json({
    success: true,
    data: {
      gameId,
      config: gameEngine.getGameConfig(),
      initialState: gameState
    }
  });
});

app.post('/api/game/update', (req, res) => {
  const { gameId, elapsedTime, playerAction, deltaTime } = req.body;
  const game = activeGames.get(gameId);
  
  if (!game) {
    return res.json({ success: false, error: '游戏不存在' });
  }
  
  if (game.status !== 'playing') {
    return res.json({ success: true, data: game });
  }
  
  game.elapsedTime = elapsedTime;
  game.speed = gameEngine.getCurrentSpeed(elapsedTime);
  game.difficultyLevel = gameEngine.getDifficultyLevel(elapsedTime);
  game.timeLeft = Math.max(0, gameEngine.config.gameTime - Math.floor(elapsedTime / 1000));
  
  const player = game.player;
  if (playerAction) {
    if (playerAction.jump && !player.isJumping) {
      player.velocityY = gameEngine.config.jumpForce;
      player.isJumping = true;
    }
    if (playerAction.crouch !== undefined) {
      player.isCrouching = playerAction.crouch;
    }
    if (playerAction.laneChange) {
      player.lane = Math.max(-1, Math.min(1, player.lane + playerAction.laneChange));
    }
  }
  
  player.velocityY += gameEngine.config.gravity;
  player.y += player.velocityY;
  
  const groundY = gameEngine.config.canvasHeight - gameEngine.config.groundHeight - 
    (player.isCrouching ? player.height * 0.6 : player.height);
  
  if (player.y >= groundY) {
    player.y = groundY;
    player.velocityY = 0;
    player.isJumping = false;
  }
  
  player.x = 120 + player.lane * 30;
  
  const scrollAmount = game.speed * (deltaTime / 16.67);
  game.obstacles.forEach(obs => { obs.x -= scrollAmount; });
  game.items.forEach(item => { item.x -= scrollAmount; });
  
  game.obstacles = game.obstacles.filter(obs => obs.x + obs.width > -100);
  game.items = game.items.filter(item => item.x + item.width > -100);
  
  const spawnInterval = gameEngine.getObstacleSpawnInterval(elapsedTime);
  game.lastObstacleX -= scrollAmount;
  if (game.lastObstacleX < gameEngine.config.canvasWidth + 100 && Math.random() < deltaTime / spawnInterval) {
    const newObstacle = gameEngine.generateObstacle(elapsedTime, gameEngine.config.canvasWidth + 200);
    game.obstacles.push(newObstacle);
    game.lastObstacleX = newObstacle.x;
  }
  
  const itemInterval = gameEngine.getItemSpawnInterval(elapsedTime);
  game.lastItemX -= scrollAmount;
  if (game.lastItemX < gameEngine.config.canvasWidth + 100 && Math.random() < deltaTime / itemInterval) {
    const newItem = gameEngine.generateItem(elapsedTime, gameEngine.config.canvasWidth + 300);
    game.items.push(newItem);
    game.lastItemX = newItem.x;
  }
  
  const collisionResults = { obstaclesHit: [], itemsCollected: [] };
  
  game.obstacles = game.obstacles.filter(obs => {
    if (gameEngine.checkCollision(player, obs)) {
      const result = gameEngine.handleObstacleCollision(player, obs);
      collisionResults.obstaclesHit.push({ obstacle: obs, result });
      if (result.hit) {
        game.lives -= result.damage;
        game.combo = 0;
        game.effects.push({
          id: Date.now(),
          type: 'damage',
          x: player.x + player.width / 2,
          y: player.y + player.height / 2,
          duration: 500,
          startTime: Date.now()
        });
        if (game.lives <= 0) {
          game.status = 'gameover';
        }
      } else {
        game.score += gameEngine.calculateScore(result.scoreGained, elapsedTime, game.combo);
        game.combo++;
      }
      return false;
    }
    return true;
  });
  
  game.items = game.items.filter(item => {
    if (gameEngine.checkCollision(player, item)) {
      const result = gameEngine.handleItemCollision(player, item);
      collisionResults.itemsCollected.push({ item, result });
      game.score += gameEngine.calculateScore(result.scoreGained, elapsedTime, game.combo);
      if (result.heal) {
        game.lives = Math.min(gameEngine.config.maxLives, game.lives + result.heal);
      }
      if (result.invincible) {
        player.invincible = true;
        setTimeout(() => { 
          if (activeGames.get(gameId)) player.invincible = false; 
        }, result.invincible);
      }
      if (result.shield) {
        player.shield = true;
      }
      if (result.timeBonus) {
        game.timeLeft += result.timeBonus;
      }
      game.combo++;
      game.effects.push({
        id: Date.now(),
        type: 'collect',
        x: item.x + item.width / 2,
        y: item.y + item.height / 2,
        color: item.color,
        text: `+${result.scoreGained}`,
        duration: 800,
        startTime: Date.now()
      });
      return false;
    }
    return true;
  });
  
  game.score += Math.floor(scrollAmount * 0.1);
  
  game.effects = game.effects.filter(e => Date.now() - e.startTime < e.duration);
  
  if (game.timeLeft <= 0 && game.status === 'playing') {
    game.status = 'gameover';
    game.finalScore = game.score;
  }
  
  res.json({
    success: true,
    data: {
      ...game,
      collisionResults
    }
  });
});

app.post('/api/game/end', (req, res) => {
  const { gameId, playerName } = req.body;
  const game = activeGames.get(gameId);
  
  if (!game) {
    return res.json({ success: false, error: '游戏不存在' });
  }
  
  game.status = 'gameover';
  const rank = gameEngine.submitHighScore(playerName || '匿名玩家', game.score);
  const highScores = gameEngine.getHighScores();
  
  activeGames.delete(gameId);
  
  res.json({
    success: true,
    data: {
      finalScore: game.score,
      rank,
      highScores,
      maxLives: gameEngine.config.maxLives
    }
  });
});

app.get('/api/highscores', (req, res) => {
  res.json({
    success: true,
    data: gameEngine.getHighScores()
  });
});

app.get('/api/difficulty/:elapsedTime', (req, res) => {
  const elapsedTime = parseInt(req.params.elapsedTime);
  res.json({
    success: true,
    data: {
      level: gameEngine.getDifficultyLevel(elapsedTime),
      speed: gameEngine.getCurrentSpeed(elapsedTime),
      obstacleInterval: gameEngine.getObstacleSpawnInterval(elapsedTime),
      itemInterval: gameEngine.getItemSpawnInterval(elapsedTime)
    }
  });
});

app.listen(PORT, () => {
  console.log(`🏃 跑酷游戏后端服务启动成功!`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`📋 可用接口:`);
  console.log(`   GET  /api/config - 获取游戏配置`);
  console.log(`   POST /api/game/start - 开始新游戏`);
  console.log(`   POST /api/game/update - 更新游戏状态`);
  console.log(`   POST /api/game/end - 结束游戏并提交分数`);
  console.log(`   GET  /api/highscores - 获取排行榜`);
});
