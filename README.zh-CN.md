# 判断实验室 — Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

基于《Judgment under Uncertainty: Heuristics and Biases》（Kahneman、Slovic、Tversky 主编，1982）的课堂实验应用，由教师控制开始。支持日语、简体中文、英语，首次默认为日语。使用Node.js与本地SQLite，不使用Vercel或Neon。

已逐项核查21项，目前可实施14项，明确区分已刊材料子集、同章谈话先导研究和原方法重建。其余7项缺少核心刺激或现场条件。先前暂缓的14项逐项恢复结果、缺少材料及条件见[恢复清单](docs/restoration-status.md)。这不是全书全部实验的复刻。已去除英语字母频率题，锚定类保留五秒乘积估计。

## 本地运行

需要Node.js 24.15.0或以上，无第三方npm依赖。在仓库目录运行：

~~~sh
npm start
~~~

## 课堂流程

- 学生打开 http://127.0.0.1:3000/ ，输入7位学生证号后等待。保留前导0。

- 教师打开 http://127.0.0.1:3000/admin ，按实验block选择任务，分别设置实验顺序和选择题按钮位置是否随机，点击开始。

- 等待中的学生约1秒内进入实验，连续完成所选任务。迟到登录者也进入当前实施。完成后可回到等待页。教师结束当前实施后可以开始下一次。

- 实验顺序按学生独立随机；关闭时按章节顺序。选项随机只改变选择按钮位置，不打乱排名量尺的数值顺序、乘法升降序条件或任务内部阶段。原研究的组内条件分配单独保留。

- 刷新不改变分组、顺序和已存回答。切换语言保留当前输入；普通未提交输入刷新会丢失。结果未确认的提交使用同一提交ID重试。

- 学生界面只呈现题目和必要操作。没有统一接触经历题、额外信心评分或技术说明。教师可导出CSV／JSON。

## 可实施的任务

