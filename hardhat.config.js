require("@nomicfoundation/hardhat-ethers");
const fs = require("fs");

// Sepolia 部署账户私钥（仅测试网用途，存于 scripts/.deployer.json，勿提交勿泄露）
let sepoliaAccounts = [];
try {
  sepoliaAccounts = [JSON.parse(fs.readFileSync("scripts/.deployer.json", "utf8")).privateKey];
} catch {}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    // npx hardhat node 启动的本地链 (chainId 31337)
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Ganache 图形客户端（默认 RPC 7545 / chainId 1337）——数据可持久化，关掉 Ganache 再开数据仍在
    // 不写 accounts：直接借用节点自带的解锁账户发交易（eth_sendTransaction）。
    // 这样每次新建/重置 Ganache 工作区（助记词会变）都不再因为私钥过时而报 insufficient funds。
    ganache: {
      url: "http://127.0.0.1:7545",
      chainId: 1337,
    },
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: sepoliaAccounts,
    },
    // Polygon Amoy 公共测试网（chainId 80002）——公网访客可直接交互
    amoy: {
      url: "https://polygon-amoy-bor-rpc.publicnode.com",
      chainId: 80002,
      accounts: sepoliaAccounts,
    },
  },
};
