// Собирает папку www/ — содержимое приложения, которое Capacitor кладёт внутрь iOS/Android.
// Сайт и приложение используют одни и те же файлы; отдельной копии кода нет.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const item of ['index.html', 'manifest.webmanifest', 'favicon.svg', 'css', 'js', 'fonts', 'icons']) {
  if (existsSync(item)) cpSync(item, `www/${item}`, { recursive: true });
}
console.log('www/ собрана');
