import { test, expect } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off' });
test('browser crypto survives reload and restores in a clean browser context', async ({
  page,
  browser,
}) => {
  await page.goto('/demo');
  const bundle = await page.evaluate(async () => {
    const path = '/@fs/workspace/packages/crypto/index.ts';
    const mod = await import(path);
    const vaultPath = '/src/browser-vault.ts';
    const vault = await import(vaultPath);
    const key = await mod.createRoomKey();
    const context = {
      network: 'localnet',
      component: `component_${'0'.repeat(64)}`,
      submissionId: mod.randomSubmissionId(),
      keyThumbprint: key.thumbprint,
    };
    const first = await mod.sealStory(
      { version: 1, text: 'A synthetic browser recovery test.' },
      context,
      key.publicJwk,
    );
    const second = await mod.sealStory(
      { version: 1, text: 'A synthetic browser recovery test.' },
      context,
      key.publicJwk,
    );
    if (first.envelope === second.envelope || key.privateKey.extractable)
      throw new Error('KEY_OR_RANDOMIZATION_FAILED');
    await vault.vaultPut('browser-test-key', key.privateKey);
    return { ...first, context, recoveryFile: key.recoveryFile, recoveryCode: key.recoveryCode };
  });
  await page.reload();
  const reused = await page.evaluate(async (bundle) => {
    const mod = await import('/@fs/workspace/packages/crypto/index.ts');
    const vault = await import('/src/browser-vault.ts');
    const key = await vault.vaultGet('browser-test-key');
    const payload = await mod.openStory(bundle.envelope, bundle.context, key);
    return !key.extractable && payload.text === 'A synthetic browser recovery test.';
  }, bundle);
  expect(reused).toBe(true);
  const clean = await browser.newContext(),
    fresh = await clean.newPage();
  try {
    await fresh.goto(page.url());
    const restored = await fresh.evaluate(async (bundle) => {
      const mod = await import('/@fs/workspace/packages/crypto/index.ts');
      const vault = await import('/src/browser-vault.ts');
      if (await vault.vaultGet('browser-test-key')) throw new Error('CONTEXT_NOT_CLEAN');
      const key = await mod.restoreRoomKey(
        bundle.recoveryFile,
        bundle.recoveryCode,
        bundle.context.keyThumbprint,
      );
      const payload = await mod.openStory(bundle.envelope, bundle.context, key.privateKey);
      return !key.privateKey.extractable && payload.text === 'A synthetic browser recovery test.';
    }, bundle);
    expect(restored).toBe(true);
  } finally {
    await clean.close();
  }
});
