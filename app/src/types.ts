export type Stage = "application" | "assessment" | "interview" | "result";
export type DateType = "none" | "deadline" | "appointment";
export interface ReminderSetupState {
  phase:
    | "idle"
    | "preparing"
    | "authorizing"
    | "ready"
    | "deploying"
    | "complete"
    | "error";
  step: string;
  error: string;
  authUrl: string;
  accounts: { id: string; name: string }[];
  url: string;
  busy: boolean;
  configured: boolean;
  mode: "create" | "edit";
  current: null | {
    accountId: string;
    name: string;
    url: string;
    sender: string;
    recipient: string;
  };
  editError: string;
  updatePending: boolean;
}
export interface ReminderSettings {
  configurationPending?: boolean;
  revision: number;
  syncedRevision: number;
  enabled: boolean;
  recipient: string;
  animation: boolean;
  muted: Record<string, boolean>;
  configured: boolean;
  pending: boolean;
  lastSync: string | null;
  error: string;
  cloud: null | {
    issues: {
      id: string;
      job_id: string;
      state: string;
      error: string;
      updated: number;
    }[];
    counts: { state: string; count: number }[];
  };
}
export interface Action {
  text: string;
  date: string;
  dateType: DateType;
  round: string;
}
export interface History {
  id?: string;
  title: string;
  text: string;
  date: string;
  action?: Action;
  previousStage?: Stage;
  previousRoundRecord?: Round;
  roundRecord?: Round;
}
export interface Round {
  stage: Stage;
  round: string;
  date: string;
  notes: string;
  result: string;
}
export interface Job {
  id: string;
  version: number;
  company: string;
  role: string;
  city: string;
  salary: string;
  source: string;
  url: string;
  appliedAt: string;
  notes: string;
  stage: Stage;
  status: string;
  round: string;
  action: string;
  date: string;
  dateType: DateType;
  resultType: string;
  offerDecision: string;
  archived: boolean;
  statusSince: string;
  updatedAt: string;
  createdAt: string;
  history: History[];
  rounds: Round[];
}
export const stages: { id: Stage; name: string; tone: string; hint: string }[] =
  [
    {
      id: "application",
      name: "投递",
      tone: "blue",
      hint: "从感兴趣，到迈出第一步",
    },
    {
      id: "assessment",
      name: "测评",
      tone: "amber",
      hint: "笔试、在线测评与作业",
    },
    {
      id: "interview",
      name: "面试",
      tone: "purple",
      hint: "每一轮，都离目标更近",
    },
    {
      id: "result",
      name: "结果",
      tone: "green",
      hint: "记录结果，作出下一步决定",
    },
  ];
export const decisions: Record<string, string> = {
  pending: "待决定",
  accepted: "已接受",
  declined: "已婉拒",
};
export const statusLabel = (j: Job) =>
  j.resultType === "offer"
    ? `Offer · ${decisions[j.offerDecision] || "待决定"}`
    : j.status;
export const stageName = (stage: Stage) =>
  stages.find((s) => s.id === stage)!.name;
export const jobTone = (j: Job) =>
  j.stage === "result"
    ? j.resultType === "offer"
      ? "green"
      : "gray"
    : stages.find((s) => s.id === j.stage)!.tone;
