const express = require('express');
const path = require('path');

const app = express();
const PORT = 3618;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 跑酷游戏前端服务启动成功!`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`⚙️  请确保后端服务已在 http://localhost:9618 启动`);
});
