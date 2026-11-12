import { JUDGMENT_NAME } from "@/experiments/judgment/constants";

export const EXPERIMENT_CATALOG = [
  {
    id: "double-auction",
    title: "Double Auction",
    description: "商品を取引し、市場制度と価格形成を比較する。",
    detail: "CDA / Call Market / Posted Offer",
    teacherHref: "/teacher?experiment=institutions",
    demoHref: "/demo",
  },
  {
    id: "emh",
    title: "Efficient Market Hypothesis",
    description: "配当の異なる証券を取引し、情報と資産価格の関係を観察する。",
    detail: "資産市場実験",
    teacherHref: "/teacher?experiment=emh",
    demoHref: "/emh/demo",
  },
  {
    id: "judgment",
    title: JUDGMENT_NAME,
    description: "確率判断や意思決定を通して、認知の偏りを観察する。",
    teacherHref: "/teacher?experiment=judgment",
    demoHref: "/judgment/demo",
  },
  {
    id: "evolution",
    title: "Stochastic Evolutionary Games",
    description: "各ラウンドで相手を組み替え、選択と利得の変化を観察する。",
    teacherHref: "/teacher?experiment=evolution",
    demoHref: "/evolution/demo",
  },
] as const;
