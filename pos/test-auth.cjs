// Regression-only fixture. Each isolated browser uses a fake account and the real login form.
const crypto=require('crypto');
const password='Regression-only-2026',salt='1234567890abcdef1234567890abcdef';
const account={version:1,users:[{id:'regression-admin',username:'regression',name:'测试管理员',role:'admin',enabled:true,createdAt:new Date().toISOString(),salt,iterations:600000,hash:crypto.pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex')}]};
async function login(scope){if(await scope.locator('#scanSearch').isVisible())return;await scope.locator('#authUsername').waitFor();await scope.locator('#authUsername').fill('regression');await scope.locator('#authPassword').fill(password);await scope.locator('#authSubmit').click();await scope.locator('#scanSearch').waitFor();}
async function prepare(page,{frame=false}={}){await page.addInitScript(data=>{if(!localStorage.getItem('TCGshop-POS-accounts-v1'))localStorage.setItem('TCGshop-POS-accounts-v1',JSON.stringify(data));},account);for(const method of ['goto','reload']){const original=page[method].bind(page);page[method]=async(...args)=>{const result=await original(...args);await login(frame?page.frameLocator('#app'):page);return result;};}}
module.exports={prepare};
