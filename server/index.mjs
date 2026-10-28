import { createServer } from 'node:http';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Store } from './store.mjs';
import { catalog } from './protocols.mjs';
import { AppError } from './engine.mjs';
import { createPreview } from './preview.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const files = new Map([
  ['/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/preview.js',['preview.js','text/javascript; charset=utf-8']],
  ['/preview-state.js',['preview-state.js','text/javascript; charset=utf-8']],
  ['/present-trial.js',['present-trial.js','text/javascript; charset=utf-8']],
  ['/debrief.js',['debrief.js','text/javascript; charset=utf-8']],
  ['/task-ui.js',['task-ui.js','text/javascript; charset=utf-8']],
  ['/ranking.js',['ranking.js','text/javascript; charset=utf-8']],
  ['/i18n.js',['i18n.js','text/javascript; charset=utf-8']],
  ['/timed-response.js',['timed-response.js','text/javascript; charset=utf-8']],
  ['/locale-data.js',['locale-data.js','text/javascript; charset=utf-8']],
  ['/revised-messages.js',['revised-messages.js','text/javascript; charset=utf-8']],
  ['/expanded-messages.js',['expanded-messages.js','text/javascript; charset=utf-8']],
  ['/admin.js',['admin.js','text/javascript; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/fonts/noto-sans-jp/index.css',['fonts/noto-sans-jp/index.css','text/css; charset=utf-8']],
  ['/favicon.svg',['favicon.svg','image/svg+xml']]
]);
for(const name of readdirSync(new URL('../public/fonts/noto-sans-jp/files/',import.meta.url))){
  if(/^noto-sans-jp-[\w-]+\.woff2$/.test(name))files.set('/fonts/noto-sans-jp/files/'+name,['fonts/noto-sans-jp/files/'+name,'font/woff2']);
}
async function body(request) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw new AppError('JSON形式で送信してください。',415);
  let size=0; const chunks=[];
  for await (const chunk of request) {
    size+=chunk.length;
    if(size>65536)throw new AppError('送信データが大きすぎます。',413);
    chunks.push(chunk);
  }
  try { const data=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(); return data; }
  catch { throw new AppError('送信データを読み取れません。'); }
}
export function createApp(store) {
  return createServer(async (req,res)=>{
    const headers={
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    };
    const send=(status,value,type='application/json; charset=utf-8',extra={})=>{
      res.writeHead(status,{...headers,'Content-Type':type,...extra});
      res.end(type.startsWith('application/json')?JSON.stringify(value):value);
    };
    try {
      const host=req.headers.host || '';
      if(!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host))throw new AppError('ローカル接続のみ利用できます。',403);
      const url=new URL(req.url,'http://'+host);
      const path=url.pathname;
      if(path==='/preview/student')headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'");
      const privateRequest=req.method!=='GET'||path.startsWith('/api/');
      if(privateRequest && req.headers.origin && req.headers.origin!=='http://'+host)throw new AppError('別のサイトからは操作できません。',403);
      if(privateRequest && req.headers['sec-fetch-site']==='cross-site')throw new AppError('別のサイトからは操作できません。',403);
      if(req.method==='GET' && path==='/api/catalog')return send(200,catalog);
      if(req.method==='POST' && path==='/api/preview')return send(200,createPreview(await body(req)));
      if(req.method==='GET' && path==='/api/health')return send(200,{ok:true,version:catalog.version});
      if(req.method==='GET' && path==='/api/classroom')return send(200,store.classroom.dashboard());
      if(req.method==='POST' && path==='/api/classroom/join')return send(200,store.classroom.join(await body(req)));
      if(req.method==='POST' && path==='/api/classroom/start')return send(200,store.classroom.start(await body(req)));
      const classroomMatch=path.match(/^\/api\/classroom\/(student|end)\/([0-9a-f-]{36})$/);
      if(classroomMatch){
        if(req.method==='GET'&&classroomMatch[1]==='student')return send(200,store.classroom.student(classroomMatch[2]));
        if(req.method==='POST'&&classroomMatch[1]==='end'){await body(req);return send(200,store.classroom.end(classroomMatch[2]));}
      }
      if(req.method==='POST' && path==='/api/runs'){await body(req);throw new AppError('教師が実験を開始してください。',410);}
      if(req.method==='GET' && path==='/api/runs')return send(200,{runs:store.runs.list()});
      const runMatch=path.match(/^\/api\/runs\/([0-9a-f-]{36})(?:\/(answers|withdraw))?$/);
      if(runMatch){
        if(req.method==='GET'&&!runMatch[2])return send(200,store.runs.state(runMatch[1]));
        if(req.method==='POST'&&runMatch[2]==='answers')return send(200,store.runs.submit(runMatch[1],await body(req)));
        if(req.method==='POST'&&runMatch[2]==='withdraw'){await body(req);return send(200,store.runs.withdraw(runMatch[1]));}
      }
      if(req.method==='GET' && path==='/api/sessions')return send(200,{sessions:store.list(),pairs:store.pairs()});
      if(req.method==='POST' && path==='/api/sessions'){
        const input=await body(req);
        if(input.isTest!==true)throw new AppError('教師が実験を開始してください。',410);
        return send(200,store.start(input));
      }
      const studentsOnly=url.searchParams.get('scope')==='students';
      if(req.method==='GET' && path==='/api/export.json')return send(200,store.exportJSON({studentsOnly}),'application/json; charset=utf-8',{'Content-Disposition':'attachment; filename="judgment-data.json"'});
      if(req.method==='GET' && path==='/api/export.csv')return send(200,store.exportCSV({studentsOnly}),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="judgment-responses.csv"'});
      const match=path.match(/^\/api\/sessions\/([0-9a-f-]{36})(?:\/(answers|withdraw))?$/);
      if(match){
        if(req.method==='GET' && !match[2])return send(200,store.state(match[1]));
        if(req.method==='POST' && match[2]==='answers')return send(200,store.submit(match[1],await body(req)));
        if(req.method==='POST' && match[2]==='withdraw'){await body(req);return send(200,store.withdraw(match[1]));}
      }
      if(req.method==='GET' && /^\/experiment\/[0-9]{2}-[0-9]{2}$/.test(path)){res.writeHead(302,{...headers,Location:'/'});return res.end();}
      if(req.method==='GET' && path==='/')return send(200,readFileSync(resolve(root,'public/index.html')),'text/html; charset=utf-8');
      if(req.method==='GET' && path==='/preview/student')return send(200,readFileSync(resolve(root,'public/index.html')),'text/html; charset=utf-8');
      if(req.method==='GET' && path==='/preview')return send(200,readFileSync(resolve(root,'public/preview.html')),'text/html; charset=utf-8');
      if(req.method==='GET' && path==='/admin')return send(200,readFileSync(resolve(root,'public/admin.html')),'text/html; charset=utf-8');
      if(req.method==='GET' && files.has(path)){
        const [file,type]=files.get(path);return send(200,readFileSync(resolve(root,'public',file)),type);
      }
      throw new AppError('ページが見つかりません。',404);
    } catch(error) {
      if(!(error instanceof AppError))console.error(error);
      if(!res.headersSent)send(error.status || 500,{error:error instanceof AppError?error.message:'保存できませんでした。サーバーの状態を確認して、同じ回答を再送してください。'});
      else res.end();
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const directory=resolve(process.env.DATA_DIR || resolve(root,'data'));
  mkdirSync(directory,{recursive:true});
  const store=new Store(resolve(directory,'local.sqlite'));
  const port=Number(process.env.PORT || 3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be 1–65535.');
  const server=createApp(store);
  server.listen(port,'127.0.0.1',()=>console.log('判断ラボ: http://127.0.0.1:'+port+'\nデータ: '+resolve(directory,'local.sqlite')));
  const shutdown=()=>server.close(()=>{store.close();process.exit(0);});
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
