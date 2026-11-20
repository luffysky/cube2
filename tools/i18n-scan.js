'use strict';
// Finds the words that still need a machine translation and writes them to i18n/todo.json.
//   node tools/i18n-scan.js          list them (and write the file)
//   node tools/i18n-scan.js --check  the same, and fail when there is anything left
const fs = require('fs'), path = require('path');
const D = require('./dict.js');
const { dict } = D.raw(), auto = D.readAuto(), todo = D.todo(dict, auto);
fs.writeFileSync(path.join(D.ROOT, 'i18n', 'todo.json'), JSON.stringify(todo, null, 1) + '\n');
// machine text for words that are gone, or that a person has since translated, is dropped
const keep = {};
for (const k of Object.keys(auto)) if (dict[k] && D.missing(dict[k]).length) keep[k] = auto[k];
if (Object.keys(keep).length !== Object.keys(auto).length) fs.writeFileSync(D.AUTO, JSON.stringify(keep, null, 1) + '\n');
console.log('i18n: ' + Object.keys(dict).length + ' words, ' + todo.length + ' waiting for a machine translation' + (todo.length ? ': ' + todo.slice(0, 8).map(x => x.k).join(', ') + (todo.length > 8 ? ' …' : '') : ''));
if (process.argv.includes('--check') && todo.length) process.exit(1);
