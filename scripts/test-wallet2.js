// 双钱包改造前端核心逻辑实测（复刻 index.html 中的新增模块代码路径）
const { ethers } = require("ethers");
const assert = (c, m) => { if (!c) { console.error("❌ FAIL:", m); process.exit(1); } console.log("✅", m); };

// ---- 与前端完全一致的 AES-GCM 助记词加密模块 ----
async function deriveAesKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const _b64 = b => Buffer.from(b).toString("base64");
const _unb = s => new Uint8Array(Buffer.from(s, "base64"));
async function encryptText(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { salt: _b64(salt), iv: _b64(iv), data: _b64(data) };
}
async function decryptText(obj, password) {
  const key = await deriveAesKey(password, _unb(obj.salt));
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _unb(obj.iv) }, key, _unb(obj.data));
  return new TextDecoder().decode(buf);
}

(async () => {
  console.log("====== 1. 新建钱包：私钥格式 + BIP39 12 词助记词 ======");
  const w = ethers.Wallet.createRandom();
  assert(/^0x[0-9a-f]{64}$/.test(w.privateKey), "私钥格式 0x + 64位十六进制: " + w.privateKey.slice(0, 14) + "…");
  assert(w.mnemonic.phrase.split(" ").length === 12, "助记词为 12 个 BIP39 单词");

  console.log("====== 2. 助记词导入还原同一私钥 ======");
  const w2 = ethers.Wallet.fromPhrase(w.mnemonic.phrase);
  assert(w2.privateKey === w.privateKey && w2.address === w.address, "助记词还原出相同私钥与地址");

  console.log("====== 3. 私钥导入 ======");
  const w3 = new ethers.Wallet(w.privateKey);
  assert(w3.address === w.address, "私钥导入得到相同地址");

  console.log("====== 4. 助记词 AES-GCM 加密存储 / 密码验证导出 ======");
  const enc = await encryptText(w.mnemonic.phrase, "test123456");
  const dec = await decryptText(enc, "test123456");
  assert(dec === w.mnemonic.phrase, "正确密码可解密导出助记词");
  let wrongFail = false;
  try { await decryptText(enc, "wrongpass"); } catch { wrongFail = true; }
  assert(wrongFail, "错误密码解密被拒绝");

  console.log("====== 5. keystore 私钥加密（登录解锁路径） ======");
  const ks = await w.encrypt("test123456");
  const unlock = await ethers.Wallet.fromEncryptedJson(ks, "test123456");
  assert(unlock.address === w.address, "keystore 密码解锁成功");
  let badPass = false;
  try { await ethers.Wallet.fromEncryptedJson(ks, "nope123"); } catch { badPass = true; }
  assert(badPass, "错误密码解锁被拒绝");

  console.log("====== 6. 旧版存储格式兼容（字符串 → 对象） ======");
  const oldData = { [w.address.toLowerCase()]: ks }; // 旧版直接存字符串
  for (const k in oldData) if (typeof oldData[k] === "string") oldData[k] = { ks: oldData[k], phrase: null };
  assert(oldData[w.address.toLowerCase()].ks === ks && oldData[w.address.toLowerCase()].phrase === null, "旧版账号可正常读取（phrase=null → 导出时友好提示）");

  console.log("\n🎉 全部通过");
})().catch(e => { console.error("❌ 异常:", e.message); process.exit(1); });
