import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // --- 1. 核心部署 (所有網絡都會執行) ---

  // 部署 Corn 代幣
  await deploy("Corn", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  const cornToken = await hre.ethers.getContract<Contract>("Corn", deployer);

  // 部署 DEX
  await deploy("CornDEX", {
    from: deployer,
    args: [cornToken.target],
    log: true,
    autoMine: true,
  });
  const cornDEX = await hre.ethers.getContract<Contract>("CornDEX", deployer);

  // 部署 Lending 合約
  const lending = await deploy("Lending", {
    from: deployer,
    args: [cornDEX.target, cornToken.target],
    log: true,
    autoMine: true,
  });

  // --- 2. 本地開發環境專用 (僅在 localhost 執行，節省 Sepolia Gas) ---
  if (hre.network.name === "localhost") {
    console.log("🛠  Localhost detected: Deploying helper contracts and initializing liquidity...");

    // 部署輔助合約
    const movePrice = await deploy("MovePrice", {
      from: deployer,
      args: [cornDEX.target, cornToken.target],
      log: true,
      autoMine: true,
    });

    await deploy("FlashLoanLiquidator", {
      from: deployer,
      args: [lending.address, cornDEX.target, cornToken.target],
      log: true,
      autoMine: true,
    });

    await deploy("Leverage", {
      from: deployer,
      args: [lending.address, cornDEX.target, cornToken.target],
      log: true,
      autoMine: true,
    });

    // 初始化資金與狀態 (本地測試用)
    // 給 MovePrice 合約 ETH 和 Corn
    await hre.ethers.provider.send("hardhat_setBalance", [
      movePrice.address,
      `0x${hre.ethers.parseEther("10000").toString(16)}`,
    ]);
    await cornToken.mintTo(movePrice.address, hre.ethers.parseEther("10000"));

    // 給 Lending 合約注入 Corn
    await cornToken.mintTo(lending.address, hre.ethers.parseEther("10000"));

    // 給 Deployer 注入 Corn 和 ETH
    await cornToken.mintTo(deployer, hre.ethers.parseEther("1000"));

    // 初始化 DEX 流動性
    await cornToken.approve(cornDEX.target, hre.ethers.parseEther("1000"));
    await cornDEX.init(hre.ethers.parseEther("1000"), { value: hre.ethers.parseEther("1") });

    console.log("✅ Localhost setup complete!");
  }
};

export default deployContracts;
