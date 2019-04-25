irp
===
irp is a tcp proxy built using Node.js     

Installation
===
Simple install as a dependency using npm:  
```javascript
npm install irp --save
```
Usage
===
## Server
```javascript
const irp = require('irp')

const server = irp.createServer()

```
###Options  
```
irp.createServer({
  portPool:[20000,30000],
  bindPort:51221
})
```

## Client

```javascript
const irp = require('irp')

const client = irp.createClient('exampleserver.com')

client.connect(22,10022)
```