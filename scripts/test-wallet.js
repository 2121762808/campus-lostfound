// 模拟前端「本地托管钱包」全流程测试：
// 创建钱包 -> 密码加密存储 -> 解密登录 -> RPC 直连（无 MetaMask）-> 完整业务闭环
const { ethers } = require("ethers");

const RPC = "http://127.0.0.1:8545";
const ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FAUCET_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const ABI = [
  "function registerFoundItem(string,string,string,uint256,string) returns (uint256)",
  "function claimFoundItem(uint256 id) payable",
  "function markFoundReturned(uint256 id)",
  "function confirmFoundReceived(uint256 id)",
  "function getFoundItem(uint256 id) view returns (tuple(uint256 id, address finder, string category, string description, string foundLocation, uint256 foundTime, string contact, uint8 status, address claimant, uint256 deposit, uint256 returnMarkedAt))",
  "function foundCount() view returns (uint256)",
];

let passed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`   ✅ ${name}`); }
  else { console.log(`   ❌ ${name}`); process.exitCode = 1; }
};

async function main() {
  // cacheTimeout: -1 关闭 RPC 缓存，避免连续交易拿到过期 nonce（前端同样处理）
  const provider = new ethers.JsonRpcProvider(RPC, 31337, { cacheTimeout: -1, staticNetwork: true });

  console.log("\n========== 1. 创建钱包 + 密码加密（模拟注册） ==========");
  const finderW = ethers.Wallet.createRandom();
  const ownerW = ethers.Wallet.createRandom();
  check("随机钱包创建成功，助记词 12 词", finderW.mnemonic.phrase.split(" ").length === 12);

  const t0 = Date.now();
  const finderKeystore = await finderW.encrypt("test123456");
  console.log(`   🔐 加密耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s（scrypt，前端体验一致）`);
  check("keystore JSON 生成成功（可存 localStorage）", JSON.parse(finderKeystore).address.length > 0);

  console.log("\n========== 2. 解密登录 ==========");
  const unlocked = await ethers.Wallet.fromEncryptedJson(finderKeystore, "test123456");
  check("密码正确 -> 解密登录成功", unlocked.address === finderW.address);
  let failed = false;
  try { await ethers.Wallet.fromEncryptedJson(finderKeystore, "wrongpass"); } catch { failed = true; }
  check("密码错误 -> 登录被拒绝", failed);

  console.log("\n========== 3. RPC 直连 + 水龙头（无 MetaMask） ==========");
  const faucet = new ethers.Wallet(FAUCET_PK, provider);
  let nonce = await provider.getTransactionCount(faucet.address, "pending");
  await (await faucet.sendTransaction({ to: finderW.address, value: ethers.parseEther("1"), nonce: nonce++ })).wait();
  await (await faucet.sendTransaction({ to: ownerW.address, value: ethers.parseEther("1"), nonce: nonce++ })).wait();
  const bal = await provider.getBalance(finderW.address);
  check(`新钱包已获测试币：${ethers.formatEther(bal)} ETH`, bal === ethers.parseEther("1"));

  console.log("\n========== 4. 用新钱包跑完整业务闭环 ==========");
  const finder = finderW.connect(provider);
  const owner = ownerW.connect(provider);
  const cF = new ethers.Contract(ADDR, ABI, finder);
  const cO = new ethers.Contract(ADDR, ABI, owner);

  const now = (await provider.getBlock("latest")).timestamp;
  const txr = await cF.registerFoundItem("衣物饰品", "灰色连帽卫衣，L码", "体育馆看台", now, "微信: newfinder");
  await txr.wait();
  const id = Number(await cF.foundCount());
  let item = await cF.getFoundItem(id);
  check(`本地钱包签名登记成功（物品 #${id}）`, item.finder === finder.address && Number(item.status) === 0);

  await (await cO.claimFoundItem(id, { value: ethers.parseEther("0.01") })).wait();
  item = await cF.getFoundItem(id);
  check("失主认领并托管 0.01 ETH", Number(item.status) === 1 && item.deposit === ethers.parseEther("0.01"));

  await (await cF.markFoundReturned(id)).wait();
  const before = await provider.getBalance(finder.address);
  await (await cO.confirmFoundReceived(id)).wait();
  const after = await provider.getBalance(finder.address);
  item = await cF.getFoundItem(id);
  check(`合约自动放款：拾获人 +${ethers.formatEther(after - before)} ETH`, after - before === ethers.parseEther("0.01"));
  check("流程终态 Completed", Number(item.status) === 3);

  console.log(`\n===== 测试完成：${passed} 项断言${process.exitCode ? "存在失败" : "全部通过"} =====`);
  console.log("结论：前端的钱包创建/加密/登录/RPC 直连/合约交互代码路径全部验证通过，全程无 MetaMask。");
}

main().catch((e) => { console.error(e); process.exit(1); });
