const EventEmitter = require('events').EventEmitter
const net = require("net")

class Tunnel extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.connection = 0;
    this.restConn = 1;
    this._closed = false;
    for(let i = 0 ; i < options.minConn ; i++){
      this.open();
    }
  }

  open(){
    if( this._closed ) return;

    let pcs = new TunnelProcess(this.options);
    pcs.once('open' , () => {
      this.connection--;
    })
    //当连接丢失时重新开启
    pcs.once('lost' , () => {
      //this.connection
      //当剩余的可用连接数小于阈值时，启用新的连接
      if( this.connection < this.options.minConn ){
        this.open();
      }
      //this.open()
    })
  }

  close(){
    this._closed = true;

  }
}

class TunnelProcess extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.options.localHost = this.options.localHost || 'localhost';

    this._closed = false;
    this.createSocketRemote();
  }

  createSocketRemote() {
    let {remotePort , remoteHost} = this.options;
    console.log('create connection at server:'+remotePort);
    this.socketRemote = net.createConnection({ port: remotePort, host: remoteHost });

    this.socketRemote.setKeepAlive(true);

    this.socketRemote.on("connect" , () => {
      this.emit('open');
      this.createSocketLocal();
    })

    this.socketRemote.once("close", (error) => {
      console.log('remote -x-> client close');
      if( this.socketLocal ){
        this.socketLocal.end();
      }

      //连接被server关闭时，需要立即重启为其他的进入连接准备
      this.emit('lost');

      //this.reconnect()
    })

    this.socketRemote.on("error", (error) => {
      console.log('remote -x-> client error : ' , error.code);

      if (error.code === 'ECONNREFUSED') {
        //this.emit('error', `connection refused: ${remoteHost}:${remotePort}`);
      }

      this.socketRemote.end();

    });
  }

  createSocketLocal() {

    if( !this.socketRemote || this.socketRemote.destroyed ){
      this.emit('lost');
      return;
    }

    this.socketRemote.pause()
    this.socketLocal = net.createConnection({ port: this.options.localPort, host: this.options.localHost }, (socket) => {
      this.socketRemote.resume();
      this.emit('open');
      this.socketRemote.pipe(this.socketLocal).pipe(this.socketRemote);
    })
    
    this.socketLocal.once("error", (error) => {
      console.log('local socket error',error.code);

      this.socketLocal.end();

      if (error.code !== 'ECONNREFUSED') {
        return this.socketRemote.end();
      }else{
        setTimeout(()=>{
          this.createSocketLocal();
        }, 1*1000);
      }

      //this.socketRemote.end()
    })
  }

  reconnect(init){
    this.createSocketRemote();
  }

  close(){
    this._closed = true;
  }
}

class TunnelManage extends EventEmitter {
  constructor(host , port = 51221) {
    super();
    this.serverHost = host;
    this.serverPort = port;
    //建立更多的空间连接
    this.minConn = 2;
  }

  consult(remotePort , cb){
     let socket = net.createConnection({host:this.serverHost , port:this.serverPort || 51221} , () => {
      let msg = 'port.assign';
      if( remotePort) msg += ':' + remotePort;
      socket.write(msg);
    })

    socket.once('data' , (buffer)=>{
      let data = buffer.toString().split(':');
      if(data[0] == 'port.assigned'){
        cb(data[1] , data[2]);
        socket.end();
      }
    })

    socket.once("end", () =>{});
    socket.once("close", () =>{});
    socket.once('error', (err) => {
      console.log('reconnect server , wait 2s');
      setTimeout(() => {
        this.consult(remotePort,cb);
      } , 2000)
    });
  }

  establish(localPort,remotePort,publicPort ,localHost){
    let tunnel = new Tunnel({
      remoteHost: this.serverHost,
      remotePort: remotePort,
      localHost: localHost || 'localhost',
      localPort: localPort,
      publicPort:publicPort,
      minConn : this.minConn
    })
    return tunnel;
  }

  connect(localPort , remotePort , localHost = 'localhost'){
    return new Promise((resolve , reject) => {
      this.consult(remotePort , (linkPort , remotePort) => {
        console.log(`create tunnel ${localHost}:${localPort} <--> ${this.serverHost}:${remotePort}`);
        resolve(this.establish(localPort , linkPort , remotePort , localHost));
      })
    })
  }

  disconnect(id){

  }
}

module.exports = (...rest) => {
  return new TunnelManage(...rest);
}