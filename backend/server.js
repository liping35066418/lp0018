const express = require('express');
const cors = require('cors');
const ValidationEngine = require('./validationEngine');

const app = express();
const PORT = 9918;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const validationEngine = new ValidationEngine();

app.get('/api/levels', (req, res) => {
  res.json({
    success: true,
    data: validationEngine.getLevels()
  });
});

app.get('/api/assets', (req, res) => {
  const levelId = req.query.level ? parseInt(req.query.level) : null;
  res.json({
    success: true,
    data: validationEngine.getAssets(levelId)
  });
});

app.post('/api/validate', (req, res) => {
  const { levelId, objects } = req.body;
  
  if (!levelId || !Array.isArray(objects)) {
    return res.json({
      success: false,
      error: '请求参数无效'
    });
  }
  
  if (objects.length > 500) {
    return res.json({
      success: false,
      error: '场景对象数量过多，疑似作弊'
    });
  }
  
  const result = validationEngine.validate(levelId, objects);
  res.json(result);
});

app.post('/api/generate-test-scene', (req, res) => {
  const { levelId, testType } = req.body;
  
  if (!levelId || !testType) {
    return res.json({
      success: false,
      error: '请求参数无效'
    });
  }
  
  const validTypes = ['narrow_channel', 'high_polycount', 'light_occlusion', 'all'];
  if (!validTypes.includes(testType)) {
    return res.json({
      success: false,
      error: '无效的测试类型'
    });
  }
  
  const result = validationEngine.generateTestScene(levelId, testType);
  res.json(result);
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      backendPort: PORT,
      frontendPort: 3917,
      version: '1.0.0',
      features: ['channel_validation', 'light_occlusion', 'polycount_validation']
    }
  });
});

app.listen(PORT, () => {
  console.log(`🏗️  3D展厅搭建校验系统 - 后端服务启动成功!`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`📋 可用接口:`);
  console.log(`   GET  /api/config - 获取系统配置`);
  console.log(`   GET  /api/levels - 获取关卡列表`);
  console.log(`   GET  /api/assets - 获取构件库`);
  console.log(`   POST /api/validate - 提交场景校验`);
  console.log(`   POST /api/generate-test-scene - 生成快速验证场景`);
  console.log(``);
  console.log(`🔍 校验引擎已就绪:`);
  console.log(`   ✅ 通道宽度校验 - 洪水填充 + 距离变换算法`);
  console.log(`   ✅ 光源遮挡校验 - 光线步进 + AABB碰撞检测`);
  console.log(`   ✅ 模型面数校验 - 缩放加权面数统计`);
  console.log(``);
  console.log(`🎮 前端服务请在 http://localhost:3917 访问`);
});
