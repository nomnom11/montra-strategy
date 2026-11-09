const fs = require('fs');

let data = fs.readFileSync('factory-bytecode.txt', 'utf8').trim();
if (data.startsWith('0x')) data = data.slice(2);

const code = Buffer.from(data, 'hex');
const selectors = new Set();

let i = 0;

while (i < code.length) {
  const op = code[i];

  // PUSH4 followed directly by EQ
  if (
    op === 0x63 &&
    i + 5 < code.length &&
    code[i + 5] === 0x14
  ) {
    selectors.add('0x' + code.subarray(i + 1, i + 5).toString('hex'));
  }

  if (op >= 0x60 && op <= 0x7f) {
    i += 1 + op - 0x5f;
  } else {
    i++;
  }
}

const result = [...selectors].sort();

fs.writeFileSync('factory-dispatch-selectors.txt', result.join('\n'));

console.log('Kandidat selector dispatcher:', result.length);
console.log(result.join('\n'));
