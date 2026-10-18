// 验证 admin 后台档位快选按钮 (最终版)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join('e:', 'desktop', 'pocktp', 'verify-shots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('EXC: ' + err.message));

  try {
    // 1. 打开首页
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));

    // 2. 登录
    const isLoginPage = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.some(i => i.type === 'tel' || i.type === 'password');
    });
    if (isLoginPage) {
      const telHandle = await page.$('input[type="tel"]');
      if (telHandle) {
        await telHandle.click({ clickCount: 3 });
        await telHandle.type('13900000000', { delay: 20 });
      }
      const pwdHandle = await page.$('input[type="password"]');
      if (pwdHandle) {
        await pwdHandle.type('admin123', { delay: 20 });
      }
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const submit = btns.find(b => /登录|login|登\s*录/i.test(b.textContent));
        if (submit) submit.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('登录后URL:', page.url());

    // 3. 进入 /admin
    await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Admin URL:', page.url());

    // 4. 检查页面错误状态
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('页面内容长度:', pageText.length);
    console.log('页面前500字:', pageText.substring(0, 500));
    console.log('错误列表:', JSON.stringify(errors.slice(0, 5)));

    // 5. 检查是否能看到 Admin 组件
    const hasAdminContent = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasH3: !!Array.from(document.querySelectorAll('h3')).find(h => /批量生成激活码/.test(h.textContent)),
        hasTierBtn: /¥\d/.test(text),
        hasSparkles: !!document.querySelector('svg.lucide-sparkles'),
        bodyTextSample: text.substring(0, 200),
      };
    });
    console.log('Admin 内容检查:', JSON.stringify(hasAdminContent, null, 2));

    // 6. 截图
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin-page-state.png'), fullPage: false });
    console.log('已截图 admin-page-state.png');

    // 7. 收集档位按钮 (如果有)
    const tierInfo = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const tierBtns = allButtons.filter(b => /¥\d/.test(b.textContent));
      return {
        count: tierBtns.length,
        list: tierBtns.map(b => ({
          text: b.textContent.trim(),
          hasHot: /热/.test(b.textContent),
        })),
      };
    });
    console.log('档位按钮:', JSON.stringify(tierInfo, null, 2));
  } catch (err) {
    console.error('脚本错误:', err.message);
  } finally {
    await browser.close();
  }
}

main();
