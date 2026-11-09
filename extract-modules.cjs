const fs = require('fs');

for (let n = 1; n <= 3; n++) {
  let data = fs.readFileSync(`module${n}-bytecode.txt`, 'utf8').trim();
  data = data.startsWith('0x') ? data.slice(2) : data;

  const code = Buffer.from(data, 'hex');
  const selectors = new Set();

  let i = 0;

  while (i < code.length) {
    const op = code[i];

    if (op === 0x63 && i + 4 < code.length) {
      selectors.add('0x' + code.subarray(i + 1, i + 5).toString('hex'));
    }

    if (op >= 0x60 && op <= 0x7f) {
      i += 1 + op - 0x5f;
    } else {
      i++;
    }
  }

  const result = [...selectors].sort();

  fs.writeFileSync(`module${n}-selectors.txt`, result.join('\n'));

  console.log(`Module ${n}: ${result.length} kandidat PUSH4`);
}
