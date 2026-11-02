import test from 'node:test';
import assert from 'node:assert/strict';
import {statistics,cost,currentHour,madridDate} from '../web/assets/calculations.mjs';
test('statistics include negative prices and stable ties',()=>{
 const hours=[{total:0.1},{total:-0.03},{total:0.1}];
 const result=statistics(hours);
 assert.equal(result.minimum,hours[1]);assert.equal(result.maximum,hours[0]);
 assert.ok(Math.abs(result.average-0.17/3)<1e-12);
 assert.throws(()=>statistics([]));
});
test('energy costs exclude any fixed charge',()=>{
 assert.equal(cost(0,0.2),0);assert.equal(cost(3,0.2),0.6000000000000001);
 assert.equal(cost(2,-0.01),-0.02);
 for(const value of [-1,Infinity,NaN,1000001])assert.throws(()=>cost(value,0.1));
});
test('distinct instants in duplicated DST civil hours',()=>{
 const hours=[{start:'2026-10-25T02:00:00+02:00',end:'2026-10-25T01:00:00Z'}, {start:'2026-10-25T02:00:00+01:00',end:'2026-10-25T02:00:00Z'}];
 assert.equal(currentHour(hours,Date.parse('2026-10-25T01:30:00Z')),hours[1]);
 assert.equal(currentHour(hours,Date.parse('2026-10-25T02:00:00Z')),undefined);
 assert.equal(madridDate(new Date('2026-07-01T23:30:00Z')),'2026-07-02');
});
