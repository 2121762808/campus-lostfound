const hre = require("hardhat");

const ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const STATUS = ["Active(待认领)", "Matched(已匹配)", "ReturnMarked(已标记归还)", "Completed(已完成)", "Closed(已关闭)"];
const E = (v) => hre.ethers.formatEther(v);

let passed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`   ✅ ${name}`); }
  else { console.log(`   ❌ ${name}`); process.exitCode = 1; }
}

async function main() {
  const [deployer, finder, owner, anyone] = await hre.ethers.getSigners();
  const c = await hre.ethers.getContractAt("CampusLostFound", ADDR);
  const provider = hre.ethers.provider;
  const bal = (s) => provider.getBalance(s.address);
  const chainNow = () => provider.getBlock("latest").then((b) => b.timestamp);

  console.log("\n========== 流程一：拾获登记 → 认领托管 → 归还 → 确认放款 ==========");

  // 1. 拾获人登记（不可篡改存证）
  let txr = await c.connect(finder).registerFoundItem("电子产品", "黑色小米充电宝，侧面有划痕", "第三教学楼302", await chainNow(), "微信: finder123");
  await txr.wait();
  let item = await c.getFoundItem(1);
  check("拾获登记成功，状态为 Active", item.finder === finder.address && Number(item.status) === 0);
  console.log(`   📌 链上存证: #${item.id} ${item.category} @ ${item.foundLocation}，状态 ${STATUS[Number(item.status)]}`);

  // 2. 失主认领并托管 0.01 ETH 押金
  txr = await c.connect(owner).claimFoundItem(1, { value: hre.ethers.parseEther("0.01") });
  await txr.wait();
  item = await c.getFoundItem(1);
  check("押金 0.01 ETH 已托管进合约", (await provider.getBalance(ADDR)) === hre.ethers.parseEther("0.01"));
  check("状态流转为 Matched，认领人已记录", Number(item.status) === 1 && item.claimant === owner.address);

  // 3. 拾获人标记已归还
  txr = await c.connect(finder).markFoundReturned(1);
  await txr.wait();
  item = await c.getFoundItem(1);
  check("拾获人链上声明已归还（不可抵赖）", Number(item.status) === 2);

  // 4. 失主确认收货 -> 合约自动放款
  const before = await bal(finder);
  txr = await c.connect(owner).confirmFoundReceived(1);
  const rcpt = await txr.wait();
  const ev = rcpt.logs.find(l => l.fragment && l.fragment.name === "FoundCompleted");
  const after = await bal(finder);
  item = await c.getFoundItem(1);
  check("FoundCompleted 事件已发出（可追溯）", !!ev);
  check(`合约自动放款：拾获人余额 +${E(after - before)} ETH`, after - before === hre.ethers.parseEther("0.01"));
  check("流程终态 Completed，押金清零", Number(item.status) === 3 && item.deposit === 0n);

  console.log("\n========== 流程二：发布悬赏 → 报名 → 归属核对 → 归还 → 放款 ==========");

  // 1. 失主发布悬赏并托管 0.05 ETH
  txr = await c.connect(owner).postBounty("电子产品", "银色 MacBook Air，贴有动漫贴纸", "图书馆三楼", await chainNow(), "手机: 138xxxx", { value: hre.ethers.parseEther("0.05") });
  await txr.wait();
  let b = await c.getBounty(1);
  check("悬赏发布，0.05 ETH 赏金托管在合约", Number(b.status) === 0 && b.reward === hre.ethers.parseEther("0.05"));

  // 2. 两名拾获人报名
  await (await c.connect(finder).applyForBounty(1)).wait();
  await (await c.connect(anyone).applyForBounty(1)).wait();
  const apps = await c.getBountyApplicants(1);
  check("两名拾获人报名，等待失主核对归属", apps.length === 2);

  // 3. 失主核对后指定真正的拾获人（finder）
  await (await c.connect(owner).confirmFinder(1, finder.address)).wait();
  b = await c.getBounty(1);
  check("归属核对完成，匹配拾获人", Number(b.status) === 1 && b.finder === finder.address);

  // 4. 拾获人标记归还
  await (await c.connect(finder).markBountyReturned(1)).wait();
  b = await c.getBounty(1);
  check("拾获人标记已归还", Number(b.status) === 2);

  // 5. 失主确认 -> 自动放款 0.05 ETH
  const before2 = await bal(finder);
  await (await c.connect(owner).confirmBountyReceived(1)).wait();
  const after2 = await bal(finder);
  b = await c.getBounty(1);
  check(`合约自动放款：拾获人余额 +${E(after2 - before2)} ETH`, after2 - before2 === hre.ethers.parseEther("0.05"));
  check("悬赏流程终态 Completed", Number(b.status) === 3);

  console.log("\n========== 场景三：失主拖延不确认 → 超时自动放款 ==========");

  await (await c.connect(finder).registerFoundItem("钥匙/U盘", "一串钥匙带蓝色门禁卡", "食堂二楼", await chainNow(), "微信: finder123")).wait();
  await (await c.connect(owner).claimFoundItem(2, { value: hre.ethers.parseEther("0.02") })).wait();
  await (await c.connect(finder).markFoundReturned(2)).wait();
  console.log("   ⏩ 拾获人已标记归还，快进 7 天 + 1 秒…");
  await provider.send("evm_increaseTime", [7 * 24 * 3600 + 1]);
  await provider.send("evm_mine");
  const before3 = await bal(finder);
  // 任意第三方触发超时放款
  await (await c.connect(anyone).timeoutReleaseFound(2)).wait();
  const after3 = await bal(finder);
  item = await c.getFoundItem(2);
  check(`第三方触发超时放款成功：拾获人 +${E(after3 - before3)} ETH`, after3 - before3 === hre.ethers.parseEther("0.02"));
  check("状态 Completed（无需失主配合）", Number(item.status) === 3);

  console.log("\n========== 场景四：取消路径与资金退回 ==========");

  // 悬赏未匹配前撤销 -> 赏金全额退回失主
  await (await c.connect(owner).postBounty("校园卡/证件", "校园卡，姓名张某", "操场", await chainNow(), "手机: 139xxxx", { value: hre.ethers.parseEther("0.03") })).wait();
  const before4 = await bal(owner);
  const tx4 = await c.connect(owner).cancelBounty(2);
  const rc4 = await tx4.wait();
  const gas4 = rc4.gasUsed * rc4.gasPrice;
  const after4 = await bal(owner);
  b = await c.getBounty(2);
  check("撤销悬赏，赏金 0.03 ETH 全额退回（扣 gas 后）", b.reward === 0n && Number(b.status) === 4 && after4 - before4 + gas4 === hre.ethers.parseEther("0.03"));

  // 认领后归还前取消认领 -> 押金退回失主，物品重新开放
  await (await c.connect(finder).registerFoundItem("书籍资料", "《算法导论》一本", "自习室A区", await chainNow(), "微信: finder123")).wait();
  await (await c.connect(owner).claimFoundItem(3, { value: hre.ethers.parseEther("0.005") })).wait();
  await (await c.connect(owner).cancelClaim(3)).wait();
  item = await c.getFoundItem(3);
  check("取消认领，押金退回，物品回到 Active 可再次被认领", Number(item.status) === 0 && item.deposit === 0n);

  console.log("\n========== 场景五：权限与状态校验（防篡改） ==========");

  let reverted = false;
  try { await c.connect(anyone).confirmFinder(3, anyone.address); } catch { reverted = true; }
  check("非失主无法指定拾获人（交易被回滚）", reverted);

  reverted = false;
  try { await c.connect(owner).claimFoundItem(3, { value: 0 }); } catch { reverted = true; }
  check("认领必须附带押金（msg.value = 0 被拒绝）", reverted);

  reverted = false;
  try { await c.connect(finder).claimFoundItem(3, { value: hre.ethers.parseEther("0.01") }); } catch { reverted = true; }
  check("拾获人不能认领自己登记的物品", reverted);

  console.log(`\n===== 测试完成：${passed} 项断言通过${process.exitCode ? "，存在失败项" : "，全部通过"} =====`);
  const finalBal = await provider.getBalance(ADDR);
  console.log(`合约余额（应只剩进行中托管）：${E(finalBal)} ETH（物品#3 重新开放后押金已退，应为 0.005 ETH 的活跃认领=0，实际为 ${E(finalBal)}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
