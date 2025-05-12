const { trimStr } = require("./utils");

let users = [];
let messagesHistory = {};
let onlineStatus = {};

const findUser = (user) => {
  const userName = trimStr(user.name);
  const userRoom = trimStr(user.room);

  return users.find(
    (u) => trimStr(u.name) === userName && trimStr(u.room) === userRoom
  );
};

const findUserById = (id) => {
  return users.find(u => u.id === id);
};

const addUser = (user) => {
  const isExist = findUser(user);

  if (!isExist) {
    const userWithId = { ...user, id: user.id || Date.now().toString() };
    users.push(userWithId);
    onlineStatus[userWithId.id] = true;
    return { isExist: false, user: userWithId };
  }

  // Обновляем socketId если пользователь переподключился
  isExist.socketId = user.id;
  onlineStatus[isExist.id] = true;
  return { isExist: true, user: isExist };
};

const getRoomUsers = (room) => {
  return users.filter((u) => u.room === room).map(user => ({
    id: user.id,
    name: user.name,
    isOnline: onlineStatus[user.id] || false
  }));
};

const removeUser = (user) => {
  const found = findUser(user);
  if (found) {
    users = users.filter(
      ({ room, name }) => room === found.room && name !== found.name
    );
    onlineStatus[found.id] = false;
  }
  return found;
};

const addMessageToHistory = (room, message) => {
  if (!messagesHistory[room]) {
    messagesHistory[room] = [];
  }
  messagesHistory[room].push(message);
  // Ограничиваем историю (последние 100 сообщений)
  if (messagesHistory[room].length > 100) {
    messagesHistory[room] = messagesHistory[room].slice(-100);
  }
};

const getRoomHistory = (room) => {
  return messagesHistory[room] || [];
};

const setUserOnlineStatus = (userId, status) => {
  onlineStatus[userId] = status;
};

module.exports = { 
  addUser, 
  findUser, 
  getRoomUsers, 
  removeUser,
  findUserById,
  addMessageToHistory,
  getRoomHistory,
  setUserOnlineStatus
};