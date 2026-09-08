/*
 * 求职看板设计用虚构样例。所有公司、岗位、薪资和经历均为虚构，
 * 不代表真实招聘信息。链接统一使用 example.com。
 * 展示基准：2026-09-08，Asia/Shanghai（+08:00）。
 * 共 33 条：未归档 30 条（投递 10 / 测评 7 / 面试 8 / 结果 5），归档 3 条。
 * date 为空时 dateType 为 none；仅日期的 deadline 在日期结束后才算逾期。
 * 已过 appointment 但尚待完成的事项应显示“待更新”，不应标成逾期或缺席。
 */
window.JOB_DATA = [
  {
    "id": "JOB-001", "company": "星汀科技", "initials": "星汀", "role": "产品经理实习生", "city": "上海",
    "stage": "application", "status": "待投递", "round": "", "action": "提交产品岗位申请",
    "date": "2026-09-08", "dateType": "deadline", "appliedAt": "", "source": "校园招聘",
    "salary": "200–250 元/天", "url": "https://example.com/jobs/job-001",
    "notes": "【虚构示例】申请今日截止，已准备针对用户研究经历的简历版本。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-002", "company": "谷序数据", "initials": "谷序", "role": "数据分析实习生", "city": "杭州",
    "stage": "application", "status": "已投递", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-09-03", "source": "公司官网",
    "salary": "180–250 元/天", "url": "https://example.com/jobs/job-002",
    "notes": "【虚构示例】已提交简历与数据分析项目说明，等待简历筛选反馈。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-003", "company": "苔光设计", "initials": "苔光", "role": "体验设计实习生", "city": "深圳",
    "stage": "application", "status": "待投递", "round": "", "action": "完善并提交作品集",
    "date": "2026-09-10", "dateType": "deadline", "appliedAt": "", "source": "招聘平台",
    "salary": "200–300 元/天", "url": "https://example.com/jobs/job-003",
    "notes": "【虚构示例】补充看板项目的设计推导与可用性测试部分后提交。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-004", "company": "栖岚互动", "initials": "栖岚", "role": "前端开发工程师", "city": "北京",
    "stage": "application", "status": "已投递", "round": "", "action": "跟进申请进度",
    "date": "", "dateType": "none", "appliedAt": "2026-08-26", "source": "校友内推",
    "salary": "16–22K·14 薪", "url": "https://example.com/jobs/job-004",
    "notes": "【虚构示例】内推申请尚未收到新消息，计划向内推人了解筛选进度。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-005", "company": "弧原科技", "initials": "弧原", "role": "商业分析实习生", "city": "上海",
    "stage": "application", "status": "待投递", "round": "", "action": "调整岗位简历",
    "date": "", "dateType": "none", "appliedAt": "", "source": "校园招聘",
    "salary": "200 元/天", "url": "https://example.com/jobs/job-005",
    "notes": "【虚构示例】先记录感兴趣的岗位，突出竞品分析与指标拆解经历，尚未约定提交日期。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-006", "company": "微屿智能", "initials": "微屿", "role": "算法工程师实习生", "city": "杭州",
    "stage": "application", "status": "已投递", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-09-07", "source": "公司官网",
    "salary": "250–350 元/天", "url": "https://example.com/jobs/job-006",
    "notes": "【虚构示例】已完成官网申请，提交了模型评估项目，等待后续通知。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-007", "company": "松禾研究", "initials": "松禾", "role": "用户研究实习生", "city": "广州",
    "stage": "application", "status": "待投递", "round": "", "action": "提交研究岗位申请",
    "date": "2026-09-12", "dateType": "deadline", "appliedAt": "", "source": "招聘平台",
    "salary": "180–220 元/天", "url": "https://example.com/jobs/job-007",
    "notes": "【虚构示例】申请材料需要附一份访谈提纲及研究结论，本周六截止。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-008", "company": "晴砾科技", "initials": "晴砾", "role": "后端开发工程师", "city": "成都",
    "stage": "application", "status": "已投递", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-20", "source": "公司官网",
    "salary": "14–20K·13 薪", "url": "https://example.com/jobs/job-008",
    "notes": "【虚构示例】已等待较长时间，尚无明确结果，继续留意招聘方消息。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-009", "company": "云沐软件", "initials": "云沐", "role": "软件测试实习生", "city": "南京",
    "stage": "application", "status": "待投递", "round": "", "action": "补充项目材料并投递",
    "date": "2026-09-10", "dateType": "deadline", "appliedAt": "", "source": "校园招聘",
    "salary": "160–220 元/天", "url": "https://example.com/jobs/job-009",
    "notes": "【虚构示例】申请需要项目测试报告，补充完成后在报名期限内提交。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-010", "company": "竹影数字", "initials": "竹影", "role": "增长运营实习生", "city": "深圳",
    "stage": "application", "status": "已投递", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-09-01", "source": "朋友内推",
    "salary": "180–250 元/天", "url": "https://example.com/jobs/job-010",
    "notes": "【虚构示例】已经投递增长方向岗位，等待招聘方确认筛选结果。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-011", "company": "黎川科技", "initials": "黎川", "role": "产品分析实习生", "city": "上海",
    "stage": "assessment", "status": "待完成", "round": "第 1 轮", "action": "完成在线测评",
    "date": "2026-09-07", "dateType": "deadline", "appliedAt": "2026-08-29", "source": "校园招聘",
    "salary": "200–250 元/天", "url": "https://example.com/jobs/job-011",
    "notes": "【虚构示例】测评截止日期已过，尚未完成，待确认是否还能补交。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-012", "company": "澄星数据", "initials": "澄星", "role": "数据科学实习生", "city": "北京",
    "stage": "assessment", "status": "待完成", "round": "第 1 轮", "action": "提交数据分析作业",
    "date": "2026-09-08", "dateType": "deadline", "appliedAt": "2026-08-30", "source": "公司官网",
    "salary": "250–300 元/天", "url": "https://example.com/jobs/job-012",
    "notes": "【虚构示例】作业今日截止，已完成清洗分析，最后检查结论与附件。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-013", "company": "墨川科技", "initials": "墨川", "role": "前端开发实习生", "city": "杭州",
    "stage": "assessment", "status": "待反馈", "round": "第 1 轮", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-28", "source": "招聘平台",
    "salary": "200–280 元/天", "url": "https://example.com/jobs/job-013",
    "notes": "【虚构示例】9 月 5 日完成第一轮在线笔试，等待成绩与下一步通知。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-014", "company": "栎白软件", "initials": "栎白", "role": "后端开发实习生", "city": "深圳",
    "stage": "assessment", "status": "待完成", "round": "第 2 轮", "action": "提交接口设计作业",
    "date": "2026-09-11", "dateType": "deadline", "appliedAt": "2026-08-22", "source": "公司官网",
    "salary": "220–300 元/天", "url": "https://example.com/jobs/job-014",
    "notes": "【虚构示例】第一轮编程题已完成，当前准备第二轮接口设计作业。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-015", "company": "岚汀科技", "initials": "岚汀", "role": "商业分析师", "city": "广州",
    "stage": "assessment", "status": "待安排", "round": "第 1 轮", "action": "确认笔试安排",
    "date": "", "dateType": "none", "appliedAt": "2026-09-02", "source": "校友内推",
    "salary": "13–18K·14 薪", "url": "https://example.com/jobs/job-015",
    "notes": "【虚构示例】已收到进入测评环节的通知，具体时间尚未确定。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-016", "company": "禾栈科技", "initials": "禾栈", "role": "交互设计实习生", "city": "杭州",
    "stage": "assessment", "status": "待完成", "round": "第 1 轮", "action": "提交交互设计题",
    "date": "2026-09-13", "dateType": "deadline", "appliedAt": "2026-08-31", "source": "招聘平台",
    "salary": "180–260 元/天", "url": "https://example.com/jobs/job-016",
    "notes": "【虚构示例】需提交信息结构与关键流程设计，本周日截止。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-017", "company": "映川设计", "initials": "映川", "role": "视觉设计师", "city": "上海",
    "stage": "assessment", "status": "待反馈", "round": "第 2 轮", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-18", "source": "公司官网",
    "salary": "12–17K·13 薪", "url": "https://example.com/jobs/job-017",
    "notes": "【虚构示例】9 月 4 日提交第二轮设计作业，等待评审反馈。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-018", "company": "原序智能", "initials": "原序", "role": "AI 产品实习生", "city": "北京",
    "stage": "interview", "status": "待完成", "round": "第 2 轮", "action": "参加产品业务面",
    "date": "2026-09-07T15:00:00+08:00", "dateType": "appointment", "appliedAt": "2026-08-21", "source": "校园招聘",
    "salary": "250–300 元/天", "url": "https://example.com/jobs/job-018",
    "notes": "【虚构示例】预约已过，待补充本轮面试记录及反馈。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-019", "company": "星漾科技", "initials": "星漾", "role": "前端开发工程师", "city": "上海",
    "stage": "interview", "status": "待完成", "round": "第 1 轮", "action": "参加技术一面",
    "date": "2026-09-08T14:30:00+08:00", "dateType": "appointment", "appliedAt": "2026-08-25", "source": "公司官网",
    "salary": "16–24K·14 薪", "url": "https://example.com/jobs/job-019",
    "notes": "【虚构示例】今日下午技术面，准备项目结构说明与组件设计案例。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-020", "company": "棠序软件", "initials": "棠序", "role": "后端开发工程师", "city": "深圳",
    "stage": "interview", "status": "待完成", "round": "第 3 轮", "action": "参加团队终面",
    "date": "2026-09-09T10:00:00+08:00", "dateType": "appointment", "appliedAt": "2026-08-12", "source": "朋友内推",
    "salary": "18–26K·15 薪", "url": "https://example.com/jobs/job-020",
    "notes": "【虚构示例】前两轮技术面已结束，第三轮与团队负责人沟通。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-021", "company": "序澜科技", "initials": "序澜", "role": "数据产品经理", "city": "杭州",
    "stage": "interview", "status": "待反馈", "round": "第 2 轮", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-16", "source": "公司官网",
    "salary": "16–22K·14 薪", "url": "https://example.com/jobs/job-021",
    "notes": "【虚构示例】9 月 3 日完成二面，已整理本轮讨论要点，等待后续通知。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-022", "company": "望屿数字", "initials": "望屿", "role": "用户研究员", "city": "广州",
    "stage": "interview", "status": "待安排", "round": "第 2 轮", "action": "回复可面试时间",
    "date": "2026-09-09", "dateType": "deadline", "appliedAt": "2026-08-24", "source": "校友内推",
    "salary": "12–18K·13 薪", "url": "https://example.com/jobs/job-022",
    "notes": "【虚构示例】已收到二面邀请，招聘方希望明日前回复可用时间，正在核对日程。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-023", "company": "砾芽智能", "initials": "砾芽", "role": "机器学习实习生", "city": "北京",
    "stage": "interview", "status": "待完成", "round": "第 1 轮", "action": "参加算法技术面",
    "date": "2026-09-11T16:00:00+08:00", "dateType": "appointment", "appliedAt": "2026-08-27", "source": "校园招聘",
    "salary": "280–350 元/天", "url": "https://example.com/jobs/job-023",
    "notes": "【虚构示例】本周五线上技术面，准备训练评估、数据质量和项目复盘。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-024", "company": "叠云实验", "initials": "叠云", "role": "产品经理", "city": "上海",
    "stage": "interview", "status": "待反馈", "round": "第 3 轮", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-10", "source": "公司官网",
    "salary": "18–25K·14 薪", "url": "https://example.com/jobs/job-024",
    "notes": "【虚构示例】9 月 1 日完成第三轮终面，仍在等待明确结果。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-025", "company": "苇青科技", "initials": "苇青", "role": "测试开发工程师", "city": "成都",
    "stage": "interview", "status": "待安排", "round": "第 1 轮", "action": "确认面试形式与时间",
    "date": "", "dateType": "none", "appliedAt": "2026-09-01", "source": "招聘平台",
    "salary": "13–19K·14 薪", "url": "https://example.com/jobs/job-025",
    "notes": "【虚构示例】简历通过后直接进入面试，没有测评环节，尚未确定预约时间。",
    "resultType": "", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-026", "company": "星梧科技", "initials": "星梧", "role": "产品设计师", "city": "杭州",
    "stage": "result", "status": "待决定", "round": "", "action": "答复录用 Offer",
    "date": "2026-09-10", "dateType": "deadline", "appliedAt": "2026-08-08", "source": "公司官网",
    "salary": "16–22K·14 薪", "url": "https://example.com/jobs/job-026",
    "notes": "【虚构示例】已收到书面 Offer，需要在本周四答复；正在比较岗位方向与成长机会。",
    "resultType": "offer", "offerDecision": "pending", "archived": false
  },
  {
    "id": "JOB-027", "company": "山序数据", "initials": "山序", "role": "数据分析师", "city": "上海",
    "stage": "result", "status": "已接受", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-05", "source": "校友内推",
    "salary": "15–20K·14 薪", "url": "https://example.com/jobs/job-027",
    "notes": "【虚构示例】已明确接受 Offer，保留录用通知方便后续查阅。",
    "resultType": "offer", "offerDecision": "accepted", "archived": false
  },
  {
    "id": "JOB-028", "company": "沐野科技", "initials": "沐野", "role": "业务运营实习生", "city": "深圳",
    "stage": "result", "status": "已婉拒", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-07", "source": "招聘平台",
    "salary": "180–220 元/天", "url": "https://example.com/jobs/job-028",
    "notes": "【虚构示例】收到 Offer 后因到岗时间不合适而主动婉拒。",
    "resultType": "offer", "offerDecision": "declined", "archived": false
  },
  {
    "id": "JOB-029", "company": "溪石科技", "initials": "溪石", "role": "算法工程师", "city": "北京",
    "stage": "result", "status": "未通过", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-19", "source": "公司官网",
    "salary": "20–28K·14 薪", "url": "https://example.com/jobs/job-029",
    "notes": "【虚构示例】已收到测评未通过的明确通知，本次没有进入面试，准备复盘测评题目。",
    "resultType": "rejected", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-030", "company": "棠雨科技", "initials": "棠雨", "role": "实施顾问", "city": "南京",
    "stage": "result", "status": "主动退出", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-08-23", "source": "校园招聘",
    "salary": "11–16K·13 薪", "url": "https://example.com/jobs/job-030",
    "notes": "【虚构示例】了解长期出差要求后主动结束申请，没有收到 Offer，也不是招聘方拒绝。",
    "resultType": "withdrawn", "offerDecision": "", "archived": false
  },
  {
    "id": "JOB-031", "company": "禾序科技", "initials": "禾序", "role": "前端开发实习生", "city": "杭州",
    "stage": "result", "status": "已接受", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-07-18", "source": "公司官网",
    "salary": "200–280 元/天", "url": "https://example.com/jobs/job-031",
    "notes": "【虚构示例】上一招聘批次已接受的 Offer，录用通知与答复记录已整理。",
    "resultType": "offer", "offerDecision": "accepted", "archived": true
  },
  {
    "id": "JOB-032", "company": "弦谷数字", "initials": "弦谷", "role": "数据运营实习生", "city": "广州",
    "stage": "result", "status": "未通过", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-07-25", "source": "校园招聘",
    "salary": "160–220 元/天", "url": "https://example.com/jobs/job-032",
    "notes": "【虚构示例】收到明确未通过通知后手动归档，保留历史用于复盘。",
    "resultType": "rejected", "offerDecision": "", "archived": true
  },
  {
    "id": "JOB-033", "company": "云砚科技", "initials": "云砚", "role": "交互设计师", "city": "上海",
    "stage": "result", "status": "主动退出", "round": "", "action": "",
    "date": "", "dateType": "none", "appliedAt": "2026-07-30", "source": "朋友内推",
    "salary": "13–19K·13 薪", "url": "https://example.com/jobs/job-033",
    "notes": "【虚构示例】因求职方向调整主动退出，相关沟通记录已整理。",
    "resultType": "withdrawn", "offerDecision": "", "archived": true
  }
];

