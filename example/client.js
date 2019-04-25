const fs = require('fs')
const irp = require('../index')

try{
  let data = fs.readFileSync(process.cwd() + '/example/client.json','utf-8');  
  data = JSON.parse(data)
  if(data && data.server_addr){
    let tunnelManager = irp.createClient(data.server_addr , data.server_port)
    if(data.tunnels.length){
      data.tunnels.forEach( conf => {
        tunnelManager.connect(conf.local_port , conf.remote_port , conf.local_addr)
      })
    }
  }
}catch(e){
  console.log(e)
}