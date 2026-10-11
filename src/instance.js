import net from 'node:net';
// An OS-held listener avoids stale PID files and competing publisher instances.
export function singleInstance(port=64637) {
  return new Promise((resolve,reject)=>{
    const server=net.createServer(socket=>socket.end());
    server.once('error',()=>reject(new Error('Codex Discord RPC is already running, or local port 64637 is in use.')));
    server.listen({host:'127.0.0.1',port,exclusive:true},()=>resolve(server));
  });
}
