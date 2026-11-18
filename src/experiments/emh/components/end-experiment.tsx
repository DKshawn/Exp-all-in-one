"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EndExperimentButton } from "@/components/end-experiment-button";

export function EmhEndExperiment({
  disabled,
  onFinish,
}: {
  disabled: boolean;
  onFinish: () => Promise<void>;
}) {
  // Keep the session revision or demo phase that the teacher was asked to confirm.
  const [finish, setFinish] = useState<(() => Promise<void>) | null>(null);
  return (
    <>
      <EndExperimentButton
        disabled={disabled}
        onClick={() => setFinish(() => onFinish)}
      />
      {finish && (
        <ConfirmDialog
          danger
          title="実験を終了しますか？"
          message="すべての市場を終了します。取引中の期は現在の保有量で配当を確定し、残っている注文を取り消します。"
          onCancel={() => setFinish(null)}
          onConfirm={async () => {
            try {
              await finish();
            } finally {
              setFinish(null);
            }
          }}
        />
      )}
    </>
  );
}
