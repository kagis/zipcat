# zipcat

```js
import { zipcat } from 'https://raw.githubusercontent.com/kagis/zipcat/c2fc55f65f33c1576ae5cd9c6ed6e5999dc7f032/zipcat.js';
import { readableStreamFromIterable } from 'https://deno.land/std@0.144.0/streams/mod.ts';

await readableStreamFromIterable(zipcat(generate_zip_entries())).pipeTo(Deno.stdout.writable);

async function * generate_zip_entries() {
  yield { name: 'one.txt', data: utf8enc('hello world\n') };
  yield { name: 'two.txt', data: [utf8enc('lorem ipsum\n'), utf8enc('dolor sit amet\n')] };
  
  const file = await Deno.open('/tmp/three.txt');
  yield { name: 'three.txt', data: file.readable };
}

function utf8enc(s) {
  return new TextEncoder().encode(s);
}
```