| ID | 实验 | 原设计（简短） | 屏幕化等改动 | 出处 |
| --- | --- | --- | --- | --- |
| 01-02 | 合取／析取事件：下注选择 | 将单次抽出红球，分别与七次全部抽到红球、七次至少一次抽到红球比较，选择愿意下注的事件。 | 恢复书中两对比较，删除额外第三对、胜率判断和擅加的同额奖金。每人回答两题及固定题序是明确记录的实现选择。 | [BH73](https://doi.org/10.1016/0030-5073(73)90061-5) · [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 03-01 | 大医院与小医院 | 日均45／15名新生儿的两所医院，判断一年中男婴超过60%的天数哪所更多，三选一。 | 三语采用超过60%的原题，恢复每日比例波动和“差在5%以内”选项，改为屏幕独立作答。 | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 03-02 | 随机序列的局部代表性 | 已知六孩家庭出生顺序GBGBBG有72户，估计BGBBBB有多少户；G女、B男。 | 删除硬币三选一，恢复原家庭数量估计；不加独立、等概率前提，不将72设为上限。三语屏幕输入。 | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 04-01 | 工程师／律师概率估计 | 在两种基准率下，判断Jack、Dick及无人物描述者是工程师／律师的概率。 | 恢复基准率两条件×提问职业两条件及0～100概率。只采用已刊两个人物和无描述题；不冒称恢复原五人物及专家奖金程序。 | [KT73](https://doi.org/10.1037/h0034747) |
| 06-01 | Linda：合取判断 | 阅读Linda原人物描述，将八项职业／活动按可能性排1至8名，采用组内概率排序版本。 | 恢复完整八目标与1–8排序，不缩成三目标、不加外貌条件。三语数字排序；未包含Bill及其他分组版本。 | [TK82R](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB) |
| 08-01 | 因果方向与诊断方向：眼色／身高 | 母女蓝眼条件概率三选一；另一题在高中毕业年级男生调查情境下，比较由父预测子与由子预测父身高的信心，三选一。 | 删除180厘米、虚构群体、相同边际比例和额外0–100信心评分；三语恢复两种不同测量，不将身高选项判作数学正误。 | [TK80](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download) |
| 09-07 | 虚假共识：假想携牌情境 | 在携带餐馆广告牌或宗教劝诫牌的假想情境中，估计他人同意率，作出自己的选择，并评定自己、同意者和拒绝者的八项特质。 | 采用1977年Study 3。恢复合计100的两个比例及三对象×八特质的−50～+50量尺。题面为保留事实的转述和翻译；对象块序独立随机，不声称完成原人数配额平衡。 | [RGH77](https://doi.org/10.1016/0022-1031(77)90049-X) |
| 11-06 | 五秒乘法外推：升序／降序乘积估计 | 将高中生分为两组，在5秒内估计1×2×…×8或8×7×…×1的乘积；每人只看其中一个算式。 | 黑板改为屏幕。准备页后计时5秒，截止时锁定已输入的估计，未输入记为null；刷新或离开页面记为中断。新增键盘输入、设备与语言差异。 删除原文未给出的计算工具禁令。 | [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 12-01 | 谈话中的自己与对方贡献 | 同一次谈话的两位参与者，独立估计自己和对方发言时间的比例，再比较两人的估计。 | 选用同章26人的谈话先导研究，与夫妻家务主实验区分。两个估计不强制合计100，删除额外回忆、信心及七天条件。学号只用于同一次实施内的互指配对。 | [RS79](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf) |
| 14-01 | 心理撤销：改变过去事件的反事实 | 组间呈现Jones致命车祸的路线版／时间版，填写一个或多个“要是……”续句，研究者编码第一条。 | 面试故事恢复为原车祸故事，删除仅一条限制、事件编号和理由题。三语自由文本留待人工编码。 | [KT82S](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE) |
| 23-01 | 结局信息与历史判断 | 阅读廓尔喀战争的十二条事实，评估四种结局的概率和各事实的相关性，比较无结局信息组与四种结局信息组。 | 限定1975年实验1事件A，恢复四概率合计100及十二项七点评定。英语也是忠实转述，不是原纸问卷逐字复制；没有补造相关性量尺的端点词。 | [F75](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf) |
| 25-01 | 两袋后验概率（章节例题） | 两袋各1000片，红片分别700／300；公平硬币选袋，放回抽12次得8红4蓝，估计选中700红袋的概率一次。这是章节例题。 | 删除自编10次序贯更新，恢复原例题一批样本、一次概率回答，可填小数。三语屏幕作答，不冒充原研究全套实验。 保留原文0–1概率表述及0.5提示。 | [ED68](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf) |
| 26-01 | 袋—罐的多阶段推断 | 根据袋、罐、圆片的组成表，利用观察到的颜色估计袋I与II的赔率；三条件、四色重复两轮，共24次判断。 | 恢复原矩阵、24题及赔率，以两个数的比输入并保留无穷值。原4～6人小组共用顺序改为个人持久化顺序；当前学生不具备原参与者约两小时同类先行经验。 | [GKP73](https://deepblue.lib.umich.edu/handle/2027.42/33759) |
| 33-03 | 风险、收益与危险特征（30项） | 对30种活动和技术的风险或收益排序，以最低项10作比率评分；随后对全部项目评估可接受风险及九个七点量尺。 | 用1978年研究及Fox-Glassman、Weber的2016年复现补核，撤掉十项短版。允许并列、比率评分不设100上限；五区块循环顺序独立分配，明确翻译和当代课堂样本差异。 | [FSLRC78](https://doi.org/10.1007/BF00143739) · [FGW16](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf) · [SFL82](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8) |

## 实施版本与条件

实验界面的卡片只显示可实施任务的名称和简短介绍。实施条件、版本说明、与原书的对应及待补实验集中保留在本README。

| ID | 版本范围 | 实施条件 | 完整研究仍缺的材料 |
| --- | --- | --- | --- |
| 01-02 | 书中两对比较 | 实施假想偏好判断，不执行真实下注。 | 完整研究的题册、激励办法和分配表未取得。 |
| 04-01 | Jack、Dick及无描述的已刊子集 | 每位学生回答三题，基准率和提问职业在三题中保持一致。 | 另外三份原人物描述，以及与专家判断比较的奖金办法。 |
| 09-07 | 原论文Study 3 | 仅是假想情境，不要求真实举牌，也不承诺给予学分。 | 未取得原纸问卷版面和确切的顺序分配表；主要情境、特质和量尺已确认。 |
| 12-01 | 同章谈话先导研究 | 两人必须实际参加过同一次谈话并独立作答；不另加固定话题或时长，双方互填对方学号。 | 所选先导版本的主要材料已齐；夫妻版20项活动也已取得，但属于另一程序。 |
| 23-01 | 原论文实验1、事件A | 每人只见一个条件；部分指定结局并非真实历史，结束后统一说明。 | 未取得1975年整份问卷版面；十二事实、结局及测量范围已由原论文补核。 |
| 26-01 | 原书三矩阵、24题 | 参与者需要理解赔率表达；界面仅说明比值含义，不新增数值范例或答案教学。 | 主要矩阵和条件已齐；原先行练习所用题目及个体分配表未取得。 |
| 33-03 | 30项原方法重建 | 需要较长实验时段，2016年完整版本平均约90分钟；不擅自将活动替换为日本情境。 | 未取得1978年纸问卷逐字影印；30项目、九量尺及全部阶段已由原研究和2016年复现确认。 |

## 尚未恢复的任务

| ID | 实验 | 原设计（简短） | 尚未恢复的原因 | 出处 |
| --- | --- | --- | --- | --- |
| 04-07 | 实习教师的一课表现与五年后能力 | 7段实习课描述；评价当课、预测五年后能力或同时两项。 | PDF72–73页只有方法，没有七段刺激。第70页的新生章内例题已提取，可另做例题，但目标和测量不同，不冒充教师研究恢复。 七段原实习课描述全部未刊；精确问卷及评价／预测的呈现顺序也未刊。 以100名小学教师为参照做百分位判断，区分评价五年前课程、预测现在能力及两者兼做的三组。 | [KT73](https://doi.org/10.1037/h0034747) |
| 09-03 | 虚假成功／失败反馈后的信念持续 | 判断真假遗书后给虚假能力反馈，再明确撤销反馈依据，测自我与他人评价。 | PDF163–167页的消防员变体也没刊完整案例，不能用六道符号分类题代替原刺激。 25对真假遗书、所选版本的逐试次虚假反馈安排及完整后测问句。 需要撤销虚假反馈并在结束后说明，不将虚假成绩当作能力诊断。 | [RLH75](https://doi.org/10.1037/0022-3514.32.5.880) |
| 09-05 | 支持／反对死刑者对混合证据的评价 | 原有立场不同者看一正一反两份研究，分阶段评价研究与自身态度变化。 | PDF161–162页仅为概要。原论文短结果卡已取得，能做明确标注的首阶段反应，但尚不支持当前条目的完整混合证据／态度极化程序。 完整研究报告、方法批评与回应，以及刺激表格和图。 需记录事先的死刑态度、两方向证据及评价顺序。 | [LRL79](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf) |
| 13-01 | 观察视角与谈话者因果影响 | 让观察者从不同座位/视角看两人谈话，再评估双方影响。 | PDF155–156、212–213页的综述不足以恢复脚本；放大SVG人物并新增0～100影响题属于另一设计。 受控谈话的完整脚本或影像、各视角观看程序，以及原归因问卷。 需要保持谈话内容相同，仅操作观察视角的现场或等效影像安排。 | [TF75](https://doi.org/10.1037/h0077095) |
| 16-02 | 彩票选择权与转售要价 | 1美元购买实物橄榄球卡彩票，自选／配对分配两组，之后询问转售价格。 | PDF256–257页的程序及三语询价已恢复；欠缺的是现场材料、真实所有权和购买条件，不用假想100日元题冒充。 两套各227张球星卡，以及匹配分配记录。 需真实1美元购买、约50美元奖池，无选择者匹配前位选择者的卡，以及开奖前的要价和初始拒卖记录。 | [L75](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf) |
| 17-01 | 画人测验：症状—画面特征错觉相关 | 展示受控配对的画作与症状，之后评估两者关系。 | PDF261–264页可恢复六症状、张数和时间；核心45图缺失，不能用三种SVG或另一研究的词语联想量尺替代。 45张原人物画、逐图症状配对表和完整后测。 每图两个症状，15对组合各出现三次，每图30秒；不作临床诊断。 | [CC67](https://pubmed.ncbi.nlm.nih.gov/4859731/) |
| 20-01 | 病例信息递增与诊断信心 | 32名判断者按四阶段获得病例信息，反复判断并报信心。 | PDF308–311页的第一阶段和五道示例已取得，但仅做首阶段示例不能实施信息递增的核心操纵。 第2～4阶段完整病例资料，25题中未刊的20题、选项及事实答案。 四阶段重复同25题，每题五选一，逐题收20～100%信心。 | [O65](https://doi.org/10.1037/h0022125) |

## 与原设计的对应

- 身高题恢复为“由父预测子／由子预测父身高的信心”三选一，与眼色条件概率题区分。删除180厘米、相同边际比例和额外0–100评分。

- 已恢复Linda八目标排序、六孩家庭数量估计、Jones车祸路线／时间版本。两袋任务是第25章例题，只填写一次0–1概率，保留原文0.5提示；不称为整套原研究复现。

- 11-06准备后只呈现一种算式5秒，截止时保存此前的有效输入；空白或无效输入记null。中断、刷新、隐藏页面也记null，不再次呈现算式。黑板改为屏幕与键盘输入。

- 此次新增七项：两对假想下注、Jack／Dick／无描述、虚假共识Study 3、谈话先导研究、Gurka实验1、袋—罐24次赔率判断、30项风险研究。全选14项共86个准备／作答页面。

- 谈话题要求两人实际参加同一次谈话并独立回答，两个估计不强制合计100。仅同一实施中互指对方学号的记录进入conversationPairs，输出“自己对自己的估计−对方对自己的估计”及两人差值均值，不判定客观发言时间的正误。

- 风险题由原研究和2016年复现补核，含30项目及全部阶段。最低项固定为10，允许并列和小数，比率评分不设100上限，保持九量尺顺序和方向。请安排长时段：2016年完整版本平均约90分钟。

- 翻译、屏幕作答、连续实验、教师随机设置均是相对原研究的改变。尚未检验三语回译、跨语言等价性或心理效应复现。每项只选择明确版本，不包括该章全部条件与研究。

- 详见[设计核查](docs/design-audit.md)、[前段](docs/audit-early.md)、[中段](docs/audit-middle.md)、[后段](docs/audit-late.md)。用户PDF页码指598页重排版的文件页面序号，从1计数，不是纸书印刷页码。

## 数据与验证

- data/local.sqlite保存学生证号、教师设置、实施ID、随机种子、学生题序、各题协议与版本、回答和计时。同一学生证号参加下一次实施会另存记录。学生证号登录用于身份标记，不校验本人身份。

- JSON schemaVersion=5含lessons、runs、sessions及完整题面与翻译快照。CSV每个回答字段一行，包含实施ID、教师设置、实验顺序、选项顺序、语言、题面摘要和计时。自由文本由研究者编码。

- 保留旧版回答与协议，新版以teacher-1区分，不把历史错误刺激改写成新刺激。已分配但未呈现的任务仍出现在JSON中，回答数为0。

- 测试请另设DATA_DIR。data/、环境文件、日志不进入Git。停服后复制整个data可备份。.env不会自动加载，需要时使用node --env-file=.env server/index.mjs。PORT默认3000。

- 服务器目前只绑定127.0.0.1，可在同一PC打开教师和学生页验证。尚未开放其他学生电脑接入、教师身份认证、招募、报酬或公开部署。

- npm test验证原题量尺、输入约束、三语、教师启停、等待续做、提交重试、随机顺序保持、导出及旧记录保留。npm run check检查语法、元数据与README同步。测试数据与真实回答分离。

界面采用与PRP相同的字体设置。日语内置Noto Sans JP Variable（@fontsource-variable/noto-sans-jp 5.3.0）；其他语言依次使用PingFang SC、Microsoft YaHei、Helvetica Neue、Arial。[字体许可](public/fonts/noto-sans-jp/LICENSE)。

~~~sh
npm test
npm run check
npm run docs
~~~

## 主要文件

| File | — |
| --- | --- |
| content/catalog.json | 21项的原设计、出处、核查与开放状态 |
| server/restored.mjs / public/revised-messages.js | 已恢复题型与三语题面 |
| server/expanded.mjs / public/expanded-messages.js | 新增七项程序与三语刺激 |
| server/classroom.mjs | 教师设置、学生等待、持久化随机分配 |
| server/store.mjs / server/runs.mjs | SQLite、回答保存导出及旧流程兼容 |
| public/app.js / public/admin.js | 学生与教师界面 |
| tests/classroom.test.mjs | 教师控制与复原内容回归测试 |

## 原始出处

使用用户提供的原书PDF和原始论文核对；不将PDF本身加入仓库。恢复范围限于明确选定的题型版本。

- **TK74** — Tversky & Kahneman (1974). Judgment under Uncertainty: Heuristics and Biases. Science, 185, 1124–1131. [Source](https://doi.org/10.1126/science.185.4157.1124)

- **KT72** — Kahneman & Tversky (1972). Subjective probability: A judgment of representativeness. Cognitive Psychology, 3, 430–454. [Source](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf)

- **KT73** — Kahneman & Tversky (1973). On the psychology of prediction. Psychological Review, 80, 237–251. [Source](https://doi.org/10.1037/h0034747)

- **TK82R** — Tversky, A., & Kahneman, D. (1982). Judgments of and by representativeness. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 84–98). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB)

- **TK80** — Tversky & Kahneman (1980). Causal schemas in judgments under uncertainty. In Fishbein (Ed.), Progress in Social Psychology, Vol. 1, 49–72. [Source](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download)

- **RLH75** — Ross, L., Lepper, M. R., & Hubbard, M. (1975). Perseverance in self-perception and social perception: Biased attributional processes in the debriefing paradigm. Journal of Personality and Social Psychology, 32(5), 880–892. [Source](https://doi.org/10.1037/0022-3514.32.5.880)

- **LRL79** — Lord, Ross & Lepper (1979). Biased assimilation and attitude polarization: The effects of prior theories on subsequently considered evidence. Journal of Personality and Social Psychology, 37, 2098–2109. [Source](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf)

- **RGH77** — Ross, L., Greene, D., & House, P. (1977). The “false consensus effect”: An egocentric bias in social perception and attribution processes. Journal of Experimental Social Psychology, 13(3), 279–301. [Source](https://doi.org/10.1016/0022-1031(77)90049-X)

- **TK73A** — Tversky & Kahneman (1973). Availability: A heuristic for judging frequency and probability. Cognitive Psychology, 5, 207–232. [Source](https://noorsiddiqui.com/papers/TverskyKahneman.pdf)

- **RS79** — Ross & Sicoly (1979). Egocentric biases in availability and attribution. Journal of Personality and Social Psychology, 37, 322–336. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf)

- **TF75** — Taylor, S. E., & Fiske, S. T. (1975). Point of view and perceptions of causality. Journal of Personality and Social Psychology, 32(3), 439–445. [Source](https://doi.org/10.1037/h0077095)

- **KT82S** — Kahneman, D., & Tversky, A. (1982). The simulation heuristic. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 201–208). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE)

- **L75** — Langer (1975). The illusion of control. Journal of Personality and Social Psychology, 32, 311–328. [Source](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf)

- **CC67** — Chapman & Chapman (1967). Genesis of popular but erroneous psychodiagnostic observations. Journal of Abnormal Psychology, 72, 193–204. [Source](https://pubmed.ncbi.nlm.nih.gov/4859731/)

- **O65** — Oskamp (1965). Overconfidence in case-study judgments. Journal of Consulting Psychology, 29, 261–265. [Source](https://doi.org/10.1037/h0022125)

- **F75** — Fischhoff (1975). Hindsight ≠ foresight: The effect of outcome knowledge on judgment under uncertainty. Journal of Experimental Psychology: Human Perception and Performance, 1, 288–299. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf)

- **ED68** — Edwards (1968). Conservatism in human information processing. In Formal Representation of Human Judgment, 17–52. [Source](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf)

- **GKP73** — Gettys, Kelly & Peterson (1973). The best guess hypothesis in multistage inference. Organizational Behavior and Human Performance, 10, 364–373. [Source](https://deepblue.lib.umich.edu/handle/2027.42/33759)

- **SFL82** — Slovic, P., Fischhoff, B., & Lichtenstein, S. (1982). Facts versus fears: Understanding perceived risk. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 463–490). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8)

- **BH73** — Bar-Hillel, M. (1973). On the subjective probability of compound events. Organizational Behavior and Human Performance, 9(3), 396–406. [Source](https://doi.org/10.1016/0030-5073(73)90061-5)

- **FSLRC78** — Fischhoff, B., Slovic, P., Lichtenstein, S., Read, S., & Combs, B. (1978). How safe is safe enough? A psychometric study of attitudes towards technological risks and benefits. Policy Sciences, 9, 127–152. [Source](https://doi.org/10.1007/BF00143739)

- **FGW16** — Fox-Glassman, K. T., & Weber, E. U. (2016). What makes risk acceptable? Revisiting the 1978 psychological dimensions of perceptions of technological risks. Journal of Mathematical Psychology, 75, 157–169. [Source](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf)

[选材Google表格](https://docs.google.com/spreadsheets/d/1E6j0l_dqVMttijLAn5mud7CvreEPOiTsKCHZV-zfaYI/edit)
