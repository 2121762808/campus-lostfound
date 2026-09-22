const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const PAGE = path.join(__dirname, "..", "frontend", "index.html");

async function main() {
  const LostFound = await hre.ethers.getContractFactory("CampusLostFound");
  const contract = await LostFound.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("CampusLostFound deployed to:", address);

  // 直接把新地址写回前端默认值，避免每次换 Ganache 工作区都要手工改、也避免忘改导致交易全部失败
  const src = fs.readFileSync(PAGE, "utf8");
  const next = src.replace(
    /const DEFAULT_ADDR = "0x[0-9a-fA-F]{40}";[^\n]*/,
    `const DEFAULT_ADDR = "${address}"; // 由 scripts/deploy.js（--network ${hre.network.name}）自动写入`
  );
  if (next === src) {
    console.log(src.includes(address) ? "frontend/index.html 已是该地址，无需修改" : "未找到 DEFAULT_ADDR 行，请手动把地址填入「设置」页");
  } else {
    fs.writeFileSync(PAGE, next);
    console.log("已自动把新地址写入 frontend/index.html 的 DEFAULT_ADDR");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
