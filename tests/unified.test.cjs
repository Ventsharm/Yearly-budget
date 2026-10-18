const {test}=require('node:test');const assert=require('node:assert/strict');
const load=()=>import('../reminder-utils.js');
test('calendar totals count unpaid monetary reminders in their actual UK month/year, in cents',async()=>{
 const {savingsTotals}=await load();const rows=[
  {type:'subscription',date:'2026-10-19',amount:4.09,done:false},
  {type:'payment',date:'2026-10-01',amount:5,done:false},
  {type:'subscription',date:'2026-09-01',amount:12,done:false},
  {type:'payment',date:'2026-10-20',amount:99,done:true},
  {type:'cancel',date:'2026-10-20',amount:900,done:false},
  {type:'subscription',date:'2027-10-20',amount:100,done:false},
  {type:'payment',date:'2025-10-20',amount:100,done:false},
 ];assert.deepEqual(savingsTotals(rows,'2026-10-18'),{month:9.09,year:21.09});
 rows[0].done=true;assert.deepEqual(savingsTotals(rows,'2026-10-18'),{month:5,year:17});
 assert.deepEqual(savingsTotals([{type:'payment',date:'2026-10-20',amount:0.1},{type:'payment',date:'2026-10-20',amount:0.2}],'2026-10-18'),{month:0.3,year:0.3});
});
test('paid and unfinished reminders share chronological order, including overdue items',async()=>{
 const {combineReminders}=await load();const rows=combineReminders([
  {id:'later',type:'payment',date:'2026-10-21',done:false},
  {id:'paid',type:'subscription',date:'2026-10-01',done:true},
  {id:'overdue',type:'cancel',date:'2026-09-30',done:false},
 ],[],'2026-10-18');assert.deepEqual(rows.map(r=>r.id),['overdue','paid','later']);
});
test('month-only original subscriptions remain visible, budgeted and unscheduled without mutation',async()=>{
 const {combineReminders,savingsTotals}=await load();const originals=[{id:'old',name:'Original',month:'October',amount:4.09,paid:false,legacyField:'keep'},{id:'paid',name:'Paid',month:'January',amount:10,paid:true}];const before=JSON.stringify(originals);
 const rows=combineReminders([],originals,'2026-10-18');assert.equal(rows.find(r=>r.id==='old').date,null);assert.equal(rows.find(r=>r.id==='paid').done,true);
 assert.deepEqual(savingsTotals(rows,'2026-10-18'),{month:4.09,year:4.09});assert.equal(JSON.stringify(originals),before);
});
test('linked exact-date reminders are shown and counted once while original subscription fields remain',async()=>{
 const {combineReminders,savingsTotals}=await load();const legacy=[{id:'abc',month:'October',amount:4.09,paid:false,legacyField:'keep'}];
 const rows=combineReminders([{id:'legacy-sub-abc',type:'subscription',name:'Original',date:'2027-02-01',amount:5,done:false}],legacy,'2026-10-18');
 assert.equal(rows.length,1);assert.equal(rows[0].legacyId,'abc');assert.deepEqual(savingsTotals(rows,'2026-10-18'),{month:0,year:0});assert.equal(legacy[0].legacyField,'keep');
});
test('cancellations never take an amount; subscriptions require a valid amount; payment amount stays optional',async()=>{
 const {reminderAmount}=await load();assert.equal(reminderAmount('cancel','1000'),null);assert.equal(reminderAmount('payment',''),null);assert.equal(reminderAmount('subscription','0'),0);
 for(const raw of ['','-1','Infinity','1000000001','bad'])assert.throws(()=>reminderAmount('subscription',raw));
 assert.equal(reminderAmount('payment','4.09'),4.09);
});
test('year boundary and UK midnight totals follow the due date, not creation or payment time',async()=>{
 const {ukDay,savingsTotals}=await load();const rows=[{type:'subscription',date:'2027-01-01',amount:10,done:false,createdAt:1}];
 assert.deepEqual(savingsTotals(rows,'2026-12-31'),{month:0,year:0});assert.deepEqual(savingsTotals(rows,'2027-01-01'),{month:10,year:10});
 assert.equal(ukDay(Date.parse('2026-06-30T23:30:00Z')),'2026-07-01');
});
