"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify-icon/react";
import { Link } from "react-router-dom";

import {
  OCEAN_BACKGROUNDS,
  OCEAN_BACKGROUND_EVENT,
  OCEAN_BACKGROUND_STORAGE_KEY,
} from "./OceanBackground";
import {
  resolveOceanBackground,
  type OceanBackgroundKey,
} from "@/lib/homeServerPresentation";

export default function OceanBackgroundSwitcher() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<OceanBackgroundKey>(() => {
    if (typeof window === "undefined") return "b";
    return resolveOceanBackground(window.localStorage.getItem(OCEAN_BACKGROUND_STORAGE_KEY));
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (key: OceanBackgroundKey) => {
    setSelected(key);
    window.localStorage.setItem(OCEAN_BACKGROUND_STORAGE_KEY, key);
    window.dispatchEvent(new CustomEvent(OCEAN_BACKGROUND_EVENT, { detail: key }));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="ocean-switcher">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="frosted optical-glass p-2.5 rounded-full gear-link transition-colors duration-200 aspect-square flex items-center justify-center"
        aria-label="切换动态海面背景"
        aria-expanded={open}
      >
        <Icon icon="fa6-solid:gear" className="gear-rotate text-foreground transition-colors duration-200" />
      </button>
      {open && (
        <div className="ocean-switcher__menu optical-glass" role="menu">
          <div className="ocean-switcher__eyebrow">动态海面 · 默认 B</div>
          {OCEAN_BACKGROUNDS.map((background) => (
            <button
              key={background.key}
              type="button"
              role="menuitemradio"
              aria-checked={selected === background.key}
              onClick={() => choose(background.key)}
              className={`ocean-switcher__option ${selected === background.key ? "is-active" : ""}`}
            >
              <Icon icon="fa6-solid:water" className="ocean-switcher__water" />
              <span>
                <strong>{background.key.toUpperCase()} · {background.name}</strong>
                <small>{background.description}</small>
              </span>
              <Icon icon="fa6-solid:check" className="ocean-switcher__check" />
            </button>
          ))}
          <Link to="/settings/appearance" className="ocean-switcher__settings" onClick={() => setOpen(false)}>
            <Icon icon="fa6-solid:sliders" />
            其他外观设置
          </Link>
        </div>
      )}
    </div>
  );
}
