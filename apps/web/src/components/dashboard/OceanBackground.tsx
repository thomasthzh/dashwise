"use client";

import { useEffect, useRef, useState } from "react";

import {
  resolveOceanBackground,
  shouldPlayOceanVideo,
  type OceanBackgroundKey,
} from "@/lib/homeServerPresentation";

export const OCEAN_BACKGROUND_STORAGE_KEY = "126f-ocean-background";
export const OCEAN_BACKGROUND_EVENT = "126f:ocean-background";

export const OCEAN_BACKGROUNDS: Array<{
  key: OceanBackgroundKey;
  name: string;
  description: string;
  source: string;
}> = [
  { key: "a", name: "深蓝慢潮", description: "低亮度，数据最稳", source: "https://cdn.pixabay.com/video/2025/09/14/304019_large.mp4" },
  { key: "b", name: "地中海碎光", description: "默认 · 本地轻量循环", source: "/backgrounds/ocean-b.mp4" },
  { key: "c", name: "青绿流光", description: "高动态，电影感", source: "https://videos.pexels.com/video-files/28370648/12368494_3840_2160_30fps.mp4" },
  { key: "d", name: "碧蓝细波", description: "近景涟漪，折射清楚", source: "https://videos.pexels.com/video-files/28454641/12388552_3840_2160_30fps.mp4" },
  { key: "e", name: "暖金碎光", description: "温暖而克制", source: "https://videos.pexels.com/video-files/12645348/12645348-uhd_4096_2160_30fps.mp4" },
  { key: "f", name: "水晶俯潮", description: "透明浅海，大尺度水纹", source: "https://videos.pexels.com/video-files/2915051/2915051-uhd_3840_2160_25fps.mp4" },
  { key: "g", name: "晴海银光", description: "开阔低频，留白最多", source: "https://videos.pexels.com/video-files/12881622/12881622-uhd_3840_2160_30fps.mp4" },
];

function readSavedBackground() {
  if (typeof window === "undefined") return "b" as OceanBackgroundKey;
  return resolveOceanBackground(window.localStorage.getItem(OCEAN_BACKGROUND_STORAGE_KEY));
}

export default function OceanBackground() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [selected, setSelected] = useState<OceanBackgroundKey>(readSavedBackground);
  const source = OCEAN_BACKGROUNDS.find((background) => background.key === selected)?.source
    || OCEAN_BACKGROUNDS[1].source;

  useEffect(() => {
    const onBackgroundChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setSelected(resolveOceanBackground(detail));
    };
    window.addEventListener(OCEAN_BACKGROUND_EVENT, onBackgroundChange);
    return () => window.removeEventListener(OCEAN_BACKGROUND_EVENT, onBackgroundChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const play = () => void video.play().catch(() => undefined);
    const syncPlayback = () => {
      const shouldPlay = shouldPlayOceanVideo({
        pageVisible: !document.hidden,
        prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      if (shouldPlay) play();
      else video.pause();
    };
    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => document.removeEventListener("visibilitychange", syncPlayback);
  }, [source]);

  return (
    <div className="ocean-background" aria-hidden="true">
      <video
        ref={videoRef}
        key={source}
        className="ocean-background__video"
        autoPlay
        muted
        loop
        playsInline
        preload={selected === "b" ? "auto" : "metadata"}
      >
        <source src={source} type="video/mp4" />
      </video>
      <div className="ocean-background__veil" />
    </div>
  );
}
