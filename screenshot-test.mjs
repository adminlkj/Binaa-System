import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ar-SA'
  });
  const page = await context.newPage();
  
  // Step 1: Navigate to home page
  console.log('Step 1: Navigating to http://localhost:3000');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/z/my-project/verify-01-homepage.png', fullPage: false });
  console.log('Screenshot 1: Homepage saved');
  
  // Step 2: Click on المبيعات (Sales)
  console.log('Step 2: Clicking on المبيعات');
  const salesLink = page.locator('a, button').filter({ hasText: 'المبيعات' }).first();
  if (await salesLink.isVisible()) {
    await salesLink.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/home/z/my-project/verify-02-sales.png', fullPage: false });
    console.log('Screenshot 2: Sales page saved');
  } else {
    console.log('Could not find المبيعات link, trying sidebar navigation...');
    // Try clicking sidebar items
    const sidebarLinks = await page.locator('nav a, aside a, [class*="sidebar"] a').all();
    for (const link of sidebarLinks) {
      const text = await link.textContent();
      console.log('Sidebar link:', text?.trim());
      if (text?.includes('المبيعات') || text?.includes('مبيعات')) {
        await link.click();
        await page.waitForTimeout(3000);
        break;
      }
    }
    await page.screenshot({ path: '/home/z/my-project/verify-02-sales.png', fullPage: false });
    console.log('Screenshot 2: Sales page saved (alternative method)');
  }
  
  // Step 3: Find and click the eye/view icon on the first invoice
  console.log('Step 3: Looking for eye/view icon on first invoice');
  await page.waitForTimeout(2000);
  
  // Try to find view/eye buttons
  const viewButtons = await page.locator('button[title*="عرض"], button[title*="preview"], button[title*="view"], a[title*="عرض"], a[title*="preview"], a[title*="view"], [aria-label*="عرض"], [aria-label*="preview"], [aria-label*="view"]').all();
  
  if (viewButtons.length > 0) {
    console.log(`Found ${viewButtons.length} view buttons, clicking first one`);
    await viewButtons[0].click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
  } else {
    // Look for eye icon or any icon buttons in table rows
    console.log('Looking for icon buttons in the table...');
    const iconButtons = await page.locator('tr button, tr a, table button, table a, [class*="action"] button, [class*="action"] a').all();
    console.log(`Found ${iconButtons.length} icon/action buttons`);
    
    // Look for SVG eye icons
    const eyeIcons = await page.locator('svg[class*="eye"], [data-testid*="view"], [data-testid*="eye"]').all();
    if (eyeIcons.length > 0) {
      console.log('Found eye icon, clicking parent');
      await eyeIcons[0].evaluate(el => el.closest('button, a')?.click());
      await page.waitForTimeout(3000);
    } else if (iconButtons.length > 0) {
      // Click the first action button which is likely the view button
      console.log('Clicking first action button');
      await iconButtons[0].click();
      await page.waitForTimeout(3000);
    }
  }
  
  await page.screenshot({ path: '/home/z/my-project/verify-03-invoice-preview.png', fullPage: true });
  console.log('Screenshot 3: Invoice preview saved');
  
  // Take a full-page screenshot for detailed inspection
  await page.screenshot({ path: '/home/z/my-project/verify-03-invoice-preview-full.png', fullPage: true });
  console.log('Screenshot 3b: Invoice preview full page saved');
  
  // Step 4: Go back and navigate to settings
  console.log('Step 4: Going to Settings (الإعدادات)');
  await page.goBack();
  await page.waitForTimeout(2000);
  
  // Find and click الإعدادات
  const settingsLink = page.locator('a, button').filter({ hasText: 'الإعدادات' }).first();
  if (await settingsLink.isVisible()) {
    await settingsLink.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
  } else {
    // Try navigating directly
    console.log('Trying direct navigation to settings...');
    await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  
  await page.screenshot({ path: '/home/z/my-project/verify-04-settings.png', fullPage: false });
  console.log('Screenshot 4: Settings page saved');
  
  // Step 5: Scroll to Document Identity section
  console.log('Step 5: Scrolling to Document Identity section');
  const docIdentity = page.locator('text=هوية المستندات, text=Document Identity, [class*="document-identity"], h2, h3').filter({ hasText: /هوية المستندات|Document Identity|مستندات/ });
  if (await docIdentity.count() > 0) {
    await docIdentity.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/z/my-project/verify-05-document-identity.png', fullPage: false });
    console.log('Screenshot 5: Document Identity section saved');
  } else {
    // Scroll down to find it
    console.log('Scrolling down to find Document Identity section...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: '/home/z/my-project/verify-05-document-identity.png', fullPage: false });
    console.log('Screenshot 5: Scrolled settings page saved');
  }
  
  // Also take a full page screenshot of settings
  await page.screenshot({ path: '/home/z/my-project/verify-05-settings-fullpage.png', fullPage: true });
  console.log('Screenshot 5b: Full settings page saved');
  
  await browser.close();
  console.log('Done! All screenshots saved.');
})();
