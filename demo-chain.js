// CampusChain 演示账本
// 公网那份站点没有可访问的本地节点，这里用一份存在浏览器里的模拟账本替代链上读写：
// 规则（谁能点什么、押金/赏金怎么流转、7 天超时放款）与 contracts/CampusLostFound.sol 一致，
// 但它是模拟数据，不是真实交易。本机 127.0.0.1 访问时本文件不生效，页面照常连真链。
(function () {
  const LIVE_HOSTS = ["127.0.0.1", "localhost", "", "[::1]"];
  const qs = new URLSearchParams(location.search);
  const wantDemo = qs.get("demo") === "1" || (qs.get("live") !== "1" && !LIVE_HOSTS.includes(location.hostname));
  if (!wantDemo || typeof ethers === "undefined") return;

  const LS = "lf_demo_ledger_v1";
  const DAY = 86400;
  const TIMEOUT = 7n * BigInt(DAY);
  const wei = (s) => ethers.parseEther(s);

  const ME = "0x9A3f1c8B7d5E2a4F6c8D0e1B3a5C7d9E1f3A5b7D";
  const DESK = "0x191b1fD217Dca4F9a9a02fBf7e8d92f8944aD2bA";
  const LI = "0x54ba56a048E18ae2BF4D6F473393731e18C4C764";
  const WANG = "0x9625836BC9C477151B312de304f5D4912D7A39cc";
  const ZHANG = "0xdb07f0f90543de9f369951326a4164b77aba9e7E";
  const CONTRACT = "0x" + "d3c".padEnd(40, "0");   // 一眼可辨的假合约地址，仅用于演示

  const now = () => Math.floor(Date.now() / 1000);

  function seed() {
    const t = now();
    return {
      found: [
        { id: 1, finder: DESK, category: "钱包/卡包", description: "黑色短款钱包，内有校园卡与一张公交卡，卡面姓名已打码", foundLocation: "第三食堂二楼靠窗座位", foundTime: t - 2 * 3600, contact: "微信 campus_desk", status: 0, claimant: "0x0000000000000000000000000000000000000000", deposit: 0n, returnMarkedAt: 0n },
        { id: 2, finder: LI, category: "电子产品", description: "AirPods Pro 白色，充电盒右下角有一道划痕", foundLocation: "图书馆 3 楼自习区 B 区", foundTime: t - 26 * 3600, contact: "138****2210", status: 0, claimant: "0x0000000000000000000000000000000000000000", deposit: 0n, returnMarkedAt: 0n },
        { id: 3, finder: WANG, category: "钥匙门禁卡", description: "一串钥匙，带灰色兔子挂饰，共 4 把钥匙和 1 张宿舍门禁卡", foundLocation: "北校区公交站", foundTime: t - 3 * DAY, contact: "QQ 100200300", status: 1, claimant: ME, deposit: wei("0.08"), returnMarkedAt: 0n },
        { id: 4, finder: ZHANG, category: "书籍教材", description: "《高等数学（下）》同济第七版，扉页写有“若禾”二字并有大量笔记", foundLocation: "2 号教学楼 305", foundTime: t - 5 * DAY, contact: "campus@iflow.cn", status: 2, claimant: ME, deposit: wei("0.12"), returnMarkedAt: BigInt(t - 2 * 3600) },
        { id: 5, finder: DESK, category: "水杯", description: "雾蓝色保温杯 500ml，杯底贴有卡通贴纸", foundLocation: "体育馆更衣室 3 号柜", foundTime: t - 9 * DAY, contact: "服务台代管，可预约领取", status: 3, claimant: LI, deposit: 0n, returnMarkedAt: BigInt(t - 6 * DAY) },
        { id: 6, finder: LI, category: "其他", description: "半把透明长柄伞，伞骨有一处轻微变形", foundLocation: "樱花大道长椅", foundTime: t - 12 * DAY, contact: "无需联系，已交服务台", status: 4, claimant: "0x0000000000000000000000000000000000000000", deposit: 0n, returnMarkedAt: 0n },
      ],
      bounties: [
        { id: 1, owner: ZHANG, category: "电子产品", description: "丢失银色 13 寸 MacBook，左下角贴着一枚校运会贴纸，内有毕业设计资料", lostLocation: "创新楼 5 楼研讨室", lostTime: t - 20 * 3600, contact: "139****8842", reward: wei("0.35"), status: 0, finder: "0x0000000000000000000000000000000000000000", returnMarkedAt: 0n, applicants: [LI], applied: { [LI]: true } },
        { id: 2, owner: WANG, category: "证件卡类", description: "黑色学生证，姓名李某某，学院为外国语学院，卡内有食堂饭卡", lostLocation: "第一教学楼至食堂途中", lostTime: t - 2 * DAY, contact: "137****5566", reward: wei("0.2"), status: 0, finder: "0x0000000000000000000000000000000000000000", returnMarkedAt: 0n, applicants: [LI, ZHANG], applied: { [LI]: true, [ZHANG]: true } },
        { id: 3, owner: LI, category: "服饰配饰", description: "浅灰色羊绒围巾，一端有流苏，内侧绣着字母 Y", lostLocation: "南区操场看台", lostTime: t - 4 * DAY, contact: "微信 y_scarf", reward: wei("0.1"), status: 1, finder: ME, returnMarkedAt: 0n, applicants: [ME, DESK], applied: { [ME]: true, [DESK]: true } },
        { id: 4, owner: ME, category: "电子产品", description: "白色 20000mAh 充电宝，侧面有划痕，数据线一并丢失", lostLocation: "实验楼 B1 机房", lostTime: t - 11 * DAY, contact: "135****0077", reward: wei("0.15"), status: 2, finder: DESK, returnMarkedAt: BigInt(t - 8 * DAY), applicants: [DESK], applied: { [DESK]: true } },
        { id: 5, owner: DESK, category: "其他", description: "深蓝折叠伞，伞柄缠了一圈黄色胶带", lostLocation: "图书馆门口伞架", lostTime: t - 15 * DAY, contact: "campus_desk@mail", reward: 0n, status: 3, finder: ZHANG, returnMarkedAt: BigInt(t - 13 * DAY), applicants: [ZHANG], applied: { [ZHANG]: true } },
      ],
      balances: { [ME]: wei("8"), [DESK]: wei("5"), [LI]: wei("5"), [ZHANG]: wei("5"), [WANG]: wei("5") },
      foundCount: 6,
      bountyCount: 5,
    };
  }

  let S = null;
  function load() {
    if (S) return S;
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        const j = JSON.parse(raw);
        // BigInt 在 JSON 里存成字符串，取回时要还原，否则金额比较会出错
        const fix = (o) => {
          for (const k of ["deposit", "returnMarkedAt"]) if (k in o) o[k] = BigInt(o[k]);
          for (const k of ["reward"]) if (k in o) o[k] = BigInt(o[k]);
          for (const k of ["id", "foundTime", "lostTime", "status"]) if (k in o) o[k] = Number(o[k]);
          return o;
        };
        j.found.forEach(fix); j.bounties.forEach(fix);
        for (const a in j.balances) j.balances[a] = BigInt(j.balances[a]);
        S = j;
        return S;
      }
    } catch (e) { /* 数据损坏则重建 */ }
    S = seed();
    save();
    return S;
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(S, (k, v) => (typeof v === "bigint" ? v.toString() : v))); } catch (e) {}
  }
  const bal = (a) => load().balances[a] ?? 0n;
  const move = (from, to, amount) => {
    load();
    if (amount > bal(from)) throw new Error("演示账本余额不足，请先点右上角地址旁的提示了解规则");
    S.balances[from] = bal(from) - amount;
    S.balances[to] = bal(to) + amount;
    save();
  };
  const burn = (from, amount) => move(from, CONTRACT, amount);
  const mint = (to, amount) => { load(); S.balances[to] = bal(to) + amount; save(); };

  const found = (id) => { const it = load().found.find(x => x.id === Number(id)); if (!it) throw new Error("该登记不存在"); return it; };
  const bounty = (id) => { const b = load().bounties.find(x => x.id === Number(id)); if (!b) throw new Error("该悬赏不存在"); return b; };
  const tx = () => ({ hash: "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""), nonce: 0 });

  // ==================== 模拟节点 ====================
  const fakeProvider = {
    async getNetwork() { return { chainId: 80002n, name: "campus-demo" }; },
    async getCode() { return "0x6080604052"; },
    async getBalance(a) { return bal(a); },
    async getTransactionCount() { return 0n; },
    async getBlock() { return { timestamp: now() }; },
    async estimateGas() { return 120000n; },
    async send(method) {
      if (method === "eth_gasPrice") return "0x3b9aca00";
      if (method === "eth_accounts") return [ME];
      throw new Error("演示站不支持该方法：" + method);
    },
    async waitForTransaction() { await new Promise(r => setTimeout(r, 520)); return { status: 1 }; },
  };

  // ==================== 模拟只读接口 ====================
  const fakeView = {
    async foundCount() { return BigInt(load().found.length); },
    async bountyCount() { return BigInt(load().bounties.length); },
    async CONFIRM_TIMEOUT() { return TIMEOUT; },
    async getFoundItem(id) { return found(id); },
    async getBounty(id) { return bounty(id); },
    async getBountyApplicants(id) { return bounty(id).applicants.slice(); },
    async hasApplied(id, who) { return !!bounty(id).applied[who.toLowerCase()] || !!bounty(id).applied[who]; },
  };

  // ==================== 模拟写接口（规则与智能合约一致） ====================
  const ZERO = "0x0000000000000000000000000000000000000000";
  // 页面调用写方法时可能带一个 { value } 覆盖参数，这里统一拆出来
  function write(fn) {
    return (...args) => {
      toast("模拟签名并写入演示账本…", "info");
      const last = args[args.length - 1];
      const overrides = last && typeof last === "object" && "value" in last ? last : null;
      if (overrides) args = args.slice(0, -1);
      load();
      fn(args, overrides ? BigInt(overrides.value ?? 0) : 0n);
      save();
      return Promise.resolve(tx());
    };
  }
  const fakeContract = {
    registerFoundItem: write((a) => {
      const [category, description, foundLocation, foundTime, contact] = a;
      if (!String(category).trim()) throw new Error("演示合约回滚：请选择物品分类");
      if (Number(foundTime) > now()) throw new Error("演示合约回滚：拾获时间不能晚于现在");
      const it = { id: ++S.foundCount, finder: account, category, description, foundLocation, foundTime: Number(foundTime), contact, status: 0, claimant: ZERO, deposit: 0n, returnMarkedAt: 0n };
      S.found.push(it);
      return tx();
    }),
    claimFoundItem: write((a, ov) => {
      const it = found(a[0]);
      if (it.status !== 0) throw new Error("演示合约回滚：该物品已被认领或已关闭");
      if (it.finder.toLowerCase() === account.toLowerCase()) throw new Error("演示合约回滚：拾获人不能认领自己登记的物品");
      if (!(ov > 0n)) throw new Error("演示合约回滚：请先填写答谢押金金额");
      burn(account, ov);
      it.status = 1; it.claimant = account; it.deposit = ov;
      return tx();
    }),
    cancelClaim: write((a) => {
      const it = found(a[0]);
      if (it.status !== 1) throw new Error("演示合约回滚：当前状态无法取消认领");
      if (it.claimant.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有认领人可以取消");
      mint(account, it.deposit);
      it.status = 0; it.claimant = ZERO; it.deposit = 0n;
      return tx();
    }),
    markFoundReturned: write((a) => {
      const it = found(a[0]);
      if (it.status !== 1) throw new Error("演示合约回滚：只有已匹配状态可以标记归还");
      if (it.finder.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有拾获人可以标记归还");
      it.status = 2; it.returnMarkedAt = BigInt(now());
      return tx();
    }),
    confirmFoundReceived: write((a) => {
      const it = found(a[0]);
      if (it.status !== 2) throw new Error("演示合约回滚：等待拾获人先标记归还");
      if (it.claimant.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有认领人可以确认收货");
      mint(it.finder, it.deposit); it.deposit = 0n; it.status = 3;
      return tx();
    }),
    timeoutReleaseFound: write((a) => {
      const it = found(a[0]);
      if (it.status !== 2) throw new Error("演示合约回滚：当前状态无法触发超时放款");
      if (BigInt(now()) < it.returnMarkedAt + TIMEOUT) throw new Error("演示合约回滚：7 天确认期尚未结束");
      mint(it.finder, it.deposit); it.deposit = 0n; it.status = 3;
      return tx();
    }),
    closeFoundItem: write((a) => {
      const it = found(a[0]);
      if (it.status !== 0) throw new Error("演示合约回滚：已被认领的登记不能撤销");
      if (it.finder.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有登记人可以撤销");
      it.status = 4;
      return tx();
    }),
    postBounty: write((a, ov) => {
      const [category, description, lostLocation, lostTime, contact] = a;
      if (!(ov > 0n)) throw new Error("演示合约回滚：悬赏金必须大于 0");
      if (!String(category).trim()) throw new Error("演示合约回滚：请选择物品分类");
      const b = { id: ++S.bountyCount, owner: account, category, description, lostLocation, lostTime: Number(lostTime), contact, reward: ov, status: 0, finder: ZERO, returnMarkedAt: 0n, applicants: [], applied: {} };
      burn(account, ov); S.bounties.push(b);
      return tx();
    }),
    applyForBounty: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 0) throw new Error("演示合约回滚：该悬赏已不在待匹配状态");
      if (b.owner.toLowerCase() === account.toLowerCase()) throw new Error("演示合约回滚：失主不能报名自己的悬赏");
      if (b.applied[account.toLowerCase()]) throw new Error("演示合约回滚：你已经报名过这条悬赏了");
      b.applied[account.toLowerCase()] = true; b.applicants.push(account);
      return tx();
    }),
    confirmFinder: write((a) => {
      const [id, finder] = a;
      const b = bounty(id);
      if (b.status !== 0) throw new Error("演示合约回滚：该悬赏已不在待匹配状态");
      if (b.owner.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有失主可以确认拾获人");
      if (!b.applied[String(finder).toLowerCase()]) throw new Error("演示合约回滚：该地址并未报名这条悬赏");
      b.status = 1; b.finder = finder;
      return tx();
    }),
    unmatchBounty: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 1) throw new Error("演示合约回滚：当前不是已匹配状态");
      if (b.owner.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有失主可以取消匹配");
      b.status = 0; b.finder = ZERO;
      return tx();
    }),
    markBountyReturned: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 1) throw new Error("演示合约回滚：只有已匹配的悬赏可以标记归还");
      if (b.finder.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有被确认的拾获人可以标记归还");
      b.status = 2; b.returnMarkedAt = BigInt(now());
      return tx();
    }),
    confirmBountyReceived: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 2) throw new Error("演示合约回滚：等待拾获人先标记归还");
      if (b.owner.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有失主可以确认收货放款");
      mint(b.finder, b.reward); b.reward = 0n; b.status = 3;
      return tx();
    }),
    timeoutReleaseBounty: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 2) throw new Error("演示合约回滚：当前状态无法触发超时放款");
      if (BigInt(now()) < b.returnMarkedAt + TIMEOUT) throw new Error("演示合约回滚：7 天确认期尚未结束");
      mint(b.finder, b.reward); b.reward = 0n; b.status = 3;
      return tx();
    }),
    cancelBounty: write((a) => {
      const b = bounty(a[0]);
      if (b.status !== 0) throw new Error("演示合约回滚：已有人匹配的悬赏不能直接撤销");
      if (b.owner.toLowerCase() !== account.toLowerCase()) throw new Error("演示合约回滚：只有失主可以撤销悬赏");
      mint(b.owner, b.reward); b.reward = 0n; b.status = 4;
      return tx();
    }),
  };

  // ==================== 接管页面 ====================
  function banner() {
    if (document.getElementById("demoBanner")) return;
    const box = document.querySelector("#appView .container");
    if (!box) return;
    const d = document.createElement("div");
    d.id = "demoBanner";
    d.style.cssText = "margin:0 0 16px;padding:13px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,138,92,.12),rgba(255,178,107,.12));border:1px dashed #f0c9a4;font-size:12.5px;line-height:1.75;color:#8a5a35";
    d.innerHTML = `<b>🔸 演示模式</b>　本页数据是浏览器内置的模拟账本，规则与智能合约一致，但<b>不是真实上链交易</b>，也不会产生任何代币流转。
      你现在登录的身份是 <code style="background:#fff;padding:1px 6px;border-radius:6px">${ME.slice(0, 10)}…${ME.slice(-6)}</code>，余额 8 ETH；列表里别人名下的条目只能看不能操作，换成“我登记的 / 我认领的 / 我发布的”条目即可走完放款流程。
      <a href="#" style="color:#c26a3d;font-weight:700;margin-left:6px" onclick="demoReset();return false">↺ 重置演示数据</a>`;
    box.insertBefore(d, box.firstChild);
  }

  window.demoReset = function () {
    localStorage.removeItem(LS);
    S = null;
    load();
    refreshAll();
    toast("演示数据已恢复到初始样例", "ok");
  };

  // 演示站不该暴露"连到本机 RPC"这类操作
  saveSettings = async function () { toast("演示站的节点与合约地址已固定，无需设置", "info"); };
  logout = async function () { toast("演示站不需要退出，数据只保存在你自己的浏览器里", "info"); };
  faucet = async function () { toast("演示余额固定，无需领取测试币", "info"); };
  exportMnemonic = async function () { toast("演示钱包没有真实私钥，无法导出", "info"); };

  async function boot() {
    provider = fakeProvider;
    wallet = null;
    walletMode = "demo";
    account = ME;
    contractAddr = CONTRACT;
    chainIdNum = 80002;
    nonceCache = null;
    view = fakeView;
    contract = fakeContract;

    document.getElementById("authView").style.display = "none";
    document.getElementById("appView").style.display = "block";
    document.getElementById("addrText").textContent = "🔸 " + account.slice(0, 8) + "…" + account.slice(-6);
    document.getElementById("netBadge").textContent = "演示网";
    document.getElementById("faucetBox").style.display = "none";
    document.getElementById("wpModeDesc").innerHTML = "当前模式：<b>🔸 演示账本</b>。所有读写都在你的浏览器内完成，规则复刻智能合约，关闭页面后仍保留，可随时重置。";
    document.getElementById("wpExportArea").style.display = "none";
    document.getElementById("wpMnArea").style.display = "none";
    banner();
    await refreshAll();
    toast("演示站已就绪：内置样例数据，可直接体验完整流程", "ok");
  }

  // 页面的 load 监听先注册，这里排在其后，确保覆盖生效
  window.addEventListener("load", () => { boot().catch(e => console.error("demo boot failed", e)); });
})();
