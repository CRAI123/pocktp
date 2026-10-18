// 教师工作台印刷卷改造 v2 验证脚本
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join('e:', 'desktop', 'pocktp', 'verify-shots');
const DOWNLOADS_DIR = path.join('e:', 'desktop', 'pocktp', 'verify-downloads');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const consoleErrors = [];
  let pageDownloadFilenames = [];
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOADS_DIR,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({ url: page.url(), text: msg.text() });
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push({ url: page.url(), text: 'pageerror: ' + err.message });
    });
    page.on('response', resp => {
      if (resp.status() >= 400) {
        consoleErrors.push({ url: page.url(), text: `HTTP ${resp.status()} ${resp.url()}` });
      }
    });

    // ============ 1. 登录 ============
    console.log('--- [1] 登录 ---');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));
    // 检查是否已登录（如果跳到登录页则登录）
    const isLoginPage = await page.evaluate(() => !!document.querySelector('input[type="password"], input[placeholder*="密码"], input[placeholder*="账号"]'));
    if (isLoginPage) {
      console.log('  检测到登录页，开始登录...');
      // 查找账号输入框
      const phoneSel = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map((el, i) => ({ i, type: el.type, ph: el.placeholder, name: el.name }));
      });
      console.log('  inputs:', JSON.stringify(phoneSel));
      // 尝试按 placeholder 定位
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
          if (/手机|账号|user|account/i.test(inp.placeholder || '') || /phone|tel/i.test(inp.name || '')) {
            inp.focus();
          }
        }
      });
      // 用 type 输入
      const telHandle = await page.$('input[type="tel"]');
      if (telHandle) {
        await telHandle.type('13800000000', { delay: 20 });
      } else {
        // 试所有非 password input
        const allInputs = await page.$$('input');
        for (const inp of allInputs) {
          const type = await page.evaluate(el => el.type, inp);
          if (type !== 'password' && type !== 'hidden') {
            await inp.type('13800000000', { delay: 20 });
            break;
          }
        }
      }
      const pwdHandle = await page.$('input[type="password"]');
      if (pwdHandle) {
        await pwdHandle.type('123456', { delay: 20 });
      }
      // 提交
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const submit = btns.find(b => /登录|login|登\s*录/i.test(b.textContent));
        if (submit) submit.click();
      });
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log('  已登录或非登录页');
    }
    console.log('  当前URL:', page.url());

    // ============ 2. 进入 /teaching/chinese/dictation ============
    console.log('\n--- [2] /teaching/chinese/dictation ---');
    await page.goto('http://localhost:5173/teaching/chinese/dictation', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1200)); // 等 HMR 编译

    // 检查按钮
    const buttonsInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.map(b => b.textContent.trim());
    });
    console.log('  按钮列表:', JSON.stringify(buttonsInfo));
    const hasPdfBtn = buttonsInfo.some(t => t.includes('PDF'));
    const hasOldBtn = buttonsInfo.some(t => t.includes('生成纸质版'));
    console.log('  hasPdfBtn:', hasPdfBtn, 'hasOldBtn:', hasOldBtn);

    // 强制打印视图
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.print-only').forEach(el => el.style.display = 'block');
    });
    await new Promise(r => setTimeout(r, 300));

    const dictationInfo = await page.evaluate(() => {
      const list = document.querySelector('.print-list');
      const items = document.querySelectorAll('.print-item');
      const heads = document.querySelectorAll('.print-head');
      const firstHead = document.querySelector('.print-item .print-head');
      return {
        gridTemplateColumns: list ? getComputedStyle(list).gridTemplateColumns : null,
        itemCount: items.length,
        headCount: heads.length,
        firstHeadText: firstHead ? firstHead.textContent.trim() : null,
        firstPrintNo: document.querySelector('.print-item .print-no')?.textContent?.trim() ?? null,
      };
    });
    console.log('  dictation grid:', JSON.stringify(dictationInfo));

    // 截图
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dictation-grid.png'), fullPage: false });
    console.log('  截图: dictation-grid.png');

    // ============ 3. /teaching/english/sentence ============
    console.log('\n--- [3] /teaching/english/sentence ---');
    await page.goto('http://localhost:5173/teaching/english/sentence', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1200));

    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.print-only').forEach(el => el.style.display = 'block');
    });
    await new Promise(r => setTimeout(r, 300));

    const sentenceInfo = await page.evaluate(() => {
      const list = document.querySelector('.print-list');
      const items = document.querySelectorAll('.print-item');
      const heads = document.querySelectorAll('.print-head');
      return {
        gridTemplateColumns: list ? getComputedStyle(list).gridTemplateColumns : null,
        itemCount: items.length,
        headCount: heads.length,
        firstPrintNo: document.querySelector('.print-item .print-no')?.textContent?.trim() ?? null,
      };
    });
    console.log('  sentence grid:', JSON.stringify(sentenceInfo));

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'sentence-grid.png'), fullPage: false });
    console.log('  截图: sentence-grid.png');

    // ============ 4. /teaching/english/wordbank ============
    console.log('\n--- [4] /teaching/english/wordbank ---');
    await page.goto('http://localhost:5173/teaching/english/wordbank', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1200));

    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.print-only').forEach(el => el.style.display = 'block');
    });
    await new Promise(r => setTimeout(r, 300));

    const wordbankInfo = await page.evaluate(() => {
      const list = document.querySelector('.print-list');
      const items = document.querySelectorAll('.print-item');
      const heads = document.querySelectorAll('.print-head');
      return {
        gridTemplateColumns: list ? getComputedStyle(list).gridTemplateColumns : null,
        itemCount: items.length,
        headCount: heads.length,
        firstPrintNo: document.querySelector('.print-item .print-no')?.textContent?.trim() ?? null,
      };
    });
    console.log('  wordbank grid:', JSON.stringify(wordbankInfo));

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'wordbank-grid.png'), fullPage: false });
    console.log('  截图: wordbank-grid.png');

    // ============ 5. 关闭打印模式 ============
    console.log('\n--- [5] 关闭打印模式 ---');
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.style.display = '');
      document.querySelectorAll('.print-only').forEach(el => el.style.display = '');
    });

    // ============ 6. /teaching/english/sentence - 点 PDF 按钮 ============
    console.log('\n--- [6] /teaching/english/sentence 点 PDF 按钮 ---');
    await page.goto('http://localhost:5173/teaching/english/sentence', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));

    // 清空下载目录
    const beforeFiles = fs.readdirSync(DOWNLOADS_DIR);
    console.log('  下载目录已有文件:', beforeFiles.length);

    // 点击 PDF 按钮
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const pdfBtn = btns.find(b => /生成 PDF 打印版/.test(b.textContent));
      if (pdfBtn) {
        pdfBtn.click();
        return true;
      }
      return false;
    });
    console.log('  点击PDF按钮:', clicked);

    // 等待 PDF 生成和下载（html2canvas + jsPDF 可能需要几秒）
    let downloadedFiles = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const newFiles = files.filter(f => f.endsWith('.pdf'));
      if (newFiles.length > beforeFiles.filter(f => f.endsWith('.pdf')).length) {
        downloadedFiles = newFiles;
        break;
      }
      downloadedFiles = newFiles;
    }

    const pdfFiles = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.pdf'));
    const pdfInfo = pdfFiles.map(f => {
      const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
      return { name: f, size: stat.size };
    });
    console.log('  下载的PDF:', JSON.stringify(pdfInfo));
    pageDownloadFilenames = pdfFiles;

    // ============ 7. 控制台错误 ============
    console.log('\n--- [7] 控制台错误 ---');
    console.log('  错误数:', consoleErrors.length);
    consoleErrors.forEach(e => console.log('  -', e.text));

    // 输出汇总
    console.log('\n=== 汇总 ===');
    console.log(JSON.stringify({
      dictation: dictationInfo,
      sentence: sentenceInfo,
      wordbank: wordbankInfo,
      pdfDownloads: pdfInfo,
      consoleErrorCount: consoleErrors.length,
      consoleErrors: consoleErrors.slice(0, 10),
    }, null, 2));

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});