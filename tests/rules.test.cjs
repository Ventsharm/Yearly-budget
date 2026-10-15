const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc} = require('firebase/firestore');
const {initializeApp,deleteApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {runDaily,deliveryId} = require('../automation/reminders.cjs');
let env,admin,db;
const projectId='demo-yearly-budget';
const reminder={name:'O2',date:'2026-10-16',type:'payment',amount:5,done:false,createdAt:1,updatedAt:1};
before(async()=>{
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use the emulator; never run against production');
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
  admin=initializeApp({projectId},'test');db=getFirestore(admin);
});
after(async()=>{await env?.cleanup();if(admin)await deleteApp(admin)});
test('reminders are private; owners can save, edit overdue dates, complete and delete',async()=>{
  const own=env.authenticatedContext('alice').firestore();
  const other=env.authenticatedContext('bob').firestore();
  const anon=env.unauthenticatedContext().firestore();
  const path='users/alice/yearlyReminders/private';
  await assertSucceeds(setDoc(doc(own,path),{...reminder,date:'2020-01-01'}));
  await assertSucceeds(updateDoc(doc(own,path),{date:'2026-10-16',updatedAt:2}));
  await assertSucceeds(updateDoc(doc(own,path),{done:true}));
  for(const client of [other,anon]){
    await assertFails(getDoc(doc(client,path)));
    await assertFails(getDocs(collection(client,'users/alice/yearlyReminders')));
    await assertFails(setDoc(doc(client,path),reminder));
    await assertFails(deleteDoc(doc(client,path)));
  }
  await assertFails(updateDoc(doc(own,path),{claimedAt:1}));
  await assertFails(updateDoc(doc(own,path),{createdAt:123}));
  await assertFails(updateDoc(doc(own,path),{amount:-1}));
  await assertFails(updateDoc(doc(own,path),{name:'x'.repeat(141)}));
  await assertSucceeds(deleteDoc(doc(own,path)));
});
test('tokens are private, malformed tokens rejected, and delivery claims are server-only',async()=>{
  const own=env.authenticatedContext('alice').firestore();
  const other=env.authenticatedContext('bob').firestore();
  const path='users/alice/yearlyPushTokens/'+ 'a'.repeat(64);
  await assertSucceeds(setDoc(doc(own,path),{token:'t'.repeat(100),updatedAt:1}));
  await assertFails(getDoc(doc(other,path)));
  await assertFails(setDoc(doc(own,path),{token:'short',updatedAt:1}));
  await assertFails(setDoc(doc(own,'users/alice/yearlyReminderDeliveries/x'),{date:reminder.date}));
  await assertFails(getDoc(doc(own,'users/alice/yearlyReminderDeliveries/x')));
});
test('original subscription documents keep their existing permissions and fields',async()=>{
  const own=env.authenticatedContext('alice').firestore();
  const other=env.authenticatedContext('bob').firestore();
  const ref=doc(own,'users/alice/yearlySubscriptions/original');
  const data={name:'Original subscription',amount:12,month:'January',paid:true,legacyField:'kept'};
  await assertSucceeds(setDoc(ref,data));
  assert.deepEqual((await getDoc(ref)).data(),data);
  await assertSucceeds(updateDoc(ref,{paid:false}));
  await assertFails(getDoc(doc(other,ref.path)));
});
test('daily sender handles races, retries, restarts, changed dates, and invalid tokens',async()=>{
  await env.clearFirestore();
  const base='users/sender';
  const good=db.doc(base+'/yearlyPushTokens/good'), bad=db.doc(base+'/yearlyPushTokens/bad');
  await good.set({token:'good'.repeat(20),updatedAt:1});await bad.set({token:'bad'.repeat(20),updatedAt:1});
  for(const [id,patch] of Object.entries({tomorrow:{},today:{date:'2026-10-15'},overdue:{date:'2026-10-14'},done:{done:true}}))
    await db.doc(base+'/yearlyReminders/'+id).set({...reminder,...patch});
  const messages=[];
  const messaging={sendEachForMulticast:async m=>{
    messages.push(m);
    return {responses:m.tokens.map(t=>t.startsWith('bad')?{success:false,error:{code:'messaging/registration-token-not-registered'}}:{success:true})};
  }};
  const now=Date.parse('2026-10-15T08:17:00Z');
  const options={db,messaging,clock:()=>now,logger:{warn(){}}};
  await Promise.all([runDaily(options),runDaily(options)]);
  await runDaily(options);
  assert.equal(messages.length,1);assert.equal(messages[0].data.dueDate,'2026-10-16');
  assert.equal(messages[0].notification,undefined);
  assert.equal((await bad.get()).exists,false);assert.equal((await good.get()).exists,true);
  const claim=db.doc(base+'/yearlyReminderDeliveries/'+deliveryId(base+'/yearlyReminders/tomorrow','2026-10-16'));
  assert.equal((await claim.get()).exists,true);
  await db.doc(base+'/yearlyReminders/tomorrow').update({date:'2026-10-17'});
  await runDaily({...options,clock:()=>Date.parse('2026-10-16T08:17:00Z')});
  assert.equal(messages.length,2);
  assert.equal((await db.doc(base+'/yearlyReminders/overdue').get()).exists,true);
});
test('a crash after claiming cannot resend on restart; an ambiguous FCM failure is not retried',async()=>{
  await env.clearFirestore();
  await db.doc('users/crash/yearlyPushTokens/t').set({token:'t'.repeat(100)});
  await db.doc('users/crash/yearlyReminders/r').set(reminder);
  let sends=0;
  const options={db,clock:()=>Date.parse('2026-10-15T08:17:00Z'),logger:{warn(){}},messaging:{sendEachForMulticast:async()=>{sends++;throw new Error('unknown outcome')}}};
  await assert.rejects(runDaily({...options,afterClaim:()=>{throw new Error('simulated restart')}}));
  await runDaily(options);assert.equal(sends,0);
  await db.doc('users/crash/yearlyReminders/second').set(reminder);
  await runDaily(options);await runDaily(options);assert.equal(sends,1);
});
