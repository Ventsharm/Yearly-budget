import{initializeApp}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";import{getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence,sendEmailVerification,sendPasswordResetEmail,deleteUser}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";import{getFirestore,collection,addDoc,deleteDoc,doc,onSnapshot,query,updateDoc,getDocs,writeBatch}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";import{configurePush,setPushUser,supportsPush,enablePush,detachPushToken,notifyCreated}from"./push-client.js";import{ukDay,validDate,MONTHS,LEGACY_PREFIX,isMoneyReminder,combineReminders,savingsTotals,reminderAmount}from"./reminder-utils.js";const firebaseConfig={apiKey:"AIzaSyD4gZYEI2SxZCKQ32bKHV8RlPiLv-zpHrU",authDomain:"yearly-budget-c93fb.firebaseapp.com",projectId:"yearly-budget-c93fb",storageBucket:"yearly-budget-c93fb.firebasestorage.app",messagingSenderId:"415123329669",appId:"1:415123329669:web:76ab11fe58563197c9cfec"};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
setPersistence(auth,browserLocalPersistence).catch(()=>{});
const $=id=>document.getElementById(id);
const [showLogin,showRegister,loginBox,registerBox,loginEmail,loginPassword,registerEmail,registerPassword,loginBtn,forgotBtn,registerBtn,loginStatus,registerStatus,authCard,appCard,userEmail,logoutBtn,deleteAccountBtn,appStatus] = ['showLogin','showRegister','loginBox','registerBox','loginEmail','loginPassword','registerEmail','registerPassword','loginBtn','forgotBtn','registerBtn','loginStatus','registerStatus','authCard','appCard','userEmail','logoutBtn','deleteAccountBtn','appStatus'].map($);
const yrType=$('yrReminderType'),yrName=$('yrReminderName'),yrAmount=$('yrReminderAmount'),yrDate=$('yrReminderDate'),yrSave=$('yrSaveReminder'),yrCancel=$('yrCancelEdit'),yrStatus=$('yrReminderStatus'),yrList=$('yrRemindersList'),yrNotify=$('yrEnableNotifications'),yrNotifyStatus=$('yrNotifyStatus');
let currentUser=null,yrItems=[],legacyItems=[],rows=[],yrEditing=null,unsub=null,yrUnsub=null,loaded={reminders:false,subscriptions:false};
const money=n=>'£'+Number(n).toFixed(2),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setMode(mode){if(mode==="login"){showLogin.classList.add("active");showRegister.classList.remove("active");loginBox.classList.remove("hidden");registerBox.classList.add("hidden")}else{showRegister.classList.add("active");showLogin.classList.remove("active");registerBox.classList.remove("hidden");loginBox.classList.add("hidden")}loginStatus.textContent="";registerStatus.textContent=""}
function loginMessage(code){if(code==="auth/user-not-found")return"Please sign up.";if(code==="auth/invalid-credential")return"Please sign up or check your password.";if(code==="auth/invalid-email")return"Enter a valid email.";if(code==="auth/missing-password")return"Enter your password.";if(code==="auth/too-many-requests")return"Too many attempts. Try again later.";return"Login failed."}function registerMessage(code){if(code==="auth/email-already-in-use")return"Please login.";if(code==="auth/invalid-email")return"Enter a valid email.";if(code==="auth/weak-password")return"Password must be at least 6 characters.";return"Could not create account."}async function deleteUserData(uid){for(const col of ["yearlySubscriptions","yearlyReminders","yearlyPushTokens"]){const snap=await getDocs(collection(db,"users",uid,col));if(snap.empty)continue;let batch=writeBatch(db),count=0;for(const d of snap.docs){batch.delete(d.ref);count++;if(count===450){await batch.commit();batch=writeBatch(db);count=0}}if(count)await batch.commit()}}showLogin.onclick=()=>setMode("login");showRegister.onclick=()=>setMode("register");forgotBtn.onclick=async()=>{const email=loginEmail.value.trim();loginStatus.textContent="";if(!email){loginStatus.textContent="Enter your email above first.";return}try{forgotBtn.disabled=!0;await sendPasswordResetEmail(auth,email);showEmailReminder();loginStatus.textContent="Password reset email sent. Check your inbox."}catch(e){loginStatus.textContent=e.code==="auth/invalid-email"?"Enter a valid email.":"Could not send reset email."}finally{forgotBtn.disabled=!1}};registerBtn.onclick=async()=>{const email=registerEmail.value.trim(),password=registerPassword.value.trim();registerStatus.textContent="";if(!email||!password){registerStatus.textContent="Enter email and password.";return}if(password.length<6){registerStatus.textContent="Password must be at least 6 characters.";return}try{registerBtn.disabled=!0;registerBtn.textContent="Creating...";const cred=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(cred.user);showEmailReminder();await signOut(auth);registerStatus.textContent="Verification email sent. Please verify your email, then login.";setMode("login");loginEmail.value=email;loginPassword.value=""}catch(e){registerStatus.textContent=registerMessage(e.code)}finally{registerBtn.disabled=!1;registerBtn.textContent="Create account"}};loginBtn.onclick=async()=>{const email=loginEmail.value.trim(),password=loginPassword.value.trim();loginStatus.textContent="";if(!email||!password){loginStatus.textContent="Enter email and password.";return}try{loginBtn.disabled=!0;loginBtn.textContent="Logging in...";const cred=await signInWithEmailAndPassword(auth,email,password);if(!cred.user.emailVerified){await sendEmailVerification(cred.user).catch(()=>{});await signOut(auth);loginStatus.textContent="Please verify your email first. A verification email has been sent.";return}}catch(e){loginStatus.textContent=loginMessage(e.code)}finally{loginBtn.disabled=!1;loginBtn.textContent="Login"}};function detachListeners(){if(unsub)unsub();if(yrUnsub)yrUnsub();unsub=yrUnsub=null;}
function resetItems(){yrItems=[];legacyItems=[];rows=[];loaded={reminders:false,subscriptions:false};yrReset();yrRender();}
logoutBtn.onclick=async()=>{try{await detachPushToken();await signOut(auth)}catch{appStatus.textContent='Could not log out.'}};
deleteAccountBtn.onclick=async()=>{
  if(!currentUser||!confirm('Delete your account and all saved reminders and subscriptions? This cannot be undone.')||!confirm('Last check: are you sure you want to permanently delete this account?'))return;
  try{deleteAccountBtn.disabled=true;deleteAccountBtn.textContent='Deleting...';const user=currentUser;detachListeners();await detachPushToken();await deleteUserData(user.uid);await deleteUser(user);resetItems();}
  catch(e){appStatus.textContent=e.code==='auth/requires-recent-login'?'For safety, please log out, log back in, then delete your account.':e.message||'Could not delete account.';if(currentUser)listen(currentUser.uid);}
  finally{deleteAccountBtn.disabled=false;deleteAccountBtn.textContent='Delete account';}
};
function updateAmountField(){
  const hidden=yrType.value==='cancel';$('yrAmountField').classList.toggle('hidden',hidden);yrAmount.disabled=hidden;yrAmount.required=yrType.value==='subscription';
  $('yrAmountLabel').textContent=yrType.value==='payment'?'Amount (£) – optional':'Amount (£)';
  yrName.placeholder=yrType.value==='subscription'?'Example: Amazon Prime':yrType.value==='payment'?'Example: Top up O2':'Example: Cancel a free trial';
}
yrType.addEventListener('change',()=>{if(yrType.value==='cancel')yrAmount.value='';updateAmountField();});
function yrReset(){yrEditing=null;yrType.value='subscription';yrName.value='';yrAmount.value='';yrDate.value='';yrSave.textContent='Add reminder';yrCancel.classList.add('hidden');$('yrFormTitle').textContent='Add a reminder';updateAmountField();}
function dateLabel(date){if(!validDate(date))return '';return new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'long',year:'numeric'});}
function yrRender(){
  const ready=loaded.reminders&&loaded.subscriptions,today=ukDay();rows=combineReminders(yrItems,legacyItems,today);
  const totals=savingsTotals(rows,today);$('saveMonth').textContent=ready?money(totals.month):'…';$('saveYear').textContent=ready?money(totals.year):'…';
  $('yrLegacyNote').classList.toggle('hidden',!ready||!rows.some(r=>r.source==='legacy'&&!validDate(r.date)));
  if(!ready){yrList.innerHTML='<div class="empty">Loading your reminders…</div>';return;}
  if(!rows.length){yrList.innerHTML='<div class="empty">Your reminders will appear here.</div>';return;}
  yrList.innerHTML=rows.map(r=>{
    const dated=validDate(r.date),late=dated&&!r.done&&r.date<today,due=dated&&!r.done&&r.date===today,financial=isMoneyReminder(r);
    const kind=r.type==='subscription'?'Subscription':r.type==='payment'?'Payment / top-up':'Cancel subscription';
    const date=dated?dateLabel(r.date):(MONTHS.includes(r.month)?r.month+' — choose an exact date':'Choose an exact date');
    const status=r.done?(financial?' (paid)':' (done)'):'';
    return '<div class="item yr-reminder-item '+(r.done?'paid':'')+'" data-key="'+esc(r.key)+'"><div class="itemhead"><div class="itemleft"><div class="itemtitle">'+esc(r.name)+'<span class="paid-inline">'+status+'</span></div><div class="yr-reminder-date '+(late?'yr-overdue':r.done?'yr-done':'')+'">'+esc(date)+(late?' · Overdue':due?' · Due today':'')+'</div><div class="yr-reminder-kind">'+kind+'</div></div>'+(financial&&typeof r.amount==='number'?'<div class="amt">'+money(r.amount)+'</div>':'')+'</div><div class="yr-reminder-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button><button type="button" data-action="done">'+(r.type==='subscription'?(r.done?'Mark unpaid':'Mark paid'):(r.done?'Undo':'Mark done'))+'</button></div></div>';
  }).join('');
}
function listen(uid){
  detachListeners();
  unsub=onSnapshot(query(collection(db,'users',uid,'yearlySubscriptions')),snap=>{if(currentUser?.uid!==uid)return;legacyItems=snap.docs.map(d=>({...d.data(),id:d.id}));loaded.subscriptions=true;yrRender();},e=>{appStatus.textContent=e.message||'Could not load existing subscriptions.';});
  yrUnsub=onSnapshot(query(collection(db,'users',uid,'yearlyReminders')),snap=>{if(currentUser?.uid!==uid)return;yrItems=snap.docs.map(d=>({...d.data(),id:d.id}));loaded.reminders=true;yrRender();},e=>{appStatus.textContent=e.message||'Could not load reminders. Check Firestore permissions.';});
}
function editReminder(r){
  yrEditing=r.key;yrType.value=r.type;yrName.value=r.name||'';yrAmount.value=isMoneyReminder(r)?r.amount??'':'';yrDate.value=validDate(r.date)?r.date:'';updateAmountField();yrSave.textContent='Save changes';yrCancel.classList.remove('hidden');$('yrFormTitle').textContent='Edit reminder';
  yrStatus.textContent=validDate(r.date)?'Choose a new date to reuse this reminder.':'Choose an exact date to enable day-before reminders for this subscription.';
  $('yrFormTitle').scrollIntoView({behavior:'smooth',block:'start'});
}
function legacyFields(data){return {name:data.name,amount:data.amount,month:MONTHS[Number(data.date.slice(5,7))-1],date:data.date,paid:data.done,paidAt:data.done?Date.now():null,updatedAt:data.updatedAt};}
yrCancel.onclick=()=>{yrReset();yrStatus.textContent='Edit cancelled.';};
yrSave.onclick=async()=>{
  if(!currentUser)return;
  const name=yrName.value.trim(),date=yrDate.value,type=yrType.value;
  if(!name||name.length>140||!validDate(date)){yrStatus.textContent='Enter a reminder name and exact date.';return;}
  if(!['subscription','payment','cancel'].includes(type))return;
  let amount;try{amount=reminderAmount(type,yrAmount.value);}catch(e){yrStatus.textContent=e.message;return;}
  const original=yrEditing?rows.find(r=>r.key===yrEditing):null;
  if(yrEditing&&!original){yrStatus.textContent='This reminder changed or was removed. Cancel editing and try again.';return;}
  const owner=currentUser;const data={name,date,type,amount,done:original&&(date===original.date||!validDate(original.date))?!!original.done:false,updatedAt:Date.now()};
  yrSave.disabled=true;yrStatus.textContent='Saving…';
  try{
    if(original){
      if(original.source==='legacy'){
        // Keep the original document and its unknown legacy fields. An atomic
        // linked reminder gives the unchanged sender an exact-date record.
        const batch=writeBatch(db);
        batch.set(doc(db,'users',owner.uid,'yearlyReminders',LEGACY_PREFIX+original.id),{...data,createdAt:Date.now()});
        batch.update(doc(db,'users',owner.uid,'yearlySubscriptions',original.id),legacyFields(data));await batch.commit();
      }else{
        const batch=writeBatch(db);batch.update(doc(db,'users',owner.uid,'yearlyReminders',original.id),data);
        if(original.legacyId)batch.update(doc(db,'users',owner.uid,'yearlySubscriptions',original.legacyId),legacyFields(data));await batch.commit();
      }
      yrStatus.textContent=data.done?'Reminder updated. Its paid/completed status is unchanged.':'Reminder updated and ready for its date.';
    }else{
      const saved=await addDoc(collection(db,'users',owner.uid,'yearlyReminders'),{...data,createdAt:Date.now()});yrStatus.textContent='Reminder added.';
      notifyCreated({id:saved.id,...data},owner).catch(()=>{yrNotifyStatus.textContent='Reminder saved, but its creation notification could not be displayed.';});
    }
    if(currentUser?.uid===owner.uid)yrReset();
  }catch(e){yrStatus.textContent=e.message||'Could not save reminder. Check Firestore permissions.';}finally{yrSave.disabled=false;}
};
yrList.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action]');if(!button||!currentUser)return;
  const r=rows.find(r=>r.key===button.closest('[data-key]')?.dataset.key);if(!r)return;
  const action=button.dataset.action;if(action==='edit'){editReminder(r);return;}
  if(action==='delete'&&!confirm('Delete this reminder?'))return;
  const uid=currentUser.uid;button.disabled=true;
  try{
    const batch=writeBatch(db),now=Date.now();
    const reminderRef=r.source==='reminder'?doc(db,'users',uid,'yearlyReminders',r.id):null;
    const legacyRef=r.legacyId?doc(db,'users',uid,'yearlySubscriptions',r.legacyId):null;
    if(action==='delete'){
      if(reminderRef)batch.delete(reminderRef);if(legacyRef)batch.delete(legacyRef);
    }else if(action==='done'){
      if(reminderRef)batch.update(reminderRef,{done:!r.done,updatedAt:now});
      if(legacyRef)batch.update(legacyRef,{paid:!r.done,paidAt:!r.done?now:null,updatedAt:now});
    }else return;
    await batch.commit();if(action==='delete'&&yrEditing===r.key)yrReset();
    yrStatus.textContent=action==='delete'?'Reminder deleted.':!r.done?(isMoneyReminder(r)?'Marked as paid.':'Marked as done.'):'Marked as unfinished.';
  }catch(err){yrStatus.textContent=err.message||'Could not update reminder.';}finally{button.disabled=false;}
});
configurePush(app,db,auth,yrNotifyStatus);