// 每条记录明确指定更新时间和当前状态进入时间，不从投递日期推算。
// history.date 是已经发生的事件日期；未来预约或答复期限仅在 text 中说明。
(() => {
  const recordDates = {
    "JOB-001": { "updatedAt": "2026-09-08", "statusSince": "2026-09-05" },
    "JOB-002": { "updatedAt": "2026-09-03", "statusSince": "2026-09-03" },
    "JOB-003": { "updatedAt": "2026-09-07", "statusSince": "2026-09-04" },
    "JOB-004": { "updatedAt": "2026-09-08", "statusSince": "2026-08-26" },
    "JOB-005": { "updatedAt": "2026-09-07", "statusSince": "2026-09-06" },
    "JOB-006": { "updatedAt": "2026-09-07", "statusSince": "2026-09-07" },
    "JOB-007": { "updatedAt": "2026-09-08", "statusSince": "2026-09-06" },
    "JOB-008": { "updatedAt": "2026-09-01", "statusSince": "2026-08-20" },
    "JOB-009": { "updatedAt": "2026-09-08", "statusSince": "2026-09-05" },
    "JOB-010": { "updatedAt": "2026-09-02", "statusSince": "2026-09-01" },
    "JOB-011": { "updatedAt": "2026-09-06", "statusSince": "2026-09-02" },
    "JOB-012": { "updatedAt": "2026-09-08", "statusSince": "2026-09-04" },
    "JOB-013": { "updatedAt": "2026-09-05", "statusSince": "2026-09-05" },
    "JOB-014": { "updatedAt": "2026-09-07", "statusSince": "2026-09-06" },
    "JOB-015": { "updatedAt": "2026-09-08", "statusSince": "2026-09-07" },
    "JOB-016": { "updatedAt": "2026-09-07", "statusSince": "2026-09-05" },
    "JOB-017": { "updatedAt": "2026-09-06", "statusSince": "2026-09-04" },
    "JOB-018": { "updatedAt": "2026-09-04", "statusSince": "2026-09-04" },
    "JOB-019": { "updatedAt": "2026-09-07", "statusSince": "2026-09-03" },
    "JOB-020": { "updatedAt": "2026-09-08", "statusSince": "2026-09-05" },
    "JOB-021": { "updatedAt": "2026-09-05", "statusSince": "2026-09-03" },
    "JOB-022": { "updatedAt": "2026-09-08", "statusSince": "2026-09-07" },
    "JOB-023": { "updatedAt": "2026-09-08", "statusSince": "2026-09-06" },
    "JOB-024": { "updatedAt": "2026-09-04", "statusSince": "2026-09-01" },
    "JOB-025": { "updatedAt": "2026-09-08", "statusSince": "2026-09-07" },
    "JOB-026": { "updatedAt": "2026-09-08", "statusSince": "2026-09-05" },
    "JOB-027": { "updatedAt": "2026-09-07", "statusSince": "2026-09-06" },
    "JOB-028": { "updatedAt": "2026-09-05", "statusSince": "2026-09-04" },
    "JOB-029": { "updatedAt": "2026-09-07", "statusSince": "2026-09-06" },
    "JOB-030": { "updatedAt": "2026-09-06", "statusSince": "2026-09-02" },
    "JOB-031": { "updatedAt": "2026-08-05", "statusSince": "2026-08-03" },
    "JOB-032": { "updatedAt": "2026-08-09", "statusSince": "2026-08-07" },
    "JOB-033": { "updatedAt": "2026-08-13", "statusSince": "2026-08-11" }
  };

  const recordHistories = {
    "JOB-018": [
      { "title": "提交申请", "text": "通过校园招聘投递 AI 产品实习生，附上产品分析项目。", "date": "2026-08-21" },
      { "title": "完成在线测评", "text": "已提交第一轮测评，保留在这次申请的考核记录中。", "date": "2026-08-26" },
      { "title": "完成第 1 轮面试", "text": "沟通产品分析与项目经历，记录为已完成并等待反馈。", "date": "2026-08-30" },
      { "title": "确认第 2 轮面试", "text": "收到二面邀请，约定 9 月 7 日 15:00 进行产品业务面；当前状态改为待完成。", "date": "2026-09-04" }
    ],
    "JOB-021": [
      { "title": "提交申请", "text": "通过官网申请数据产品经理岗位。", "date": "2026-08-16" },
      { "title": "完成第 1 轮面试", "text": "介绍指标体系与数据产品项目，保留第一轮沟通记录。", "date": "2026-08-23" },
      { "title": "确认第 2 轮面试", "text": "收到二面安排，预约 9 月 3 日与业务负责人沟通。", "date": "2026-08-28" },
      { "title": "完成第 2 轮面试", "text": "完成业务场景讨论，当前状态改为待反馈，仍留在面试阶段。", "date": "2026-09-03" },
      { "title": "补充面试复盘", "text": "整理需求优先级与指标口径的复盘笔记，尚未收到进一步反馈。", "date": "2026-09-05" }
    ],
    "JOB-022": [
      { "title": "提交内推申请", "text": "通过校友内推申请用户研究员，提交研究案例。", "date": "2026-08-24" },
      { "title": "完成第 1 轮面试", "text": "介绍研究方法、访谈提纲与洞察产出。", "date": "2026-08-31" },
      { "title": "收到第 2 轮邀请", "text": "招聘方邀请第二轮沟通，并要求 9 月 9 日前回复可面试时间；当前状态为待安排。", "date": "2026-09-07" },
      { "title": "整理可面试时段", "text": "已列出备选时间，尚未向招聘方回复，下一步仍是回复可面试时间。", "date": "2026-09-08" }
    ],
    "JOB-026": [
      { "title": "提交申请", "text": "通过官网申请产品设计师，附上交互设计作品集。", "date": "2026-08-08" },
      { "title": "提交设计作业", "text": "完成核心流程与界面方案，提交测评作业。", "date": "2026-08-13" },
      { "title": "完成第 1 轮面试", "text": "介绍作品集与设计推导，记录第一轮反馈。", "date": "2026-08-20" },
      { "title": "完成第 2 轮面试", "text": "与团队负责人讨论协作方式及岗位方向，随后等待结果。", "date": "2026-08-27" },
      { "title": "收到书面 Offer", "text": "招聘方发出录用通知，要求 9 月 10 日前答复；进入结果阶段，Offer 决定为待决定。", "date": "2026-09-05" },
      { "title": "补充 Offer 比较备注", "text": "整理岗位方向与成长机会，尚未接受或婉拒，答复期限保持不变。", "date": "2026-09-08" }
    ]
  };

  window.JOB_DATA.forEach((job) => {
    job.updatedAt = recordDates[job.id].updatedAt;
    job.statusSince = recordDates[job.id].statusSince;
    if (recordHistories[job.id]) job.history = recordHistories[job.id];
  });
})();
