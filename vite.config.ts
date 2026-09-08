import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',proxy:{'/api':{
 target:'http://127.0.0.1:3000',changeOrigin:true,
 configure(proxy){proxy.on('proxyReq',(request,source)=>{
  // Forward this local development page using the API server's same-origin contract.
  if(source.headers.origin===`http://${source.headers.host}`) request.setHeader('Origin','http://127.0.0.1:3000');
 });}
}}}});
