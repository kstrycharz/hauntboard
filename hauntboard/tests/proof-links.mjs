import {chromium,firefox,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=process.env.PROOF_ORIGIN;
assert(origin);
const report={origin,checkedAt:new Date().toISOString(),browsers:{},chainWrites:0};
const board=await (await fetch(`${origin}/api/board`)).json();
assert(board.threads.length>0,'Existing public thread required; this test never creates one.');
const thread=await (await fetch(`${origin}/api/thread?address=${board.threads[0].address}`)).json();
for(const [name,type] of Object.entries({chromium,firefox})) {
  const browser=await type.launch();
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    let writes=0;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.name));
    await page.route('**/api/**',async route=>{
      if(route.request().method()!=='GET'){writes++;await route.abort();}
      else await route.continue();
    });
    await page.goto(`${origin}/?board=${thread.board}&thread=${thread.address}`);
    await expect(page.locator('.post-chain-link').first()).toBeVisible({timeout:60000});
    assert.equal(await page.locator('.post-chain-link').count(),thread.posts.length);
    for(const post of thread.posts) {
      const link=page.locator(`[data-post="${post.index}"] .post-chain-link`);
      const address=thread.pages[Math.floor(post.index/16)];
      const href=await link.getAttribute('href');
      assert.equal(href,`https://ootle-indexer-a.tari.com/substates/${address}`);
      assert.equal(await link.getAttribute('target'),'_blank');
      const raw=await (await fetch(href)).json();
      assert.equal(raw.verified,true);
      assert.deepEqual(raw.substate.Component.body.state[7][post.index%16][2],post.payload);
    }
    for(const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    assert.equal(writes,0);
    assert.deepEqual(errors,[]);
    report.browsers[name]={status:'PASSED',posts:thread.posts.length,directPayloadMatches:true,responsive:true};
  } finally {await browser.close();}
}
report.status='POST_CHAIN_LINKS_VERIFIED';
if(process.env.PROOF_EVIDENCE)await writeFile(process.env.PROOF_EVIDENCE,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
