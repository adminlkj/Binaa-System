import { chromium } from 'playwright';

(async () => {
  console.log('Launching minimal browser...');
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
    ]
  });
  
  const context = await browser.newContext({ 
    viewport: { width: 1920, height: 1080 }, 
    locale: 'ar-SA',
    ignoreHTTPSErrors: true,
  });
  
  const page = await context.newPage();

  try {
    // Step 1: Homepage
    console.log('Step 1: Loading homepage...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/z/my-project/verify-01-homepage.png' });
    console.log('  Saved: verify-01-homepage.png');
    
    // Check if main content loaded
    const h1Text = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent : 'no h1 found';
    });
    console.log(`  Page h1: "${h1Text}"`);
    
    // Step 2: Click المبيعات
    console.log('Step 2: Clicking المبيعات...');
    await page.click('button:has-text("المبيعات")', { timeout: 10000 }).catch(e => console.log(`  Click failed: ${e.message}`));
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/z/my-project/verify-02-sales.png' });
    console.log('  Saved: verify-02-sales.png');
    
    // Check page content
    const salesH1 = await page.evaluate(() => document.querySelector('h1')?.textContent || 'no h1');
    console.log(`  Sales h1: "${salesH1}"`);
    
    // Step 3: Look for eye/view icon
    console.log('Step 3: Looking for invoice view...');
    const eyeBtn = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-Eye), button[title*="عرض"]').first();
    if (await eyeBtn.count() > 0) {
      await eyeBtn.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/home/z/my-project/verify-03-invoice-preview.png', fullPage: true });
      console.log('  Saved: verify-03-invoice-preview.png');
    } else {
      console.log('  No eye button found. Checking for retry/refresh...');
      const retryBtn = page.locator('button:has-text("إعادة المحاولة"), button:has-text("تحديث")').first();
      if (await retryBtn.count() > 0) {
        await retryBtn.click();
        await page.waitForTimeout(5000);
        
        // Check again for eye button
        const eyeBtn2 = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-Eye), button[title*="عرض"]').first();
        if (await eyeBtn2.count() > 0) {
          await eyeBtn2.click();
          await page.waitForTimeout(5000);
          await page.screenshot({ path: '/home/z/my-project/verify-03-invoice-preview.png', fullPage: true });
          console.log('  Saved: verify-03-invoice-preview.png');
        }
      }
      // If still no eye button, screenshot what we have
      if (!require('fs').existsSync('/home/z/my-project/verify-03-invoice-preview.png')) {
        await page.screenshot({ path: '/home/z/my-project/verify-03-sales-state.png' });
        console.log('  Saved: verify-03-sales-state.png (no preview available)');
      }
    }
    
    // Step 4: Go to Settings
    console.log('Step 4: Going to Settings...');
    // We need to go back to the main page first since it's an SPA
    // Try clicking الإعدادات in the sidebar
    await page.click('button:has-text("الإعدادات")', { timeout: 10000 }).catch(e => console.log(`  Click failed: ${e.message}`));
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/z/my-project/verify-04-settings.png' });
    console.log('  Saved: verify-04-settings.png');
    
    // Step 5: Scroll to Document Identity
    console.log('Step 5: Scrolling to Document Identity...');
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(300);
      const found = await page.locator('text=هوية المستندات').count();
      if (found > 0) {
        console.log('  Found Document Identity section!');
        break;
      }
    }
    await page.screenshot({ path: '/home/z/my-project/verify-05-document-identity.png' });
    console.log('  Saved: verify-05-document-identity.png');
    
  } catch (error) {
    console.error('Error:', error.message);
    // Try to save whatever screenshot we can
    await page.screenshot({ path: '/home/z/my-project/verify-error.png' }).catch(() => {});
  }
  
  await browser.close();
  console.log('Done!');
})();
