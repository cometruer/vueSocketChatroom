let io = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const users = require('../models/users');
const cookieParser = require('cookie-parser');
const urlencode = require('urlencode');
const moment = require('moment');

const { addRecord } = require('../models/records');

const secret = fs.readFileSync(path.resolve(__dirname, '../config/secret.key'), 'utf8');

function getUnSignedCookie(cookieString, cookieName) {
  // console.log(cookieString);
  let matches = new RegExp(`${cookieName}=([^;]+)`, 'gmi').exec(cookieString);
  // console.log(matches);
  return matches ? matches[1] : null;
}

function getSessionId(socket) {
  let cookies = socket.request.headers.cookie;
  let unsignedCookie = urlencode.decode(getUnSignedCookie(cookies, 'iouser'));
  let sessionId = cookieParser.signedCookie(unsignedCookie, secret);
  return sessionId;
}


function messageHandler(socketio) {
  socketio.on('connection', (socket) => {
    console.log(socket.id, '已连接');

    socket.on('login', (data) => {
      let sessionId = getSessionId(socket);
      console.log(sessionId);
      let time = data.time;
      if (sessionId) {
        // 设置登录的用户的socket
        users.setUserSocket(sessionId, socket);
        let username = users.getUsername(sessionId);
        // console.log(username);

        // 广播通知有用户进入聊天室
        socket.broadcast.emit('someOneLogin', {
          user: {
            username,
            sessionId,
          },
          msg: `${username} 进入了房间`,
          time,
        });
      }
    });

    // 广播
    socket.on('broadcast', (data) => {
      let sessionId = getSessionId(socket);
      console.log(sessionId);
      let username = users.getUsername(sessionId);
      // console.log(username);
      let msg = data.msg;
      let time = data.time;
      if (username) {
        socket.broadcast.emit('broadcast', {
          user: {
            sessionId,
            username,
          },
          msg,
          time,
        });

        // 储存聊天记录
        addRecord(username, sessionId, msg, time);
      }
    });

    // 私聊
    socket.on('private', (data) => {
      let sessionId = getSessionId(socket);
      let username = users.getUsername(sessionId);
      let time = data.time;
      console.log('private', data.msg);
      if (username) {
        let to = users.findUser(data.toSessionId);
        if (to) {
          to.socket.emit('private', {
            user: {
              sessionId,
              username,
            },
            msg: data.msg,
            time,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      let sessionId = getSessionId(socket);
      let username = users.getUsername(sessionId);
      console.log(username, '已退出聊天室');
      let time = moment().format('YYYY/MM/DD HH:mm:ss');
      socket.broadcast.emit('quit', {
        user: {
          sessionId,
          username,
        },
        msg: `${username} 退出了聊天室`,
        time,
      });
    });
  });
}

/**
 * 创建server
 * @param {obejct} app
 * @returns {object} server
 */
function createServer(app) {
  const server = http.createServer(app);
  io = io(server);
  messageHandler(io);
  return server;
}

module.exports = {
  createServer,
};
