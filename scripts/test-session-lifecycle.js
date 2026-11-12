const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require('path').join(__dirname, '../src/bridge/Lifecycle.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019}}).outputText;
let timers = [], now = 0;
const moduleObject = {exports: {}};
vm.runInNewContext(source, {exports: moduleObject.exports, module: moduleObject, Promise, Date, Math, Number, Error,
  setTimeout(fn, delay) { const timer = {fn, at: now + delay}; timers.push(timer); return timer; },
  clearTimeout(timer) { timers = timers.filter(t => t !== timer); }
});
const {Lifecycle, documentId, sameScope} = moduleObject.exports;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const advance = async ms => { now += ms; const due = timers.filter(t => t.at <= now); timers = timers.filter(t => t.at > now); due.forEach(t => t.fn()); await flush(); };
const scope = generation => ({documentId, generation});
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function active(kind = 'room') {
  const owner = new Lifecycle(), replies = [], task = owner.begin(kind, scope(1), value => replies.push(value));
  let closes = 0;
  task.object = kind === 'room' ? {phase: 'connected', async disconnect() { closes++; this.phase = 'disconnected'; }} : {stop() { closes++; }};
  owner.activate(task, '{}'); task.settle();
  return {owner, task, replies, closes: () => closes};
}
test('duplicate create cannot replace an in-flight or active owner', async () => {
  const owner = new Lifecycle(); const task = owner.begin('room', scope(1), () => {});
  assert.throws(() => owner.begin('room', scope(2), () => {}), /Busy/);
  owner.activate(task, '{}'); task.settle();
  assert.throws(() => owner.begin('player', scope(2), () => {}), /AlreadyJoined/);
});
test('cancel completes once, preserves the slot and closes a late Room', async () => {
  const owner = new Lifecycle(), replies = []; const task = owner.begin('room', scope(1), v => replies.push(JSON.parse(v)));
  const close = owner.leave(scope(1));
  assert.equal(replies[0].__error.code, 'Cancelled'); assert.equal(owner.state, 'closing');
  assert.throws(() => owner.begin('room', scope(2), () => {}), /Busy/);
  let closed = 0; task.object = {phase:'connected',async disconnect(){closed++;this.phase='disconnected';}};
  task.settle(); await close; owner.activate(task, '{}');
  assert.equal(closed,1); assert.equal(replies.length,1); assert.equal(owner.state,'idle');
});
test('deadline wins, later leave cannot overwrite JoinTimeout', async () => {
  const owner = new Lifecycle(), replies = []; const task = owner.begin('room',scope(1),v=>replies.push(JSON.parse(v)),45);
  await advance(46); const close=owner.leave(scope(1));
  assert.equal(replies[0].__error.code,'JoinTimeout');
  task.object={phase:'connected',async disconnect(){this.phase='disconnected';}};task.settle();await close;
  assert.equal(replies.length,1);
});
test('deadline disconnects an acquired Room while plugin mount is still pending', async () => {
  const owner = new Lifecycle(), replies = [];
  const task = owner.begin('room', scope(1), value => replies.push(JSON.parse(value)), 45);
  let disconnects = 0, cleaned = 0;
  task.object = {phase: 'connected', async disconnect() { disconnects++; this.phase = 'disconnected'; }};
  task.disposers.push(() => cleaned++);
  await advance(46);
  assert.equal(replies[0].__error.code, 'JoinTimeout');
  assert.equal(disconnects, 1, 'transport must close before a stalled mount settles');
  assert.equal(cleaned, 0); assert.equal(owner.state, 'closing');
  assert.throws(() => owner.begin('room', scope(2), () => {}), /Busy/);
  task.settle(); await owner.leave(scope(1));
  assert.equal(disconnects, 1); assert.equal(cleaned, 1); assert.equal(owner.state, 'idle');
});
test('an acquired Room closes its transport even when initialization never settles', async () => {
  const owner = new Lifecycle(), task = owner.begin('room', scope(1), () => {});
  let disconnects = 0;
  task.object = {phase: 'connected', async disconnect() { disconnects++; this.phase = 'disconnected'; }};
  const close = owner.leave(scope(1));
  const rejected = assert.rejects(close, /LeaveTimeout/);
  await flush(); assert.equal(disconnects, 1);
  await advance(20001); await rejected;
  assert.equal(owner.state, 'blocked'); assert.equal(disconnects, 1);
  task.settle(); await flush(); assert.equal(owner.state, 'idle');
});
test('disconnect and leave share one close; idle precedes completion', async () => {
  const {owner,task,closes}=active(); const first=owner.leave(scope(1)),second=owner.leave(scope(1));
  assert.strictEqual(first,second); await first; assert.equal(closes(),1); assert.equal(owner.state,'idle');
  assert.equal(owner.accepts(scope(1)),false); owner.begin('room',scope(2),()=>{});
  assert.equal(owner.accepts(scope(1),true),false);
});
test('automatic reconnect keeps owner active; terminal event never frees it', async () => {
  const {owner,task}=active(); owner.phase(task,'reconnecting');assert.equal(owner.state,'active');
  owner.phase(task,'connected');assert.equal(owner.state,'active');owner.phase(task,'disconnected');
  assert.equal(owner.state,'blocked');assert.throws(()=>owner.begin('room',scope(2),()=>{}),/Busy/);
});
test('exit during automatic reconnect waits for recovery, then disconnects before reuse', async () => {
  const {owner,task,closes}=active();task.object.phase='reconnecting';
  const close=owner.leave(scope(1));await flush();
  assert.equal(closes(),0);assert.equal(owner.state,'closing');
  assert.throws(()=>owner.begin('room',scope(2),()=>{}),/Busy/);
  task.object.phase='connected';owner.phase(task,'connected');await close;
  assert.equal(closes(),1);assert.equal(task.object.phase,'disconnected');assert.equal(owner.state,'idle');
  owner.begin('room',scope(2),()=>{});
});
test('waiting for automatic recovery keeps a single close and has a deadline', async () => {
  const {owner,task,closes}=active();task.object.phase='reconnecting';
  const close=owner.leave(scope(1));const rejected=assert.rejects(close,/LeaveTimeout/);
  assert.strictEqual(owner.leave(scope(1)),close);await flush();await advance(20001);await rejected;
  assert.equal(closes(),0);assert.equal(owner.state,'blocked');assert.equal(task.connectionWaiter,undefined);
});
test('terminal phase during recovery wait cannot admit another Room', async () => {
  for(const phase of ['disconnected','error','kicked']){
    const {owner,task,closes}=active();task.object.phase='reconnecting';
    const close=owner.leave(scope(1));const rejected=assert.rejects(close,/CloseUnconfirmed/);await flush();
    task.object.phase='disconnected';owner.phase(task,phase);await rejected;
    assert.equal(closes(),0);assert.equal(owner.state,'blocked');assert.equal(task.connectionWaiter,undefined);
  }
});
test('reconnect after normal disconnect has started remains unconfirmed', async () => {
  const {owner,task}=active();task.object.disconnect=async()=>{
    owner.phase(task,'reconnecting');task.object.phase='disconnected';
  };
  await assert.rejects(owner.leave(scope(1)),/CloseUnconfirmed/);assert.equal(owner.state,'blocked');
});
test('cleanup errors preserve blocked and still clean other resources', async () => {
  const {owner,task}=active();let cleaned=0;task.disposers.push(()=>{cleaned++;},()=>{throw new Error('cleanup');});
  await assert.rejects(owner.leave(scope(1)),/cleanup/);assert.equal(cleaned,1);assert.equal(owner.state,'blocked');
});
test('error or kick during close cannot be hidden by a successful disconnect result', async () => {
  for(const phase of ['error','kicked']) {
    const {owner,task}=active();task.object.disconnect=async()=>{owner.phase(task,phase);};
    await assert.rejects(owner.leave(scope(1)),/CloseUnconfirmed/);assert.equal(owner.state,'blocked');
  }
  const {owner,task}=active('player');task.object.stop=()=>owner.phase(task,'error');
  await assert.rejects(owner.leave(scope(1)),/CloseUnconfirmed/);assert.equal(owner.state,'blocked');
});
test('Player waits for already started initialization and stop runs once', async () => {
  const {owner,task,closes}=active('player');let complete;task.initializations.push(new Promise(r=>complete=r));
  const first=owner.leave(scope(1));assert.strictEqual(first,owner.leave(scope(1)));await flush();assert.equal(closes(),0);
  complete();await first;assert.equal(closes(),1);assert.equal(owner.state,'idle');
});
test('Player has no implicit creation deadline beyond five minutes', async () => {
  const owner=new Lifecycle(),replies=[];const task=owner.begin('player',scope(1),v=>replies.push(v));
  await advance(300001);
  assert.equal(task.timer,undefined);assert.equal(owner.state,'joining');assert.equal(replies.length,0);
  owner.activate(task,'{}');task.settle();assert.equal(replies.length,1);
});
test('external Player cancellation closes the late object before a fresh create', async () => {
  const owner=new Lifecycle(),replies=[],order=[];
  const first=owner.begin('player',scope(1),v=>replies.push(JSON.parse(v)));
  const closing=owner.leave(scope(1));
  assert.equal(replies[0].__error.code,'Cancelled');
  assert.throws(()=>owner.begin('player',scope(2),()=>{}),/Busy/);
  await advance(5000);
  first.object={stop(){order.push('old-stop');}};first.settle();await closing;
  owner.activate(first,'{}');assert.equal(replies.length,1);
  const second=owner.begin('player',scope(2),()=>{});order.push('new-create');
  second.object={stop(){order.push('new-stop');}};owner.activate(second,'{}');second.settle();await owner.leave(scope(2));
  assert.deepEqual(order,['old-stop','new-create','new-stop']);
});
test('Player stop failures remain failures for repeated exits', async () => {
  const {owner,task}=active('player');task.object.stop=()=>{throw new Error('stop failed');};
  const close=owner.leave(scope(1));await assert.rejects(close,/stop failed/);assert.strictEqual(close,owner.leave(scope(1)));assert.equal(owner.state,'blocked');
});
test('unresolved creates time out leave without freeing the slot; late cleanup may finish', async () => {
  for(const kind of ['room','player']) {
    const owner=new Lifecycle(),task=owner.begin(kind,scope(1),()=>{});const close=owner.leave(scope(1));
    const rejected=assert.rejects(close,/LeaveTimeout/);await advance(20001);await rejected;assert.equal(owner.state,'blocked');
    assert.throws(()=>owner.begin(kind,scope(2),()=>{}),/Busy/);
    task.object=kind==='room'?{phase:'connected',async disconnect(){this.phase='disconnected';}}:{stop(){}};
    task.settle();await flush();assert.equal(owner.state,'idle');assert.strictEqual(owner.leave(scope(1)),close);
  }
});
test('cancel overtaking create rejects the stale generation only',async()=>{
  const owner=new Lifecycle();await owner.leave(scope(2));assert.throws(()=>owner.begin('room',scope(2),()=>{}),/StaleScope/);
  owner.begin('room',scope(3),()=>{});assert.equal(sameScope(scope(2),scope(3)),false);
});
test('preparation failure or cancellation frees only a slot that never started transport', async () => {
  for (const cancelled of [false, true]) {
    const owner = new Lifecycle(), replies = [];
    const task = owner.begin('room', scope(1), value => replies.push(JSON.parse(value)));
    task.transportStarted = false;
    const close = cancelled ? owner.leave(scope(1)) : undefined;
    await owner.finish(task, new Error('preparation failed'));
    await (close || task.closeResult);
    assert.equal(owner.state, 'idle');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].__error.code, cancelled ? 'Cancelled' : 'preparation failed');
    owner.begin('room', scope(2), () => {});
  }
  const owner = new Lifecycle(), task = owner.begin('room', scope(1), () => {});
  task.transportStarted = true;
  await owner.finish(task, new Error('SDK join failed'));
  assert.equal(owner.state, 'blocked');
});
test('cancel before transport releases without waiting; late finish cannot poison an idle or replacement slot', async () => {
  for (const replace of [false, true]) {
    const owner = new Lifecycle(), replies = [];
    const task = owner.begin('room', scope(1), value => replies.push(JSON.parse(value)), 45000);
    task.transportStarted = false;
    const close = owner.leave(scope(1));
    await close;
    assert.equal(owner.state, 'idle');
    const replacement = replace ? owner.begin('room', scope(2), () => {}) : undefined;
    await advance(120001);
    assert.equal(replies.length, 1); assert.equal(replies[0].__error.code, 'Cancelled');
    if (replace) await assert.rejects(owner.leave(scope(1)), /StaleScope/);
    else assert.strictEqual(owner.leave(scope(1)), close);
    await owner.finish(task, new Error('late preparation failure'));
    assert.equal(owner.state, replace ? 'joining' : 'idle');
    if (replacement) assert.strictEqual(owner.task, replacement);
    else await owner.leave(scope(1));
  }
});
test('replacement retires a failed close, logs once to Room logger and fences late events', async () => {
  const {owner,task}=active(); const logs=[],nativeLogs=[];
  task.object.logger={error:message=>logs.push(message)};
  owner.onLeaveFailure=(_scope,message)=>nativeLogs.push(message);
  task.object.disconnect=async()=>{throw Error('synthetic disconnect failure');};
  await assert.rejects(owner.leave(scope(1)),/synthetic disconnect failure/);
  assert.equal(owner.state,'blocked');
  owner.continueAfterLeaveFailure(scope(1),'synthetic disconnect failure');
  assert.equal(logs.length,1); assert.match(logs[0],/synthetic disconnect failure/); assert.equal(nativeLogs.length,1);
  const fresh=owner.begin('room',scope(2),()=>{});owner.activate(fresh,'{}');fresh.settle();
  owner.phase(task,'error');await owner.finish(task,Error('late failure'));
  owner.continueAfterLeaveFailure(scope(1),'stale recovery');
  assert.equal(owner.state,'active');assert.strictEqual(owner.task,fresh);
});
test('replacement continues after timeout and cleans late Room exactly once',async()=>{
  const owner=new Lifecycle(),task=owner.begin('room',scope(1),()=>{});
  task.transportStarted=true;const closed=owner.leave(scope(1));const rejected=assert.rejects(closed,/LeaveTimeout/);
  await advance(20001);await rejected;owner.continueAfterLeaveFailure(scope(1),'LeaveTimeout');
  const fresh=owner.begin('room',scope(2),()=>{});owner.activate(fresh,'{}');fresh.settle();
  let disconnects=0,disposals=0;
  task.object={phase:'connected',async disconnect(){disconnects++;this.phase='disconnected';}};
  task.disposers.push(()=>disposals++);
  await owner.finish(task,Error('Cancelled'));await flush();
  assert.equal(disconnects,1);assert.equal(disposals,1);assert.equal(owner.state,'active');assert.strictEqual(owner.task,fresh);
});
test('pending old disconnect cannot block replacement after Native deadline or later poison it',async()=>{
  for(const rejectLate of [false,true]) {
    const {owner,task}=active();let finish,disconnects=0;
    task.object.disconnect=()=>{disconnects++;return new Promise((resolve,reject)=>finish=()=>rejectLate?reject(Error('late close')):resolve());};
    const closed=owner.leave(scope(1));const rejected=assert.rejects(closed,/LeaveTimeout/);await flush();
    await advance(20001);await rejected;owner.continueAfterLeaveFailure(scope(1),'LeaveTimeout');
    const fresh=owner.begin('room',scope(2),()=>{});owner.activate(fresh,'{}');fresh.settle();finish();await flush();
    assert.equal(disconnects,1);assert.equal(owner.state,'active');assert.strictEqual(owner.task,fresh);
  }
});
test('logger exceptions and reconnect wait do not prevent fallback cleanup or fresh creation',async()=>{
  const {owner,task,closes}=active();task.object.phase='reconnecting';
  task.object.logger={error(){throw Error('logger failed');}};owner.onLeaveFailure=()=>{throw Error('callback failed');};
  const closed=owner.leave(scope(1));const rejected=assert.rejects(closed,/CloseUnconfirmed/);await flush();
  owner.continueAfterLeaveFailure(scope(1),'native timeout');await rejected;
  assert.equal(closes(),1);owner.begin('room',scope(2),()=>{});assert.equal(owner.state,'joining');
});
test('healthy pending leave still serializes and new join errors remain observable',async()=>{
  const {owner,task}=active();let finish;
  task.object.disconnect=()=>new Promise(r=>finish=()=>{task.object.phase='disconnected';r();});
  const closed=owner.leave(scope(1));await flush();assert.throws(()=>owner.begin('room',scope(2),()=>{}),/Busy/);
  finish();await closed;
  const replies=[],fresh=owner.begin('room',scope(2),v=>replies.push(JSON.parse(v)));fresh.transportStarted=true;
  await owner.finish(fresh,Error('new room rejected'));assert.equal(replies[0].__error.message,'new room rejected');
});
test('late retired synced-store initialization cannot overwrite replacement store or handlers',async()=>{
  const mod={exports:{}},installs=[],pending=[],win={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('path').join(__dirname,'../src/bridge/SyncedStore.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,
    {module:mod,exports:mod.exports,window:win,Map,WeakMap,require(name){
      if(name==='./Lifecycle')return moduleObject.exports;
      if(name==='@netless/synced-store')return {SyncedStorePlugin:{init:()=>new Promise(r=>pending.push(r))}};
      if(name==='.')return {scopedCall:()=>()=>{},register:(_name,handler)=>installs.push(handler),registerAsyn:(_name,handler)=>installs.push(handler)};
      return {addBridgeLogHook(){}};
    }});
  let cancelled=false;const old=mod.exports.initSyncedStore({},()=>!cancelled);
  cancelled=true;const fresh=mod.exports.initSyncedStore({});const current={destroy(){}};
  pending[1](current);await fresh;pending[0]({destroy(){}});await old;
  assert.strictEqual(win.syncedStore,current);assert.equal(installs.length,2);assert.ok(installs.every(h=>h.syncedStore===current));
});
let suiteCompleted=false;
process.on('beforeExit',()=>{if(!suiteCompleted){console.error('Lifecycle suite did not finish');process.exitCode=1;}});
(async()=>{for(const t of tests){await t.fn();process.stdout.write(`PASS ${t.name}\n`);timers=[];}suiteCompleted=true;process.stdout.write(`${tests.length} lifecycle tests passed\n`);})().catch(e=>{console.error(e);process.exitCode=1;});

// Exercise the actual thin adapter with a native-shaped transport, including sync calls.
const adapterModule={exports:{}}, wire=[];
const transport={register(){},registerAsync(){},call(method,data){wire.push({method,data});},syncCall(){throw Error('must preserve synchronous native return');}};
const nativeWindow={_dsbridge:{call(method,args){wire.push({method,args:JSON.parse(args)});return JSON.stringify({code:0,data:'converted-url'});}}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('path').join(__dirname,'../src/bridge/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,
 {module:adapterModule,exports:adapterModule.exports,window:nativeWindow,require(name){return name==='./Lifecycle'?moduleObject.exports:{bridge:transport};},JSON,Error,Object});
const adapter=adapterModule.exports;
assert.equal(adapter.syncCall('sdk.urlInterrupter','original-url'),'converted-url');
assert.equal(wire.at(-1).args.data.value,'original-url');
assert.equal(wire.at(-1).args.data.scope.documentId,documentId);
adapter.call('rtc.setVolume',42);assert.equal(wire.at(-1).data,42);
let envelope;
const wrapped=adapter.scopedHandler('sdk',{getLifecycle(reply){reply('document');}});
wrapped.getLifecycle(value=>envelope=value);
assert.equal(envelope.value,'document');assert.equal(envelope.scope.generation,0);
process.stdout.write('PASS sync native URL return, document envelope and unchanged RTC payload\n');

// Room/Player media callbacks retain their source across asynchronous replacement.
const mediaModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('path').join(__dirname,'../src/native/SDKCallbackHandler.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,
 {module:mediaModule,exports:mediaModule.exports,require(){return adapter;},console});
const mediaOwner=new Lifecycle();const mediaTask=mediaOwner.begin('room',scope(41),()=>{});
const media=moduleObject.exports.inScope(scope(41),()=>new mediaModule.exports.SDKCallbackHandler(true));
media.onPPTMediaPause('old-shape','audio');assert.equal(wire.at(-1).data.scope.generation,41);
moduleObject.exports.inScope(scope(42),()=>media.onPPTMediaPlay('old-shape','audio'));
assert.equal(wire.at(-1).data.scope.generation,41);
media.onLogger({message:'sdk-global'});assert.equal(wire.at(-1).data.scope.generation,0);
assert.equal(media.onUrlInterrupter('url'),'converted-url');
assert.equal(wire.at(-1).args.data.scope.generation,0);
process.stdout.write('PASS task media scope survives replacement; global log and synchronous URL remain global\n');
// Execute the production setup admission prefix: JSON key order is not a configuration change.
const sdkSource=fs.readFileSync(require('path').join(__dirname,'../src/bridge/SDK.ts'),'utf8');
const setupPrefix=sdkSource.split('newWhiteSdk = (config: NativeSDKConfigWithPresentation, callback?: (value: string) => void) => {')[1].split('        const urlInterrupter')[0];
const completionModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('path').join(__dirname,'../src/bridge/PreloadCompletion.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,
 {module:completionModule,exports:completionModule.exports});
const setupAdmission=new Function('configurationKey','config','sdk','sdkConfigurationJson','lifecycle','callback',setupPrefix+'return configurationJson;').bind(null,completionModule.exports.configurationKey);
const initialSetup={appIdentifier:'app',nested:{b:2,a:1},sequence:[1,2]};
const serializedSetup=setupAdmission(initialSetup,null,null,{state:'idle'},()=>{});
let setupReplies=0;
setupAdmission({sequence:[1,2],nested:{a:1,b:2},appIdentifier:'app'},{},serializedSetup,{state:'active'},()=>setupReplies++);
assert.equal(setupReplies,1);
assert.throws(()=>setupAdmission({...initialSetup,sequence:[2,1]},{},serializedSetup,{state:'active'},()=>{}),/Busy/);
assert.throws(()=>setupAdmission({...initialSetup,nested:{a:1,b:'2'}},{},serializedSetup,{state:'active'},()=>{}),/Busy/);
process.stdout.write('PASS setup reuses equivalent JSON snapshots, preserves array order and scalar types\n');