const yrPermissionOverlay=document.getElementById("yrPermissionOverlay"),yrPermissionAllow=document.getElementById("yrPermissionAllow"),yrPermissionLater=document.getElementById("yrPermissionLater");
yrNotify.onclick=async()=>{if(!currentUser)return;if(!await supportsPush()){yrNotifyStatus.textContent="Background notifications are not supported in this browser or app. Try opening Yearly Budget in Chrome.";return}yrPermissionOverlay.classList.remove("hidden");yrPermissionAllow.focus()};
function yrClosePermission(){yrPermissionOverlay.classList.add("hidden");yrNotify.focus()}
yrPermissionLater.onclick=yrClosePermission;
yrPermissionOverlay.addEventListener("click",e=>{if(e.target===yrPermissionOverlay)yrClosePermission()});
yrPermissionOverlay.addEventListener("keydown",e=>{if(e.key==="Escape")yrClosePermission();if(e.key==="Tab"){e.preventDefault();(document.activeElement===yrPermissionAllow?yrPermissionLater:yrPermissionAllow).focus()}});
yrPermissionAllow.onclick=async()=>{yrClosePermission();if(!currentUser)return;if(!("Notification" in window)){yrNotifyStatus.textContent="This browser does not support notifications.";return}if(Notification.permission==="denied"){yrNotifyStatus.textContent="Notifications are blocked. Allow them in your browser or device settings.";return}try{const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();if(permission==="granted"){await enablePush()}else{yrNotifyStatus.textContent="Notifications not enabled."}}catch(e){yrNotifyStatus.textContent="Could not enable background notifications. Check your connection and try again."}};
// Keep existing notification links (#reminders) valid without a second tab.
function openReminderLink(){if(currentUser&&location.hash==='#reminders')$('yrRemindersView').scrollIntoView({block:'start'});}
window.addEventListener('hashchange',openReminderLink);
onAuthStateChanged(auth,user=>{
  detachListeners();currentUser=user&&user.emailVerified?user:null;resetItems();yrStatus.textContent='';appStatus.textContent='';yrNotifyStatus.textContent='';setPushUser(currentUser);
  if(user&&!user.emailVerified){signOut(auth).catch(()=>{});loginStatus.textContent='Please verify your email first.';}
  authCard.classList.toggle('hidden',!!currentUser);appCard.classList.toggle('hidden',!currentUser);userEmail.textContent=currentUser?.email||'';
  if(currentUser){listen(currentUser.uid);openReminderLink();}else yrPermissionOverlay.classList.add('hidden');
});
// Refresh calendar boundaries after the app was closed across UK midnight.
let renderedDay=ukDay();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ukDay()!==renderedDay){renderedDay=ukDay();yrRender();}});
