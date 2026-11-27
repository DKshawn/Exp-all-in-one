"use client";

import {
  DetailDialog,
  type DetailDialogProps,
} from "@/components/detail-dialog";
import { useSetupText } from "@/components/experiment-language";

export function StudyDetailDialog(props: DetailDialogProps) {
  const t = useSetupText();
  return (
    <DetailDialog
      {...props}
      closeLabel={props.closeLabel ?? t("閉じる", "关闭", "Close")}
    />
  );
}
