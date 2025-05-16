const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();

const route = require("./route");
const { 
  addUser, 
  findUser, 
  getRoomUsers, 
  removeUser,
  addMessageToHistory,
  getRoomHistory,
  findUserById,
  setUserOnlineStatus
} = require("./users");

const multer = require('multer');
const path = require('path');
const fs = require('fs');

app.use(cors({ origin: "*" }));
app.use(route);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware для проверки аутентификации
io.use((socket, next) => {
  const { token } = socket.handshake.auth;
  // Здесь можно добавить проверку токена
  next();
});

// Создаем папку uploads, если ее нет
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Маршрут для загрузки файлов
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    url: `/uploads/${req.file.filename}`,
    type: req.file.mimetype.split('/')[0] // audio, video, image
  });
});

// Статическая папка для файлов
app.use('/uploads', express.static('uploads'));

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Устанавливаем статус онлайн при подключении
  socket.on("setOnline", ({ userId }) => {
    setUserOnlineStatus(userId, true);
    io.emit("userStatusChanged", { userId, isOnline: true });
  });

  socket.on("join", ({ name, room }) => {
    // Проверка на максимальное количество пользователей в комнате
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    if (roomSize >= 100) {
      socket.emit("error", { message: "Room is full (max 100 users)" });
      return;
    }

    socket.join(room);
    const { user, isExist } = addUser({ 
      name, 
      room, 
      id: socket.id,
      socketId: socket.id
    });

    const timestamp = new Date().toISOString();
    const welcomeMessage = isExist
      ? `${user.name}, welcome back to ${room}`
      : `Welcome ${user.name} to ${room}`;

    // Отправляем историю сообщений новому пользователю
    if (!isExist) {
      const roomHistory = getRoomHistory(room);
      socket.emit("history", { data: roomHistory });
    }

    // Системное сообщение для вошедшего пользователя
    socket.emit("message", {
      data: { 
        user: { name: "Admin", id: "system" }, 
        message: welcomeMessage,
        timestamp,
        type: "system"
      }
    });

    // Уведомление для других пользователей
    socket.broadcast.to(user.room).emit("message", {
      data: {
        user: { name: "Admin", id: "system" },
        message: isExist 
          ? `${user.name} has rejoined the chat`
          : `${user.name} has joined the chat`,
        timestamp,
        type: "system"
      }
    });

    // Обновляем список пользователей в комнате
    io.to(user.room).emit("roomData", {
      data: { 
        users: getRoomUsers(user.room),
        room: user.room 
      },
    });
  });

  // Обработка обычных сообщений
  socket.on("sendMessage", ({ message, params, file }) => {
    const user = findUser(params);
    if (user) {
      const timestamp = new Date().toISOString();
      const messageData = {
        user,
        message,
        timestamp,
        room: user.room,
        type: file ? file.type : 'text'
      };
      
      if (file) {
        messageData.file = file;
      }
      
      // Сохраняем сообщение в историю
      addMessageToHistory(user.room, messageData);
      
      // Отправляем сообщение всем в комнате
      io.to(user.room).emit("message", { data: messageData });
    }
  });

  // Обработка приватных сообщений
  socket.on("privateMessage", ({ to, message }) => {
    const fromUser = findUserById(socket.id);
    const toUser = findUserById(to);
    
    if (fromUser && toUser) {
      const timestamp = new Date().toISOString();
      const messageData = {
        from: fromUser,
        to: toUser,
        message,
        timestamp,
        type: "private"
      };
      
      // Отправляем получателю
      io.to(toUser.socketId).emit("privateMessage", messageData);
      // Отправляем отправителю для подтверждения
      socket.emit("privateMessage", messageData);
    }
  });

  // Обработка набора текста
  socket.on("typing", ({ room, isTyping }) => {
    const user = findUserById(socket.id);
    if (user) {
      socket.broadcast.to(room).emit("typing", {
        userId: user.id,
        name: user.name,
        isTyping
      });
    }
  });

  // Выход из комнаты
  socket.on("leaveRoom", ({ params }) => {
    const user = removeUser(params);
    if (user) {
      const timestamp = new Date().toISOString();
      
      io.to(user.room).emit("message", {
        data: { 
          user: { name: "Admin", id: "system" }, 
          message: `${user.name} has left the chat`,
          timestamp,
          type: "system"
        }
      });

      io.to(user.room).emit("roomData", {
        data: { 
          users: getRoomUsers(user.room),
          room: user.room 
        },
      });
    }
  });

  // Отключение пользователя
  socket.on("disconnect", () => {
    const user = findUserById(socket.id);
    if (user) {
      const timestamp = new Date().toISOString();
      
      setUserOnlineStatus(user.id, false);
      io.to(user.room).emit("userStatusChanged", { 
        userId: user.id, 
        isOnline: false 
      });

      io.to(user.room).emit("message", {
        data: { 
          user: { name: "Admin", id: "system" }, 
          message: `${user.name} has disconnected`,
          timestamp,
          type: "system"
        }
      });

      removeUser({ name: user.name, room: user.room });
      io.to(user.room).emit("roomData", {
        data: { 
          users: getRoomUsers(user.room),
          room: user.room 
        },
      });
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(5000, () => {
  console.log("Server is running on port 5000");
});