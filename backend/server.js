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
  const { playerName } = req.body;
  const gameId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const seed = Math.floor(Math.random() * 0x7fffffff);
  
  const state = gameEngine.createState(seed);
  
  const gameRecord = {
    id: gameId,
    seed,
    playerName: playerName || '匿名玩家',
    createdAt: Date.now(),
    submitted: false
  };
  
  activeGames.set(gameId, gameRecord);
  
  const initialState = {
    score: state.score,
    lives: state.lives,
    combo: state.combo,
    timeLeft: state.timeLeft,
    difficultyLevel: state.difficultyLevel,
    player: { ...state.player },
    obstacles: state.obstacles.map(o => ({ ...o })),
    items: state.items.map(i => ({ ...i }))
  };
  
  res.json({
    success: true,
    data: {
      gameId,
      seed,
      config: gameEngine.getGameConfig(),
      initialState
    }
  });
});

app.post('/api/game/end', (req, res) => {
  const { gameId, playerName, actions, clientScore } = req.body;
  const game = activeGames.get(gameId);
  
  if (!game) {
    return res.json({ success: false, error: '游戏不存在或已结束' });
  }
  
  if (game.submitted) {
    return res.json({ success: false, error: '该游戏已提交过分数' });
  }
  
  if (!Array.isArray(actions)) {
    return res.json({ success: false, error: '操作记录无效' });
  }
  
  if (actions.length > 50000) {
    return res.json({ success: false, error: '操作记录过长，疑似作弊' });
  }
  
  const result = gameEngine.replay(game.seed, actions);
  
  game.submitted = true;
  activeGames.delete(gameId);
  
  const finalScore = result.score;
  const timeSurvivedSec = Math.floor(result.timeSurvived / 1000);
  const rank = gameEngine.submitHighScore(
    game.playerName || playerName || '匿名玩家',
    finalScore,
    timeSurvivedSec,
    result.dashCount,
    result.dashBreakCount
  );
  const highScores = gameEngine.getHighScores();
  
  res.json({
    success: true,
    data: {
      finalScore,
      rank,
      highScores,
      maxLives: gameEngine.config.maxLives,
      verified: true,
      timeSurvived: timeSurvivedSec,
      livesRemaining: result.lives,
      dashCount: result.dashCount,
      dashBreakCount: result.dashBreakCount
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
  console.log(`   POST /api/game/end - 结束游戏并提交分数（后端重放验证）`);
  console.log(`   GET  /api/highscores - 获取排行榜`);
  console.log(`   🔒 分数由后端独立重放验证，前端无法伪造`);
});
