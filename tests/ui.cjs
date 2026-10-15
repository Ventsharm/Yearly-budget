// Integration tests use only the demo Firebase emulators. No production accounts or data.
const {chromium} = require('playwright');
const {initializeApp,deleteApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main(){
  if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulators required');
  const app=initializeApp({projectId:'demo-yearly-budget'});
  const auth=getAuth(app),db=getFirestore(app);
  const email='ui-test@example.test',password='Test-password-123';
  let user=await auth.getUserByEmail(email).catch(()=>null);
  if(!user) user=await auth.createUser({email,password,emailVerified:true});
  const subs=db.collection('users').doc(user.uid).collection('yearlySubscriptions');
  await subs.doc('original').set({name:'Original subscription',amount:25,month:'January',paid:false});
  await subs.doc('paid').set({name:'Original paid',amount:10,month:'February',paid:true});
  const oldReminders=await db.collection('users').doc(user.uid).collection('yearlyReminders').get();
  for(const old of oldReminders.docs) await old.ref.delete();
  await db.collection('users').doc(user.uid).collection('yearlyReminders').doc('overdue').set({name:'Overdue reminder',date:'2020-01-01',type:'cancel',amount:null,done:false,createdAt:1,updatedAt:1});
  const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    let route=new URL(req.url,'http://localhost').pathname;
    if(!route.startsWith('/Yearly-budget/')){res.writeHead(404);return res.end()}
    let relative=route.slice('/Yearly-budget/'.length)||'index.html';
    const file=path.resolve(relative);
    if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}
    let data=fs.readFileSync(file);
    if(relative==='index.html'){
      let source=data.toString().replace('projectId:"yearly-budget-c93fb"','projectId:"demo-yearly-budget"');
      source=source.replace('import{getAuth,','import{connectAuthEmulator,getAuth,').replace('import{getFirestore,','import{connectFirestoreEmulator,getFirestore,');
      source=source.replace('db=getFirestore(app);','db=getFirestore(app);connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});connectFirestoreEmulator(db,"127.0.0.1",8080);');
      data=Buffer.from(source);
    }
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data);
  });
  await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],
    proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
  const context=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:false});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:8765/Yearly-budget/?vs_app=vs1_5d67ed0b4e1bc4bde4dd113f',{waitUntil:'networkidle'});
    await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);await page.locator('#loginBtn').click();
    await page.locator('#appCard:not(.hidden)').waitFor();
    await page.getByText('Original subscription',{exact:true}).waitFor();
    assert.equal(await page.locator('#saveTotal').innerText(),'£25.00');
    assert.match(await page.locator('#subsList').innerText(),/Original paid.*\(Paid\)/s);
    // Existing paid/unpaid toggle still works.
    await page.getByText('Original subscription',{exact:true}).click();
    await page.locator('.paid-toggle[data-id="original"]').click();
    await page.waitForFunction(()=>document.querySelector('#saveTotal').textContent==='£0.00');
    await page.locator('.paid-toggle[data-id="original"]').click();
    await page.waitForFunction(()=>document.querySelector('#saveTotal').textContent==='£25.00');
    console.log('PASS: existing login, original subscriptions, paid/unpaid totals');
    await page.locator('#yrRemindersTab').click();
    await page.getByText('Overdue reminder',{exact:true}).waitFor();
    assert.match(await page.locator('#yrRemindersList').innerText(),/Overdue/);
    // The custom prompt appears first. Its Not now button must not request device permission.
    await page.evaluate(()=>{
      window.permissionRequests=0;window.testPermission='default';
      Object.defineProperty(Notification,'permission',{configurable:true,get:()=>window.testPermission});
      Notification.requestPermission=async()=>{window.permissionRequests++;return 'default'};
    });
    await page.locator('#yrEnableNotifications').click();await page.locator('#yrPermissionOverlay:not(.hidden)').waitFor();
    await page.locator('#yrPermissionLater').click();assert.equal(await page.evaluate(()=>window.permissionRequests),0);
    await page.locator('#yrEnableNotifications').click();await page.locator('#yrPermissionAllow').click();
    assert.equal(await page.evaluate(()=>window.permissionRequests),1);
    console.log('PASS: custom popup, Not now, then device permission request on Allow');
    await context.grantPermissions(['notifications']);
    await page.evaluate(()=>{window.testPermission='granted'});
    await page.locator('#yrEnableNotifications').click();await page.locator('#yrPermissionAllow').click();
    await page.waitForFunction(()=>document.querySelector('#yrNotifyStatus').textContent.includes('Creation notifications are enabled'));
    await page.evaluate(()=>navigator.serviceWorker.ready);
    const worker=context.serviceWorkers()[0];
    await worker.evaluate(()=>{
      self.testDisplays=[];
      const original=self.registration.showNotification.bind(self.registration);
      self.registration.showNotification=async(...args)=>{await original(...args);self.testDisplays.push(args[0])};
    });
    const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
    await page.locator('#yrReminderName').fill('New payment reminder');await page.locator('#yrReminderDate').fill(tomorrow);await page.locator('#yrReminderType').selectOption('payment');
    await page.locator('#yrSaveReminder').click();await page.getByText('New payment reminder',{exact:true}).waitFor();
    await worker.evaluate(()=>new Promise((resolve,reject)=>{
      const until=Date.now()+10000;const check=()=>{if(self.testDisplays.length)resolve();else if(Date.now()>until)reject(new Error('No notification display'));else setTimeout(check,50)};check();
    }));
    const count=await worker.evaluate(()=>self.testDisplays.filter(title=>title==='Reminder saved').length);
    assert.equal(count,1);
    const overdue=page.locator('.yr-reminder-item').filter({hasText:'Overdue reminder'});
    await overdue.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#yrReminderDate').fill(tomorrow);await page.locator('#yrSaveReminder').click();
    await page.waitForFunction(()=>document.querySelector('#yrReminderStatus').textContent.includes('Reminder updated'));
    assert.equal((await db.doc(`users/${user.uid}/yearlyReminders/overdue`).get()).data().date,tomorrow);
    assert.equal(await worker.evaluate(()=>self.testDisplays.filter(title=>title==='Reminder saved').length),1);
    console.log('PASS: saving a reminder displays one creation notification; editing does not repeat it');
    await page.evaluate(()=>location.hash='reminders');await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#yrRemindersView:not(.hidden)').waitFor();
    await page.locator('#vsAppGuard').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.querySelector('#emailReminder').getBoundingClientRect().top>=innerHeight);
    await fs.promises.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/reminders-mobile.png',fullPage:true});
    // The worker must have cached the app shell and new local modules.
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.title(),'Yearly budget');
    assert.equal(await page.locator('h1').innerText(),'Yearly budget');
    await context.setOffline(false);
    console.log('PASS: notification route opens Reminders; offline reload preserves shell');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(r=>server.close(r));await deleteApp(app)}
}
main().catch(e=>{console.error(e);process.exitCode=1});
