const EventEmitter = require('events').EventEmitter
const net = require("net")

const pipe = (client, server) => {
  const onClose = err => {
    client.destroy();
    server.destroy();
  };
  const onError = err => {
    console.log(err);
  };
  client.pipe(server);
  server.pipe(client);
  server.on('close', onClose);
  server.on('error', onError);
  client.on('close', onClose);
  client.on('error', onError);
}

class PortPool {
  constructor(start = 10000, end = 65535) {
    this.range = Array.from({ length: (end - start) }, (_, i) => i + start);
    this.use = [];
  }

  random() {
    return this.idle({ port: 0 });
  }

  get() {
    return new Promise((resolve, reject) => {
      this.range.reduce((seq, port) => {
        return seq.catch(() => {
          return this.idle({ port }).then(port => port).catch(Promise.reject.bind(Promise));
        });
      }, Promise.reject()).then(resolve).catch(reject);
    });
  }

  add(port) {
    this.pool.push(port);
  }

  remove(port) {
    let index = this.range.findIndex(i => i == port);
    if (index) {
      this.range.splice(index, 1);
    }
  }

  idle(options) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', (err) => {
        if (options.port) this.remove(options.port);
        reject();
      });
      server.listen(options, () => {
        const { port } = server.address();
        this.remove(port);
        server.close(() => {
          resolve(port);
        });
      });
    })
  }
}

class Server extends EventEmitter {
  constructor(options = {portPool:[20000,30000] , bindPort:51221}) {
    super();
    this.options = options;
    this.pool = new PortPool(options.portPool[0], options.portPool[1]);
    this.clientMap = new Map();
    this.commu = net.createServer((socket) => {
      socket.on('data', (buffer) => {
        let data = buffer.toString().split(':');
        if (data[0] == 'port.assign') {
          this.createServer(data[1], (link_port, remote_port) => {
            console.log(`Server(${remote_port}) <---> Server(:${link_port}) <---> Client`);
            socket.write('port.assigned:' + link_port + ':' + remote_port);
          })
        }
      })
    });

    this.commu.on('error', (err) => {
      console.log('Commu Error',err);
    });

    this.commu.listen(this.options.bindPort);

    console.log('Server Running at :',this.options.bindPort);

  }

  createServer(remotePort, cb) {
    if (this.clientMap.has(remotePort)) {
      let client = this.clientMap.get(remotePort);
      cb(client.options.inport , remotePort);
    } else {
      this.getPairsPort(remotePort).then(pairs => {
        let client = new Client(pairs[0], pairs[1]);
        this.clientMap.set(pairs[1], client);
        cb(pairs[0], pairs[1]);
      })
    }
  }

  getPairsPort(remotePort) {
    return new Promise((resolve, reject) => {
      this.pool.random().then(linkPort => {
        if (remotePort) {
          resolve([linkPort, remotePort]);
        } else {
          this.pool.get().then(remotePort => {
            resolve([linkPort, remotePort]);
          })
        }
      })
    })

  }
}


class Client extends EventEmitter {
  constructor(inport, outport) {
    super();
    this.options = { inport, outport };

    this.agent = new Agent(inport);

    //创建外部监听
    this.server = net.createServer();

    this.server.on('connection' , (socket) => {
      console.log('user --> server is connect ')
      this.agent.createConnection((conn) => {
        pipe(conn, socket);
        //console.log('pipe');
        // pump(conn, socket);
        // pump(socket, conn);
      })
    })

    this.server.on('error', (err) => {
      console.log('user -x-> server');

      if (err.code == 'EADDRINUSE') {

      }
    })

    this.server.on('close', () => {
      console.log('close');
    })

    this.server.listen(outport);
  }
}

//回环连接,接受来自client的连接，并在user 发起 request，将此socket pipe过去
class Agent extends EventEmitter {
  constructor(port, options) {
    super();
    this.options = options || {};

    this.availableSockets = [];
    this.waitingCreateConn = [];
    this.closed = false;

    this.server = net.createServer();

    this.server.on('connection', this._onConnection.bind(this));

    this.server.on('close', this._onClose.bind(this));

    this.server.on('error', (err) => {
      console.log('Error : client <-x-> server',err);

      if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {

      }
    })

    this.server.listen(port);
  }

  _onConnection(socket) {
    console.log('save local cilent connection');

    socket.setKeepAlive(true);

    const fn = this.waitingCreateConn.shift();

    if (fn) {
      console.log('giving socket to queued conn request');
      setTimeout(() => {
        fn(socket);
      }, 0);
      return
    }

    socket.once('close', (err) => {
      console.log('closed socket (error: %s)', err);
      const index = this.availableSockets.indexOf(socket);

      if (index >= 0) {
        this.availableSockets.splice(index, 1);
      }

      if (this.availableSockets.length <= 0) {
        console.log('all sockets disconnected');
        this.emit('offline');
      }
    })

    socket.once('error', (err) => {
      console.log('connection error');
      socket.destroy();
    })

    this.availableSockets.push(socket);

    console.log(`available connection count ${this.availableSockets.length}`)
  }

  _onClose() {
    console.log(' -x-> Agent closed');

    this.closed = true;
    for (const conn of this.waitingCreateConn) {
      conn(new Error('closed'), null);
    }
    this.waitingCreateConn = [];
    this.emit('end');
  }

  createConnection(cb) {
    if (this.closed) {
      console.log('user connection is closed');
      cb(new Error('closed'));
      return;
    }

    const sock = this.availableSockets.shift();

    if (!sock) {
      this.waitingCreateConn.push(cb);
      console.log('NO available link socket from pools');
      // console.log('waiting connected: %s', this.connectedSockets)
      return
    }else{
      console.log('socket given server ---> client');
      cb(sock);
    }
  }
}

module.exports = (...rest) => {
  return new Server(...rest);
}
