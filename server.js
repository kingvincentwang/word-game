const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 設置靜態文件目錄
app.use(express.static('public'));
app.use(express.json());

// 遊戲狀態儲存
const games = new Map();

// 路由設置
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Socket.IO 連接處理
io.on('connection', (socket) => {
    console.log('使用者連接');

    // 創建新遊戲
    socket.on('createGame', () => {
        const gameCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        games.set(gameCode, {
            players: [],
            board: Array(20).fill().map(() => Array(20).fill('')),
            currentPlayer: null,
            status: 'waiting',
            initialWord: '',
            version: 1
        });
        
        socket.join(gameCode);
        socket.emit('gameCreated', gameCode);
    });

    // 加入遊戲
    socket.on('joinGame', ({ gameCode, playerName }) => {
        const game = games.get(gameCode);
        
        if (!game) {
            socket.emit('error', '遊戲不存在');
            return;
        }
        
        if (game.players.length >= 2) {
            socket.emit('error', '遊戲已滿');
            return;
        }
        
        if (!game.players.includes(playerName)) {
            game.players.push(playerName);
            socket.join(gameCode);
            socket.playerName = playerName;
            socket.gameCode = gameCode;
            
            io.to(gameCode).emit('playerJoined', {
                players: game.players,
                status: game.status,
                version: game.version++
            });
        }
    });

    // 開始遊戲
    socket.on('startGame', ({ gameCode, initialWord }) => {
        const game = games.get(gameCode);
        
        if (!game) {
            socket.emit('error', '遊戲不存在');
            return;
        }
        
        if (game.players.length !== 2) {
            socket.emit('error', '等待玩家加入');
            return;
        }
        
        game.status = 'playing';
        game.currentPlayer = game.players[0];
        game.initialWord = initialWord;
        
        // 將初始文字放在中央
        const centerPos = Math.floor(20 / 2);
        game.board[centerPos][centerPos] = initialWord;
        
        io.to(gameCode).emit('gameStarted', {
            currentPlayer: game.currentPlayer,
            board: game.board,
            status: game.status,
            players: game.players,
            version: game.version++
        });
    });

    // 提交文字
    socket.on('submitWord', ({ gameCode, playerName, word, selectedCells }) => {
        const game = games.get(gameCode);
        
        if (!game) {
            socket.emit('error', '遊戲不存在');
            return;
        }
        
        if (game.status !== 'playing') {
            socket.emit('error', '遊戲尚未開始');
            return;
        }
        
        if (game.currentPlayer !== playerName) {
            socket.emit('error', '不是您的回合');
            return;
        }
        
        // 檢查並放置文字
        for (let i = 0; i < 3; i++) {
            const cell = selectedCells[i];
            if (game.board[cell.row][cell.col] !== '') {
                socket.emit('error', '選擇的位置已被占用');
                return;
            }
            game.board[cell.row][cell.col] = word[i];
        }
        
        // 切換玩家
        const currentPlayerIndex = game.players.indexOf(playerName);
        game.currentPlayer = game.players[(currentPlayerIndex + 1) % 2];
        
        io.to(gameCode).emit('wordSubmitted', {
            currentPlayer: game.currentPlayer,
            board: game.board,
            version: game.version++
        });
    });

    socket.on('disconnect', () => {
        if (socket.gameCode) {
            const game = games.get(socket.gameCode);
            if (game) {
                game.players = game.players.filter(p => p !== socket.playerName);
                if (game.players.length === 0) {
                    games.delete(socket.gameCode);
                } else {
                    io.to(socket.gameCode).emit('playerLeft', {
                        players: game.players,
                        version: game.version++
                    });
                }
            }
        }
    });
});

// 使用 3000 作為容器內部端口
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});