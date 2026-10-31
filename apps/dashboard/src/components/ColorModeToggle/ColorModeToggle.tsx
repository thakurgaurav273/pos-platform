"use client";

import { Dropdown, type MenuProps } from "antd";
import { Check, Monitor, Moon, Store, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { ModePreference } from "@/lib/theme/types";
import styles from "./ColorModeToggle.module.css";

const OPTIONS: { key: string; value: ModePreference; label: string; icon: typeof Sun }[] = [
  { key: "light", value: "light", label: "Light", icon: Sun },
  { key: "dark", value: "dark", label: "Dark", icon: Moon },
  { key: "system", value: "system", label: "Match system", icon: Monitor },
  { key: "shop", value: null, label: "Shop default", icon: Store },
];

/** Header control for this device's light/dark preference. */
export function ColorModeToggle() {
  const { mode, modePreference, setModePreference } = useTheme();
  const current = OPTIONS.find((o) => o.value === modePreference) ?? OPTIONS[3];

  const items: MenuProps["items"] = OPTIONS.map((o) => {
    const Icon = o.icon;
    return {
      key: o.key,
      icon: <Icon className="size-[15px]" strokeWidth={1.9} aria-hidden />,
      label: (
        <span className={styles.item}>
          {o.label}
          {o.key === current.key && <Check className="size-[14px]" aria-hidden />}
        </span>
      ),
    };
  });

  const Icon = mode === "dark" ? Moon : Sun;

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items,
        selectable: true,
        selectedKeys: [current.key],
        onClick: ({ key }) => {
          const opt = OPTIONS.find((o) => o.key === key);
          if (opt) setModePreference(opt.value);
        },
      }}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Colour mode: ${current.label}. Change colour mode`}
        title="Colour mode"
      >
        <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden />
      </button>
    </Dropdown>
  );
}
