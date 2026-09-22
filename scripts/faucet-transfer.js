const { ethers } = require("hardhat");

async function main() {
    // 改成你要打钱的钱包地址
    const targetAddr = "0x你的钱包地址";
    // 获取本地节点自带的富豪账户（第一个账户，自带10000 ETH）
    const [richAccount] = await ethers.getSigners();

    console.log("转账来源:", richAccount.address);
    console.log("给目标地址打测试ETH:", targetAddr);

    // 转 100 个本地测试ETH
    const tx = await richAccount.sendTransaction({
        to: targetAddr,
        value: ethers.parseEther("100")
    });
    await tx.wait();
    console.log("✅转账完成");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
