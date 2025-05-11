const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();

const route = require("./route");
const { addUser, findUser, getRoomUsers, removeUser } = require("./users");

app.use(cors({ origin: "*" }));
app.use(route);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room }) => {
    socket.join(room);

    const { user, isExist } = addUser({ name, room });

    // Определяем сообщение в зависимости от isExist
    const welcomeMessage = isExist
      ? `${user.name}, here you go to ${room}`
      : `Welcome ${user.name} to ${room}`;

    // Отправляем персонализированное сообщение
    socket.emit("message", {
      data: { user: { name: "Admin" }, message: welcomeMessage },
    });

    // Уведомляем других пользователей
    socket.broadcast.to(user.room).emit("message", {
      data: {
        user: { name: "Admin" },
        message: isExist
          ? `${user.name} has rejoined the room`
          : `${user.name} has joined the room`,
      },
    });

    io.to(user.room).emit("room", {
      data: { users: getRoomUsers(user.room) },
    });
  });

  socket.on("sendMessage", ({ message, params }) => {
    const user = findUser(params);
    if (user) {
      io.to(user.room).emit("message", { data: { user, message } });
    }
  });

  socket.on("leftRoom", ({ params }) => {
    const user = removeUser(params);
    if (user) {
      const { room, name } = user;

      io.to(room).emit("message", {
        data: { user: { name: "Admin" }, message: `${name} has left` },
      });

      io.to(room).emit("room", {
        data: { users: getRoomUsers(room) },
      });
    }
  });

  socket.on("disconnect", () => {
    // Исправлено с io.on на socket.on
    console.log("User disconnected");
  });
});

server.listen(5000, () => {
  console.log("Server is running");
});
