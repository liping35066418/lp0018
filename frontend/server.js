const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3917;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

app.listen(PORT, () => {
  console.log(`�️ 3D展厅实训系统前端服务启动成功!`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`⚙️  请确保后端校验引擎已在 http://localhost:9918 启动`);
});
