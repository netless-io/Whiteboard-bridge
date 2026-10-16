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
test('exit while reconnecting cleans but does not certify a normal close', async () => {
  const {owner,task,closes}=active();task.object.phase='reconnecting';
  await assert.rejects(owner.leave(scope(1)),/CloseUnconfirmed/);assert.equal(closes(),1);assert.equal(owner.state,'blocked');
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
(async()=>{for(const t of tests){await t.fn();process.stdout.write(`PASS ${t.name}\n`);timers=[];}process.stdout.write(`${tests.length} lifecycle tests passed\n`);})().catch(e=>{console.error(e);process.exitCode=1;});

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
const setupAdmission=new Function('config','sdk','sdkConfigurationJson','lifecycle','callback',setupPrefix+'return configurationJson;');
const initialSetup={appIdentifier:'app',nested:{b:2,a:1},sequence:[1,2]};
const serializedSetup=setupAdmission(initialSetup,null,null,{state:'idle'},()=>{});
let setupReplies=0;
setupAdmission({sequence:[1,2],nested:{a:1,b:2},appIdentifier:'app'},{},serializedSetup,{state:'active'},()=>setupReplies++);
assert.equal(setupReplies,1);
assert.throws(()=>setupAdmission({...initialSetup,sequence:[2,1]},{},serializedSetup,{state:'active'},()=>{}),/Busy/);
assert.throws(()=>setupAdmission({...initialSetup,nested:{a:1,b:'2'}},{},serializedSetup,{state:'active'},()=>{}),/Busy/);
process.stdout.write('PASS setup reuses equivalent JSON snapshots, preserves array order and scalar types\n');
