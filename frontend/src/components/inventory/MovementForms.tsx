"use client";

import { useState } from "react";
import { InboundForm } from "./InboundForm";
import { OutboundForm } from "./OutboundForm";
import { TransferForm } from "./TransferForm";

const MOVEMENT_TYPES = [
  { key: "inbound", label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "transfer", label: "Transfer" },
] as const;

type MovementKey = (typeof MOVEMENT_TYPES)[number]["key"];

export function MovementForms() {
  const [active, setActive] = useState<MovementKey>("inbound");

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {MOVEMENT_TYPES.map((type) => (
          <button
            key={type.key}
            type="button"
            onClick={() => setActive(type.key)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              active === type.key
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        {active === "inbound" ? <InboundForm /> : null}
        {active === "outbound" ? <OutboundForm /> : null}
        {active === "transfer" ? <TransferForm /> : null}
      </div>
    </div>
  );
}
