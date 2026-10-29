import type { Metadata } from "next";
import AutumnHedgehog from "../components/AutumnHedgehog";

export const metadata: Metadata = {
  title: "Осенний Ёжик в листве",
  description:
    "Найди свой уют. Разгребай осеннюю листву, разбуди спящего ёжика и подпишись на рассылку с тёплыми письмами по пятницам.",
};

export default function HedgehogPage() {
  return <AutumnHedgehog />;
}
