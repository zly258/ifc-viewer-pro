import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('demo-recording');
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  colorScheme: 'light',
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
});

const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();
const timeline = [];

const elapsed = () => Date.now() - startedAt;
const say = (text) => timeline.push({ time_ms: elapsed(), text });
const pause = (ms) => page.waitForTimeout(ms);

async function clickButton(name, exact = true) {
  const button = page.getByRole('button', { name, exact }).filter({ visible: true }).first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  const box = await button.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await pause(250);
  }
  await button.click();
}

async function ensurePanel(buttonName, panelText) {
  if (await page.getByText(panelText, { exact: true }).count()) return;
  await clickButton(buttonName);
  await pause(1000);
}

await page.goto('https://zly258.github.io/ifc-viewer-pro/', {
  waitUntil: 'networkidle',
  timeout: 120000,
});

await page.addStyleTag({ content: `
  #demo-cursor {
    position: fixed; left: 0; top: 0; width: 18px; height: 18px;
    margin-left: -9px; margin-top: -9px; border-radius: 50%;
    border: 2px solid #2563eb; background: rgba(255,255,255,.85);
    box-shadow: 0 2px 10px rgba(15,23,42,.35); z-index: 2147483647;
    pointer-events: none; transition: transform .08s ease;
  }
  #demo-cursor.down { transform: scale(.72); background: rgba(37,99,235,.25); }
  .demo-click-ring {
    position: fixed; width: 12px; height: 12px; margin-left: -6px; margin-top: -6px;
    border: 2px solid #2563eb; border-radius: 50%; pointer-events: none;
    z-index: 2147483646; animation: demoRing .55s ease-out forwards;
  }
  @keyframes demoRing { to { width: 46px; height: 46px; margin-left: -23px; margin-top: -23px; opacity: 0; } }
` });
await page.evaluate(() => {
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  document.body.appendChild(cursor);
  window.addEventListener('pointermove', (e) => {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  }, true);
  window.addEventListener('pointerdown', (e) => {
    cursor.classList.add('down');
    const ring = document.createElement('div');
    ring.className = 'demo-click-ring';
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 650);
  }, true);
  window.addEventListener('pointerup', () => cursor.classList.remove('down'), true);
});

say('这是 IFC Viewer Pro 的真实在线操作演示。整个过程直接运行项目的 GitHub Pages 页面，并加载项目自带的 IFC 案例模型。');
await pause(5200);

say('首先点击案例，选择体量较小的结构体系模型。模型文件将在浏览器本地解析，加载完成后自动适应当前视口。');
await clickButton('案例');
await pause(1000);
const sample = page.getByRole('button', { name: /结构体系模型/ }).first();
await sample.waitFor({ state: 'visible', timeout: 30000 });
await sample.click();

await page.waitForFunction(() => {
  const text = document.body.innerText;
  return text.includes('模型结构') && !text.includes('正在读取文件') && !text.includes('解析模型数据');
}, { timeout: 180000 });
await pause(4500);

const canvas = page.locator('canvas').first();
await canvas.waitFor({ state: 'visible', timeout: 30000 });
let box = await canvas.boundingBox();
if (!box) throw new Error('3D canvas not available');
let cx = box.x + box.width * 0.55;
let cy = box.y + box.height * 0.48;

say('模型加载后，可以使用接近 CAD 和 Revit 的操作习惯浏览模型。这里进行一次平稳旋转，并配合滚轮完成缩放，不使用连续晃动镜头。');
await page.mouse.move(cx, cy, { steps: 25 });
await page.keyboard.down('Control');
await page.mouse.down({ button: 'middle' });
await page.mouse.move(cx + 170, cy - 65, { steps: 55 });
await page.mouse.up({ button: 'middle' });
await page.keyboard.up('Control');
await pause(1700);
await page.mouse.wheel(0, -420);
await pause(1700);
await page.mouse.wheel(0, 160);
await pause(3000);

say('左侧模型结构面板按照 IFC 空间层级组织构件。单击三维构件后，右侧属性面板会读取该构件的基本信息和 IFC 属性。');
await ensurePanel('模型', '模型结构');
box = await canvas.boundingBox();
const candidates = [
  [0.52, 0.46], [0.58, 0.52], [0.46, 0.54], [0.62, 0.40], [0.42, 0.42],
];
let selectedPoint = { x: cx, y: cy };
for (const [rx, ry] of candidates) {
  const x = box.x + box.width * rx;
  const y = box.y + box.height * ry;
  await page.mouse.move(x, y, { steps: 18 });
  await page.mouse.click(x, y);
  await pause(900);
  selectedPoint = { x, y };
  if (await page.getByText('基本信息', { exact: true }).count()) break;
}
await ensurePanel('属性', '属性详情');
await pause(4200);

say('测量工具支持距离、角度和坐标拾取。这里选择距离测量，在模型表面依次拾取两个位置，测量结果会保留在三维视图和结果面板中。');
await clickButton('测量');
await pause(1200);
box = await canvas.boundingBox();
const p1 = selectedPoint;
const p2 = {
  x: Math.min(box.x + box.width * 0.74, p1.x + 230),
  y: Math.min(box.y + box.height * 0.66, p1.y + 110),
};
await page.mouse.move(p1.x, p1.y, { steps: 20 });
await page.mouse.click(p1.x, p1.y);
await pause(900);
await page.mouse.move(p2.x, p2.y, { steps: 28 });
await page.mouse.click(p2.x, p2.y);
await pause(4200);

say('剖切功能可按 X、Y、Z 三个方向控制可见范围。现在开启 X 向剖切，并调整剖切范围，直接观察结构内部。');
await clickButton('剖切');
await pause(1200);
const xPlane = page.getByRole('button', { name: 'X', exact: true }).first();
await xPlane.waitFor({ state: 'visible', timeout: 30000 });
await xPlane.click();
await pause(1600);
const ranges = page.locator('.sub-toolbar input[type="range"]');
if (await ranges.count() >= 2) {
  const maxRange = ranges.nth(1);
  await maxRange.evaluate((el) => {
    const input = el;
    const min = Number(input.min);
    const max = Number(input.max);
    input.value = String(min + (max - min) * 0.58);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
await pause(4700);

say('重置剖切后，打开爆炸视图。通过滑块让各个构件按空间位置分散，便于查看构件组成和连接关系。');
const resetSection = page.getByRole('button', { name: '重置并关闭所有剖切面', exact: true });
if (await resetSection.count()) await resetSection.click();
await pause(1000);
await clickButton('爆炸');
await pause(1000);
const explode = page.locator('.explode-range-input').first();
await explode.waitFor({ state: 'visible', timeout: 30000 });
await explode.evaluate((el) => {
  const input = el;
  input.value = '58';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await pause(5200);
await explode.evaluate((el) => {
  const input = el;
  input.value = '0';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await pause(2000);

say('视图菜单提供顶视图、前后左右视图以及多种等轴测视角。这里先切换到顶视图，再恢复到东北等轴测视图。');
await clickButton('视图');
await pause(900);
await clickButton('顶视图');
await pause(3200);
await clickButton('视图');
await pause(900);
await clickButton('东北等轴测');
await pause(3500);

say('最后点击充满，使模型重新适应窗口。以上画面均来自 IFC Viewer Pro 在线页面的真实功能操作，没有使用虚构界面。');
await clickButton('充满');
await pause(6500);

fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf8');
await page.close();
await context.close();
await browser.close();

const videoPath = await video.path();
fs.copyFileSync(videoPath, path.join(OUT, 'real-demo.webm'));
console.log(`Recorded video: ${path.join(OUT, 'real-demo.webm')}`);
