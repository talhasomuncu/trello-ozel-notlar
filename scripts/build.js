import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of await readdir('public')) {
  await cp(`public/${file}`, `dist/${file}`);
}
await writeFile('dist/.nojekyll', '');
console.log('Statik dağıtım dosyaları dist/ klasöründe hazır.');
